// Palabras vistas en tableros que todavía no forman parte del diccionario.
// Esta bandeja es deliberadamente pasiva: el motor nunca la consulta.

import { BoardState } from '../types';
import { normalizeWord } from './wordBlocklist';

const STORAGE_KEY = 'anagrama.candidates.v1';

export const extractBoardWords = (board: BoardState): string[] => {
    const found = new Set<string>();
    const collect = (line: string) => {
        for (const part of line.split('.')) {
            const word = normalizeWord(part);
            if (word.length >= 2) found.add(word);
        }
    };

    for (const row of board.letters) collect(row);
    for (let col = 0; col < board.letters.length; col++) {
        collect(board.letters.map(row => row[col] ?? '.').join(''));
    }
    return Array.from(found).sort();
};

export const loadCandidates = (): string[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return [];
        return Array.from(new Set(parsed
            .filter((word): word is string => typeof word === 'string')
            .map(normalizeWord)
            .filter(word => word.length >= 2))).sort();
    } catch {
        return [];
    }
};

export const saveCandidates = (words: string[]): string[] => {
    const clean = Array.from(new Set(words.map(normalizeWord).filter(word => word.length >= 2))).sort();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); } catch { /* sin cuota */ }
    return clean;
};

export const addCandidates = (words: string[]): string[] =>
    saveCandidates([...loadCandidates(), ...words]);

export const removeCandidate = (word: string): string[] =>
    saveCandidates(loadCandidates().filter(candidate => candidate !== normalizeWord(word)));

export const exportCandidates = (words: string[]): string => {
    const filename = `anagrama-palabras-detectadas-${new Date().toISOString().slice(0, 10)}.txt`;
    const blob = new Blob([`${words.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return filename;
};
