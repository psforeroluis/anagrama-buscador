// Reconocimiento de letras sin dependencias ni red: cada ficha recortada se
// normaliza a una huella binaria de 16x16 y se compara con plantillas.
//
// Hay dos fuentes de plantillas:
//   1. Las que aprende de tus correcciones (tienen prioridad: son la tipografía
//      real de tu juego, en tu pantalla).
//   2. Unas sintéticas dibujadas con canvas, para que el primer tablero no
//      salga completamente en blanco.

export const GLYPH_SIZE = 16;
export const GLYPH_LEN = GLYPH_SIZE * GLYPH_SIZE;

/** Huella binaria de una letra: GLYPH_LEN valores 0/1. */
export type Glyph = Uint8Array;

export const ALPHABET = 'abcdefghijlmnñopqrstuvxyz'; // sin K ni W: no hay fichas

/** Umbral de Otsu sobre un histograma de 256 niveles. */
const otsu = (hist: Uint32Array, total: number): number => {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];

    let sumB = 0, wB = 0, best = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) { best = between; threshold = t; }
    }
    return threshold;
};

export interface GlyphResult {
    glyph: Glyph;
    /** Proporción de píxeles de tinta dentro del recuadro de la letra. */
    inkRatio: number;
}

/**
 * Convierte una región en escala de grises en huella normalizada: busca la
 * tinta oscura, recorta su caja y la escala a 16x16 conservando proporción.
 */
/**
 * Quita del mapa de tinta lo que no es la letra: el número del valor de la
 * ficha (arriba a la derecha en Apalabrados) y el puntito de color de la
 * esquina inferior. Se etiquetan las manchas conexas y se descartan las
 * pequeñas que estén arrinconadas — la virgulilla de la Ñ va arriba pero
 * centrada, así que sobrevive.
 */
const dropCornerBlobs = (mask: Uint8Array, w: number, h: number) => {
    const labels = new Int32Array(w * h).fill(-1);
    const blobs: { size: number; cx: number; cy: number; pixels: number[] }[] = [];

    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || labels[start] >= 0) continue;
        const id = blobs.length;
        const pixels: number[] = [];
        const stack = [start];
        labels[start] = id;
        let sx = 0, sy = 0;

        while (stack.length) {
            const p = stack.pop()!;
            pixels.push(p);
            const x = p % w, y = (p / w) | 0;
            sx += x; sy += y;
            const neighbours = [
                x > 0 ? p - 1 : -1,
                x < w - 1 ? p + 1 : -1,
                y > 0 ? p - w : -1,
                y < h - 1 ? p + w : -1,
            ];
            for (const n of neighbours) {
                if (n < 0 || !mask[n] || labels[n] >= 0) continue;
                labels[n] = id;
                stack.push(n);
            }
        }
        blobs.push({ size: pixels.length, cx: sx / pixels.length, cy: sy / pixels.length, pixels });
    }

    if (blobs.length <= 1) return;
    const largest = blobs.reduce((a, b) => (b.size > a.size ? b : a));

    for (const blob of blobs) {
        if (blob === largest) continue;
        const offCentreX = blob.cx < w * 0.3 || blob.cx > w * 0.7;
        const offCentreY = blob.cy < h * 0.35 || blob.cy > h * 0.6;
        const tiny = blob.size < largest.size * 0.55;
        if (tiny && offCentreX && offCentreY) {
            for (const p of blob.pixels) mask[p] = 0;
        }
    }
};

export const normalizeGlyph = (lum: Float32Array, w: number, h: number): GlyphResult | null => {
    const hist = new Uint32Array(256);
    for (let i = 0; i < lum.length; i++) hist[Math.max(0, Math.min(255, lum[i] | 0))]++;
    const threshold = otsu(hist, lum.length);

    const mask = new Uint8Array(w * h);
    for (let i = 0; i < lum.length; i++) mask[i] = lum[i] < threshold ? 1 : 0;
    dropCornerBlobs(mask, w, h);

    let minX = w, minY = h, maxX = -1, maxY = -1, ink = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!mask[y * w + x]) continue;
            ink++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0 || ink < 6) return null;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    // Escalamos el lado mayor a 16 y centramos el otro, para que una I y una M
    // no se deformen a la misma anchura.
    const scale = GLYPH_SIZE / Math.max(bw, bh);
    const offX = (GLYPH_SIZE - bw * scale) / 2;
    const offY = (GLYPH_SIZE - bh * scale) / 2;

    const glyph = new Uint8Array(GLYPH_LEN);
    for (let gy = 0; gy < GLYPH_SIZE; gy++) {
        for (let gx = 0; gx < GLYPH_SIZE; gx++) {
            const sx = Math.round((gx + 0.5 - offX) / scale) + minX;
            const sy = Math.round((gy + 0.5 - offY) / scale) + minY;
            if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;
            if (mask[sy * w + sx]) glyph[gy * GLYPH_SIZE + gx] = 1;
        }
    }

    return { glyph, inkRatio: ink / (bw * bh) };
};

const hamming = (a: Glyph, b: Glyph, dx: number, dy: number): number => {
    let diff = 0;
    for (let y = 0; y < GLYPH_SIZE; y++) {
        const sy = y + dy;
        for (let x = 0; x < GLYPH_SIZE; x++) {
            const sx = x + dx;
            const av = (sx < 0 || sx >= GLYPH_SIZE || sy < 0 || sy >= GLYPH_SIZE)
                ? 0 : a[sy * GLYPH_SIZE + sx];
            if (av !== b[y * GLYPH_SIZE + x]) diff++;
        }
    }
    return diff / GLYPH_LEN;
};

/**
 * Distancia de Hamming normalizada (0 = idénticas), tolerante a un píxel de
 * desplazamiento: un recorte un pelo distinto no debe cambiar la letra.
 */
export const glyphDistance = (a: Glyph, b: Glyph): number => {
    let best = 1;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const d = hamming(a, b, dx, dy);
            if (d < best) best = d;
        }
    }
    return best;
};

// --- Plantillas sintéticas (arranque en frío) ---
const SYNTHETIC_FONTS = [
    '700 44px Inter, Helvetica, Arial, sans-serif',
    '800 44px Arial, Helvetica, sans-serif',
    '700 44px Georgia, "Times New Roman", serif',
];

let syntheticCache: Map<string, Glyph[]> | null = null;

export const syntheticTemplates = (): Map<string, Glyph[]> => {
    if (syntheticCache) return syntheticCache;

    const map = new Map<string, Glyph[]>();
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { syntheticCache = map; return map; }

    for (const font of SYNTHETIC_FONTS) {
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const letter of ALPHABET) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000';
            ctx.fillText(letter.toUpperCase(), size / 2, size / 2);

            const { data } = ctx.getImageData(0, 0, size, size);
            const lum = new Float32Array(size * size);
            for (let i = 0; i < lum.length; i++) {
                lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
            }
            const result = normalizeGlyph(lum, size, size);
            if (!result) continue;
            const list = map.get(letter) ?? [];
            list.push(result.glyph);
            map.set(letter, list);
        }
    }

    syntheticCache = map;
    return map;
};

export interface Classification {
    letter: string;
    /** 0–1. Combina el parecido con la plantilla y la ventaja sobre la segunda mejor. */
    confidence: number;
    /** true si solo pudo apoyarse en las plantillas sintéticas. */
    synthetic: boolean;
}

const nearest = (glyph: Glyph, templates: Map<string, Glyph[]>) => {
    let best = { letter: '', dist: Infinity };
    let secondBestOther = Infinity;

    for (const [letter, list] of templates) {
        let dist = Infinity;
        for (const t of list) dist = Math.min(dist, glyphDistance(glyph, t));
        if (dist < best.dist) {
            secondBestOther = best.dist;
            best = { letter, dist };
        } else if (dist < secondBestOther) {
            secondBestOther = dist;
        }
    }
    return { ...best, margin: secondBestOther - best.dist };
};

/**
 * Lo aprendido vale más que lo sintético (es la tipografía real), pero no puede
 * imponerse sin más: si solo hemos aprendido algunas letras, un parecido
 * mediocre con una de ellas no debe ganar a un calco casi exacto de la
 * plantilla genérica de la letra correcta. Se comparan ambas con ventaja para
 * la aprendida, no con prioridad absoluta.
 */
const LEARNED_ADVANTAGE = 0.7;
const MAX_ACCEPTABLE_DISTANCE = 0.42;

export const classifyGlyph = (glyph: Glyph, learned: Map<string, Glyph[]>): Classification | null => {
    const fromLearned = learned.size > 0 ? nearest(glyph, learned) : null;
    const fromSynthetic = nearest(glyph, syntheticTemplates());

    const learnedScore = fromLearned ? fromLearned.dist * LEARNED_ADVANTAGE : Infinity;
    const useLearned = learnedScore <= fromSynthetic.dist;
    const candidate = useLearned && fromLearned ? fromLearned : fromSynthetic;

    if (!candidate.letter || candidate.dist > MAX_ACCEPTABLE_DISTANCE) return null;

    // Si ambas fuentes coinciden en la letra, la lectura es mucho más creíble.
    const agree = !!fromLearned && fromLearned.letter === fromSynthetic.letter;
    const base = useLearned
        ? (1 - candidate.dist / 0.35) * 0.75
        : (1 - candidate.dist / 0.45) * 0.55;

    return {
        letter: candidate.letter,
        confidence: Math.max(0, Math.min(1,
            base + Math.min(candidate.margin, 0.1) * 2.5 + (agree ? 0.15 : 0))),
        synthetic: !useLearned,
    };
};
