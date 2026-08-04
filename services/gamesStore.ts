// Persistencia de partidas. IndexedDB por defecto (aguanta tableros, historial
// y, más adelante, las capturas de pantalla); si no está disponible —modo
// privado, permisos— cae a localStorage sin que la UI se entere.

import { BoardState } from '../types';
import { BOARD_SIZE, emptyBoard } from './boardLayout';

export interface Game {
    id: string;
    name: string;
    board: BoardState;
    rack: string;
    blanks: number;
    createdAt: number;
    updatedAt: number;
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
});

const isValidGame = (g: unknown): g is Game => {
    const x = g as Game;
    return !!x && typeof x.id === 'string' && typeof x.name === 'string'
        && !!x.board && Array.isArray(x.board.letters) && Array.isArray(x.board.blanks)
        && x.board.letters.length === BOARD_SIZE && x.board.blanks.length === BOARD_SIZE
        && x.board.letters.every(r => typeof r === 'string' && r.length === BOARD_SIZE)
        && x.board.blanks.every(r => typeof r === 'string' && r.length === BOARD_SIZE);
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
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

// --- Backend localStorage (respaldo) ---
const readFallback = (): Game[] => {
    try {
        const raw = localStorage.getItem(FALLBACK_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(isValidGame) : [];
    } catch { return []; }
};

const writeFallback = (games: Game[]) => {
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(games)); } catch { /* sin cuota */ }
};

let useFallback = false;

const byRecent = (a: Game, b: Game) => b.updatedAt - a.updatedAt;

export const listGames = async (): Promise<Game[]> => {
    if (!useFallback) {
        try {
            const all = await tx<Game[]>('readonly', s => s.getAll() as IDBRequest<Game[]>);
            return all.filter(isValidGame).sort(byRecent);
        } catch {
            useFallback = true;
        }
    }
    return readFallback().sort(byRecent);
};

export const saveGame = async (game: Game): Promise<void> => {
    const record = { ...game, updatedAt: Date.now() };
    if (!useFallback) {
        try {
            await tx('readwrite', s => s.put(record));
            return;
        } catch {
            useFallback = true;
        }
    }
    const games = readFallback().filter(g => g.id !== record.id);
    writeFallback([...games, record]);
};

export const deleteGame = async (id: string): Promise<void> => {
    if (!useFallback) {
        try {
            await tx('readwrite', s => s.delete(id));
            return;
        } catch {
            useFallback = true;
        }
    }
    writeFallback(readFallback().filter(g => g.id !== id));
};

export const getActiveId = (): string | null => {
    try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
};

export const setActiveId = (id: string) => {
    try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* sin cuota */ }
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
                    await saveGame(candidate);
                    localStorage.removeItem(LEGACY_BOARD_KEY);
                    return [candidate];
                }
            }
        } catch { /* nada que migrar */ }

        await saveGame(migrated);
        games = [migrated];
    }
    return games;
};

/** Nombre libre para la siguiente partida: "Partida 3" si ya existen 1 y 2. */
export const nextGameName = (games: Game[]): string => {
    const used = new Set(games.map(g => g.name));
    for (let i = 1; i <= games.length + 1; i++) {
        const name = `Partida ${i}`;
        if (!used.has(name)) return name;
    }
    return `Partida ${games.length + 1}`;
};
