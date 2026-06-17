// --- Dictionary Store ---
let wordData = []; // {word: string, normCharMap: object}[]
let wordSet = new Set(); // normalized words for O(1) cross-word validation

// --- Scoring ---
const SCORES = {
    'a': 1, 'e': 1, 'i': 1, 'o': 1, 'u': 1, 'l': 1, 'n': 1, 'r': 1, 's': 1, 't': 1,
    'd': 2, 'g': 2,
    'b': 3, 'c': 3, 'm': 3, 'p': 3,
    'f': 4, 'h': 4, 'v': 4, 'y': 4,
    'ch': 5, 'q': 5,
    'j': 8, 'll': 8, 'ñ': 8, 'rr': 8, 'x': 8,
    'z': 10
};

const calculateScore = (word) => {
    // Score based on normalized form (no accents) since tiles have no accents
    const norm = normalizeAccents(word);
    let score = 0;
    for (let i = 0; i < norm.length; i++) {
        if (i + 1 < norm.length) {
            const digraph = norm.substring(i, i + 2);
            if (SCORES[digraph]) { score += SCORES[digraph]; i++; continue; }
        }
        score += SCORES[norm[i]] || 0;
    }
    return score;
};

// --- Accent normalization (á→a, é→e etc., but ñ stays ñ) ---
const normalizeAccents = (str) => {
    return str
        .replace(/[áà]/g, 'a')
        .replace(/[éè]/g, 'e')
        .replace(/[íì]/g, 'i')
        .replace(/[óò]/g, 'o')
        .replace(/[úùü]/g, 'u');
};

// --- Helpers ---
const createCharMap = (str) => {
    const map = {};
    for (const ch of str) { map[ch] = (map[ch] || 0) + 1; }
    return map;
};

// Normalize + clean: remove accents (except ñ) then strip non-letter chars
const cleanString = (str) => normalizeAccents(str.toLowerCase()).replace(/[^a-zñ]/g, '');

// Pattern keeps accents and wildcards for flexible matching
const cleanPattern = (str) => str.toLowerCase().trim().replace(/[^a-zñáéíóúü\-\?\*]/g, '');

// --- Anagram search with optional blank tiles ---
const findAnagrams = (letters, blanks) => {
    const cleanLetters = cleanString(letters);
    if (!cleanLetters) return [];

    const inputMap = createCharMap(cleanLetters);
    const maxLen = cleanLetters.length + blanks;
    const found = [];

    for (const { word, normCharMap } of wordData) {
        if (word.length < 2 || word.length > maxLen) continue;

        let blanksUsed = 0;
        let canBeFormed = true;

        for (const char in normCharMap) {
            const deficit = normCharMap[char] - (inputMap[char] || 0);
            if (deficit > 0) {
                blanksUsed += deficit;
                if (blanksUsed > blanks) { canBeFormed = false; break; }
            }
        }

        if (canBeFormed) found.push(word);
    }

    return found;
};

// --- Pattern Matching ---
const filterByPattern = (pattern, words) => {
    const cleanPat = cleanPattern(pattern);
    if (!cleanPat) return words;

    // No wildcards: exact match (normalize both sides)
    if (!/[-?*]/.test(cleanPat)) {
        const normPat = normalizeAccents(cleanPat);
        return words.filter(w => normalizeAccents(w) === normPat);
    }

    // Contains: '-or-'
    if (cleanPat.startsWith('-') && cleanPat.endsWith('-') && cleanPat.length > 2) {
        const middle = cleanPat.slice(1, -1);
        if (!/[-?*]/.test(middle)) {
            const normMiddle = normalizeAccents(middle);
            return words.filter(w => normalizeAccents(w).includes(normMiddle));
        }
    }

    // Starts with: 'ca-'
    if (cleanPat.endsWith('-') && !cleanPat.startsWith('-')) {
        const prefix = cleanPat.slice(0, -1);
        if (!/[-?*]/.test(prefix)) {
            const normPrefix = normalizeAccents(prefix);
            return words.filter(w => normalizeAccents(w).startsWith(normPrefix));
        }
    }

    // Ends with: '-ción'
    if (cleanPat.startsWith('-') && !cleanPat.endsWith('-')) {
        const suffix = cleanPat.slice(1);
        if (!/[-?*]/.test(suffix)) {
            const normSuffix = normalizeAccents(suffix);
            return words.filter(w => normalizeAccents(w).endsWith(normSuffix));
        }
    }

    // Complex pattern: '?' = one char slot (trailing ones are optional — you may not use all tiles)
    try {
        // Find last position that is a fixed letter (not a wildcard)
        const chars = cleanPat.split('');
        const lastFixed = chars.reduce(
            (acc, ch, i) => (ch !== '?' && ch !== '-' && ch !== '*') ? i : acc, -1
        );

        const regexSource = chars
            .map((ch, i) => {
                if (ch === '?') return i > lastFixed ? '.?' : '.';
                if (ch === '-' || ch === '*') return '.*';
                return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('');
        const regex = new RegExp(`^${regexSource}$`);
        return words.filter(w => regex.test(normalizeAccents(w)));
    } catch (e) {
        console.error('Invalid regex from pattern:', e);
        return [];
    }
};

// --- Main Solver ---
const solve = (letters, pattern, blanks) => {
    const cleanLetters = cleanString(letters);
    const cleanPat = cleanPattern(pattern);
    let results;

    if (cleanLetters) {
        const patternLetters = cleanPat.replace(/[-?*]/g, '');
        results = findAnagrams(cleanLetters + cleanString(patternLetters), blanks);
    } else {
        // Pattern-only: search entire dictionary (still require min 2 letters)
        results = wordData.filter(d => d.word.length >= 2).map(d => d.word);
    }

    if (cleanPat) {
        results = filterByPattern(cleanPat, results);
    }

    // Deduplicate by normalized form, keeping the accented version
    const seen = new Set();
    const deduped = [];
    for (const word of results) {
        const key = normalizeAccents(word);
        if (!seen.has(key)) { seen.add(key); deduped.push(word); }
    }

    return deduped
        .map(word => ({ word, score: calculateScore(word) }))
        .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, 'es'));
};

// --- Board-aware placement engine ---

// Apalabrados = Words With Friends layout (0-indexed) — TP NOT at corners
const BONUS_BOARD = {
    '0,3':'TW','0,11':'TW','3,0':'TW','3,14':'TW','11,0':'TW','11,14':'TW','14,3':'TW','14,11':'TW',
    '1,1':'DW','1,13':'DW','2,4':'DW','2,10':'DW','4,2':'DW','4,12':'DW','7,7':'DW',
    '10,2':'DW','10,12':'DW','12,4':'DW','12,10':'DW','13,1':'DW','13,13':'DW',
    '0,6':'TL','0,8':'TL','3,5':'TL','3,9':'TL','5,3':'TL','5,11':'TL',
    '6,0':'TL','6,14':'TL','8,0':'TL','8,14':'TL','9,3':'TL','9,11':'TL',
    '11,5':'TL','11,9':'TL','14,6':'TL','14,8':'TL',
    '0,0':'DL','0,14':'DL','1,5':'DL','1,9':'DL','2,2':'DL','2,12':'DL',
    '4,4':'DL','4,10':'DL','5,6':'DL','5,8':'DL','7,3':'DL','7,11':'DL',
    '8,6':'DL','8,8':'DL','9,6':'DL','9,8':'DL','10,4':'DL','10,10':'DL',
    '12,2':'DL','12,12':'DL','13,5':'DL','13,9':'DL','14,0':'DL','14,14':'DL',
};

// Score a word placed at (row, col) in direction, only applying bonuses to NEW tiles
const scorePlacement = (normWord, row, col, direction, board) => {
    let wordScore = 0;
    let wordMult = 1;
    for (let i = 0; i < normWord.length; i++) {
        const r = direction === 'H' ? row : row + i;
        const c = direction === 'H' ? col + i : col;
        const isNew = !board[r]?.[c]; // null/undefined = new tile
        const bonus = isNew ? (BONUS_BOARD[`${r},${c}`] || null) : null;
        const ls = SCORES[normWord[i]] || 0;
        if (!bonus)          wordScore += ls;
        else if (bonus === 'TL') wordScore += ls * 3;
        else if (bonus === 'DL') wordScore += ls * 2;
        else { wordScore += ls; if (bonus === 'TW') wordMult *= 3; else wordMult *= 2; }
    }
    return wordScore * wordMult;
};

// Check whether normWord can legally be placed at (row, col, direction) on board.
// Also validates every cross-word formed by newly placed tiles against the dictionary.
const canPlace = (normWord, row, col, direction, board, boardIsEmpty) => {
    const len = normWord.length;
    if (direction === 'H' && col + len > 15) return false;
    if (direction === 'V' && row + len > 15) return false;

    // Word must not extend an existing word (no tile immediately before/after)
    if (direction === 'H') {
        if (col > 0 && board[row]?.[col - 1]) return false;
        if (col + len < 15 && board[row]?.[col + len]) return false;
    } else {
        if (row > 0 && board[row - 1]?.[col]) return false;
        if (row + len < 15 && board[row + len]?.[col]) return false;
    }

    if (boardIsEmpty) {
        for (let i = 0; i < len; i++) {
            const r = direction === 'H' ? row : row + i;
            const c = direction === 'H' ? col + i : col;
            if (r === 7 && c === 7) return true;
        }
        return false;
    }

    let hasAnchor = false;
    for (let i = 0; i < len; i++) {
        const r = direction === 'H' ? row : row + i;
        const c = direction === 'H' ? col + i : col;
        const existing = board[r]?.[c] ?? null;

        if (existing !== null) {
            if (existing !== normWord[i]) return false; // letter conflict with board
            hasAnchor = true;
        } else {
            // Empty cell: check perpendicular adjacency (counts as anchor)
            if (direction === 'H') {
                if (board[r - 1]?.[c] || board[r + 1]?.[c]) hasAnchor = true;
            } else {
                if (board[r]?.[c - 1] || board[r]?.[c + 1]) hasAnchor = true;
            }

            // Cross-word validation: build the word formed perpendicularly by this new tile
            let cross = '';
            if (direction === 'H') {
                // Scan upward then downward in column c, inserting normWord[i] at row r
                let rr = r; while (rr > 0 && board[rr - 1]?.[c]) rr--;
                while (rr < 15) { const ch = rr === r ? normWord[i] : board[rr]?.[c]; if (!ch) break; cross += ch; rr++; }
            } else {
                // Scan left then right in row r, inserting normWord[i] at col c
                let cc = c; while (cc > 0 && board[r]?.[cc - 1]) cc--;
                while (cc < 15) { const ch = cc === c ? normWord[i] : board[r]?.[cc]; if (!ch) break; cross += ch; cc++; }
            }
            // If a cross-word formed (≥2 letters), it must exist in the dictionary
            if (cross.length >= 2 && !wordSet.has(cross)) return false;
        }
    }
    return hasAnchor;
};

const solveWithBoard = (letters, blanks, board) => {
    const boardIsEmpty = board.every(row => row.every(cell => !cell));
    const cleanLetters = cleanString(letters);
    if (!cleanLetters) return [];

    const candidates = findAnagrams(cleanLetters, blanks);
    const results = [];

    for (const word of candidates) {
        const normWord = normalizeAccents(word.toLowerCase()).replace(/[^a-zñ]/g, '');
        if (normWord.length < 2) continue;
        const placements = [];

        for (const dir of ['H', 'V']) {
            const maxR = dir === 'H' ? 14 : 15 - normWord.length;
            const maxC = dir === 'H' ? 15 - normWord.length : 14;
            for (let r = 0; r <= maxR; r++) {
                for (let c = 0; c <= maxC; c++) {
                    if (canPlace(normWord, r, c, dir, board, boardIsEmpty)) {
                        placements.push({ row: r, col: c, direction: dir,
                            score: scorePlacement(normWord, r, c, dir, board) });
                    }
                }
            }
        }

        if (placements.length > 0) {
            placements.sort((a, b) => b.score - a.score);
            results.push({ word, score: placements[0].score, placements: placements.slice(0, 12) });
        }
    }

    // Deduplicate by normalized form
    const seen = new Set();
    return results
        .filter(r => { const k = normalizeAccents(r.word); if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, 'es'))
        .slice(0, 150);
};

// --- Message Handler ---
self.onmessage = (event) => {
    const { type, payload, dictionaryText } = event.data;

    try {
        if (type === 'init') {
            if (dictionaryText) {
                const wordSet = new Set();
                const rawWords = dictionaryText.split('\n');

                for (let i = 0; i < rawWords.length; i++) {
                    const rawWord = rawWords[i].trim();
                    if (!rawWord || rawWord.startsWith('-')) continue;

                    if (/^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\-\s,]+$/.test(rawWord)) {
                        if (rawWord.includes(',')) {
                            const parts = rawWord.split(',').map(p => p.trim());
                            const base = parts[0];
                            if (!base) continue;
                            wordSet.add(base.toLowerCase());
                            const suffix = parts[1];
                            if (suffix && suffix.length <= 3) {
                                if (base.endsWith('o') && suffix === 'a') {
                                    wordSet.add((base.slice(0, -1) + 'a').toLowerCase());
                                } else if (base.endsWith('ado') && suffix === 'da') {
                                    wordSet.add((base.slice(0, -3) + 'ada').toLowerCase());
                                } else if (base.endsWith('or') && suffix === 'ra') {
                                    wordSet.add((base + 'a').toLowerCase());
                                } else if (base.endsWith('és') && suffix === 'sa') {
                                    wordSet.add((base.slice(0, -2) + 'esa').toLowerCase());
                                } else if (base.endsWith('ón') && suffix === 'na') {
                                    wordSet.add((base.slice(0, -2) + 'ona').toLowerCase());
                                } else if (base.length > suffix.length) {
                                    wordSet.add((base.slice(0, -suffix.length) + suffix).toLowerCase());
                                }
                            }
                        } else {
                            wordSet.add(rawWord.toLowerCase());
                        }
                    }
                }

                const cleanWords = Array.from(wordSet)
                    .map(w => w.toLowerCase().replace(/[^a-zñáéíóúü]/g, ''))
                    .filter(w => w.length >= 2 && /^[a-zñáéíóúü]+$/.test(w));

                // Pre-compute normalized charMaps for fast anagram matching
                wordData = cleanWords.map(word => ({
                    word,
                    normCharMap: createCharMap(normalizeAccents(word))
                }));
                // Build normalized set for O(1) cross-word lookup
                wordSet = new Set(wordData.map(d => normalizeAccents(d.word)));
            }
            self.postMessage({ type: 'ready', size: wordData.length });

        } else if (type === 'solve') {
            if (wordData.length === 0) throw new Error('Dictionary not loaded yet.');
            const { letters, pattern, blanks = 0, board = null } = payload;
            const results = (board && letters.trim())
                ? solveWithBoard(letters, blanks, board)
                : solve(letters, pattern, blanks);
            self.postMessage({ type: 'result', data: results });
        }
    } catch (e) {
        console.error('Error in worker:', e);
        self.postMessage({ type: 'result', data: [] });
    }
};
