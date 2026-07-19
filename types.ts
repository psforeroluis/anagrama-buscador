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
    parallelMode: boolean;
    updatedAt: number;
}

export type SearchMode = 'anagram' | 'pattern' | 'combined' | 'parallel';

export interface FoundWord {
    word: string;
    score: number;
    leave?: string;
    leaveQuality?: 'good' | 'warn';
}
