export interface BoardSlot {
    id: string;
    letter: string;
}

export type SearchMode = 'anagram' | 'pattern' | 'combined' | 'parallel';

export interface MoveTile {
    row: number;
    col: number;
    letter: string;
    blank: boolean;
}

export interface BoardMove {
    word: string;
    score: number;
    bingo: boolean;
    row: number;
    col: number;
    direction: 'H' | 'V';
    tiles: MoveTile[];
    usedLetters: string;
    usedBlanks: number;
    leave?: string;
    leaveQuality?: 'good' | 'warn';
}

/** Tablero 15x15: 15 cadenas de 15 chars ('.' = casilla vacía). */
export interface BoardState {
    letters: string[];
    blanks: string[];
}

export interface FoundWord {
    word: string;
    score: number;
    leave?: string;
    leaveQuality?: 'good' | 'warn';
}
