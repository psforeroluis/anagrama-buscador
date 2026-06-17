import React, { useState, useMemo, useRef } from 'react';
import { PlayRecord, PlayDirection, PlayerSide } from '../types';

// Apalabrados = Words With Friends layout (15×15, 0-indexed, filas A-O, columnas 1-15)
// TP no está en esquinas — está desplazado hacia adentro (igual que WWF)
type Bonus = 'TW' | 'DW' | 'TL' | 'DL';
const BONUS: Record<string, Bonus> = {
    // TP — Triple Palabra
    '0,3':'TW','0,11':'TW',
    '3,0':'TW','3,14':'TW',
    '11,0':'TW','11,14':'TW',
    '14,3':'TW','14,11':'TW',
    // DP — Doble Palabra (+ centro ★)
    '1,1':'DW','1,13':'DW',
    '2,4':'DW','2,10':'DW',
    '4,2':'DW','4,12':'DW',
    '7,7':'DW',
    '10,2':'DW','10,12':'DW',
    '12,4':'DW','12,10':'DW',
    '13,1':'DW','13,13':'DW',
    // TL — Triple Letra
    '0,6':'TL','0,8':'TL',
    '3,5':'TL','3,9':'TL',
    '5,3':'TL','5,11':'TL',
    '6,0':'TL','6,14':'TL',
    '8,0':'TL','8,14':'TL',
    '9,3':'TL','9,11':'TL',
    '11,5':'TL','11,9':'TL',
    '14,6':'TL','14,8':'TL',
    // DL — Doble Letra
    '0,0':'DL','0,14':'DL',
    '1,5':'DL','1,9':'DL',
    '2,2':'DL','2,12':'DL',
    '4,4':'DL','4,10':'DL',
    '5,6':'DL','5,8':'DL',
    '7,3':'DL','7,11':'DL',
    '8,6':'DL','8,8':'DL',
    '9,6':'DL','9,8':'DL',
    '10,4':'DL','10,10':'DL',
    '12,2':'DL','12,12':'DL',
    '13,5':'DL','13,9':'DL',
    '14,0':'DL','14,14':'DL',
};

const BONUS_LABEL: Record<Bonus, string> = { TW:'TP', DW:'DP', TL:'TL', DL:'DL' };

const BONUS_STYLE: Record<Bonus, string> = {
    TW: 'bg-red-800/80 border-red-600/60 text-red-200',
    DW: 'bg-orange-700/70 border-orange-500/50 text-orange-200',
    TL: 'bg-green-800/80 border-green-600/60 text-green-200',
    DL: 'bg-blue-800/70 border-blue-600/50 text-blue-200',
};

const ROW_LABELS = 'ABCDEFGHIJKLMNO';

interface CellLetter { letter: string; player: PlayerSide; }

const deriveBoard = (plays: PlayRecord[]): (CellLetter | null)[][] => {
    const board: (CellLetter | null)[][] = Array.from({ length: 15 }, () => Array(15).fill(null));
    for (const play of plays) {
        for (let i = 0; i < play.word.length; i++) {
            const row = play.direction === 'H' ? play.startRow : play.startRow + i;
            const col = play.direction === 'H' ? play.startCol + i : play.startCol;
            if (row < 15 && col < 15 && board[row][col] === null) {
                board[row][col] = { letter: play.word[i].toLowerCase(), player: play.player };
            }
        }
    }
    return board;
};

interface BoardViewProps {
    plays: PlayRecord[];
    onAddPlay: (play: Omit<PlayRecord, 'id'>) => void;
    onRemovePlay: (id: string) => void;
    onSearchFromLetter: (letter: string) => void;
}

const BoardView: React.FC<BoardViewProps> = ({ plays, onAddPlay, onRemovePlay, onSearchFromLetter }) => {
    const [selCell, setSelCell] = useState<{ row: number; col: number } | null>(null);
    const [word, setWord] = useState('');
    const [direction, setDirection] = useState<PlayDirection>('H');
    const [player, setPlayer] = useState<PlayerSide>('me');
    const [score, setScore] = useState('');
    const [error, setError] = useState<string | null>(null);
    const wordInputRef = useRef<HTMLInputElement>(null);

    const board = useMemo(() => deriveBoard(plays), [plays]);
    const myScore = useMemo(() => plays.filter(p => p.player === 'me').reduce((s, p) => s + p.score, 0), [plays]);
    const opScore = useMemo(() => plays.filter(p => p.player === 'opponent').reduce((s, p) => s + p.score, 0), [plays]);

    const handleCellClick = (row: number, col: number) => {
        setSelCell({ row, col });
        setError(null);
        wordInputRef.current?.focus();
    };

    const handleAdd = () => {
        const clean = word.trim().toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
        if (!clean) { setError('Escribe la palabra jugada'); return; }
        if (!selCell) { setError('Haz clic en el tablero para indicar dónde empieza la palabra'); return; }

        const { row, col } = selCell;
        const endRow = direction === 'V' ? row + clean.length - 1 : row;
        const endCol = direction === 'H' ? col + clean.length - 1 : col;
        if (endRow >= 15 || endCol >= 15) { setError('La palabra se sale del tablero'); return; }

        for (let i = 0; i < clean.length; i++) {
            const r = direction === 'H' ? row : row + i;
            const c = direction === 'H' ? col + i : col;
            const existing = board[r][c];
            if (existing && existing.letter !== clean[i]) {
                setError(`Conflicto en ${ROW_LABELS[r]}${c + 1}: hay "${existing.letter.toUpperCase()}" pero la palabra pone "${clean[i].toUpperCase()}"`);
                return;
            }
        }

        onAddPlay({ word: clean, player, startRow: row, startCol: col, direction, score: parseInt(score) || 0 });
        setWord(''); setScore(''); setSelCell(null); setError(null);
    };

    // Preview: highlight cells that would be occupied by the current pending play
    const previewCells = useMemo(() => {
        if (!selCell || !word.trim()) return new Set<string>();
        const clean = word.trim().toLowerCase().replace(/[^a-záéíóúüñ]/gi, '');
        const cells = new Set<string>();
        for (let i = 0; i < clean.length; i++) {
            const r = direction === 'H' ? selCell.row : selCell.row + i;
            const c = direction === 'H' ? selCell.col + i : selCell.col;
            if (r < 15 && c < 15) cells.add(`${r},${c}`);
        }
        return cells;
    }, [selCell, word, direction]);

    return (
        <div className="flex flex-col gap-5">
            {/* Score */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-950/40 border border-blue-800/30 rounded-xl p-3 text-center">
                    <p className="text-xs font-semibold text-blue-600 mb-0.5">Yo</p>
                    <p className="text-3xl font-bold text-blue-300">{myScore}</p>
                </div>
                <div className="bg-red-950/40 border border-red-800/30 rounded-xl p-3 text-center">
                    <p className="text-xs font-semibold text-red-600 mb-0.5">Rival</p>
                    <p className="text-3xl font-bold text-red-300">{opScore}</p>
                </div>
            </div>

            {/* Board */}
            <div className="overflow-x-auto -mx-1">
                <div className="inline-block px-1">
                    {/* Col labels */}
                    <div className="flex ml-[22px] mb-0.5">
                        {Array.from({ length: 15 }, (_, c) => (
                            <div key={c} className="w-[26px] text-center text-[10px] text-slate-600 font-mono leading-none">{c + 1}</div>
                        ))}
                    </div>
                    {/* Rows */}
                    {Array.from({ length: 15 }, (_, row) => (
                        <div key={row} className="flex items-center">
                            <div className="w-[18px] text-right pr-0.5 text-[10px] text-slate-600 font-mono flex-shrink-0 leading-none">{ROW_LABELS[row]}</div>
                            {Array.from({ length: 15 }, (_, col) => {
                                const key = `${row},${col}`;
                                const cell = board[row][col];
                                const bonus = BONUS[key];
                                const isSel = selCell?.row === row && selCell?.col === col;
                                const isPreview = previewCells.has(key);
                                const isCenter = key === '7,7';

                                if (cell) {
                                    return (
                                        <div
                                            key={col}
                                            title={`${ROW_LABELS[row]}${col + 1} · clic = colocar aquí · doble clic = buscar cruces con "${cell.letter.toUpperCase()}"`}
                                            onClick={() => handleCellClick(row, col)}
                                            onDoubleClick={() => onSearchFromLetter(cell.letter)}
                                            className={`w-[26px] h-[26px] flex items-center justify-center text-[11px] font-bold rounded-[3px] border cursor-pointer select-none ${
                                                cell.player === 'me'
                                                    ? 'bg-blue-800/70 border-blue-600/50 text-blue-100 hover:bg-blue-700/80'
                                                    : 'bg-red-900/60 border-red-700/40 text-red-100 hover:bg-red-800/70'
                                            } ${isSel ? 'ring-1 ring-white/80' : ''}`}
                                        >
                                            {cell.letter.toUpperCase()}
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={col}
                                        onClick={() => handleCellClick(row, col)}
                                        className={`w-[26px] h-[26px] flex items-center justify-center text-[9px] font-bold rounded-[3px] border cursor-pointer select-none transition-colors ${
                                            isPreview
                                                ? player === 'me'
                                                    ? 'bg-blue-700/50 border-blue-500/70 text-blue-200'
                                                    : 'bg-red-800/50 border-red-600/70 text-red-200'
                                                : bonus
                                                    ? BONUS_STYLE[bonus]
                                                    : isCenter
                                                        ? 'bg-yellow-950/60 border-yellow-800/40 text-yellow-600'
                                                        : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-700/50'
                                        } ${isSel ? 'ring-1 ring-brand-accent' : ''}`}
                                    >
                                        {isCenter && !isPreview ? '★' : bonus && !isPreview ? BONUS_LABEL[bonus] : ''}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="flex gap-4 text-xs text-slate-600 flex-wrap mb-1">
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-red-800/80 border border-red-600/60 inline-block text-red-200 flex items-center justify-center text-[9px] font-bold">TP</span> Triple palabra</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-orange-700/70 border border-orange-500/50 inline-block text-orange-200 flex items-center justify-center text-[9px] font-bold">DP</span> Doble palabra</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-green-800/80 border border-green-600/60 inline-block text-green-200 flex items-center justify-center text-[9px] font-bold">TL</span> Triple letra</span>
                <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-blue-800/70 border border-blue-600/50 inline-block text-blue-200 flex items-center justify-center text-[9px] font-bold">DL</span> Doble letra</span>
            </div>
            <p className="text-xs text-slate-600">
                <i className="fa-solid fa-hand-pointer mr-1"></i>
                Clic simple = colocar jugada aquí · <strong className="text-slate-500">doble clic en una letra = buscar palabras que la crucen</strong>
            </p>

            {/* Add play form */}
            <div className="bg-slate-900/50 rounded-xl border border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-brand-subtle mb-3">
                    <i className="fa-solid fa-plus mr-2"></i>Registrar jugada
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Palabra</label>
                        <input
                            ref={wordInputRef}
                            type="text"
                            value={word}
                            onChange={e => setWord(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            placeholder="ej: MARCO"
                            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-brand-text placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 uppercase tracking-widest text-sm font-bold"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Puntos</label>
                        <input
                            type="number"
                            value={score}
                            onChange={e => setScore(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            placeholder="ej: 24"
                            min={0}
                            className="w-full px-3 py-2.5 bg-slate-800 border border-slate-600 rounded-lg text-brand-text placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 text-sm"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 items-end">
                    {/* Player toggle */}
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Jugador</label>
                        <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                            <button type="button" onClick={() => setPlayer('me')}
                                className={`px-4 py-2 text-xs font-bold transition-all ${player === 'me' ? 'bg-blue-800/70 text-blue-200' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                                <i className="fa-solid fa-user mr-1.5"></i>Yo
                            </button>
                            <button type="button" onClick={() => setPlayer('opponent')}
                                className={`px-4 py-2 text-xs font-bold transition-all ${player === 'opponent' ? 'bg-red-900/70 text-red-200' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                                <i className="fa-solid fa-user-ninja mr-1.5"></i>Rival
                            </button>
                        </div>
                    </div>

                    {/* Direction toggle */}
                    <div>
                        <label className="text-xs text-slate-500 block mb-1">Dirección</label>
                        <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                            <button type="button" onClick={() => setDirection('H')}
                                className={`px-3 py-2 text-xs font-bold transition-all ${direction === 'H' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                                → H
                            </button>
                            <button type="button" onClick={() => setDirection('V')}
                                className={`px-3 py-2 text-xs font-bold transition-all ${direction === 'V' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                                ↓ V
                            </button>
                        </div>
                    </div>

                    {/* Position + submit */}
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-slate-500">
                            Inicio:{' '}
                            {selCell
                                ? <span className="text-brand-accent font-mono font-bold">{ROW_LABELS[selCell.row]}{selCell.col + 1}</span>
                                : <span className="text-yellow-600">haz clic en el tablero</span>}
                        </span>
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={!word.trim() || !selCell}
                            className="px-6 py-2 bg-brand-accent text-slate-900 font-bold text-sm rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                            <i className="fa-solid fa-plus mr-1.5"></i>Añadir
                        </button>
                    </div>
                </div>

                {error && (
                    <p className="mt-3 text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
                        <i className="fa-solid fa-triangle-exclamation mr-1.5"></i>{error}
                    </p>
                )}
            </div>

            {/* Play history */}
            {plays.length > 0 ? (
                <div>
                    <h3 className="text-sm font-semibold text-brand-subtle mb-2">
                        <i className="fa-solid fa-list-ol mr-2"></i>
                        Historial — {plays.length} jugadas
                    </h3>
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                        {[...plays].reverse().map((play, idx) => (
                            <div key={play.id}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                                    play.player === 'me'
                                        ? 'bg-blue-950/25 border-blue-800/25'
                                        : 'bg-red-950/25 border-red-800/25'
                                }`}
                            >
                                <span className="text-xs text-slate-600 w-4 text-right flex-shrink-0">{plays.length - idx}</span>
                                <i className={`fa-solid fa-user text-xs flex-shrink-0 ${play.player === 'me' ? 'text-blue-600' : 'text-red-600'}`}></i>
                                <span className="font-bold uppercase tracking-wider text-brand-text flex-1 min-w-0 truncate">{play.word}</span>
                                <span className="text-xs font-mono text-slate-600 flex-shrink-0">
                                    {ROW_LABELS[play.startRow]}{play.startCol + 1}{play.direction}
                                </span>
                                {play.score > 0 && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                                        play.player === 'me' ? 'bg-blue-900/50 text-blue-300' : 'bg-red-900/50 text-red-300'
                                    }`}>
                                        +{play.score}
                                    </span>
                                )}
                                <button onClick={() => onRemovePlay(play.id)}
                                    className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0"
                                    title="Deshacer esta jugada">
                                    <i className="fa-solid fa-rotate-left text-xs"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-10 text-slate-600">
                    <i className="fa-solid fa-border-all text-3xl mb-3 block opacity-30"></i>
                    <p className="text-sm">Tablero vacío. Haz clic en una casilla y añade la primera jugada.</p>
                </div>
            )}
        </div>
    );
};

export default BoardView;
