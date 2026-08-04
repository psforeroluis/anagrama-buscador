// Plantillas de letras aprendidas de las correcciones del usuario.
// Base propia para no tocar el esquema de las partidas.

import { Glyph, GLYPH_LEN, glyphDistance } from './glyphs';

const DB_NAME = 'anagrama-glyphs';
const DB_VERSION = 1;
const STORE = 'samples';
const FALLBACK_KEY = 'anagrama.glyphs.v1';

/** Muestras por letra: más de esto y solo añadiríamos ruido y lentitud. */
const MAX_PER_LETTER = 12;

interface SampleRecord {
    id: string;
    letter: string;
    /** Huella serializada como cadena de 0 y 1 (compacta y clonable). */
    bits: string;
    createdAt: number;
}

const encode = (glyph: Glyph): string => glyph.join('');

const decode = (bits: string): Glyph | null => {
    if (bits.length !== GLYPH_LEN) return null;
    const glyph = new Uint8Array(GLYPH_LEN);
    for (let i = 0; i < GLYPH_LEN; i++) glyph[i] = bits.charCodeAt(i) === 49 ? 1 : 0;
    return glyph;
};

let useFallback = false;
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

const readFallback = (): SampleRecord[] => {
    try {
        const raw = localStorage.getItem(FALLBACK_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
};

const writeFallback = (records: SampleRecord[]) => {
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(records)); } catch { /* sin cuota */ }
};

const allRecords = async (): Promise<SampleRecord[]> => {
    if (!useFallback) {
        try {
            return await tx<SampleRecord[]>('readonly', s => s.getAll() as IDBRequest<SampleRecord[]>);
        } catch { useFallback = true; }
    }
    return readFallback();
};

export const loadTemplates = async (): Promise<Map<string, Glyph[]>> => {
    const map = new Map<string, Glyph[]>();
    for (const rec of await allRecords()) {
        const glyph = decode(rec.bits);
        if (!glyph) continue;
        const list = map.get(rec.letter) ?? [];
        list.push(glyph);
        map.set(rec.letter, list);
    }
    return map;
};

export const learnGlyph = async (letter: string, glyph: Glyph): Promise<void> => {
    const bits = encode(glyph);
    const existing = await allRecords();

    // Nada que aprender si ya tenemos esa huella exacta.
    if (existing.some(r => r.letter === letter && r.bits === bits)) return;

    const record: SampleRecord = {
        id: `${letter}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        letter,
        bits,
        createdAt: Date.now(),
    };

    const doomed = new Set<string>();

    // Si nos pasamos del cupo, tiramos la muestra más antigua de esa letra.
    const sameLetter = existing.filter(r => r.letter === letter).sort((a, b) => a.createdAt - b.createdAt);
    if (sameLetter.length >= MAX_PER_LETTER) doomed.add(sameLetter[0].id);

    // Si una plantilla de OTRA letra se parece tanto a esta huella que la
    // reconocería como suya, estaba mal aprendida: corregir también la desmonta.
    for (const other of existing) {
        if (other.letter === letter) continue;
        const glyphOther = decode(other.bits);
        if (glyphOther && glyphDistance(glyph, glyphOther) < 0.1) doomed.add(other.id);
    }

    if (!useFallback) {
        try {
            for (const id of doomed) await tx('readwrite', s => s.delete(id));
            await tx('readwrite', s => s.put(record));
            return;
        } catch { useFallback = true; }
    }
    const next = readFallback().filter(r => !doomed.has(r.id));
    writeFallback([...next, record]);
};

export const countTemplates = async (): Promise<{ letters: number; samples: number }> => {
    const records = await allRecords();
    return { letters: new Set(records.map(r => r.letter)).size, samples: records.length };
};

export const clearTemplates = async (): Promise<void> => {
    if (!useFallback) {
        try { await tx('readwrite', s => s.clear()); return; } catch { useFallback = true; }
    }
    writeFallback([]);
};
