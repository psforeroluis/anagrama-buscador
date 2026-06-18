export interface BoardSlot {
    id: string;
    letter: string;
}

export interface SavedGame {
    id: string;
    name: string;
    rackLetters: string;
    blanks: number;
    boardSlots: BoardSlot[];
    updatedAt: number;
}

export type SearchMode = 'anagram' | 'pattern' | 'combined';

export interface FoundWord {
    word: string;
    score: number;
}
