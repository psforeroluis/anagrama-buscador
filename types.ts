export interface BoardSlot {
    id: string;
    letter: string;
}

export type SearchMode = 'anagram' | 'pattern' | 'combined' | 'parallel';

export interface FoundWord {
    word: string;
    score: number;
    leave?: string;
    leaveQuality?: 'good' | 'warn';
}
