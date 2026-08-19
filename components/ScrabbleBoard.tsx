import React, { useCallback, useRef, useState } from 'react';
import { BoardState, MoveTile } from '../types';
import { BOARD_SIZE, PREMIUM_ROWS, PREMIUM_STYLE, TILE_VALUES, setCell } from '../services/boardLayout';

interface ScrabbleBoardProps {
    board: BoardState;
    onChange: (board: BoardState) => void;
    preview?: MoveTile[] | null;
    disabled?: boolean;
}

const LETTER_RE = /^[a-záéíóúüñ]$/i;

const normalize = (ch: string) =>
    ch.toLowerCase()
        .replace(/[áà]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
        .replace(/[óò]/g, 'o').replace(/[úùü]/g, 'u');

const COLUMN_LABELS = 'ABCDEFGHIJKLMNO'.split('');

const ScrabbleBoard: React.FC<ScrabbleBoardProps> = ({ board, onChange, preview, disabled }) => {
    const [cursor, setCursorState] = useState<{ row: number; col: number }>({ row: 7, col: 7 });
    const [dir, setDirState] = useState<'H' | 'V'>('H');
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    // Al teclear rápido llegan varias pulsaciones antes de que React re-renderice,
    // así que el estado del closure se queda obsoleto: llevamos la verdad en refs.
    const cursorRef = useRef(cursor);
    const dirRef = useRef(dir);
    const boardRef = useRef(board);
    boardRef.current = board;

    const setCursor = useCallback((c: { row: number; col: number }) => {
        cursorRef.current = c;
        setCursorState(c);
    }, []);

    const setDir = useCallback((next: 'H' | 'V' | ((d: 'H' | 'V') => 'H' | 'V')) => {
        const value = typeof next === 'function' ? next(dirRef.current) : next;
        dirRef.current = value;
        setDirState(value);
    }, []);

    const commit = useCallback((next: BoardState) => {
        boardRef.current = next;
        onChange(next);
    }, [onChange]);

    const previewMap = React.useMemo(() => {
        const map = new Map<string, MoveTile>();
        for (const t of preview ?? []) map.set(`${t.row}-${t.col}`, t);
        return map;
    }, [preview]);

    const tilesOnBoard = board.letters.reduce(
        (total, row) => total + [...row].filter(letter => letter !== '.').length,
        0,
    );

    const advance = useCallback((row: number, col: number, back = false) => {
        const step = back ? -1 : 1;
        const next = dirRef.current === 'H'
            ? { row, col: col + step }
            : { row: row + step, col };
        if (next.row < 0 || next.row >= BOARD_SIZE || next.col < 0 || next.col >= BOARD_SIZE) return { row, col };
        return next;
    }, []);

    const writeLetter = useCallback((letter: string) => {
        const { row, col } = cursorRef.current;
        const b = boardRef.current;
        commit({
            letters: setCell(b.letters, row, col, letter),
            blanks: setCell(b.blanks, row, col, '0'),
        });
        setCursor(advance(row, col));
    }, [commit, setCursor, advance]);

    const clearCell = useCallback((row: number, col: number) => {
        const b = boardRef.current;
        commit({
            letters: setCell(b.letters, row, col, '.'),
            blanks: setCell(b.blanks, row, col, '0'),
        });
    }, [commit]);

    const toggleBlank = useCallback(() => {
        const { row, col } = cursorRef.current;
        const b = boardRef.current;
        if (b.letters[row][col] === '.') return;
        commit({
            letters: b.letters,
            blanks: setCell(b.blanks, row, col, b.blanks[row][col] === '1' ? '0' : '1'),
        });
    }, [commit]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (disabled) return;
        const { row, col } = cursorRef.current;
        const board = boardRef.current;

        if (LETTER_RE.test(e.key)) {
            e.preventDefault();
            writeLetter(normalize(e.key));
            return;
        }
        switch (e.key) {
            case 'Backspace':
                e.preventDefault();
                if (board.letters[row][col] !== '.') {
                    clearCell(row, col);
                } else {
                    const prev = advance(row, col, true);
                    clearCell(prev.row, prev.col);
                    setCursor(prev);
                }
                return;
            case 'Delete':
                e.preventDefault(); clearCell(row, col); return;
            case 'ArrowRight':
                e.preventDefault(); setCursor({ row, col: Math.min(BOARD_SIZE - 1, col + 1) }); return;
            case 'ArrowLeft':
                e.preventDefault(); setCursor({ row, col: Math.max(0, col - 1) }); return;
            case 'ArrowDown':
                e.preventDefault(); setCursor({ row: Math.min(BOARD_SIZE - 1, row + 1), col }); return;
            case 'ArrowUp':
                e.preventDefault(); setCursor({ row: Math.max(0, row - 1), col }); return;
            case 'Enter':
            case 'Tab':
                e.preventDefault(); setDir(d => (d === 'H' ? 'V' : 'H')); return;
            case ' ':
            case '*':
                e.preventDefault(); toggleBlank(); return;
            default:
                return;
        }
    }, [disabled, writeLetter, clearCell, toggleBlank, advance, setCursor, setDir]);

    // En móvil el teclado sale al enfocar este input invisible.
    const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        e.target.value = '';
        for (const ch of raw) if (LETTER_RE.test(ch)) writeLetter(normalize(ch));
    }, [writeLetter]);

    const handleCellClick = (row: number, col: number) => {
        if (disabled) return;
        if (cursor.row === row && cursor.col === col) setDir(d => (d === 'H' ? 'V' : 'H'));
        else setCursor({ row, col });
        inputRef.current?.focus();
    };

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value=""
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                disabled={disabled}
                aria-label="Escribir en el tablero"
                className="absolute opacity-0 w-px h-px pointer-events-none"
            />

            <div className="mt-2 rounded-2xl bg-ink-900/55 border border-white/[.08] p-2 sm:p-3">
                <div className="flex items-center justify-between gap-3 mb-2 px-1">
                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-semibold text-brand-subtle">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-amber-400/15 text-amber-300">
                            <i className="fa-solid fa-crosshairs text-[9px]" />
                        </span>
                        {tilesOnBoard === 0 ? 'Empieza por la casilla central ★' : 'Coordenadas activas'}
                    </div>
                    <span className="text-[10px] text-brand-subtle/55 font-mono">A–O · 1–15</span>
                </div>

                <div className="grid grid-cols-[18px_minmax(0,1fr)] sm:grid-cols-[24px_minmax(0,1fr)] gap-1.5 sm:gap-2 select-none touch-manipulation">
                    <div aria-hidden="true" />
                    <div className="grid gap-[2px] px-0.5" style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}>
                        {COLUMN_LABELS.map(label => <span key={label} className="text-center text-[8px] sm:text-[10px] font-bold text-brand-subtle/70">{label}</span>)}
                    </div>

                    <div className="grid gap-[2px]" style={{ gridTemplateRows: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }} aria-hidden="true">
                        {Array.from({ length: BOARD_SIZE }, (_, i) => <span key={i} className="flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-brand-subtle/70">{i + 1}</span>)}
                    </div>
                    <div
                        className="grid gap-[2px] select-none touch-manipulation"
                        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
                        onClick={() => inputRef.current?.focus()}
                    >
                    {PREMIUM_ROWS.map((prow, row) =>
                        [...prow].map((prem, col) => {
                        const letter = board.letters[row][col];
                        const isBlank = board.blanks[row][col] === '1';
                        const hasTile = letter !== '.';
                        const previewTile = previewMap.get(`${row}-${col}`);
                        const isCursor = cursor.row === row && cursor.col === col;
                        const style = PREMIUM_STYLE[prem] ?? PREMIUM_STYLE['.'];
                        const isCenter = row === 7 && col === 7;

                        let content: React.ReactNode = style.label;
                        let cls = style.cell;

                        if (previewTile && !hasTile) {
                            content = previewTile.letter.toUpperCase();
                            cls = 'bg-emerald-400/90 text-ink-900 shadow-[0_0_0_1.5px_rgba(52,211,153,.9)]';
                        } else if (hasTile) {
                            content = letter.toUpperCase();
                            cls = previewTile
                                ? 'bg-amber-200 text-ink-900'
                                : 'bg-amber-100/90 text-ink-900';
                        } else if (isCenter) {
                            content = <i className="fa-solid fa-star text-[7px]" />;
                        }

                        const value = hasTile && !isBlank ? TILE_VALUES[letter] : null;

                        return (
                            <button
                                key={`${row}-${col}`}
                                type="button"
                                tabIndex={-1}
                                onClick={() => handleCellClick(row, col)}
                                className={`relative aspect-square rounded-[3px] sm:rounded-[4px] flex items-center justify-center
                                    text-[9px] sm:text-xs font-bold leading-none transition-colors ${cls}
                                    ${isCursor && focused ? 'ring-2 ring-accent ring-offset-0 z-10' : ''}
                                    ${isCursor && !focused ? 'ring-1 ring-accent/50 z-10' : ''}
                                    ${isCenter && !hasTile ? 'ring-1 ring-amber-300/80 shadow-[0_0_12px_rgba(251,191,36,.32)] z-[1]' : ''}`}
                                aria-label={`fila ${row + 1} columna ${col + 1}${hasTile ? `, ficha ${letter.toUpperCase()}` : ' vacía'}`}
                            >
                                {content}
                                {value !== null && (
                                    <span className="absolute bottom-0 right-[1px] text-[6px] sm:text-[7px] font-semibold opacity-60">
                                        {value}
                                    </span>
                                )}
                                {hasTile && isBlank && (
                                    <span className="absolute bottom-0 right-[1px] text-[6px] sm:text-[7px] font-bold text-fuchsia-700">*</span>
                                )}
                                {isCursor && (
                                    <span className={`absolute ${dir === 'H' ? 'right-0 top-1/2 -translate-y-1/2' : 'bottom-0 left-1/2 -translate-x-1/2'} text-accent text-[7px] leading-none`}>
                                        <i className={`fa-solid fa-caret-${dir === 'H' ? 'right' : 'down'}`} />
                                    </span>
                                )}
                            </button>
                        );
                        })
                    )}
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap mt-3 text-[11px] text-brand-subtle/70">
                <button
                    type="button"
                    onClick={() => { setDir(d => (d === 'H' ? 'V' : 'H')); inputRef.current?.focus(); }}
                    className="focus-ring tile rounded-lg px-2.5 py-1 text-brand-subtle hover:text-white transition-colors"
                >
                    <i className={`fa-solid fa-arrow-${dir === 'H' ? 'right' : 'down'} mr-1.5`} />
                    Escribo en {dir === 'H' ? 'horizontal' : 'vertical'}
                </button>
                <span>Toca una casilla y escribe · Enter cambia de dirección · Espacio marca comodín (*)</span>
            </div>
        </div>
    );
};

export default ScrabbleBoard;
