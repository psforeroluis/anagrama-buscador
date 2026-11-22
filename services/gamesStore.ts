// Persistencia de partidas. IndexedDB por defecto (aguanta tableros, historial
// y, más adelante, las capturas de pantalla); si no está disponible —modo
// privado, permisos— cae a localStorage sin que la UI se entere.

import { BoardState } from '../types';
import { BOARD_SIZE, emptyBoard } from './boardLayout';
import { logError } from './sync/diagnostics';
import { TOMBSTONE_MS } from './sync/constants';

export interface Game {
    id: string;
    name: string;
    board: BoardState;
    rack: string;
    blanks: number;
    createdAt: number;
    updatedAt: number;
    /** Veces que se ha jugado la partida (ediciones y aperturas). Ausente en partidas antiguas. */
    uses?: number;
    /** Hora local de la última edición o apertura. Solo local. */
    lastUsedAt?: number;
    /** Guardados locales hechos. Una partida sin `rev` cuenta como 1. Viaja al servidor. */
    rev?: number;
    /** Última `rev` que se sabe que está en el servidor. Solo local; ausente = nunca sincronizada. */
    syncedRev?: number;
    /** Aparato que hizo la última edición. Solo desempata. Viaja al servidor. */
    editedBy?: string;
    /** Lápida: hora (reloj del aparato) en que se borró. La partida se conserva hasta purgarla. */
    deletedAt?: number;
}

const DB_NAME = 'anagrama';
const DB_VERSION = 1;
const STORE = 'games';
const FALLBACK_KEY = 'anagrama.games.v1';
const ACTIVE_KEY = 'anagrama.activeGame.v1';
const LEGACY_BOARD_KEY = 'anagrama.board.v1';

const newId = () =>
    (crypto.randomUUID?.() ?? `g${Date.now()}${Math.random().toString(36).slice(2)}`);

export const createGame = (name: string): Game => ({
    id: newId(),
    name,
    board: emptyBoard(),
    rack: '',
    blanks: 0,
    uses: 0,
    rev: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
});

export const isValidGame = (g: unknown): g is Game => {
    const x = g as Game;
    return !!x && typeof x.id === 'string' && typeof x.name === 'string'
        && typeof x.rack === 'string' && Number.isInteger(x.blanks) && x.blanks >= 0 && x.blanks <= 2
        && Number.isFinite(x.createdAt) && Number.isFinite(x.updatedAt)
        && (x.uses === undefined || (Number.isFinite(x.uses) && x.uses >= 0))
        && [x.lastUsedAt, x.deletedAt].every(v => v === undefined || Number.isFinite(v))
        && [x.rev, x.syncedRev].every(v => v === undefined || (Number.isInteger(v) && v >= 0))
        && (x.editedBy === undefined || typeof x.editedBy === 'string')
        && !!x.board && Array.isArray(x.board.letters) && Array.isArray(x.board.blanks)
        && x.board.letters.length === BOARD_SIZE && x.board.blanks.length === BOARD_SIZE
        && /^[a-zñ]*$/i.test(x.rack)
        && x.board.letters.every(r => typeof r === 'string' && /^[.a-zñ]{15}$/.test(r))
        && x.board.blanks.every((r, row) => typeof r === 'string'
            && /^[01]{15}$/.test(r)
            && [...r].every((flag, col) => flag !== '1' || x.board.letters[row][col] !== '.'));
};

// --- Backend IndexedDB ---
let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') { reject(new Error('sin IndexedDB')); return; }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('no se pudo abrir IndexedDB'));
        req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
    });
    return dbPromise;
};

const tx = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        let result: T;
        req.onsuccess = () => { result = req.result; };
        req.onerror = () => reject(req.error ?? new Error('falló la operación de IndexedDB'));
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error('falló la transacción de IndexedDB'));
        t.onabort = () => reject(t.error ?? new Error('se canceló la transacción de IndexedDB'));
    });
};

// --- Backend localStorage (respaldo) ---
const readFallback = (): Game[] => {
    try {
        const raw = localStorage.getItem(FALLBACK_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(isValidGame) : [];
    } catch (e) { logError('gamesStore.readFallback', e); return []; }
};

const writeFallback = (games: Game[]) => {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(games));
};

let useFallback = (() => { try { return localStorage.getItem(FALLBACK_KEY) !== null; } catch (e) { logError('gamesStore.init', e); return false; } })();
let snapshot: Game[] = [];

const byRecent = (a: Game, b: Game) => b.updatedAt - a.updatedAt;

/** Todas las partidas, incluidas las lápidas. Refresca el snapshot interno. */
export const listAllGames = async (): Promise<Game[]> => {
    if (!useFallback) {
        try {
            const all = await tx<Game[]>('readonly', s => s.getAll() as IDBRequest<Game[]>);
            snapshot = all.filter(isValidGame).sort(byRecent);
            return snapshot;
        } catch (e) {
            logError('gamesStore.listAllGames', e);
            useFallback = true;
        }
    }
    const merged = new Map(snapshot.map(game => [game.id, game]));
    for (const game of readFallback()) merged.set(game.id, game);
    snapshot = [...merged.values()].sort(byRecent);
    return snapshot;
};

/** Partidas visibles: oculta las lápidas. */
export const listGames = async (): Promise<Game[]> =>
    (await listAllGames()).filter(g => g.deletedAt === undefined);

/** Partidas borradas que aún se pueden restaurar (la papelera). */
export const listDeletedGames = async (): Promise<Game[]> =>
    (await listAllGames()).filter(g => g.deletedAt !== undefined)
        .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

let writes: Promise<void> = Promise.resolve();
const enqueueWrite = (operation: () => Promise<void>): Promise<void> => {
    const next = writes.then(operation);
    writes = next.catch(() => {});
    return next;
};

// --- Identidad del aparato y revisiones ---
const DEVICE_KEY = 'anagrama.deviceId.v1';
let deviceIdCache: string | null = null;

/** Identificador aleatorio de este aparato; solo sirve para desempatar fusiones. */
export const getDeviceId = (): string => {
    if (deviceIdCache) return deviceIdCache;
    try {
        const stored = localStorage.getItem(DEVICE_KEY);
        if (stored) return (deviceIdCache = stored);
    } catch (e) { logError('gamesStore.getDeviceId', e); }
    const id = newId();
    try { localStorage.setItem(DEVICE_KEY, id); } catch (e) { logError('gamesStore.getDeviceId', e); }
    return (deviceIdCache = id);
};

/**
 * Por qué se guarda una partida:
 *  - edit: edición del usuario (sube `rev` y queda pendiente de subir).
 *  - usage: solo se abrió (no toca `rev` ni `updatedAt`).
 *  - remote: viene del servidor (se guarda tal cual, sin eco).
 *  - copy: copia de conflicto creada por la fusión (`rev = 1`, `syncedRev = 0`, sin sumar).
 */
export type SaveOrigin = 'edit' | 'usage' | 'remote' | 'copy';

const buildRecord = (game: Game, stored: Game | undefined, origin: SaveOrigin): Game => {
    if (origin === 'remote') return game;
    if (origin === 'copy') return { ...game, rev: 1, syncedRev: 0 };
    // `rev`, `syncedRev` y las lápidas pertenecen al almacén y al motor: la copia en
    // memoria de la interfaz puede estar desfasada, así que se leen de lo guardado.
    const rev = stored?.rev ?? game.rev;
    const syncedRev = stored?.syncedRev ?? game.syncedRev;
    if (origin === 'usage') {
        return { ...game, rev, syncedRev, editedBy: stored?.editedBy ?? game.editedBy, lastUsedAt: Date.now() };
    }
    const now = Date.now();
    return {
        ...game, syncedRev, updatedAt: now, lastUsedAt: now,
        rev: (rev ?? 1) + 1, editedBy: getDeviceId(),
    };
};

/** Lee y escribe una partida dentro de una única transacción de IndexedDB. */
const idbUpdate = async (id: string, compute: (stored: Game | undefined) => Game | undefined): Promise<Game | undefined> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        const store = t.objectStore(STORE);
        let record: Game | undefined;
        const read = store.get(id);
        read.onsuccess = () => {
            const stored = read.result && isValidGame(read.result) ? read.result as Game : undefined;
            record = compute(stored);
            if (record) store.put(record);
        };
        read.onerror = () => reject(read.error ?? new Error('falló la lectura de IndexedDB'));
        t.oncomplete = () => resolve(record);
        t.onerror = () => reject(t.error ?? new Error('falló la transacción de IndexedDB'));
        t.onabort = () => reject(t.error ?? new Error('se canceló la transacción de IndexedDB'));
    });
};

const updateGame = (id: string, compute: (stored: Game | undefined) => Game | undefined): Promise<void> =>
    enqueueWrite(async () => {
        if (!useFallback) {
            try {
                const record = await idbUpdate(id, compute);
                if (record) snapshot = [...snapshot.filter(g => g.id !== id), record];
                return;
            } catch (e) {
                logError('gamesStore.updateGame', e);
                useFallback = true;
            }
        }
        const games = new Map(snapshot.map(g => [g.id, g]));
        for (const stored of readFallback()) games.set(stored.id, stored);
        const record = compute(games.get(id));
        if (!record) return;
        games.set(id, record);
        writeFallback([...games.values()]);
        snapshot = [...games.values()];
    });

export interface SaveResult {
    /** Aviso para el usuario (por ejemplo, un servidor que vuelve atrás). */
    notice?: string;
}

/**
 * Guarda una partida. El origen es obligatorio. Con `remote`, si la `rev` que llega es
 * menor que el `syncedRev` guardado (un servidor restaurado), se conserva lo local, se
 * marca pendiente (`syncedRev = 0`) y se devuelve un aviso.
 */
export const saveGame = async (game: Game, origin: SaveOrigin): Promise<SaveResult> => {
    let notice: string | undefined;
    await updateGame(game.id, stored => {
        if (origin === 'remote' && stored && stored.syncedRev !== undefined && (game.rev ?? 1) < stored.syncedRev) {
            notice = `El servidor tenía una versión anterior de «${stored.name}»; se volverá a subir.`;
            return { ...stored, syncedRev: 0 };
        }
        return buildRecord(game, stored, origin);
    });
    return notice ? { notice } : {};
};

/** Borra con lápida: la partida se conserva con su contenido hasta purgarla. */
export const deleteGame = (id: string): Promise<void> =>
    updateGame(id, stored => stored && stored.deletedAt === undefined
        ? { ...stored, deletedAt: Date.now(), updatedAt: Date.now(), rev: (stored.rev ?? 1) + 1, editedBy: getDeviceId() }
        : undefined);

/**
 * Elimina del todo las lápidas de más de 30 días (plazo provisional). Con `only`, elimina
 * exactamente esas lápidas, sea cual sea su edad (las que el servidor ya purgó).
 */
export const purgeDeleted = (now = Date.now(), only?: string[]): Promise<void> => enqueueWrite(async () => {
    const limit = now - TOMBSTONE_MS;
    const wanted = only ? new Set(only) : null;
    const expired = (await listAllGames()).filter(g => g.deletedAt !== undefined
        && (wanted ? wanted.has(g.id) : g.deletedAt < limit));
    if (expired.length === 0) return;
    const ids = new Set(expired.map(g => g.id));
    if (!useFallback) {
        try {
            for (const id of ids) await tx('readwrite', s => s.delete(id));
            snapshot = snapshot.filter(g => !ids.has(g.id));
            return;
        } catch (e) {
            logError('gamesStore.purgeDeleted', e);
            useFallback = true;
        }
    }
    const remaining = (await listAllGames()).filter(g => !ids.has(g.id));
    writeFallback(remaining);
    snapshot = remaining;
});

export const getActiveId = (): string | null => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch (e) { logError('gamesStore.getActiveId', e); return null; }
};

export const setActiveId = (id: string) => {
    try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) { logError('gamesStore.setActiveId', e); }
};

/**
 * Carga las partidas al arrancar: migra el tablero único de la versión
 * anterior si existe y garantiza que siempre haya al menos una partida.
 *
 * Se cachea la promesa: si se llama dos veces a la vez (StrictMode monta los
 * efectos por duplicado en desarrollo) ambas esperan la misma inicialización
 * en lugar de crear cada una su propia partida vacía.
 */
let initPromise: Promise<Game[]> | null = null;

export const initGames = (): Promise<Game[]> => {
    if (!initPromise) initPromise = runInit();
    return initPromise;
};

const runInit = async (): Promise<Game[]> => {
    let games = await listGames();

    if (games.length === 0) {
        const migrated = createGame('Partida 1');
        try {
            const legacy = localStorage.getItem(LEGACY_BOARD_KEY);
            if (legacy) {
                const parsed = JSON.parse(legacy);
                const candidate = { ...migrated, board: parsed.board, rack: parsed.rack ?? '', blanks: parsed.blanks ?? 0 };
                if (isValidGame(candidate)) {
                    await saveGame(candidate, 'edit');
                    localStorage.removeItem(LEGACY_BOARD_KEY);
                    return [candidate];
                }
            }
        } catch (e) { logError('gamesStore.migrarTableroAntiguo', e); }

        await saveGame(migrated, 'edit');
        games = [migrated];
    }
    return games;
};

/**
 * Hora de la última acción sobre una partida: la más reciente entre abrirla o editarla en
 * este aparato (`lastUsedAt`) y su última edición, también la hecha desde otro aparato
 * (`updatedAt`). Es la misma hora que muestra la lista como "hace X".
 */
export const lastActionAt = (game: Game): number => Math.max(game.lastUsedAt ?? 0, game.updatedAt);

/** La última acción primero; a igual hora, la creada más tarde. */
export const sortByRecent = (games: Game[]): Game[] =>
    [...games].sort((a, b) => lastActionAt(b) - lastActionAt(a) || b.createdAt - a.createdAt);

/** Nombre libre para la siguiente partida: "Partida 3" si ya existen 1 y 2. */
export const nextGameName = (games: Game[]): string => {
    const used = new Set(games.map(g => g.name));
    for (let i = 1; i <= games.length + 1; i++) {
        const name = `Partida ${i}`;
        if (!used.has(name)) return name;
    }
    return `Partida ${games.length + 1}`;
};
