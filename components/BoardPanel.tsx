import React, { useCallback, useMemo, useState } from 'react';
import ScrabbleBoard from './ScrabbleBoard';
import ScreenshotImport from './ScreenshotImport';
import Spinner from './Spinner';
import { BoardMove, BoardState, MoveRanking } from '../types';
import { censusTiles, countTiles, emptyBoard, setCell } from '../services/boardLayout';

interface BoardPanelProps {
    board: BoardState;
    rack: string;
    blanks: number;
    moves: BoardMove[];
    totalMoves: number;
    isLoading: boolean;
    isWorkerReady: boolean;
    loadError: boolean;
    hasSearched: boolean;
    onBoardChange: (b: BoardState) => void;
    onRackChange: (v: string) => void;
    onBlanksChange: (n: number) => void;
    onSolve: () => void;
    onShowToast: (msg: string) => void;
    ranking: MoveRanking;
    onRankingChange: (r: MoveRanking) => void;
    blockedWords: string[];
    onBlockWord: (word: string) => void;
    onUnblockWord: (word: string) => void;
}

const COLS = 'ABCDEFGHIJKLMNO';

const moveLabel = (m: BoardMove) =>
    m.direction === 'H' ? `${m.row + 1}${COLS[m.col]}` : `${COLS[m.col]}${m.row + 1}`;

const BoardPanel: React.FC<BoardPanelProps> = ({
    board, rack, blanks, moves, totalMoves, isLoading, isWorkerReady, loadError,
    hasSearched, onBoardChange, onRackChange, onBlanksChange, onSolve, onShowToast,
    ranking, onRankingChange, blockedWords, onBlockWord, onUnblockWord,
}) => {
    const [selected, setSelected] = useState<BoardMove | null>(null);
    const [importing, setImporting] = useState(false);
    const [showBlocked, setShowBlocked] = useState(false);

    const tilesOnBoard = useMemo(() => countTiles(board.letters), [board.letters]);
    const rackCount = rack.trim().length + blanks;

    // Censo de fichas: cuántas quedan por ver y si hay erratas de transcripción.
    const census = useMemo(
        () => censusTiles(board.letters, board.blanks, rack, blanks),
        [board.letters, board.blanks, rack, blanks],
    );
    const invalidRackLetters = useMemo(
        () => Array.from(new Set(rack.toLowerCase().match(/[kw]/g) ?? [])),
        [rack],
    );
    const canSolve = isWorkerReady && !isLoading && rackCount > 0;

    // La jugada seleccionada deja de tener sentido si cambia el tablero o el atril.
    React.useEffect(() => { setSelected(null); }, [moves]);

    const applyMove = useCallback((m: BoardMove) => {
        let letters = board.letters;
        let blanksRows = board.blanks;
        for (const t of m.tiles) {
            letters = setCell(letters, t.row, t.col, t.letter);
            blanksRows = setCell(blanksRows, t.row, t.col, t.blank ? '1' : '0');
        }
        onBoardChange({ letters, blanks: blanksRows });
        onRackChange(m.leave ? m.leave.replace(/\*/g, '') : '');
        onBlanksChange(m.leave ? (m.leave.match(/\*/g) ?? []).length : 0);
        setSelected(null);
        onShowToast(`Jugada aplicada: ${m.word.toUpperCase()} (+${m.score})`);
    }, [board, onBoardChange, onRackChange, onBlanksChange, onShowToast]);

    return (
        <>
        {importing && (
            <ScreenshotImport
                onApply={onBoardChange}
                onClose={() => setImporting(false)}
                onShowToast={onShowToast}
            />
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
            {/* --- Tablero --- */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-subtle">
                        <i className="fa-solid fa-table-cells-large mr-2" />
                        Tablero · {tilesOnBoard} fichas
                    </span>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => setImporting(true)}
                            className="focus-ring text-xs text-accent-soft hover:text-white transition-colors font-semibold"
                        >
                            <i className="fa-solid fa-camera mr-1.5" />Leer captura
                        </button>
                        <button
                            type="button"
                            onClick={() => { onBoardChange(emptyBoard()); onShowToast('Tablero vaciado'); }}
                            className="focus-ring text-xs text-brand-subtle/70 hover:text-red-300 transition-colors"
                        >
                            <i className="fa-solid fa-trash-can mr-1.5" />Vaciar tablero
                        </button>
                    </div>
                </div>

                <ScrabbleBoard
                    board={board}
                    onChange={onBoardChange}
                    preview={selected?.tiles ?? null}
                    disabled={!isWorkerReady}
                />
            </div>

            {/* --- Atril + jugadas --- */}
            <div className="flex flex-col gap-4">
                <div>
                    <label htmlFor="board-rack" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-subtle mb-2.5 ml-0.5">
                        <i className="fa-solid fa-cubes-stacked mr-2" />
                        Tu atril
                    </label>
                    <input
                        id="board-rack"
                        type="text"
                        value={rack}
                        onChange={e => onRackChange(e.target.value)}
                        placeholder="ej: rstaeil"
                        disabled={!isWorkerReady}
                        className="w-full px-4 py-3.5 surface-inset rounded-2xl focus:outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15 transition-all text-xl font-mono font-bold placeholder:text-base placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder-brand-subtle/40 text-white disabled:opacity-40 uppercase tracking-[0.24em]"
                    />
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-brand-subtle font-medium">
                            <i className="fa-regular fa-square mr-1.5 text-amber-300/70" />Comodines
                        </span>
                        <div className="flex gap-1.5">
                            {[0, 1, 2].map(n => (
                                <button
                                    key={n}
                                    type="button"
                                    onClick={() => onBlanksChange(n)}
                                    className={`focus-ring w-8 h-8 rounded-lg text-sm font-bold transition-all ${
                                        blanks === n
                                            ? 'bg-amber-400/15 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,.5)]'
                                            : 'tile text-brand-subtle hover:text-white'
                                    }`}
                                >{n}</button>
                            ))}
                        </div>
                        {rackCount > 7 && (
                            <span className="text-[11px] text-amber-300/80">
                                <i className="fa-solid fa-triangle-exclamation mr-1" />{rackCount} fichas
                            </span>
                        )}
                    </div>

                    {/* Censo de fichas */}
                    <div className="mt-2.5 ml-0.5 text-[11px] leading-relaxed">
                        <span className="text-brand-subtle/70">
                            <i className="fa-solid fa-bag-shopping mr-1.5 opacity-70" />
                            Sin ver: <strong className="text-brand-subtle">{census.unseen}</strong> fichas
                            {census.unseenBlanks > 0 && (
                                <> · {census.unseenBlanks} {census.unseenBlanks > 1 ? 'comodines' : 'comodín'}</>
                            )}
                            <span className="text-brand-subtle/40"> (bolsa + rival)</span>
                        </span>

                        {invalidRackLetters.length > 0 && (
                            <div className="text-red-300/90 mt-1">
                                <i className="fa-solid fa-circle-exclamation mr-1.5" />
                                No existen fichas de {invalidRackLetters.join(', ').toUpperCase()} en este juego.
                            </div>
                        )}
                        {census.impossible.length > 0 && (
                            <div className="text-amber-300/90 mt-1">
                                <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                                Has contado {census.impossible.map(i => `${i.counted} ${i.letter.toUpperCase()} (solo hay ${i.max})`).join(', ')}.
                                Revisa el tablero.
                            </div>
                        )}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onSolve}
                    disabled={!canSolve}
                    className="focus-ring w-full px-6 py-3.5 rounded-2xl bg-gradient-to-r from-accent-deep via-accent to-aqua text-white font-bold tracking-tight hover:shadow-[0_18px_44px_-18px_rgba(124,58,237,.95)] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center"
                >
                    {isLoading ? (
                        <><i className="fa-solid fa-circle-notch fa-spin mr-3" />Calculando…</>
                    ) : loadError ? (
                        <><i className="fa-solid fa-triangle-exclamation mr-2" />Diccionario no disponible</>
                    ) : !isWorkerReady ? (
                        <><i className="fa-solid fa-circle-notch fa-spin mr-3" />Cargando…</>
                    ) : (
                        <><i className="fa-solid fa-trophy mr-2.5" />Mejor jugada</>
                    )}
                </button>

                <div className="surface-inset rounded-2xl p-3 flex-1 min-h-[280px]">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center"><Spinner /></div>
                    ) : !hasSearched ? (
                        <p className="text-xs text-brand-subtle/60 leading-relaxed p-2">
                            Copia el tablero de tu partida, escribe tu atril y pulsa <strong className="text-brand-subtle">Mejor jugada</strong>.
                            Se calculan todas las colocaciones legales con multiplicadores de casilla,
                            palabras cruzadas y el bonus de 7 fichas.
                        </p>
                    ) : moves.length === 0 ? (
                        <p className="text-xs text-brand-subtle/60 p-2">
                            No hay ninguna jugada legal con ese atril en este tablero.
                        </p>
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5 pb-2.5">
                                {([['equity', 'Óptima'], ['score', 'Más puntos'], ['defensa', 'Defensiva']] as const).map(([id, label]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onRankingChange(id)}
                                        className={`focus-ring flex-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                            ranking === id
                                                ? 'bg-accent/15 text-accent-soft shadow-[inset_0_0_0_1px_rgba(167,139,250,.35)]'
                                                : 'tile text-brand-subtle hover:text-white'
                                        }`}
                                        title={
                                            id === 'equity'
                                                ? 'Ordena por puntos más el valor de las fichas que te quedas'
                                                : id === 'score'
                                                ? 'Ordena solo por los puntos de esta jugada'
                                                : 'Simula la respuesta del rival y descuenta lo que le dejas marcar'
                                        }
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center justify-between px-1 pb-2 text-[11px] text-brand-subtle/70">
                                <span>{totalMoves.toLocaleString('es')} jugadas legales</span>
                                <span>mostrando {moves.length}</span>
                            </div>
                            <ol className="flex flex-col gap-1.5 max-h-[520px] overflow-y-auto pr-1">
                                {moves.map((m, i) => {
                                    const isSel = selected === m;
                                    return (
                                        <li key={`${m.word}-${m.row}-${m.col}-${m.direction}-${i}`}>
                                            <div
                                                onMouseEnter={() => setSelected(m)}
                                                onClick={() => setSelected(m)}
                                                className={`rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                                                    isSel ? 'bg-accent/15 shadow-[inset_0_0_0_1.5px_rgba(167,139,250,.5)]' : 'tile hover:bg-white/[.04]'
                                                }`}
                                            >
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-lg font-bold text-emerald-300 font-mono w-11 text-right shrink-0">{m.score}</span>
                                                    <span className="font-bold uppercase tracking-wide truncate">{m.word}</span>
                                                    {m.bingo && (
                                                        <span className="text-[9px] font-bold uppercase bg-amber-400/20 text-amber-300 rounded px-1.5 py-0.5 shrink-0">Bingo</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2.5 mt-1 text-[11px] text-brand-subtle/70 flex-wrap">
                                                    <span className="font-mono">
                                                        <i className={`fa-solid fa-arrow-${m.direction === 'H' ? 'right' : 'down'} mr-1`} />
                                                        {moveLabel(m)}
                                                    </span>
                                                    <span>{m.tiles.length} fichas</span>
                                                    {m.risk !== undefined && (
                                                        <span
                                                            className={m.risk >= 45 ? 'text-red-300/85' : m.risk >= 30 ? 'text-amber-300/80' : 'text-emerald-300/80'}
                                                            title="Lo que marcaría el rival justo después, según la simulación"
                                                        >
                                                            <i className="fa-solid fa-shield-halved mr-1" />
                                                            rival ~{Math.round(m.risk)}
                                                        </span>
                                                    )}
                                                    {m.leave !== undefined && m.leave !== '' && (
                                                        <span className={m.leaveQuality === 'good' ? 'text-emerald-300/80' : m.leaveQuality === 'warn' ? 'text-amber-300/80' : ''}>
                                                            deja {m.leave.toUpperCase()}
                                                            {m.leaveValue !== 0 && (
                                                                <span className="opacity-70"> ({m.leaveValue > 0 ? '+' : ''}{m.leaveValue})</span>
                                                            )}
                                                        </span>
                                                    )}
                                                    {isSel && (
                                                        <span className="ml-auto flex items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={e => { e.stopPropagation(); onBlockWord(m.word); }}
                                                                className="focus-ring text-brand-subtle/70 hover:text-red-300 font-semibold"
                                                                title={`Vetar ${m.word.toUpperCase()}: no volverá a sugerirse`}
                                                            >
                                                                <i className="fa-solid fa-ban mr-1" />No vale
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={e => { e.stopPropagation(); applyMove(m); }}
                                                                className="focus-ring text-accent-soft hover:text-white font-semibold"
                                                            >
                                                                <i className="fa-solid fa-check mr-1" />Aplicar
                                                            </button>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </>
                    )}
                </div>

                {/* Palabras vetadas */}
                {blockedWords.length > 0 && (
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowBlocked(v => !v)}
                            className="focus-ring text-xs text-brand-subtle/70 hover:text-white transition-colors flex items-center gap-2"
                        >
                            <i className={`fa-solid fa-chevron-${showBlocked ? 'down' : 'right'} text-[10px]`} />
                            <i className="fa-solid fa-ban" />
                            {blockedWords.length} {blockedWords.length === 1 ? 'palabra vetada' : 'palabras vetadas'}
                        </button>
                        {showBlocked && (
                            <div className="surface-inset rounded-2xl p-3 mt-2">
                                <p className="text-[11px] text-brand-subtle/60 mb-2.5 leading-relaxed">
                                    No se sugieren ni como palabra principal ni como cruzada.
                                    Toca una para volver a permitirla.
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {blockedWords.map(word => (
                                        <button
                                            key={word}
                                            type="button"
                                            onClick={() => onUnblockWord(word)}
                                            className="focus-ring tile rounded-lg px-2.5 py-1 text-[11px] font-mono uppercase text-brand-subtle hover:text-emerald-300 transition-colors group"
                                            title={`Volver a permitir ${word.toUpperCase()}`}
                                        >
                                            {word}
                                            <i className="fa-solid fa-rotate-left ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
        </>
    );
};

export default BoardPanel;
