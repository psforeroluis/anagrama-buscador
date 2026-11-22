// Motor de sincronización: trae el documento del servidor, lo fusiona con las partidas
// locales, aplica el resultado y sube lo pendiente. No toca el DOM ni la red por su
// cuenta: todo llega inyectado, así que se prueba en Node con un servidor simulado.

import type { Game, SaveOrigin } from '../gamesStore';
import { merge, revOf, type RemoteGames } from './syncMerge';
import { SyncError, type SyncTransport } from './syncTransport';

export type SyncStatus = 'disabled' | 'syncing' | 'upToDate' | 'offline' | 'tokenRejected' | 'error';

export interface SyncState {
    status: SyncStatus;
    pending: number;
    lastSyncedAt: number | null;
    /** Texto para mostrar en el chip cuando el estado es `error`. */
    error: string | null;
    /** Avisos de la última sincronización (conflictos, restauraciones…). */
    notices: string[];
}

export interface SyncStore {
    listAll(): Promise<Game[]>;
    save(game: Game, origin: SaveOrigin): Promise<void>;
}

export interface SyncMeta {
    enabled: boolean;
    token: string;
    etag: string | null;
    lastSyncedAt: number | null;
    firstSyncDone: boolean;
}

export interface SyncMetaStorage {
    load(): SyncMeta;
    save(meta: SyncMeta): void;
}

export interface SyncEngineDeps {
    store: SyncStore;
    meta: SyncMetaStorage;
    transport: (token: string) => SyncTransport;
    /** Copia de seguridad previa a la primera sincronización. Puede lanzar (cuota). */
    backupBeforeFirstSync: () => Promise<void>;
    now?: () => number;
    onChange?: (state: SyncState) => void;
}

const MAX_CONFLICT_RETRIES = 3;

const messages: Record<string, string> = {
    'too-large': 'El documento supera 1 MB. Exporta una copia y elimina partidas.',
    schema: 'Actualiza la app para sincronizar.',
    invalid: 'El servidor rechazó los datos. Reintenta o exporta una copia.',
    server: 'El servidor no respondió bien. Reintenta más tarde.',
    backup: 'No se pudo guardar la copia previa. Exporta una copia manual y reintenta.',
    conflicts: 'Demasiados choques seguidos con otro aparato. Reintenta.',
};

export const createSyncEngine = (deps: SyncEngineDeps) => {
    const now = deps.now ?? Date.now;
    let meta = deps.meta.load();
    let running = false;
    let again = false;
    let state: SyncState = {
        status: meta.enabled && meta.token ? 'upToDate' : 'disabled',
        pending: 0, lastSyncedAt: meta.lastSyncedAt, error: null, notices: [],
    };

    const setState = (patch: Partial<SyncState>) => {
        state = { ...state, ...patch };
        deps.onChange?.(state);
    };
    const saveMeta = (patch: Partial<SyncMeta>) => {
        meta = { ...meta, ...patch };
        deps.meta.save(meta);
    };
    const countPending = async () => (await deps.store.listAll())
        .filter(g => g.syncedRev === undefined || revOf(g) > g.syncedRev).length;

    /**
     * Marca como sincronizado lo que se envió: `syncedRev` pasa a la `rev` enviada, no a
     * la actual. Si el usuario editó durante el envío, la `rev` actual es mayor y la
     * partida sigue pendiente (y no choca consigo misma en la siguiente fusión).
     */
    const acknowledge = async (sent: RemoteGames) => {
        for (const g of await deps.store.listAll()) {
            const r = sent[g.id];
            if (r && revOf(g) >= revOf(r) && (g.syncedRev ?? -1) < revOf(r)) {
                await deps.store.save({ ...g, syncedRev: revOf(r) }, 'remote');
            }
        }
    };

    const cycle = async (): Promise<string[]> => {
        const transport = deps.transport(meta.token);
        const notices: string[] = [];
        for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
            const pulled = await transport.pull();
            const remote = pulled.status === 'ok' ? pulled.doc.games : null;
            const etag = pulled.status === 'ok' ? pulled.etag : undefined;

            const local = await deps.store.listAll();
            const result = merge(local, remote);
            for (const g of result.toLocal) await deps.store.save(g, 'remote');
            notices.push(...result.notices);

            if (!result.needsPush) { saveMeta({ etag: etag ?? meta.etag }); return notices; }

            const pushed = await transport.push({ schemaVersion: 1, games: result.remote }, etag);
            if (pushed.status === 'ok') {
                saveMeta({ etag: pushed.etag });
                await acknowledge(result.remote);
                return notices;
            }
            // Otro aparato escribió entre la lectura y la subida: se vuelve a empezar.
        }
        throw new SyncError('conflicts');
    };

    const run = async (): Promise<void> => {
        if (!meta.enabled || !meta.token) { setState({ status: 'disabled' }); return; }
        setState({ status: 'syncing', error: null });
        try {
            if (!meta.firstSyncDone) {
                try { await deps.backupBeforeFirstSync(); }
                catch { throw new SyncError('backup'); }
            }
            const notices = await cycle();
            saveMeta({ firstSyncDone: true, lastSyncedAt: now() });
            setState({ status: 'upToDate', lastSyncedAt: meta.lastSyncedAt, pending: await countPending(), notices });
        } catch (e) {
            const pending = await countPending().catch(() => state.pending);
            if (e instanceof SyncError) {
                if (e.kind === 'unauthorized') setState({ status: 'tokenRejected', pending, error: null });
                else if (e.kind === 'offline') setState({ status: 'offline', pending, error: null });
                else setState({ status: 'error', pending, error: messages[e.kind] ?? e.message });
            } else {
                setState({ status: 'error', pending, error: 'Error inesperado al sincronizar.' });
            }
        }
    };

    /** Sincroniza ahora. Si ya hay una en curso, encadena otra al terminar. */
    const sync = async (): Promise<void> => {
        if (running) { again = true; return; }
        running = true;
        try {
            do { again = false; await run(); } while (again);
        } finally { running = false; }
    };

    return {
        getState: () => state,
        getMeta: () => meta,
        sync,
        async enable(token: string) {
            saveMeta({ enabled: true, token: token.trim(), etag: null });
            await sync();
        },
        disable() {
            saveMeta({ enabled: false, token: '', etag: null, firstSyncDone: false });
            setState({ status: 'disabled', error: null, notices: [] });
        },
        async refreshPending() { setState({ pending: await countPending() }); },
        /** Para pruebas: ¿hay una sincronización en curso o encadenada? */
        isBusy: () => running || again,
    };
};

export type SyncEngine = ReturnType<typeof createSyncEngine>;
