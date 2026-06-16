export interface BoardSlot {
    id: string;
    letter: string; // empty = rack tile needed; has letter = fixed board tile (free)
}

export type PlayDirection = 'H' | 'V';
export type PlayerSide = 'me' | 'opponent';

export interface PlayRecord {
    id: string;
    word: string;
    player: PlayerSide;
    startRow: number;
    startCol: number;
    direction: PlayDirection;
    score: number;
}

export interface SavedGame {
    id: string;
    name: string;
    rackLetters: string;
    blanks: number;
    boardSlots: BoardSlot[];
    plays: PlayRecord[];
    updatedAt: number;
}

export type SearchMode = 'anagram' | 'pattern' | 'combined';

export interface FoundWord {
    word: string;
    score: number;
}
