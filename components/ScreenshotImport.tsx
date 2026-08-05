import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BoardState } from '../types';
import { BOARD_SIZE, emptyBoard, setCell } from '../services/boardLayout';
import { CellRead, CropRect, autoDetectCrop, loadCrop, readBoard, saveCrop } from '../services/boardImage';
import { countTemplates, learnGlyph, loadTemplates } from '../services/glyphStore';
import Overlay from './Overlay';

interface ScreenshotImportProps {
    onApply: (board: BoardState) => void;
    onClose: () => void;
    onShowToast: (msg: string) => void;
}

type Step = 'imagen' | 'recorte' | 'revision';

const LETTER_RE = /^[a-záéíóúüñ]$/i;

/** Por debajo de esta confianza la casilla se marca para que la revises. */
const DOUBT_THRESHOLD = 0.6;

const normalizeLetter = (ch: string) =>
    ch.toLowerCase()
        .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
        .replace(/[óò]/g, 'o').replace(/[úùü]/g, 'u');

interface Cell extends CellRead {
    /** Letra final tras la revisión ('' = casilla vacía). */
    value: string;
    blank: boolean;
    edited: boolean;
}

const ScreenshotImport: React.FC<ScreenshotImportProps> = ({ onApply, onClose, onShowToast }) => {
    const [step, setStep] = useState<Step>('imagen');
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [crop, setCrop] = useState<CropRect | null>(null);
    const [cells, setCells] = useState<Cell[]>([]);
    const [preview, setPreview] = useState<string>('');
    const [selected, setSelectedState] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [learned, setLearned] = useState<{ letters: number; samples: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const frameRef = useRef<HTMLDivElement | null>(null);
    const keyboardRef = useRef<HTMLInputElement | null>(null);
    const cellsRef = useRef<Cell[]>([]);
    cellsRef.current = cells;
    // La selección se lleva en ref además de en estado: al tocar una casilla y
    // escribir sin pausa, el manejador de teclado no puede esperar al re-render.
    const selectedRef = useRef<number | null>(null);
    const setSelected = useCallback((index: number | null) => {
        selectedRef.current = index;
        setSelectedState(index);
    }, []);

    useEffect(() => { void countTemplates().then(setLearned); }, []);

    // --- Entrada de imagen: archivo, arrastrar o pegar ---
    // La URL del blob no se puede liberar al cargar: el <img> del paso de
    // recorte sigue apuntando a ella. Se libera al cambiar de imagen o al salir.
    const urlRef = useRef<string | null>(null);
    useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

    const acceptFile = useCallback((file: File | null | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Eso no es una imagen.'); return; }
        setError(null);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        const url = URL.createObjectURL(file);
        urlRef.current = url;
        const img = new Image();
        img.onload = () => {
            setImage(img);
            // Si ya leíste una captura de este móvil, reutilizamos aquel marco;
            // si no, se busca la rejilla en la imagen.
            setCrop(
                loadCrop(img.naturalWidth, img.naturalHeight)
                ?? autoDetectCrop(img, img.naturalWidth, img.naturalHeight),
            );
            setStep('recorte');
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            urlRef.current = null;
            setError('No se pudo abrir la imagen.');
        };
        img.src = url;
    }, []);

    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
            if (item) { e.preventDefault(); acceptFile(item.getAsFile()); }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [acceptFile]);

    // --- Ajuste del recorte ---
    const dragRef = useRef<{ mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; rect: CropRect } | null>(null);

    const startDrag = (mode: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
        if (!crop) return;
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { mode, startX: e.clientX, startY: e.clientY, rect: crop };
    };

    const onDrag = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        const frame = frameRef.current;
        if (!drag || !frame) return;

        const bounds = frame.getBoundingClientRect();
        const dx = (e.clientX - drag.startX) / bounds.width;
        const dy = (e.clientY - drag.startY) / bounds.height;
        const r = drag.rect;
        const clamp = (v: number) => Math.max(0, Math.min(1, v));
        let next: CropRect;

        if (drag.mode === 'move') {
            next = {
                ...r,
                x: clamp(Math.min(r.x + dx, 1 - r.w)),
                y: clamp(Math.min(r.y + dy, 1 - r.h)),
            };
        } else {
            const west = drag.mode === 'nw' || drag.mode === 'sw';
            const north = drag.mode === 'nw' || drag.mode === 'ne';
            const x = west ? clamp(r.x + dx) : r.x;
            const y = north ? clamp(r.y + dy) : r.y;
            const w = west ? r.w - (x - r.x) : clamp(r.w + dx);
            const h = north ? r.h - (y - r.y) : clamp(r.h + dy);
            next = { x, y, w: Math.max(0.1, Math.min(w, 1 - x)), h: Math.max(0.1, Math.min(h, 1 - y)) };
        }
        setCrop(next);
    };

    const endDrag = (e: React.PointerEvent) => {
        if (dragRef.current) (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
        dragRef.current = null;
    };

    // --- Lectura ---
    const runRead = useCallback(async () => {
        if (!image || !crop) return;
        setBusy(true);
        setError(null);
        try {
            const templates = await loadTemplates();
            const result = readBoard(image, crop, image.naturalWidth, image.naturalHeight, templates);
            // Guardamos el recorte ya cuadrado, no el que dibujaste: la próxima
            // captura del mismo móvil arranca clavada.
            saveCrop(result.crop, image.naturalWidth, image.naturalHeight);
            setCrop(result.crop);
            setPreview(result.canvas.toDataURL());
            setCells(result.cells.map(c => ({
                ...c,
                value: c.hasTile ? (c.letter ?? '') : '',
                blank: false,
                edited: false,
            })));
            setSelected(null);
            setStep('revision');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo leer el tablero.');
        } finally {
            setBusy(false);
        }
    }, [image, crop]);

    // --- Revisión ---
    const updateCell = useCallback((index: number, patch: Partial<Cell>) => {
        setCells(prev => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    }, []);

    const handleReviewKey = useCallback((e: React.KeyboardEvent) => {
        const index = selectedRef.current;
        if (index === null) return;

        if (LETTER_RE.test(e.key)) {
            e.preventDefault();
            updateCell(index, { value: normalizeLetter(e.key), hasTile: true, edited: true });
            setSelected(Math.min(cellsRef.current.length - 1, index + 1));
            return;
        }
        switch (e.key) {
            case 'Backspace':
            case 'Delete':
                e.preventDefault();
                updateCell(index, { value: '', hasTile: false, blank: false, edited: true });
                return;
            case ' ':
            case '*': {
                e.preventDefault();
                const cell = cellsRef.current[index];
                if (cell.value) updateCell(index, { blank: !cell.blank, edited: true });
                return;
            }
            case 'ArrowRight': e.preventDefault(); setSelected(Math.min(cells.length - 1, index + 1)); return;
            case 'ArrowLeft': e.preventDefault(); setSelected(Math.max(0, index - 1)); return;
            case 'ArrowDown': e.preventDefault(); setSelected(Math.min(cells.length - 1, index + BOARD_SIZE)); return;
            case 'ArrowUp': e.preventDefault(); setSelected(Math.max(0, index - BOARD_SIZE)); return;
            default: return;
        }
    }, [cells.length, updateCell]);

    const applyBoard = useCallback(async () => {
        let board = emptyBoard();
        for (const cell of cells) {
            if (!cell.value) continue;
            board = {
                letters: setCell(board.letters, cell.row, cell.col, cell.value),
                blanks: setCell(board.blanks, cell.row, cell.col, cell.blank ? '1' : '0'),
            };
        }

        // Solo aprendemos de lo que la revisión ha validado de verdad: lo que has
        // corregido y lo que estaba marcado como dudoso y has dejado tal cual.
        // Aprender también los aciertos silenciosos convertiría cualquier error
        // que se te colara en una plantilla difícil de desmontar.
        const toLearn = cells.filter(c =>
            c.glyph && c.value && !c.blank && (c.edited || c.confidence < DOUBT_THRESHOLD));
        for (const cell of toLearn) await learnGlyph(cell.value, cell.glyph!);
        if (toLearn.length > 0) void countTemplates().then(setLearned);

        onApply(board);
        onShowToast(
            toLearn.length > 0
                ? `Tablero importado · aprendidas ${toLearn.length} letras`
                : 'Tablero importado',
        );
        onClose();
    }, [cells, onApply, onClose, onShowToast]);

    const tiles = cells.filter(c => c.value);
    const doubtful = cells.filter(c => c.hasTile && (!c.value || c.confidence < DOUBT_THRESHOLD));
    // Si casi nada se deja leer, casi siempre es que el marco no cuadra con el
    // tablero: mejor decirlo que dejar que corrija 40 casillas a mano.
    const withTile = cells.filter(c => c.hasTile).length;
    const misaligned = withTile >= 6 && doubtful.length > withTile * 0.4;

    return (
        <Overlay className="items-start justify-center">
            <div className="surface edge-light rounded-4xl w-full max-w-3xl my-6 p-5 sm:p-6 relative">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold tracking-tight">
                        <i className="fa-solid fa-camera mr-2.5 text-accent-soft" />
                        Leer tablero desde una captura
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="focus-ring w-9 h-9 rounded-xl tile text-brand-subtle hover:text-white transition-colors"
                        aria-label="Cerrar"
                    >
                        <i className="fa-solid fa-xmark" />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 text-xs text-red-200 bg-red-500/10 rounded-xl px-3.5 py-2.5 border border-red-400/25">
                        <i className="fa-solid fa-triangle-exclamation mr-2 text-red-300" />{error}
                    </div>
                )}

                {/* --- Paso 1: imagen --- */}
                {step === 'imagen' && (
                    <div>
                        <label
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); acceptFile(e.dataTransfer.files?.[0]); }}
                            className="block border border-dashed border-white/15 rounded-3xl p-10 text-center cursor-pointer hover:border-accent/60 transition-colors"
                        >
                            <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => acceptFile(e.target.files?.[0])}
                            />
                            <i className="fa-solid fa-image text-3xl text-brand-subtle/50 mb-3 block" />
                            <p className="font-semibold">Arrastra la captura aquí</p>
                            <p className="text-xs text-brand-subtle/70 mt-1.5">
                                o pégala con Ctrl+V · o toca para elegir un archivo
                            </p>
                        </label>
                        {learned && (
                            <p className="text-[11px] text-brand-subtle/60 mt-3 text-center">
                                {learned.samples === 0
                                    ? 'Primera vez: la lectura usará tipografías genéricas y fallará en algunas letras. Al corregirlas aprende las tuyas y a partir del segundo tablero acierta.'
                                    : `Reconocimiento entrenado con ${learned.samples} muestras de ${learned.letters} letras.`}
                            </p>
                        )}
                    </div>
                )}

                {/* --- Paso 2: recorte --- */}
                {step === 'recorte' && image && crop && (
                    <div>
                        <p className="text-xs text-brand-subtle/70 mb-3">
                            Ajusta el marco a los bordes exteriores del tablero. Se guarda para las
                            próximas capturas del mismo móvil.
                        </p>
                        <div
                            ref={frameRef}
                            className="relative select-none touch-none rounded-2xl overflow-hidden bg-ink-800"
                            onPointerMove={onDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                        >
                            <img src={image.src} alt="Captura" className="w-full block pointer-events-none" />
                            <div className="absolute inset-0 bg-ink-900/50 pointer-events-none" />
                            <div
                                onPointerDown={startDrag('move')}
                                className="absolute cursor-move shadow-[0_0_0_2px_rgba(167,139,250,.9)]"
                                style={{
                                    left: `${crop.x * 100}%`,
                                    top: `${crop.y * 100}%`,
                                    width: `${crop.w * 100}%`,
                                    height: `${crop.h * 100}%`,
                                    backgroundImage: `url(${image.src})`,
                                    backgroundSize: `${100 / crop.w}% ${100 / crop.h}%`,
                                    backgroundPosition: `${(crop.x / (1 - crop.w || 1)) * 100}% ${(crop.y / (1 - crop.h || 1)) * 100}%`,
                                }}
                            >
                                {(['nw', 'ne', 'sw', 'se'] as const).map(corner => (
                                    <span
                                        key={corner}
                                        onPointerDown={startDrag(corner)}
                                        className={`absolute w-6 h-6 rounded-full bg-accent shadow-lg touch-none ${
                                            corner === 'nw' ? '-left-3 -top-3 cursor-nwse-resize'
                                                : corner === 'ne' ? '-right-3 -top-3 cursor-nesw-resize'
                                                : corner === 'sw' ? '-left-3 -bottom-3 cursor-nesw-resize'
                                                : '-right-3 -bottom-3 cursor-nwse-resize'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-3 mt-4">
                            <button
                                type="button"
                                onClick={() => { setStep('imagen'); setImage(null); }}
                                className="focus-ring px-5 py-3 rounded-2xl tile text-brand-subtle hover:text-white transition-colors font-semibold"
                            >
                                Otra imagen
                            </button>
                            <button
                                type="button"
                                onClick={runRead}
                                disabled={busy}
                                className="focus-ring flex-1 px-6 py-3 rounded-2xl bg-gradient-to-r from-accent-deep via-accent to-aqua text-white font-bold disabled:opacity-40 transition-all"
                            >
                                {busy
                                    ? <><i className="fa-solid fa-circle-notch fa-spin mr-2.5" />Leyendo…</>
                                    : <><i className="fa-solid fa-wand-magic-sparkles mr-2.5" />Leer tablero</>}
                            </button>
                        </div>
                    </div>
                )}

                {/* --- Paso 3: revisión --- */}
                {step === 'revision' && (
                    <div>
                        <div className="flex items-center gap-3 flex-wrap text-xs mb-3">
                            <span className="text-brand-subtle">
                                <strong className="text-brand-text">{tiles.length}</strong> fichas leídas
                            </span>
                            {doubtful.length > 0 && (
                                <span className="text-amber-300/90">
                                    <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                                    {doubtful.length} dudosas — revísalas
                                </span>
                            )}
                            <span className="text-brand-subtle/60 ml-auto">
                                Toca una casilla y escribe · Supr la vacía · Espacio = comodín
                            </span>
                        </div>

                        {misaligned && (
                            <div className="mb-3 text-xs text-amber-200 bg-amber-500/10 rounded-xl px-3.5 py-2.5 border border-amber-400/25">
                                <i className="fa-solid fa-crop-simple mr-2 text-amber-300" />
                                Se lee mal casi todo: lo normal es que el marco no coincida con el
                                tablero. Vuelve a <strong>Reajustar</strong> y cuadra los bordes —
                                el ajuste fino lo hace la app, pero necesita partir de menos de
                                media casilla de error.
                            </div>
                        )}

                        <input
                            ref={keyboardRef}
                            type="text"
                            value=""
                            onChange={() => { /* el teclado real llega por keydown */ }}
                            onKeyDown={handleReviewKey}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-label="Corregir letras"
                            className="absolute opacity-0 w-px h-px pointer-events-none"
                        />

                        <div
                            className="grid gap-[2px] rounded-xl overflow-hidden"
                            style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
                        >
                            {cells.map((cell, index) => {
                                const isSelected = selected === index;
                                const doubt = cell.hasTile && (!cell.value || cell.confidence < DOUBT_THRESHOLD);
                                return (
                                    <button
                                        key={index}
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => { setSelected(index); keyboardRef.current?.focus(); }}
                                        className={`relative aspect-square bg-ink-700 ${isSelected ? 'z-10 ring-2 ring-accent' : doubt ? 'ring-1 ring-amber-400/70' : ''}`}
                                        style={{
                                            backgroundImage: preview ? `url(${preview})` : undefined,
                                            backgroundSize: `${BOARD_SIZE * 100}%`,
                                            backgroundPosition: `${(cell.col / (BOARD_SIZE - 1)) * 100}% ${(cell.row / (BOARD_SIZE - 1)) * 100}%`,
                                        }}
                                        aria-label={`fila ${cell.row + 1} columna ${cell.col + 1}${cell.value ? `, ${cell.value.toUpperCase()}` : ', vacía'}`}
                                    >
                                        {cell.value && (
                                            <span className={`absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-bold ${
                                                doubt ? 'bg-amber-400/85 text-ink-900' : 'bg-emerald-400/85 text-ink-900'
                                            }`}>
                                                {cell.value.toUpperCase()}{cell.blank && <span className="text-[8px] align-super">*</span>}
                                            </span>
                                        )}
                                        {cell.hasTile && !cell.value && (
                                            <span className="absolute inset-0 flex items-center justify-center bg-red-500/70 text-white text-[10px] font-bold">?</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex gap-3 mt-4">
                            <button
                                type="button"
                                onClick={() => setStep('recorte')}
                                className="focus-ring px-5 py-3 rounded-2xl tile text-brand-subtle hover:text-white transition-colors font-semibold"
                            >
                                <i className="fa-solid fa-crop-simple mr-2" />Reajustar
                            </button>
                            <button
                                type="button"
                                onClick={applyBoard}
                                className="focus-ring flex-1 px-6 py-3 rounded-2xl bg-gradient-to-r from-accent-deep via-accent to-aqua text-white font-bold transition-all"
                            >
                                <i className="fa-solid fa-check mr-2.5" />
                                Aplicar a la partida ({tiles.length} fichas)
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Overlay>
    );
};

export default ScreenshotImport;
