// Palabras que el diccionario trae pero tu juego no acepta.
//
// No se toca el fichero del diccionario: se guarda aparte una lista de vetadas
// y el motor las ignora. Así es reversible, no se pierde si algún día se
// actualiza el diccionario, y puedes revisar qué has vetado.

const STORAGE_KEY = 'anagrama.blocked.v1';

/** Sin tildes y en minúsculas, que es como juega el motor de tablero. */
export const normalizeWord = (word: string): string =>
    word.toLowerCase().trim()
        .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
        .replace(/[óò]/g, 'o').replace(/[úùü]/g, 'u')
        .replace(/[^a-zñ]/g, '');

export const loadBlocked = (): string[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return Array.from(new Set(parsed.filter((w): w is string => typeof w === 'string' && w.length > 0)));
    } catch {
        return [];
    }
};

export const saveBlocked = (words: string[]): void => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(new Set(words)).sort()));
    } catch { /* sin cuota: seguimos sin persistir */ }
};

export const blockWord = (word: string): string[] => {
    const clean = normalizeWord(word);
    if (!clean) return loadBlocked();
    const next = Array.from(new Set([...loadBlocked(), clean])).sort();
    saveBlocked(next);
    return next;
};

export const unblockWord = (word: string): string[] => {
    const clean = normalizeWord(word);
    const next = loadBlocked().filter(w => w !== clean);
    saveBlocked(next);
    return next;
};
