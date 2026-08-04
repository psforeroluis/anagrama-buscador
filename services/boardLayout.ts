// Diseño del tablero para la UI.
// OJO: el worker (public/services/anagramSolver.ts) se carga como texto plano
// y no puede importar módulos, así que mantiene su propia copia de esta tabla.
// Si cambias una, cambia la otra.

export const BOARD_SIZE = 15;

// Disposición de Apalabrados / Words With Friends (la del tablero de Luis),
// no la de Scrabble clásico. La casilla central (★) no multiplica.
export const PREMIUM_ROWS = [
    '..T.t.....t.T..',
    '.t...D...D...t.',
    'T.d...t.t...d.T',
    '...t...D...t...',
    't.....d.d.....t',
    '.D...t...t...D.',
    '..t.d.....d.t..',
    '...D.......D...',
    '..t.d.....d.t..',
    '.D...t...t...D.',
    't.....d.d.....t',
    '...t...D...t...',
    'T.d...t.t...d.T',
    '.t...D...D...t.',
    '..T.t.....t.T..',
];

/** Bonus por usar las 7 fichas del atril (Apalabrados: 35; Scrabble: 50). */
export const BINGO_BONUS = 35;

export const TILE_VALUES: Record<string, number> = {
    a: 1, e: 1, i: 1, o: 1, u: 1, l: 1, n: 1, r: 1, s: 1, t: 1,
    d: 2, g: 2,
    b: 3, c: 3, m: 3, p: 3,
    f: 4, h: 4, v: 4, y: 4,
    q: 5,
    j: 8, 'ñ': 8, x: 8,
    z: 10,
};

/** Fichas de cada letra en Apalabrados (no hay K ni W, ni dígrafos). */
export const TILE_DISTRIBUTION: Record<string, number> = {
    a: 12, b: 2, c: 4, d: 5, e: 12, f: 1, g: 2, h: 2, i: 6, j: 1,
    l: 4, m: 2, n: 5, 'ñ': 1, o: 9, p: 2, q: 1, r: 5, s: 6, t: 4,
    u: 5, v: 1, x: 1, y: 1, z: 1,
};

export const BLANK_COUNT = 2;

export const TOTAL_TILES =
    Object.values(TILE_DISTRIBUTION).reduce((a, b) => a + b, 0) + BLANK_COUNT;

export interface TileCensus {
    /** Fichas que aún no has visto: bolsa + atril del rival. */
    unseen: number;
    /** Comodines que quedan sin ver. */
    unseenBlanks: number;
    /** Letras de las que has contado más fichas de las que existen. */
    impossible: { letter: string; counted: number; max: number }[];
}

/**
 * Cuenta lo que queda por ver a partir del tablero y de tu atril. Sirve para el
 * final de partida y para detectar erratas al transcribir el tablero.
 */
export const censusTiles = (
    boardLetters: string[],
    boardBlanks: string[],
    rack: string,
    rackBlanks: number,
): TileCensus => {
    const counted: Record<string, number> = {};
    let blanksCounted = rackBlanks;

    for (let r = 0; r < boardLetters.length; r++) {
        for (let c = 0; c < boardLetters[r].length; c++) {
            const ch = boardLetters[r][c];
            if (ch === '.') continue;
            if (boardBlanks[r]?.[c] === '1') blanksCounted++;
            else counted[ch] = (counted[ch] ?? 0) + 1;
        }
    }
    for (const ch of rack.toLowerCase()) {
        if (TILE_DISTRIBUTION[ch] !== undefined) counted[ch] = (counted[ch] ?? 0) + 1;
    }

    const impossible: TileCensus['impossible'] = [];
    let seen = blanksCounted;
    for (const [letter, max] of Object.entries(TILE_DISTRIBUTION)) {
        const n = counted[letter] ?? 0;
        seen += Math.min(n, max);
        if (n > max) impossible.push({ letter, counted: n, max });
    }

    return {
        unseen: Math.max(0, TOTAL_TILES - seen),
        unseenBlanks: Math.max(0, BLANK_COUNT - blanksCounted),
        impossible,
    };
};

export const PREMIUM_STYLE: Record<string, { cell: string; label: string }> = {
    T: { cell: 'bg-rose-500/25 text-rose-200/70', label: 'TP' },
    D: { cell: 'bg-fuchsia-500/20 text-fuchsia-200/70', label: 'DP' },
    t: { cell: 'bg-sky-500/25 text-sky-200/70', label: 'TL' },
    d: { cell: 'bg-cyan-500/15 text-cyan-200/70', label: 'DL' },
    '.': { cell: 'bg-ink-600/60 text-transparent', label: '' },
};

export const emptyBoard = () => ({
    letters: Array.from({ length: BOARD_SIZE }, () => '.'.repeat(BOARD_SIZE)),
    blanks: Array.from({ length: BOARD_SIZE }, () => '0'.repeat(BOARD_SIZE)),
});

export const setCell = (rows: string[], row: number, col: number, ch: string): string[] =>
    rows.map((r, i) => (i === row ? r.slice(0, col) + ch + r.slice(col + 1) : r));

export const countTiles = (letters: string[]): number =>
    letters.reduce((acc, r) => acc + [...r].filter(ch => ch !== '.').length, 0);
