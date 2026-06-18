// --- Dictionary Store ---
let wordData = []; // {word: string, normCharMap: object}[]

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

const cleanString = (str) => normalizeAccents(str.toLowerCase()).replace(/[^a-zñ]/g, '');
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

    if (!/[-?*]/.test(cleanPat)) {
        const normPat = normalizeAccents(cleanPat);
        return words.filter(w => normalizeAccents(w) === normPat);
    }

    if (cleanPat.startsWith('-') && cleanPat.endsWith('-') && cleanPat.length > 2) {
        const middle = cleanPat.slice(1, -1);
        if (!/[-?*]/.test(middle)) {
            const normMiddle = normalizeAccents(middle);
            return words.filter(w => normalizeAccents(w).includes(normMiddle));
        }
    }

    if (cleanPat.endsWith('-') && !cleanPat.startsWith('-')) {
        const prefix = cleanPat.slice(0, -1);
        if (!/[-?*]/.test(prefix)) {
            const normPrefix = normalizeAccents(prefix);
            return words.filter(w => normalizeAccents(w).startsWith(normPrefix));
        }
    }

    if (cleanPat.startsWith('-') && !cleanPat.endsWith('-')) {
        const suffix = cleanPat.slice(1);
        if (!/[-?*]/.test(suffix)) {
            const normSuffix = normalizeAccents(suffix);
            return words.filter(w => normalizeAccents(w).endsWith(normSuffix));
        }
    }

    // Complex pattern: trailing '?' are optional (word may be shorter than pattern)
    try {
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
        results = wordData.filter(d => d.word.length >= 2).map(d => d.word);
    }

    if (cleanPat) {
        results = filterByPattern(cleanPat, results);
    }

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

// --- Message Handler ---
self.onmessage = (event) => {
    const { type, payload, dictionaryText } = event.data;

    try {
        if (type === 'init') {
            if (dictionaryText) {
                const rawWordSet = new Set();
                const rawWords = dictionaryText.split('\n');

                for (let i = 0; i < rawWords.length; i++) {
                    const rawWord = rawWords[i].trim();
                    if (!rawWord || rawWord.startsWith('-')) continue;

                    if (/^[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\-\s,]+$/.test(rawWord)) {
                        if (rawWord.includes(',')) {
                            const parts = rawWord.split(',').map(p => p.trim());
                            const base = parts[0];
                            if (!base) continue;
                            rawWordSet.add(base.toLowerCase());
                            const suffix = parts[1];
                            if (suffix && suffix.length <= 3) {
                                if (base.endsWith('o') && suffix === 'a') {
                                    rawWordSet.add((base.slice(0, -1) + 'a').toLowerCase());
                                } else if (base.endsWith('ado') && suffix === 'da') {
                                    rawWordSet.add((base.slice(0, -3) + 'ada').toLowerCase());
                                } else if (base.endsWith('or') && suffix === 'ra') {
                                    rawWordSet.add((base + 'a').toLowerCase());
                                } else if (base.endsWith('és') && suffix === 'sa') {
                                    rawWordSet.add((base.slice(0, -2) + 'esa').toLowerCase());
                                } else if (base.endsWith('ón') && suffix === 'na') {
                                    rawWordSet.add((base.slice(0, -2) + 'ona').toLowerCase());
                                } else if (base.length > suffix.length) {
                                    rawWordSet.add((base.slice(0, -suffix.length) + suffix).toLowerCase());
                                }
                            }
                        } else {
                            rawWordSet.add(rawWord.toLowerCase());
                        }
                    }
                }

                const cleanWords = Array.from(rawWordSet)
                    .map(w => w.toLowerCase().replace(/[^a-zñáéíóúü]/g, ''))
                    .filter(w => w.length >= 2 && /^[a-zñáéíóúü]+$/.test(w));

                wordData = cleanWords.map(word => ({
                    word,
                    normCharMap: createCharMap(normalizeAccents(word))
                }));
            }
            self.postMessage({ type: 'ready', size: wordData.length });

        } else if (type === 'solve') {
            if (wordData.length === 0) throw new Error('Dictionary not loaded yet.');
            const { letters, pattern, blanks = 0 } = payload;
            const results = solve(letters, pattern, blanks);
            self.postMessage({ type: 'result', data: results });
        }
    } catch (e) {
        console.error('Error in worker:', e);
        self.postMessage({ type: 'result', data: [] });
    }
};
