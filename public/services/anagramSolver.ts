// --- Dictionary Store ---
let wordData = []; // {word: string, normCharMap: object}[]
let twoLetterSet = new Set(); // normalized 2-letter words, for parallel-overlap cross-checks

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

// --- Parallel-overlap mode ---
// Board letters that are only *adjacent* (not spelled through) constrain candidates
// via which two-letter words actually exist in the dictionary, instead of exact identity.
const buildTwoLetterSet = () => {
    twoLetterSet = new Set();
    for (const { word } of wordData) {
        if (word.length === 2) twoLetterSet.add(normalizeAccents(word));
    }
};

const pairValid = (boardLetter, candidateLetter) =>
    twoLetterSet.has(boardLetter + candidateLetter) || twoLetterSet.has(candidateLetter + boardLetter);

const findParallelWords = (letters, blanks, normalizedPattern) => {
    const cleanLetters = cleanString(letters);
    const patLen = normalizedPattern.length;
    if (!cleanLetters || patLen === 0) return [];

    const inputMap = createCharMap(cleanLetters);
    const found = [];

    for (const { word, normCharMap } of wordData) {
        if (word.length !== patLen) continue;

        let crossOk = true;
        for (let i = 0; i < patLen; i++) {
            const boardCh = normalizedPattern[i];
            if (boardCh === '?') continue;
            if (!pairValid(boardCh, normalizeAccents(word[i]))) { crossOk = false; break; }
        }
        if (!crossOk) continue;

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

// --- Rack leave: letters remaining after a word is played, for balance feedback ---
const computeLeave = (word, cleanLetters, blanks) => {
    const rackMap = createCharMap(cleanLetters);
    const wordMap = createCharMap(normalizeAccents(word));
    let blanksUsed = 0;

    for (const char in wordMap) {
        const used = Math.min(rackMap[char] || 0, wordMap[char]);
        rackMap[char] = (rackMap[char] || 0) - used;
        blanksUsed += wordMap[char] - used;
    }
    const blanksLeft = blanks - blanksUsed;

    const leaveChars = Object.keys(rackMap).filter(c => rackMap[c] > 0).sort();
    const leave = leaveChars.map(c => c.repeat(rackMap[c])).join('') + '*'.repeat(Math.max(0, blanksLeft));
    if (!leave) return { leave: '', leaveQuality: undefined };

    const anyTriple = leaveChars.some(c => rackMap[c] >= 3);
    const vowels = leaveChars.filter(c => 'aeiou'.includes(c));
    const goodConsonants = leaveChars.filter(c => 'rslnt'.includes(c));
    const rareConsonants = leaveChars.filter(c => !'aeiourslnt'.includes(c));

    let leaveQuality;
    if (anyTriple) leaveQuality = 'warn';
    else if (rareConsonants.length >= 2 && vowels.length === 0) leaveQuality = 'warn';
    else if (vowels.length > 0 && (goodConsonants.length > 0 || blanksLeft > 0)) leaveQuality = 'good';

    return { leave, leaveQuality };
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
const solve = (letters, pattern, blanks, parallelMode) => {
    const cleanLetters = cleanString(letters);
    const cleanPat = cleanPattern(pattern);
    let results;
    let doLeave = false;

    if (parallelMode) {
        const normalizedPattern = normalizeAccents(cleanPat);
        // Parallel mode needs an exact-length pattern (fixed board letters + '?' gaps),
        // open-ended wildcards ('-', '*') don't make sense as adjacency slots.
        results = (normalizedPattern && !/[-*]/.test(normalizedPattern))
            ? findParallelWords(letters, blanks, normalizedPattern)
            : [];
        doLeave = !!cleanLetters;
    } else {
        if (cleanLetters) {
            const patternLetters = cleanPat.replace(/[-?*]/g, '');
            results = findAnagrams(cleanLetters + cleanString(patternLetters), blanks);
        } else {
            results = wordData.filter(d => d.word.length >= 2).map(d => d.word);
        }

        if (cleanPat) {
            results = filterByPattern(cleanPat, results);
        }
        doLeave = !!cleanLetters && !cleanPat;
    }

    const seen = new Set();
    const deduped = [];
    for (const word of results) {
        const key = normalizeAccents(word);
        if (blockedWords.has(key)) continue;
        if (!seen.has(key)) { seen.add(key); deduped.push(word); }
    }

    return deduped
        .map(word => {
            const base = { word, score: calculateScore(word) };
            if (doLeave) Object.assign(base, computeLeave(word, cleanLetters, blanks));
            return base;
        })
        .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, 'es'));
};

// =====================================================================
// BOARD ENGINE — DAWG + generador de jugadas (Appel & Jacobson)
// Puntúa de verdad: multiplicadores de casilla, palabras cruzadas,
// bonus de 7 fichas y comodines a 0 puntos.
// =====================================================================

const BOARD_SIZE = 15;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzñ';
const LETTER_INDEX = {};
for (let i = 0; i < ALPHABET.length; i++) LETTER_INDEX[ALPHABET[i]] = i;

// Valor de cada ficha (una letra por casilla; sin fichas de dígrafo CH/LL/RR).
const TILE_VALUES = new Uint8Array(ALPHABET.length);
for (let i = 0; i < ALPHABET.length; i++) TILE_VALUES[i] = SCORES[ALPHABET[i]] || 0;

// Premios: '.' normal · d/t = letra doble/triple · D/T = palabra doble/triple.
// Disposición de Apalabrados / Words With Friends; la casilla central no multiplica.
// El tablero es simétrico respecto a la diagonal, así que la misma tabla
// sirve para la orientación transpuesta.
// (Copia de services/boardLayout.ts — este worker se carga como texto y no importa módulos.)
const PREMIUM_ROWS = [
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

// Bonus por usar las 7 fichas del atril (Apalabrados: 35; Scrabble: 50).
const BINGO_BONUS = 35;

const letterMultAt = (r, c) => {
    const p = PREMIUM_ROWS[r][c];
    return p === 'd' ? 2 : p === 't' ? 3 : 1;
};
const wordMultAt = (r, c) => {
    const p = PREMIUM_ROWS[r][c];
    return p === 'D' ? 2 : p === 'T' ? 3 : 1;
};

// --- DAWG (autómata acíclico minimizado, algoritmo incremental de Daciuk) ---
let dawg = null; // { final: Uint8Array, edgeStart: Uint32Array, edgeLetter: Uint8Array, edgeTarget: Uint32Array }

const buildDawg = (words) => {
    const sorted = words.slice().sort();
    const root = { final: false, edges: [], id: -1 };
    const register = new Map();
    const unchecked = [];
    let nextId = 0;

    const nodeKey = (n) => {
        let k = n.final ? '1' : '0';
        for (let i = 0; i < n.edges.length; i++) k += ',' + n.edges[i][0] + ':' + n.edges[i][1].id;
        return k;
    };

    // Minimiza los nodos pendientes hasta dejar `downTo` en la pila.
    const replaceOrRegister = (downTo) => {
        while (unchecked.length > downTo) {
            const entry = unchecked.pop();
            const parent = entry[0];
            const child = entry[2];
            const key = nodeKey(child);
            const existing = register.get(key);
            if (existing) {
                parent.edges[parent.edges.length - 1][1] = existing;
            } else {
                child.id = nextId++;
                register.set(key, child);
            }
        }
    };

    let prev = '';
    for (let w = 0; w < sorted.length; w++) {
        const word = sorted[w];
        if (word === prev) continue;

        let common = 0;
        const minLen = Math.min(word.length, prev.length);
        while (common < minLen && word[common] === prev[common]) common++;

        replaceOrRegister(common);

        let node = unchecked.length === 0 ? root : unchecked[unchecked.length - 1][2];
        for (let i = common; i < word.length; i++) {
            const li = LETTER_INDEX[word[i]];
            const child = { final: false, edges: [], id: -1 };
            node.edges.push([li, child]);
            unchecked.push([node, li, child]);
            node = child;
        }
        node.final = true;
        prev = word;
    }
    replaceOrRegister(0);

    // Aplanado a arrays tipados para recorrer rápido durante la generación.
    const order = [];
    const indexOf = new Map();
    const stack = [root];
    indexOf.set(root, 0);
    order.push(root);
    while (stack.length) {
        const n = stack.pop();
        for (let i = 0; i < n.edges.length; i++) {
            const target = n.edges[i][1];
            if (!indexOf.has(target)) {
                indexOf.set(target, order.length);
                order.push(target);
                stack.push(target);
            }
        }
    }

    let edgeCount = 0;
    for (let i = 0; i < order.length; i++) edgeCount += order[i].edges.length;

    const final = new Uint8Array(order.length);
    const edgeStart = new Uint32Array(order.length + 1);
    const edgeLetter = new Uint8Array(edgeCount);
    const edgeTarget = new Uint32Array(edgeCount);

    let e = 0;
    for (let i = 0; i < order.length; i++) {
        const n = order[i];
        final[i] = n.final ? 1 : 0;
        edgeStart[i] = e;
        const edges = n.edges.slice().sort((a, b) => a[0] - b[0]);
        for (let j = 0; j < edges.length; j++) {
            edgeLetter[e] = edges[j][0];
            edgeTarget[e] = indexOf.get(edges[j][1]);
            e++;
        }
    }
    edgeStart[order.length] = e;

    return { final, edgeStart, edgeLetter, edgeTarget, nodeCount: order.length, edgeCount };
};

// El DAWG solo hace falta en modo tablero: se construye la primera vez que se
// usa (~2 s) para no retrasar la carga del buscador.
const ensureDawg = () => {
    if (dawg) return;
    // El motor de tablero juega con letras sueltas y sin tildes, que es como
    // están las fichas físicas. Se descartan las palabras con K o W: no hay
    // fichas de esas letras, así que ni con comodín son jugables.
    dawg = buildDawg(Array.from(new Set(
        wordData
            .map(d => normalizeAccents(d.word))
            .filter(w => w.length >= 2 && !/[kw]/.test(w))
    )));
};

const dawgEdge = (node, letterIdx) => {
    const end = dawg.edgeStart[node + 1];
    for (let e = dawg.edgeStart[node]; e < end; e++) {
        if (dawg.edgeLetter[e] === letterIdx) return dawg.edgeTarget[e];
        if (dawg.edgeLetter[e] > letterIdx) return -1;
    }
    return -1;
};

// --- Estado de tablero en una orientación concreta ---
// grid[r][c] = índice de letra o -1 (vacía) · blankGrid[r][c] = 1 si es comodín.
const transpose = (grid) => {
    const out = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        const row = new Int8Array(BOARD_SIZE);
        for (let c = 0; c < BOARD_SIZE; c++) row[c] = grid[c][r];
        out.push(row);
    }
    return out;
};

const isEmptyBoard = (grid) => {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) if (grid[r][c] >= 0) return false;
    }
    return true;
};

// Cross-checks: qué letras son legales en cada casilla vacía según la palabra
// perpendicular que se formaría. ALL_LETTERS = sin restricción.
const ALL_LETTERS_MASK = (1 << 27) - 1;

const computeCrossSets = (grid) => {
    const masks = [];
    const hasCross = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        masks.push(new Int32Array(BOARD_SIZE));
        hasCross.push(new Uint8Array(BOARD_SIZE));
    }

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (grid[r][c] >= 0) { masks[r][c] = 0; continue; }

            let top = r - 1;
            while (top >= 0 && grid[top][c] >= 0) top--;
            let bottom = r + 1;
            while (bottom < BOARD_SIZE && grid[bottom][c] >= 0) bottom++;

            const prefixLen = r - 1 - top;
            const suffixLen = bottom - 1 - r;
            if (prefixLen === 0 && suffixLen === 0) {
                masks[r][c] = ALL_LETTERS_MASK;
                continue;
            }
            hasCross[r][c] = 1;

            // Recorre el prefijo vertical en el DAWG.
            let node = 0;
            let ok = true;
            for (let i = top + 1; i < r; i++) {
                node = dawgEdge(node, grid[i][c]);
                if (node < 0) { ok = false; break; }
            }
            if (!ok) { masks[r][c] = 0; continue; }

            let mask = 0;
            const end = dawg.edgeStart[node + 1];
            for (let e = dawg.edgeStart[node]; e < end; e++) {
                let n = dawg.edgeTarget[e];
                let valid = true;
                for (let i = r + 1; i < bottom; i++) {
                    n = dawgEdge(n, grid[i][c]);
                    if (n < 0) { valid = false; break; }
                }
                if (valid && dawg.final[n]) mask |= (1 << dawg.edgeLetter[e]);
            }
            masks[r][c] = mask;
        }
    }
    return { masks, hasCross };
};

// Casillas ancla: vacías y adyacentes a una ficha (o el centro si está vacío).
const computeAnchors = (grid) => {
    const anchors = [];
    for (let r = 0; r < BOARD_SIZE; r++) anchors.push(new Uint8Array(BOARD_SIZE));

    if (isEmptyBoard(grid)) {
        anchors[7][7] = 1;
        return anchors;
    }
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (grid[r][c] >= 0) continue;
            if ((r > 0 && grid[r - 1][c] >= 0) ||
                (r < BOARD_SIZE - 1 && grid[r + 1][c] >= 0) ||
                (c > 0 && grid[r][c - 1] >= 0) ||
                (c < BOARD_SIZE - 1 && grid[r][c + 1] >= 0)) {
                anchors[r][c] = 1;
            }
        }
    }
    return anchors;
};

// Puntuación real de una jugada ya construida, en la orientación de `grid`.
const scorePlacement = (grid, blankGrid, row, startCol, letters, placedFlags, placedBlanks) => {
    let mainSum = 0;
    let wordMult = 1;
    let crossTotal = 0;
    let placedCount = 0;

    for (let i = 0; i < letters.length; i++) {
        const c = startCol + i;
        const li = letters[i];

        if (!placedFlags[i]) {
            mainSum += blankGrid[row][c] ? 0 : TILE_VALUES[li];
            continue;
        }

        placedCount++;
        const value = placedBlanks[i] ? 0 : TILE_VALUES[li];
        const lm = letterMultAt(row, c);
        const wm = wordMultAt(row, c);
        const letterScore = value * lm;
        mainSum += letterScore;
        wordMult *= wm;

        // Palabra cruzada (perpendicular) generada por esta ficha.
        let top = row - 1;
        while (top >= 0 && grid[top][c] >= 0) top--;
        let bottom = row + 1;
        while (bottom < BOARD_SIZE && grid[bottom][c] >= 0) bottom++;
        if (top === row - 1 && bottom === row + 1) continue;

        let crossSum = letterScore;
        for (let rr = top + 1; rr < row; rr++) crossSum += blankGrid[rr][c] ? 0 : TILE_VALUES[grid[rr][c]];
        for (let rr = row + 1; rr < bottom; rr++) crossSum += blankGrid[rr][c] ? 0 : TILE_VALUES[grid[rr][c]];
        crossTotal += crossSum * wm;
    }

    return {
        score: mainSum * wordMult + crossTotal + (placedCount === 7 ? BINGO_BONUS : 0),
        placedCount,
        bingo: placedCount === 7,
    };
};

// Genera todas las jugadas legales de una orientación y las acumula en `out`.
// Palabras que el diccionario acepta pero el juego de Luis no. Se rellena en
// cada consulta desde la lista que guarda la interfaz.
let blockedWords = new Set();

/** Palabra perpendicular que formaría una ficha colocada, o '' si no hay vecinos. */
const crossWordAt = (grid, row, col, letterIdx) => {
    let top = row - 1;
    while (top >= 0 && grid[top][col] >= 0) top--;
    let bottom = row + 1;
    while (bottom < BOARD_SIZE && grid[bottom][col] >= 0) bottom++;
    if (top === row - 1 && bottom === row + 1) return '';

    let word = '';
    for (let r = top + 1; r < row; r++) word += ALPHABET[grid[r][col]];
    word += ALPHABET[letterIdx];
    for (let r = row + 1; r < bottom; r++) word += ALPHABET[grid[r][col]];
    return word;
};

/**
 * @param best Si se pasa {score}, no se construyen los objetos de jugada: solo
 *   se queda con el mejor tanteo. Lo usa la simulación de la respuesta del
 *   rival, que se ejecuta muchas veces y solo necesita ese número.
 */
const generateForGrid = (grid, blankGrid, rackCounts, blanksAvailable, mapCoord, out, seen, best) => {
    const { masks } = computeCrossSets(grid);
    const anchors = computeAnchors(grid);

    const letters = [];      // índices de letra de la palabra en construcción
    const placedFlags = [];  // ¿la ficha la ponemos nosotros?
    const placedBlanks = []; // ¿usando comodín?
    const rack = rackCounts.slice();
    let blanks = blanksAvailable;

    const violaVeto = (row, startCol) => {
        let word = '';
        for (let i = 0; i < letters.length; i++) word += ALPHABET[letters[i]];
        if (blockedWords.has(word)) return true;
        for (let i = 0; i < letters.length; i++) {
            if (!placedFlags[i]) continue;
            const cross = crossWordAt(grid, row, startCol + i, letters[i]);
            if (cross && blockedWords.has(cross)) return true;
        }
        return false;
    };

    const record = (row, startCol) => {
        const res = scorePlacement(grid, blankGrid, row, startCol, letters, placedFlags, placedBlanks);
        if (res.placedCount === 0) return;

        if (best) {
            if (res.score <= best.score) return;
            if (blockedWords.size > 0 && violaVeto(row, startCol)) return;
            best.score = res.score;
            return;
        }

        const tiles = [];
        let word = '';
        let usedLetters = '';
        let usedBlanks = 0;
        for (let i = 0; i < letters.length; i++) {
            word += ALPHABET[letters[i]];
            if (!placedFlags[i]) continue;
            const coord = mapCoord(row, startCol + i);
            tiles.push({ row: coord.row, col: coord.col, letter: ALPHABET[letters[i]], blank: !!placedBlanks[i] });
            if (placedBlanks[i]) usedBlanks++;
            else usedLetters += ALPHABET[letters[i]];
        }

        // Palabras vetadas: descartamos tanto la principal como cualquier
        // cruzada que genere la jugada, que también tendría que ser válida.
        if (blockedWords.size > 0) {
            if (blockedWords.has(word)) return;
            for (let i = 0; i < letters.length; i++) {
                if (!placedFlags[i]) continue;
                const cross = crossWordAt(grid, row, startCol + i, letters[i]);
                if (cross && blockedWords.has(cross)) return;
            }
        }

        // Una misma colocación física puede aparecer en ambas orientaciones.
        const key = tiles.map(t => t.row + '-' + t.col + '-' + t.letter + (t.blank ? 'B' : '')).join('|');
        if (seen.has(key)) return;
        seen.add(key);

        const start = mapCoord(row, startCol);
        out.push({
            word,
            score: res.score,
            bingo: res.bingo,
            row: start.row,
            col: start.col,
            direction: mapCoord === mapIdentity ? 'H' : 'V',
            tiles,
            usedLetters,
            usedBlanks,
        });
    };

    const extendRight = (row, col, node, anchorCol) => {
        if (col >= BOARD_SIZE) {
            if (dawg.final[node]) record(row, col - letters.length);
            return;
        }
        if (grid[row][col] >= 0) {
            const li = grid[row][col];
            const next = dawgEdge(node, li);
            if (next < 0) return;
            letters.push(li); placedFlags.push(false); placedBlanks.push(false);
            extendRight(row, col + 1, next, anchorCol);
            letters.pop(); placedFlags.pop(); placedBlanks.pop();
            return;
        }

        // Solo vale si la palabra llegó a cubrir el ancla; si termina antes,
        // queda suelta en el tablero y la jugada sería ilegal.
        if (dawg.final[node] && col > anchorCol) record(row, col - letters.length);

        const mask = masks[row][col];
        if (mask === 0) return;

        const end = dawg.edgeStart[node + 1];
        for (let e = dawg.edgeStart[node]; e < end; e++) {
            const li = dawg.edgeLetter[e];
            if ((mask & (1 << li)) === 0) continue;

            // Preferimos la ficha real; el comodín solo si no tenemos la letra
            // (usar el comodín nunca puntúa más, así que la elección es óptima).
            let useBlank = false;
            if (rack[li] > 0) rack[li]--;
            else if (blanks > 0) { blanks--; useBlank = true; }
            else continue;

            letters.push(li); placedFlags.push(true); placedBlanks.push(useBlank);
            extendRight(row, col + 1, dawg.edgeTarget[e], anchorCol);
            letters.pop(); placedFlags.pop(); placedBlanks.pop();

            if (useBlank) blanks++; else rack[li]++;
        }
    };

    const leftPart = (row, anchorCol, node, limit) => {
        extendRight(row, anchorCol, node, anchorCol);
        if (limit <= 0) return;

        const end = dawg.edgeStart[node + 1];
        for (let e = dawg.edgeStart[node]; e < end; e++) {
            const li = dawg.edgeLetter[e];
            let useBlank = false;
            if (rack[li] > 0) rack[li]--;
            else if (blanks > 0) { blanks--; useBlank = true; }
            else continue;

            letters.push(li); placedFlags.push(true); placedBlanks.push(useBlank);
            leftPart(row, anchorCol, dawg.edgeTarget[e], limit - 1);
            letters.pop(); placedFlags.pop(); placedBlanks.pop();

            if (useBlank) blanks++; else rack[li]++;
        }
    };

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (!anchors[row][col]) continue;

            if (col > 0 && grid[row][col - 1] >= 0) {
                // Prefijo fijo: las fichas que ya están en el tablero.
                let start = col - 1;
                while (start > 0 && grid[row][start - 1] >= 0) start--;
                let node = 0;
                let ok = true;
                for (let c = start; c < col; c++) {
                    node = dawgEdge(node, grid[row][c]);
                    if (node < 0) { ok = false; break; }
                    letters.push(grid[row][c]); placedFlags.push(false); placedBlanks.push(false);
                }
                if (ok) extendRight(row, col, node, col);
                letters.length = 0; placedFlags.length = 0; placedBlanks.length = 0;
            } else {
                // Hueco libre a la izquierda: cuántas casillas podemos usar.
                let limit = 0;
                let c = col - 1;
                while (c >= 0 && grid[row][c] < 0 && !anchors[row][c]) { limit++; c--; }
                leftPart(row, col, 0, limit);
                letters.length = 0; placedFlags.length = 0; placedBlanks.length = 0;
            }
        }
    }
};

const mapIdentity = (row, col) => ({ row, col });
const mapTransposed = (row, col) => ({ row: col, col: row });

// =====================================================================
// EQUITY — cuánto vale la jugada de verdad, no solo lo que suma
//
// La jugada que más puntúa no siempre es la mejor: las fichas que te quedan
// (el "deje") condicionan el turno siguiente. Aquí se le pone precio.
// =====================================================================

// Valor base de cada letra en el deje. Sale de medir, sobre este mismo
// diccionario, cuánto se usa cada letra en palabras de 7-8 letras frente a lo
// fácil que es sacarla de la bolsa: 2,2·ln(uso/frecuencia). Así la R o la S
// suman porque rinden más de lo que cuestan, y la X o la Q restan.
const LEAVE_VALUES = {
    r: 1, a: 0.7, s: 0.6, m: 0.6, p: 0.3, n: 0.2, b: 0.2, i: 0.1, c: 0.1,
    l: -0.1, f: -0.1, t: -0.1, v: -0.2, e: -0.2, j: -0.4, g: -0.5, o: -0.5,
    z: -0.6, d: -0.8, u: -1.1, h: -1.3, 'ñ': -2.2, q: -2.6, y: -3.1, x: -4,
};

/** Un comodín en la mano vale más que cualquier ficha: guarda bingos. */
const BLANK_LEAVE_VALUE = 22;

/** Proporción de vocales que mejor funciona en un atril. */
const IDEAL_VOWEL_RATIO = 0.4;

/**
 * Valor del deje. Suma el valor de cada letra y corrige por lo que la
 * frecuencia sola no ve: repetidas, desequilibrio entre vocales y consonantes,
 * y la Q huérfana, que en español sin U no se juega.
 */
const leaveValue = (leaveChars, counts, blanksLeft) => {
    let value = blanksLeft * BLANK_LEAVE_VALUE;
    let vowels = 0;
    let letters = 0;

    for (const ch of leaveChars) {
        const n = counts[ch];
        letters += n;
        if ('aeiou'.includes(ch)) vowels += n;
        value += (LEAVE_VALUES[ch] ?? 0) * n;

        // Repetir ficha estorba: dos son un lastre y de tres en adelante, peor.
        if (n >= 2) value -= 1.5 + (n - 2) * 3;
    }

    if (letters > 0) {
        // Ni todo vocales ni todo consonantes: lo que ahoga un atril es el
        // desequilibrio, no las letras en sí.
        const ideal = letters * IDEAL_VOWEL_RATIO;
        value -= Math.abs(vowels - ideal) * 2.2;
    }

    // Q sin U es una ficha muerta hasta que aparezca una.
    if (counts.q > 0 && !(counts.u > 0) && blanksLeft === 0) value -= 6;

    return Math.round(value * 10) / 10;
};

// =====================================================================
// DEFENSA — qué le dejas al rival
//
// No basta con lo que sumas: una jugada que abre un triple palabra puede
// costarte más de lo que gana. En vez de adivinarlo por la forma del tablero,
// se aplica la jugada y se calcula lo que el rival podría hacer después.
// =====================================================================

const TILE_COUNTS = {
    a: 12, b: 2, c: 4, d: 5, e: 12, f: 1, g: 2, h: 2, i: 6, j: 1,
    l: 4, m: 2, n: 5, 'ñ': 1, o: 9, p: 2, q: 1, r: 5, s: 6, t: 4,
    u: 5, v: 1, x: 1, y: 1, z: 1,
};
const BLANK_TILES = 2;
const RACK_SIZE = 7;

/** Cuántas finalistas se simulan en modo defensivo. */
const DEFENCE_CANDIDATES = 40;

/** Fichas que no has visto: bolsa más atril del rival. De ahí sale su mano. */
const buildUnseenPool = (grid, blankGrid, rackCounts, blanks) => {
    const counts = new Int32Array(ALPHABET.length);
    for (const [letter, n] of Object.entries(TILE_COUNTS)) counts[LETTER_INDEX[letter]] = n;
    let blanksLeft = BLANK_TILES - blanks;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const li = grid[r][c];
            if (li < 0) continue;
            if (blankGrid[r][c]) blanksLeft--;
            else counts[li]--;
        }
    }
    for (let i = 0; i < counts.length; i++) counts[i] = Math.max(0, counts[i] - rackCounts[i]);

    return { counts, blanks: Math.max(0, blanksLeft) };
};

/** Generador con semilla: la misma posición debe dar siempre el mismo consejo. */
const makeRng = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Roba siete fichas al azar de lo que queda sin ver. */
const sampleRack = (pool, rng) => {
    const bag = [];
    for (let i = 0; i < pool.counts.length; i++) {
        for (let n = 0; n < pool.counts[i]; n++) bag.push(i);
    }
    for (let n = 0; n < pool.blanks; n++) bag.push(-1);

    const counts = new Int32Array(ALPHABET.length);
    let blanks = 0;
    const draws = Math.min(RACK_SIZE, bag.length);
    for (let d = 0; d < draws; d++) {
        const pick = Math.floor(rng() * bag.length);
        const tile = bag[pick];
        bag[pick] = bag[bag.length - 1];
        bag.pop();
        if (tile < 0) blanks++;
        else counts[tile]++;
    }
    return { counts, blanks };
};

/** Mejor tanteo que consigue una mano concreta sobre un tablero concreto. */
const bestReply = (grid, blankGrid, rackCounts, blanks) => {
    const best = { score: 0 };
    generateForGrid(grid, blankGrid, rackCounts, blanks, mapIdentity, null, null, best);
    generateForGrid(transpose(grid), transpose(blankGrid), rackCounts, blanks, mapTransposed, null, null, best);
    return best.score;
};

/** Copia del tablero con la jugada ya puesta. */
const applyMove = (grid, blankGrid, move) => {
    const g = grid.map(row => Int8Array.from(row));
    const b = blankGrid.map(row => Uint8Array.from(row));
    for (const t of move.tiles) {
        g[t.row][t.col] = LETTER_INDEX[t.letter];
        b[t.row][t.col] = t.blank ? 1 : 0;
    }
    return { grid: g, blankGrid: b };
};

/**
 * Estima el riesgo de cada jugada: cuánto marcaría el rival justo después.
 * Se prueban varias manos posibles y se promedia, porque su atril no se sabe.
 * Solo se evalúan las mejores candidatas: simular las 20.000 sería absurdo.
 */
const addOpponentRisk = (moves, grid, blankGrid, rackCounts, blanks, samples) => {
    const pool = buildUnseenPool(grid, blankGrid, rackCounts, blanks);
    const rng = makeRng(1337);
    const racks = [];
    for (let s = 0; s < samples; s++) racks.push(sampleRack(pool, rng));

    for (const move of moves) {
        const after = applyMove(grid, blankGrid, move);
        let total = 0;
        for (const rack of racks) {
            total += bestReply(after.grid, after.blankGrid, rack.counts, rack.blanks);
        }
        move.risk = Math.round((total / racks.length) * 10) / 10;
        move.netEquity = Math.round((move.equity - move.risk) * 10) / 10;
    }
};

const leaveAfterMove = (rackClean, blanks, usedLetters, usedBlanks) => {
    const rackMap = createCharMap(rackClean);
    for (const ch of usedLetters) if (rackMap[ch]) rackMap[ch]--;
    const blanksLeft = Math.max(0, blanks - usedBlanks);

    const leaveChars = Object.keys(rackMap).filter(c => rackMap[c] > 0).sort();
    const leave = leaveChars.map(c => c.repeat(rackMap[c])).join('') + '*'.repeat(blanksLeft);
    if (!leave) return { leave: '', leaveValue: 0, leaveQuality: undefined };

    const value = leaveValue(leaveChars, rackMap, blanksLeft);
    const leaveQuality = value >= 1 ? 'good' : value <= -4 ? 'warn' : undefined;

    return { leave, leaveValue: value, leaveQuality };
};

// Punto de entrada: recibe el tablero y el atril, devuelve las mejores jugadas.
// board: 15 cadenas de 15 caracteres ('.' = vacía) · blanksBoard: 15 cadenas ('1' = comodín)
const solveBoard = (board, blanksBoard, rackLetters, blanks, limit, bagSize, rankBy, samples) => {
    const grid = [];
    const blankGrid = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        const row = new Int8Array(BOARD_SIZE);
        const brow = new Uint8Array(BOARD_SIZE);
        const src = normalizeAccents((board[r] || '').toLowerCase());
        const bsrc = blanksBoard && blanksBoard[r] ? blanksBoard[r] : '';
        for (let c = 0; c < BOARD_SIZE; c++) {
            const ch = src[c];
            row[c] = (ch && LETTER_INDEX[ch] !== undefined) ? LETTER_INDEX[ch] : -1;
            brow[c] = bsrc[c] === '1' ? 1 : 0;
        }
        grid.push(row);
        blankGrid.push(brow);
    }

    const rackClean = cleanString(rackLetters);
    const rackCounts = new Int32Array(ALPHABET.length);
    for (const ch of rackClean) {
        const li = LETTER_INDEX[ch];
        if (li !== undefined) rackCounts[li]++;
    }
    // Sin fichas no hay nada que buscar. Devolvemos la misma forma que el resto
    // de salidas: quien llama espera {moves, total}, no un array suelto.
    if (rackClean.length === 0 && blanks === 0) return { moves: [], total: 0, leaveWeight: 0 };

    const out = [];
    const seen = new Set();
    generateForGrid(grid, blankGrid, rackCounts, blanks, mapIdentity, out, seen);

    const tGrid = transpose(grid);
    const tBlank = transpose(blankGrid);
    generateForGrid(tGrid, tBlank, rackCounts, blanks, mapTransposed, out, seen);

    // El deje solo vale algo mientras queden fichas por robar. Al vaciarse la
    // bolsa deja de importar con qué te quedas: solo cuentan los puntos.
    const leaveWeight = Math.max(0, Math.min(1, bagSize / 7));

    for (const m of out) {
        Object.assign(m, leaveAfterMove(rackClean, blanks, m.usedLetters, m.usedBlanks));
        m.equity = Math.round((m.score + m.leaveValue * leaveWeight) * 10) / 10;
    }

    const porEquity = (a, b) => b.equity - a.equity || b.score - a.score || a.word.localeCompare(b.word, 'es');
    const porPuntos = (a, b) => b.score - a.score || a.word.localeCompare(b.word, 'es');
    out.sort(rankBy === 'score' ? porPuntos : porEquity);

    if (rankBy !== 'defensa') {
        return { moves: out.slice(0, limit || 200), total: out.length, leaveWeight };
    }

    // Simular la respuesta del rival cuesta, así que se hace sobre un puñado de
    // finalistas —las que ya venían bien colocadas por equity— y no sobre las
    // miles de jugadas legales. Se devuelven solo esas: mezclar simuladas con
    // no simuladas en la misma lista daría un orden sin sentido.
    const finalistas = out.slice(0, Math.min(limit || 200, DEFENCE_CANDIDATES));
    addOpponentRisk(finalistas, grid, blankGrid, rackCounts, blanks, samples || 3);
    finalistas.sort((a, b) => b.netEquity - a.netEquity || b.score - a.score
        || a.word.localeCompare(b.word, 'es'));

    return { moves: finalistas, total: out.length, leaveWeight, simulated: finalistas.length };
};

// --- Message Handler ---
self.onmessage = (event) => {
    const { type, payload, dictionaryText, requestId } = event.data;

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
                buildTwoLetterSet();
            }
            self.postMessage({ type: 'ready', size: wordData.length });

        } else if (type === 'checkWords') {
            if (wordData.length === 0) throw new Error('Dictionary not loaded yet.');
            ensureDawg();
            const words = Array.isArray(payload?.words) ? payload.words : [];
            const unknown = [];
            for (const raw of words) {
                const word = normalizeAccents(String(raw || '').toLowerCase());
                let node = 0;
                let known = word.length >= 2;
                for (const ch of word) {
                    const li = LETTER_INDEX[ch];
                    if (li === undefined) { known = false; break; }
                    node = dawgEdge(node, li);
                    if (node < 0) { known = false; break; }
                }
                if (!known || !dawg.final[node]) unknown.push(word);
            }
            self.postMessage({ type: 'checkWords', unknown, requestId });

        } else if (type === 'checkWord') {
            if (wordData.length === 0) throw new Error('Dictionary not loaded yet.');
            ensureDawg();
            const word = normalizeAccents(String(payload?.word || '').toLowerCase());
            let node = 0;
            let known = word.length >= 2;
            for (const ch of word) {
                const li = LETTER_INDEX[ch];
                if (li === undefined) { known = false; break; }
                node = dawgEdge(node, li);
                if (node < 0) { known = false; break; }
            }
            self.postMessage({ type: 'checkWord', word, known: known && !!dawg.final[node] });

        } else if (type === 'warmupBoard') {
            // La UI lo pide al abrir la pestaña de tablero para que el primer
            // cálculo no pague la construcción del DAWG.
            if (wordData.length > 0) ensureDawg();

        } else if (type === 'solveBoard') {
            if (wordData.length === 0) throw new Error('Dictionary not loaded yet.');
            ensureDawg();
            const {
                board, blanksBoard, rack, blanks = 0, limit = 200, blocked = [],
                bagSize = 99, rankBy = 'equity', samples = 3,
            } = payload;
            blockedWords = new Set(blocked);
            const result = solveBoard(board, blanksBoard, rack, blanks, limit, bagSize, rankBy, samples);
            self.postMessage({
                type: 'boardResult',
                requestId,
                data: result.moves,
                total: result.total,
                leaveWeight: result.leaveWeight,
                simulated: result.simulated,
            });

        } else if (type === 'solve') {
            if (wordData.length === 0) throw new Error('Dictionary not loaded yet.');
            const { letters, pattern, blanks = 0, parallelMode = false, blocked = [] } = payload;
            blockedWords = new Set(blocked);
            const results = solve(letters, pattern, blanks, parallelMode);
            self.postMessage({ type: 'result', data: results, requestId });
        }
    } catch (e) {
        console.error('Error in worker:', e);
        self.postMessage({ type: 'error', requestId, operation: type });
    }
};
