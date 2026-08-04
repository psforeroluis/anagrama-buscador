// Lectura del tablero a partir de una captura de pantalla.
// El recorte lo marca el usuario (una vez por dispositivo); a partir de ahí se
// asume una rejilla uniforme de 15x15, que es como dibujan el tablero estas apps.

import { BOARD_SIZE } from './boardLayout';
import { Classification, Glyph, classifyGlyph, normalizeGlyph } from './glyphs';

/** Píxeles por casilla en el lienzo normalizado. */
export const CELL_PX = 40;
export const CANVAS_PX = CELL_PX * BOARD_SIZE;

export interface CropRect {
    /** Coordenadas normalizadas 0–1 respecto a la imagen original. */
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface CellRead {
    row: number;
    col: number;
    hasTile: boolean;
    letter: string | null;
    confidence: number;
    synthetic: boolean;
    glyph: Glyph | null;
}

export interface BoardReadResult {
    cells: CellRead[];
    /** Lienzo normalizado 600x600, para pintar cada casilla en la revisión. */
    canvas: HTMLCanvasElement;
    /** Recorte ya cuadrado a la rejilla; es el que conviene recordar. */
    crop: CropRect;
}

export const defaultCrop = (width: number, height: number): CropRect => {
    const side = Math.min(width, height) * 0.96;
    return {
        x: (width - side) / 2 / width,
        y: (height - side) / 2 / height,
        w: side / width,
        h: side / height,
    };
};

/** Resolución del lienzo auxiliar donde se busca la rejilla. */
const REFINE_PX = 720;

/** Las letras van en negro o casi; por encima de esto no es tinta de letra. */
const MAX_INK_LUMINANCE = 110;

/**
 * Busca el mejor par (fase, periodo) que explique 16 líneas de rejilla
 * equiespaciadas sobre un perfil de energía de bordes.
 */
/** Energía de bordes por columna y por fila de una región reescalada a REFINE_PX. */
const edgeEnergy = (
    source: CanvasImageSource,
    region: CropRect,
    sourceWidth: number,
    sourceHeight: number,
): { cols: Float32Array; rows: Float32Array } | null => {
    const canvas = document.createElement('canvas');
    canvas.width = REFINE_PX;
    canvas.height = REFINE_PX;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(
        source,
        region.x * sourceWidth, region.y * sourceHeight,
        region.w * sourceWidth, region.h * sourceHeight,
        0, 0, REFINE_PX, REFINE_PX,
    );
    const { data } = ctx.getImageData(0, 0, REFINE_PX, REFINE_PX);

    const lum = new Float32Array(REFINE_PX * REFINE_PX);
    for (let i = 0; i < lum.length; i++) {
        lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }

    const cols = new Float32Array(REFINE_PX);
    const rows = new Float32Array(REFINE_PX);
    for (let y = 1; y < REFINE_PX; y++) {
        for (let x = 1; x < REFINE_PX; x++) {
            const i = y * REFINE_PX + x;
            cols[x] += Math.abs(lum[i] - lum[i - 1]);
            rows[y] += Math.abs(lum[i] - lum[i - REFINE_PX]);
        }
    }
    return { cols, rows };
};

/** Mejor rejilla de 16 líneas sin restricción de fase, para la detección inicial. */
const scanGrid = (energy: Float32Array, minPeriod: number, maxPeriod: number) => {
    let best = { start: 0, period: minPeriod, score: -1 };
    for (let period = minPeriod; period <= maxPeriod; period += 0.5) {
        const maxStart = energy.length - period * BOARD_SIZE;
        if (maxStart <= 0) continue;
        for (let start = 0; start <= maxStart; start += 1) {
            let score = 0;
            for (let k = 0; k <= BOARD_SIZE; k++) score += energy[Math.round(start + k * period)] ?? 0;
            if (score > best.score) best = { start, period, score };
        }
    }
    return best;
};

/**
 * Propone el recorte buscando la rejilla en toda la captura. Es una sugerencia:
 * el marco sigue siendo ajustable antes de leer.
 */
export const autoDetectCrop = (
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
): CropRect => {
    const whole: CropRect = { x: 0, y: 0, w: 1, h: 1 };
    const energy = edgeEnergy(source, whole, sourceWidth, sourceHeight);
    if (!energy) return defaultCrop(sourceWidth, sourceHeight);

    // El tablero ocupa entre el 55% y el 100% de cada lado de la captura.
    const min = (REFINE_PX * 0.55) / BOARD_SIZE;
    const max = REFINE_PX / BOARD_SIZE;
    const gx = scanGrid(energy.cols, min, max);
    const gy = scanGrid(energy.rows, min, max);
    if (gx.score <= 0 || gy.score <= 0) return defaultCrop(sourceWidth, sourceHeight);

    return {
        x: gx.start / REFINE_PX,
        y: gy.start / REFINE_PX,
        w: (gx.period * BOARD_SIZE) / REFINE_PX,
        h: (gy.period * BOARD_SIZE) / REFINE_PX,
    };
};

const bestGrid = (energy: Float32Array, expectedPeriod: number, expectedStart: number) => {
    let best = { start: expectedStart, period: expectedPeriod, score: -1 };
    const minP = expectedPeriod * 0.85;
    const maxP = expectedPeriod * 1.15;

    for (let period = minP; period <= maxP; period += 0.25) {
        const span = period * BOARD_SIZE;
        const maxStart = energy.length - span;
        if (maxStart <= 0) continue;

        // La rejilla solo puede moverse menos de media casilla respecto al marco
        // que has dibujado: si no, encajaría igual de bien corrida un cuadro
        // entero y leeríamos el tablero desplazado.
        const from = Math.max(0, Math.round(expectedStart - period * 0.45));
        const to = Math.min(maxStart, Math.round(expectedStart + period * 0.45));

        for (let start = from; start <= to; start += 1) {
            let score = 0;
            for (let k = 0; k <= BOARD_SIZE; k++) {
                const pos = Math.round(start + k * period);
                if (pos < 0 || pos >= energy.length) continue;
                score += energy[pos];
            }
            if (score > best.score) best = { start, period, score };
        }
    }
    return best;
};

/**
 * Ajusta el recorte a la rejilla real del tablero. El marco que dibujas a mano
 * nunca cae al píxel, y unos pocos píxeles de desvío arruinan la lectura: aquí
 * se detectan las líneas de separación entre casillas y se cuadra el recorte.
 */
const refineCrop = (
    source: CanvasImageSource,
    rect: CropRect,
    sourceWidth: number,
    sourceHeight: number,
): CropRect => {
    // Miramos algo más ancho que el recorte, por si el tablero se sale un poco.
    const margin = 0.08;
    const outer = {
        x: Math.max(0, rect.x - rect.w * margin),
        y: Math.max(0, rect.y - rect.h * margin),
        w: 0,
        h: 0,
    };
    outer.w = Math.min(1 - outer.x, rect.w * (1 + margin * 2));
    outer.h = Math.min(1 - outer.y, rect.h * (1 + margin * 2));

    const energy = edgeEnergy(source, outer, sourceWidth, sourceHeight);
    if (!energy) return rect;
    const { cols: colEnergy, rows: rowEnergy } = energy;

    const expectedX = (rect.w / outer.w) * REFINE_PX / BOARD_SIZE;
    const expectedY = (rect.h / outer.h) * REFINE_PX / BOARD_SIZE;
    const startX = ((rect.x - outer.x) / outer.w) * REFINE_PX;
    const startY = ((rect.y - outer.y) / outer.h) * REFINE_PX;
    const gx = bestGrid(colEnergy, expectedX, startX);
    const gy = bestGrid(rowEnergy, expectedY, startY);

    return {
        x: outer.x + (gx.start / REFINE_PX) * outer.w,
        y: outer.y + (gy.start / REFINE_PX) * outer.h,
        w: ((gx.period * BOARD_SIZE) / REFINE_PX) * outer.w,
        h: ((gy.period * BOARD_SIZE) / REFINE_PX) * outer.h,
    };
};

const median = (values: number[]): number => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[sorted.length >> 1] ?? 0;
};

/**
 * Recorta, normaliza y clasifica las 225 casillas.
 *
 * Una casilla tiene ficha si el fondo es claro (las fichas son crema; las
 * casillas de premio son colores saturados con texto claro) y contiene tinta
 * oscura en una proporción razonable.
 */
export const readBoard = (
    source: CanvasImageSource,
    userRect: CropRect,
    sourceWidth: number,
    sourceHeight: number,
    templates: Map<string, Glyph[]>,
): BoardReadResult => {
    const rect = refineCrop(source, userRect, sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_PX;
    canvas.height = CANVAS_PX;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No se pudo crear el lienzo de lectura');

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
        source,
        rect.x * sourceWidth, rect.y * sourceHeight,
        rect.w * sourceWidth, rect.h * sourceHeight,
        0, 0, CANVAS_PX, CANVAS_PX,
    );

    const cells: CellRead[] = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const inset = Math.round(CELL_PX * 0.12);
            const size = CELL_PX - inset * 2;
            const { data } = ctx.getImageData(col * CELL_PX + inset, row * CELL_PX + inset, size, size);

            const lum = new Float32Array(size * size);
            const sample: number[] = [];
            for (let i = 0; i < lum.length; i++) {
                lum[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
                if (i % 3 === 0) sample.push(lum[i]);
            }

            const background = median(sample);
            // La tinta tiene que ser oscura de verdad, no solo más oscura que el
            // fondo: si no, cualquier insignia de color encima del tablero
            // (marcadores, avisos) se cuela como si fuera una ficha.
            const inkLevel = Math.min(background - 55, MAX_INK_LUMINANCE);
            let ink = 0;
            for (let i = 0; i < lum.length; i++) if (lum[i] < inkLevel) ink++;
            const inkRatio = ink / lum.length;

            const hasTile = background > 135 && inkRatio > 0.015 && inkRatio < 0.45;
            if (!hasTile) {
                cells.push({ row, col, hasTile: false, letter: null, confidence: 0, synthetic: false, glyph: null });
                continue;
            }

            // Zona central de la ficha: deja fuera el numerito del valor, que
            // vive en una esquina inferior.
            const gx = Math.round(CELL_PX * 0.14);
            const gy = Math.round(CELL_PX * 0.06);
            const gw = Math.round(CELL_PX * 0.72);
            const gh = Math.round(CELL_PX * 0.72);
            const glyphData = ctx.getImageData(col * CELL_PX + gx, row * CELL_PX + gy, gw, gh);
            const glyphLum = new Float32Array(gw * gh);
            for (let i = 0; i < glyphLum.length; i++) {
                glyphLum[i] = 0.299 * glyphData.data[i * 4]
                    + 0.587 * glyphData.data[i * 4 + 1]
                    + 0.114 * glyphData.data[i * 4 + 2];
            }

            const normalized = normalizeGlyph(glyphLum, gw, gh);
            if (!normalized) {
                // Hay ficha pero no se distingue letra: probablemente un comodín.
                cells.push({ row, col, hasTile: true, letter: null, confidence: 0, synthetic: false, glyph: null });
                continue;
            }

            const guess: Classification | null = classifyGlyph(normalized.glyph, templates);
            cells.push({
                row,
                col,
                hasTile: true,
                letter: guess?.letter ?? null,
                confidence: guess?.confidence ?? 0,
                synthetic: guess?.synthetic ?? false,
                glyph: normalized.glyph,
            });
        }
    }

    return { cells, canvas, crop: rect };
};

const CROP_KEY = 'anagrama.crop.v1';

interface StoredCrop extends CropRect { aspect: number }

export const saveCrop = (rect: CropRect, width: number, height: number) => {
    try {
        const stored: StoredCrop = { ...rect, aspect: width / height };
        localStorage.setItem(CROP_KEY, JSON.stringify(stored));
    } catch { /* sin cuota */ }
};

/** Recupera el recorte guardado si la captura tiene la misma proporción. */
export const loadCrop = (width: number, height: number): CropRect | null => {
    try {
        const raw = localStorage.getItem(CROP_KEY);
        if (!raw) return null;
        const stored = JSON.parse(raw) as StoredCrop;
        if (!stored || typeof stored.aspect !== 'number') return null;
        if (Math.abs(stored.aspect - width / height) > 0.01) return null;
        return { x: stored.x, y: stored.y, w: stored.w, h: stored.h };
    } catch { return null; }
};
