// Motor de sincronización ya cableado con el almacén real, `localStorage` y `fetch`.
// La interfaz usa solo este módulo: `syncEngine` y `subscribeSync`.

import { listAllGames, saveGame } from '../gamesStore';
import { buildBackup } from '../backup';
import { createSyncEngine, type SyncMeta, type SyncState } from './syncEngine';
import { httpTransport } from './syncTransport';

const META_KEY = 'anagrama.sync.v1';
const BACKUP_KEY = 'anagrama.preSyncBackup.v1';

const defaults: SyncMeta = { enabled: false, token: '', etag: null, lastSyncedAt: null, firstSyncDone: false };

const loadMeta = (): SyncMeta => {
    try {
        const raw = localStorage.getItem(META_KEY);
        return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch { return { ...defaults }; }
};

const listeners = new Set<(state: SyncState) => void>();

export const syncEngine = createSyncEngine({
    store: { listAll: listAllGames, save: saveGame },
    meta: {
        load: loadMeta,
        save: meta => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* sin cuota */ } },
    },
    transport: httpTransport,
    // Una sola copia previa a la primera sincronización. Si no cabe, lanza y el motor se detiene.
    backupBeforeFirstSync: async () => {
        localStorage.setItem(BACKUP_KEY, JSON.stringify(await buildBackup()));
    },
    onChange: state => listeners.forEach(fn => fn(state)),
});

export const subscribeSync = (fn: (state: SyncState) => void): (() => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
};

const STATUS_TEXT: Record<SyncState['status'], string> = {
    disabled: 'Desactivado',
    syncing: 'Sincronizando',
    upToDate: 'Sincronizado',
    offline: 'Sin red',
    tokenRejected: 'Token rechazado',
    error: 'Error',
};

/** Texto corto del chip, con la lista única de estados del diseño. */
export const syncChipText = (state: SyncState, relative: (ts: number) => string): string => {
    switch (state.status) {
        case 'upToDate': return state.lastSyncedAt ? `Sincronizado ${relative(state.lastSyncedAt)}` : 'Sincronizado';
        case 'offline': return `Sin red · ${state.pending} pendientes`;
        default: return STATUS_TEXT[state.status];
    }
};
