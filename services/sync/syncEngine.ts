// Motor de sincronización: trae el documento del servidor, lo fusiona con las partidas
// locales, aplica el resultado y sube lo pendiente. No toca el DOM ni la red por su
// cuenta: todo llega inyectado, así que se prueba en Node con un servidor simulado.

import type { Game, SaveOrigin } from '../gamesStore';
import { hasPending, merge, revOf, stripLocal, type RemoteGames } from './syncMerge';
import { logError } from './diagnostics';
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
    save(game: Game, origin: SaveOrigin): Promise<unknown>;
    /** Elimina del todo estas lápidas (las que el servidor ya purgó). */
    purge(ids: string[]): Promise<void>;
}

export interface SyncMeta {
    enabled: boolean;
    token: string;
    etag: string | null;
    lastSyncedAt: number | null;
    /** Activada la sincronización pero aún sin completar el primer ciclo (copia previa pendiente). */
    firstSyncPending: boolean;
    /** Último error que se mostró; se conserva entre sesiones y se vacía al sincronizar bien. */
    lastError: string | null;
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
    /** Temporizador inyectable (para probar la espera de 2 s tras una edición). */
    timers?: { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };
    /** Fuente de eventos inyectable: pestaña visible y red recuperada. */
    events?: {
        onVisible(callback: () => void): () => void;
        onOnline(callback: () => void): () => void;
    };
}

export const EDIT_DELAY_MS = 2000;

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
    const timers = deps.timers ?? { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as number) };
    let running = false;
    let again = false;
    let editTimer: unknown;
    let handler: () => Promise<void> = () => sync();
    let state: SyncState = {
        status: !meta.enabled || !meta.token ? 'disabled' : meta.lastError ? 'error' : 'upToDate',
        pending: 0, lastSyncedAt: meta.lastSyncedAt, error: meta.enabled ? meta.lastError : null, notices: [],
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
            const pulled = await transport.pull(meta.etag ?? undefined);

            if (pulled.status === 'notModified') {
                // El servidor no cambió desde la última lectura: solo hay que subir lo pendiente.
                const all = await deps.store.listAll();
                if (!all.some(hasPending)) return notices;
                const doc: RemoteGames = Object.fromEntries(all.map(g => [g.id, stripLocal(g)]));
                const sent = await transport.push({ schemaVersion: 1, games: doc }, meta.etag ?? undefined);
                if (sent.status === 'ok') {
                    saveMeta({ etag: sent.etag });
                    await acknowledge(doc);
                    return notices;
                }
                continue;
            }

            const remote = pulled.status === 'ok' ? pulled.doc.games : null;
            const etag = pulled.status === 'ok' ? pulled.etag : undefined;

            let local = await deps.store.listAll();
            if (remote) {
                // El servidor purga las lápidas vencidas. Una lápida que este aparato ya subió
                // (`syncedRev > 0`) y que ya no está en el servidor se elimina aquí; si no, la
                // fusión la volvería a subir y el servidor a purgarla, sin fin.
                const purged = local.filter(g => g.deletedAt !== undefined && (g.syncedRev ?? 0) > 0 && !remote[g.id]);
                if (purged.length > 0) {
                    await deps.store.purge(purged.map(g => g.id));
                    const gone = new Set(purged.map(g => g.id));
                    local = local.filter(g => !gone.has(g.id));
                }
            }
            const result = merge(local, remote);
            const copies = new Set(result.conflicts.map(g => g.id));
            for (const g of result.toLocal) await deps.store.save(g, copies.has(g.id) ? 'copy' : 'remote');
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

    /** Pasa a `error`: lo guarda para la sesión siguiente y lo anota en Diagnóstico. */
    const fail = (pending: number, message: string, cause: unknown) => {
        logError('sync', cause instanceof SyncError ? `${cause.kind}: ${message}` : cause);
        saveMeta({ lastError: message });
        setState({ status: 'error', pending, error: message });
    };

    const run = async (): Promise<void> => {
        if (!meta.enabled || !meta.token) { setState({ status: 'disabled' }); return; }
        setState({ status: 'syncing', error: null });
        try {
            if (meta.firstSyncPending) {
                try { await deps.backupBeforeFirstSync(); }
                catch { throw new SyncError('backup'); }
            }
            const notices = await cycle();
            saveMeta({ firstSyncPending: false, lastSyncedAt: now(), lastError: null });
            setState({ status: 'upToDate', lastSyncedAt: meta.lastSyncedAt, pending: await countPending(), notices });
        } catch (e) {
            const pending = await countPending().catch(() => state.pending);
            if (e instanceof SyncError) {
                if (e.kind === 'unauthorized') setState({ status: 'tokenRejected', pending, error: null });
                else if (e.kind === 'offline') setState({ status: 'offline', pending, error: null });
                else fail(pending, messages[e.kind] ?? e.message, e);
            } else {
                fail(pending, 'Error inesperado al sincronizar.', e);
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
            saveMeta({ enabled: true, token: token.trim(), etag: null, firstSyncPending: true, lastError: null });
            await sync();
        },
        disable() {
            if (editTimer !== undefined) { timers.clear(editTimer); editTimer = undefined; }
            saveMeta({ enabled: false, token: '', etag: null, firstSyncPending: false, lastError: null });
            setState({ status: 'disabled', error: null, notices: [] });
        },
        /**
         * Sincroniza ahora y en cada disparador: pestaña visible y red recuperada.
         * `run` permite que la interfaz envuelva el ciclo (volcar escrituras antes,
         * refrescar la lista después); por defecto es `sync`. Devuelve la baja.
         */
        start(run?: () => Promise<void>): () => void {
            handler = run ?? (() => sync());
            const events = deps.events;
            const off = [events?.onVisible(() => { void handler(); }), events?.onOnline(() => { void handler(); })];
            void handler();
            return () => off.forEach(fn => fn?.());
        },
        /** Una edición local: sincroniza 2 s después de la última (cada edición reinicia la espera). */
        notifyEdit() {
            if (!meta.enabled) return;
            if (editTimer !== undefined) timers.clear(editTimer);
            editTimer = timers.set(() => { editTimer = undefined; void handler(); }, EDIT_DELAY_MS);
        },
        async refreshPending() { setState({ pending: await countPending() }); },
        /** Para pruebas: ¿hay una sincronización en curso o encadenada? */
        isBusy: () => running || again,
    };
};

export type SyncEngine = ReturnType<typeof createSyncEngine>;
