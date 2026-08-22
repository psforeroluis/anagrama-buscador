import React, { useCallback, useMemo, useState } from 'react';
import ScrabbleBoard from './ScrabbleBoard';
import ScreenshotImport from './ScreenshotImport';
import Spinner from './Spinner';
import { BoardMove, BoardState, MoveRanking } from '../types';
import { censusTiles, countTiles, emptyBoard, setCell } from '../services/boardLayout';
import { exportMaintenance, extractBoardWords } from '../services/wordCandidates';

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
    candidateWords: string[];
    onCollectBoardWords: (words: string[]) => Promise<number>;
    onRemoveCandidate: (word: string) => void;
    onVerifyMaintenance: () => Promise<{ additions: number; removals: number }>;
}

const COLS = 'ABCDEFGHIJKLMNO';

const moveLabel = (m: BoardMove) =>
    m.direction === 'H' ? `${m.row + 1}${COLS[m.col]}` : `${COLS[m.col]}${m.row + 1}`;

const BoardPanel: React.FC<BoardPanelProps> = ({
    board, rack, blanks, moves, totalMoves, isLoading, isWorkerReady, loadError,
    hasSearched, onBoardChange, onRackChange, onBlanksChange, onSolve, onShowToast,
    ranking, onRankingChange, blockedWords, onBlockWord, onUnblockWord,
    candidateWords, onCollectBoardWords, onRemoveCandidate, onVerifyMaintenance,
}) => {
    const [selected, setSelected] = useState<BoardMove | null>(null);
    const [importing, setImporting] = useState(false);
    const [showBlocked, setShowBlocked] = useState(false);
    const [blockDraft, setBlockDraft] = useState('');
    const [showMaintenance, setShowMaintenance] = useState(false);
    const [checkingWords, setCheckingWords] = useState(false);
    const [verifyingMaintenance, setVerifyingMaintenance] = useState(false);

    const submitBlocked = useCallback(() => {
        const word = blockDraft.trim();
        if (word.length < 2) return;
        onBlockWord(word);
        setBlockDraft('');
    }, [blockDraft, onBlockWord]);

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

    const collectBoardWords = useCallback(async () => {
        const words = extractBoardWords(board);
        if (words.length === 0) {
            onShowToast('El tablero no contiene palabras completas');
            return;
        }
        setCheckingWords(true);
        try {
            const added = await onCollectBoardWords(words);
            onShowToast(added > 0
                ? `${added} ${added === 1 ? 'palabra nueva detectada' : 'palabras nuevas detectadas'}`
                : 'No se encontraron palabras nuevas');
        } finally {
            setCheckingWords(false);
        }
    }, [board, onCollectBoardWords, onShowToast]);

    const downloadMaintenance = useCallback(() => {
        const files = exportMaintenance(candidateWords, blockedWords);
        const count = Number(!!files.additions) + Number(!!files.removals);
        if (count > 0) onShowToast(`${count} ${count === 1 ? 'lista exportada' : 'listas exportadas'}`);
    }, [candidateWords, blockedWords, onShowToast]);

    const verifyMaintenance = useCallback(async () => {
        setVerifyingMaintenance(true);
        try {
            const applied = await onVerifyMaintenance();
            const total = applied.additions + applied.removals;
            onShowToast(total > 0
                ? `Aplicado: ${applied.additions} altas · ${applied.removals} bajas`
                : 'El diccionario aún no contiene los cambios pendientes');
        } finally {
            setVerifyingMaintenance(false);
        }
    }, [onVerifyMaintenance, onShowToast]);

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
                <div>
                    <button
                        type="button"
                        onClick={() => setShowBlocked(v => !v)}
                        className="focus-ring text-xs text-brand-subtle/70 hover:text-white transition-colors flex items-center gap-2"
                    >
                        <i className={`fa-solid fa-chevron-${showBlocked ? 'down' : 'right'} text-[10px]`} />
                        <i className="fa-solid fa-ban" />
                        Palabras vetadas
                        {blockedWords.length > 0 && (
                            <span className="bg-red-500/15 text-red-200/90 rounded-md px-1.5 py-0.5 font-semibold">
                                {blockedWords.length}
                            </span>
                        )}
                    </button>

                    {showBlocked && (
                        <div className="surface-inset rounded-2xl p-3 mt-2">
                            <p className="text-[11px] text-brand-subtle/60 mb-2.5 leading-relaxed">
                                Una palabra vetada no se sugiere ni como jugada ni como cruzada.
                            </p>

                            <form
                                onSubmit={e => { e.preventDefault(); submitBlocked(); }}
                                className="flex gap-2 mb-3"
                            >
                                <input
                                    type="text"
                                    value={blockDraft}
                                    onChange={e => setBlockDraft(e.target.value)}
                                    placeholder="Escribe una palabra…"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    aria-label="Vetar una palabra a mano"
                                    className="flex-1 min-w-0 px-3 py-2 surface-inset rounded-xl text-sm font-mono uppercase text-white placeholder:normal-case placeholder:font-sans placeholder-brand-subtle/40 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                                />
                                <button
                                    type="submit"
                                    disabled={blockDraft.trim().length < 2}
                                    className="focus-ring px-3.5 py-2 rounded-xl bg-red-500/15 text-red-200 text-xs font-semibold hover:bg-red-500/25 transition-colors disabled:opacity-40"
                                >
                                    <i className="fa-solid fa-ban mr-1.5" />Vetar
                                </button>
                            </form>

                            {blockedWords.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {blockedWords.map(word => (
                                        <button
                                            key={word}
                                            type="button"
                                            onClick={() => onUnblockWord(word)}
                                            className="focus-ring rounded-lg px-2.5 py-1 text-[11px] font-mono uppercase bg-red-500/10 text-red-200/90 hover:bg-emerald-500/15 hover:text-emerald-300 transition-colors group"
                                            title={`Volver a permitir ${word.toUpperCase()}`}
                                        >
                                            {word}
                                            <i className="fa-solid fa-rotate-left ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ))}
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* Mantenimiento del diccionario: esta lista nunca entra en el motor. */}
                <div>
                    <button
                        type="button"
                        onClick={() => setShowMaintenance(value => !value)}
                        className="focus-ring text-xs text-brand-subtle/70 hover:text-white transition-colors flex items-center gap-2"
                    >
                        <i className={`fa-solid fa-chevron-${showMaintenance ? 'down' : 'right'} text-[10px]`} />
                        <i className="fa-solid fa-screwdriver-wrench" />
                        Mantenimiento
                        {candidateWords.length + blockedWords.length > 0 && (
                            <span className="bg-amber-500/15 text-amber-200/90 rounded-md px-1.5 py-0.5 font-semibold">
                                {candidateWords.length + blockedWords.length}
                            </span>
                        )}
                    </button>

                    {showMaintenance && (
                        <div className="surface-inset rounded-2xl p-3 mt-2">
                            <p className="text-[11px] text-brand-subtle/60 mb-3 leading-relaxed">
                                Prepara las altas detectadas y las palabras vetadas que deben eliminarse. Las altas no afectan al juego; las bajas siguen vetadas hasta comprobar que ya se retiraron del diccionario.
                            </p>
                            <div className="flex gap-2 mb-3">
                                <button
                                    type="button"
                                    onClick={collectBoardWords}
                                    disabled={!isWorkerReady || checkingWords || tilesOnBoard === 0}
                                    className="focus-ring flex-1 px-3 py-2 rounded-xl bg-accent/15 text-accent-soft text-xs font-semibold hover:bg-accent/25 transition-colors disabled:opacity-40"
                                >
                                    <i className={`fa-solid ${checkingWords ? 'fa-circle-notch fa-spin' : 'fa-magnifying-glass'} mr-1.5`} />
                                    {checkingWords ? 'Revisando…' : 'Revisar tablero'}
                                </button>
                                <button
                                    type="button"
                                    onClick={downloadMaintenance}
                                    disabled={candidateWords.length + blockedWords.length === 0}
                                    className="focus-ring px-3 py-2 rounded-xl tile text-brand-subtle hover:text-white text-xs font-semibold transition-colors disabled:opacity-40"
                                >
                                    <i className="fa-solid fa-download mr-1.5" />Exportar
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3 text-[11px]">
                                <div className="rounded-xl bg-emerald-500/[.07] px-2.5 py-2 text-emerald-200/80">
                                    <strong className="block text-base">{candidateWords.length}</strong> altas pendientes
                                </div>
                                <div className="rounded-xl bg-red-500/[.07] px-2.5 py-2 text-red-200/80">
                                    <strong className="block text-base">{blockedWords.length}</strong> bajas pendientes
                                </div>
                            </div>
                            {candidateWords.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/70 mb-1.5">Añadir</p>
                                    <div className="flex flex-wrap gap-1.5">
                                    {candidateWords.map(word => (
                                        <button
                                            key={word}
                                            type="button"
                                            onClick={() => onRemoveCandidate(word)}
                                            className="focus-ring rounded-lg px-2.5 py-1 text-[11px] font-mono uppercase bg-amber-500/10 text-amber-200/90 hover:bg-red-500/15 hover:text-red-200 transition-colors group"
                                            title={`Quitar ${word.toUpperCase()} de la lista`}
                                        >
                                            {word}<i className="fa-solid fa-xmark ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    ))}
                                    </div>
                                </div>
                            )}
                            {blockedWords.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-red-300/70 mb-1.5">Eliminar</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {blockedWords.map(word => (
                                            <span key={word} className="rounded-lg px-2.5 py-1 text-[11px] font-mono uppercase bg-red-500/10 text-red-200/90">
                                                {word}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={verifyMaintenance}
                                disabled={!isWorkerReady || verifyingMaintenance || candidateWords.length + blockedWords.length === 0}
                                className="focus-ring w-full px-3 py-2 rounded-xl tile text-brand-subtle hover:text-white text-xs font-semibold transition-colors disabled:opacity-40"
                                title="Limpia únicamente los cambios que ya estén presentes en el diccionario instalado"
                            >
                                <i className={`fa-solid ${verifyingMaintenance ? 'fa-circle-notch fa-spin' : 'fa-circle-check'} mr-1.5`} />
                                {verifyingMaintenance ? 'Comprobando…' : 'Comprobar cambios aplicados'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};

export default BoardPanel;
