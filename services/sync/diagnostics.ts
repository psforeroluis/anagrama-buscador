// Registro local acotado de errores: sustituye a los `catch {}` vacíos. Guarda los
// últimos 50 en memoria y en localStorage; si escribir falla (cuota llena), se ignora.

export interface DiagnosticEntry {
    at: number;
    source: string;
    message: string;
}

const KEY = 'anagrama.diagnostics.v1';
const MAX_ENTRIES = 50;

const isEntry = (x: unknown): x is DiagnosticEntry => {
    const e = x as DiagnosticEntry;
    return !!e && Number.isFinite(e.at) && typeof e.source === 'string' && typeof e.message === 'string';
};

const load = (): DiagnosticEntry[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter(isEntry).slice(-MAX_ENTRIES) : [];
    } catch { return []; }
};

let entries: DiagnosticEntry[] | null = null;
const current = (): DiagnosticEntry[] => (entries ??= load());

const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(current())); } catch { /* cuota llena: se queda en memoria */ }
};

const describe = (error: unknown): string =>
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'error desconocido';

/** Anota un error. Nunca lanza. */
export const logError = (source: string, error: unknown, now = Date.now()): void => {
    entries = [...current(), { at: now, source, message: describe(error) }].slice(-MAX_ENTRIES);
    persist();
};

export const readDiagnostics = (): DiagnosticEntry[] => [...current()];

export const clearDiagnostics = (): void => {
    entries = [];
    persist();
};

/** Texto para copiar y pegar en un informe. */
export const dumpDiagnostics = (): string =>
    current().map(e => `${new Date(e.at).toISOString()} [${e.source}] ${e.message}`).join('\n');
