import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import WordInput from './components/WordInput';
import Results from './components/Results';
import Toast, { ToastAction } from './components/Toast';
import BoardPanel from './components/BoardPanel';
import GameSwitcher from './components/GameSwitcher';
import { FoundWord, SearchMode, BoardSlot, BoardMove, BoardState, MoveRanking } from './types';
import { censusTiles, emptyBoard } from './services/boardLayout';
import {
    Game, createGame, deleteGame, initGames, listGames, nextGameName, saveGame,
    getActiveId, setActiveId as persistActiveId,
} from './services/gamesStore';
import { blockWord, loadBlocked, unblockWord } from './services/wordBlocklist';
import { downloadBackup, restoreBackup } from './services/backup';

const slotsToPattern = (slots: BoardSlot[]): string =>
    slots.length === 0 ? '' : slots.map(s => s.letter || '?').join('');

type WorkerMessage =
    | { type: 'ready'; size: number }
    | { type: 'result'; data: FoundWord[]; requestId?: number }
    | { type: 'boardResult'; data: BoardMove[]; total: number; requestId?: number }
    | { type: 'checkWord'; word: string; known: boolean };

type Tab = 'buscador' | 'tablero';

const App: React.FC = () => {
    // --- Input state ---
    const [rackLetters, setRackLetters] = useState('');
    const [blanks, setBlanks] = useState(0);
    const [boardSlots, setBoardSlots] = useState<BoardSlot[]>([]);
    const [parallelMode, setParallelMode] = useState(false);

    // --- Search results ---
    const [foundWords, setFoundWords] = useState<FoundWord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isWorkerReady, setIsWorkerReady] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchMode, setSearchMode] = useState<SearchMode>('anagram');
    const [activeLettersQuery, setActiveLettersQuery] = useState('');
    const [activePatternQuery, setActivePatternQuery] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [toastAction, setToastAction] = useState<ToastAction | null>(null);

    // --- Modo tablero (una partida activa entre varias) ---
    const [tab, setTab] = useState<Tab>('buscador');
    const [games, setGames] = useState<Game[]>([]);
    const [activeGameId, setActiveGameId] = useState('');
    const [board, setBoard] = useState<BoardState>(emptyBoard);
    const [boardRack, setBoardRack] = useState('');
    const [boardBlanks, setBoardBlanks] = useState(0);
    const [boardMoves, setBoardMoves] = useState<BoardMove[]>([]);
    const [boardTotal, setBoardTotal] = useState(0);
    const [boardLoading, setBoardLoading] = useState(false);
    const [boardSearched, setBoardSearched] = useState(false);
    const [blockedWords, setBlockedWords] = useState<string[]>(loadBlocked);
    const [ranking, setRanking] = useState<MoveRanking>('equity');

    const toastTimerRef = useRef<number | null>(null);
    const closeToast = useCallback(() => {
        if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
        setToastMessage(null);
        setToastAction(null);
    }, []);

    // Los avisos con acción (deshacer) duran más: hay que darte tiempo a leerlos.
    const showToast = useCallback((msg: string, action?: ToastAction) => {
        setToastMessage(msg);
        setToastAction(action ?? null);
        if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => {
            setToastMessage(null);
            setToastAction(null);
        }, action ? 9000 : 3000);
    }, []);

    const workerRef = useRef<Worker | null>(null);
    const searchRequestRef = useRef(0);
    const boardRequestRef = useRef(0);

    // --- Web Worker ---
    useEffect(() => {
        const init = async () => {
            try {
                const [wRes, dRes] = await Promise.all([
                    fetch('/services/anagramSolver.ts'),
                    fetch('/services/dictionary.txt'),
                ]);
                if (!wRes.ok || !dRes.ok) throw new Error('Failed to load');
                const [script, dict] = await Promise.all([wRes.text(), dRes.text()]);
                const worker = new Worker(URL.createObjectURL(new Blob([script], { type: 'application/javascript' })));
                workerRef.current = worker;
                worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
                    if (e.data.type === 'ready') setIsWorkerReady(true);
                    else if (e.data.type === 'result') {
                        if (e.data.requestId !== searchRequestRef.current) return;
                        setFoundWords(e.data.data);
                        setIsLoading(false);
                    }
                    else if (e.data.type === 'checkWord') {
                        // Vetar algo que el diccionario no tiene no cambia nada;
                        // más vale decirlo que dejar creer que se ha hecho algo.
                        if (!e.data.known) {
                            showToast(`${e.data.word.toUpperCase()} no está en el diccionario: vetarla no cambia nada`);
                        }
                    }
                    else if (e.data.type === 'boardResult') {
                        if (e.data.requestId !== boardRequestRef.current) return;
                        setBoardMoves(e.data.data);
                        setBoardTotal(e.data.total ?? e.data.data.length);
                        setBoardLoading(false);
                    }
                };
                worker.onerror = () => { setIsLoading(false); setBoardLoading(false); setLoadError(true); };
                worker.postMessage({ type: 'init', dictionaryText: dict });
            } catch { setIsLoading(false); setLoadError(true); }
        };
        init();
        return () => workerRef.current?.terminate();
    }, []);

    // --- Search ---
    const handleSearch = useCallback(() => {
        const pattern = slotsToPattern(boardSlots);
        const letters = rackLetters.trim();
        if (!letters && !pattern) return;
        setIsLoading(true);
        setHasSearched(true);
        setActiveLettersQuery(letters);
        setActivePatternQuery(pattern);
        const isParallel = parallelMode && pattern.length > 0;
        const requestId = ++searchRequestRef.current;
        setSearchMode(isParallel ? 'parallel' : letters && pattern ? 'combined' : pattern ? 'pattern' : 'anagram');
        workerRef.current?.postMessage({
            type: 'solve',
            requestId,
            payload: { letters, pattern, blanks, parallelMode: isParallel, blocked: blockedWords },
        });
    }, [rackLetters, boardSlots, blanks, parallelMode, blockedWords]);

    // --- Búsqueda de mejor jugada en el tablero ---
    // La lista de vetadas se pasa explícitamente para poder relanzar la
    // búsqueda con la lista recién cambiada, sin esperar al re-render.
    const runBoardSearch = useCallback((blocked: string[], rankBy: MoveRanking) => {
        if (!boardRack.trim() && boardBlanks === 0) return;
        setBoardLoading(true);
        setBoardSearched(true);
        // Lo que queda en la bolsa: lo que no has visto, menos el atril del
        // rival. Con la bolsa vacía ya no robas, así que el deje deja de contar.
        const { unseen } = censusTiles(board.letters, board.blanks, boardRack, boardBlanks);
        const requestId = ++boardRequestRef.current;
        workerRef.current?.postMessage({
            type: 'solveBoard',
            requestId,
            payload: {
                board: board.letters,
                blanksBoard: board.blanks,
                rack: boardRack,
                blanks: boardBlanks,
                limit: 120,
                blocked,
                bagSize: Math.max(0, unseen - 7),
                rankBy,
            },
        });
    }, [board, boardRack, boardBlanks]);

    const handleSolveBoard = useCallback(
        () => runBoardSearch(blockedWords, ranking),
        [runBoardSearch, blockedWords, ranking],
    );

    const handleRankingChange = useCallback((next: MoveRanking) => {
        setRanking(next);
        if (boardSearched) runBoardSearch(blockedWords, next);
    }, [boardSearched, runBoardSearch, blockedWords]);

    const handleBlockWord = useCallback((word: string) => {
        const next = blockWord(word);
        setBlockedWords(next);
        showToast(`${word.toUpperCase()} vetada: no volverá a sugerirse`);
        workerRef.current?.postMessage({ type: 'checkWord', payload: { word } });
        if (boardSearched) runBoardSearch(next, ranking);
    }, [boardSearched, runBoardSearch, ranking]);

    const handleUnblockWord = useCallback((word: string) => {
        const next = unblockWord(word);
        setBlockedWords(next);
        showToast(`${word.toUpperCase()} vuelve a estar permitida`);
        if (boardSearched) runBoardSearch(next, ranking);
    }, [boardSearched, runBoardSearch, ranking]);

    // --- Carga inicial de partidas (migra el tablero único de la versión previa) ---
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const loaded = await initGames();
            if (cancelled) return;
            const saved = getActiveId();
            const active = loaded.find(g => g.id === saved) ?? loaded[0];
            setGames(loaded);
            setActiveGameId(active.id);
            setBoard(active.board);
            setBoardRack(active.rack);
            setBoardBlanks(active.blanks);
        })();
        return () => { cancelled = true; };
    }, []);

    // Autoguardado de la partida activa, agrupando ráfagas de tecleo.
    const skipSaveRef = useRef(true);
    useEffect(() => {
        if (!activeGameId) return;
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }

        const timer = window.setTimeout(() => {
            setGames(prev => {
                const current = prev.find(g => g.id === activeGameId);
                if (!current) return prev;
                const updated: Game = {
                    ...current,
                    board,
                    rack: boardRack,
                    blanks: boardBlanks,
                    updatedAt: Date.now(),
                };
                void saveGame(updated);
                return prev.map(g => (g.id === activeGameId ? updated : g));
            });
        }, 400);
        return () => window.clearTimeout(timer);
    }, [board, boardRack, boardBlanks, activeGameId]);

    const handleSelectGame = useCallback((id: string) => {
        const game = games.find(g => g.id === id);
        if (!game) return;
        skipSaveRef.current = true;
        setActiveGameId(id);
        persistActiveId(id);
        setBoard(game.board);
        setBoardRack(game.rack);
        setBoardBlanks(game.blanks);
    }, [games]);

    const handleCreateGame = useCallback(() => {
        const game = createGame(nextGameName(games));
        void saveGame(game);
        skipSaveRef.current = true;
        setGames(prev => [game, ...prev]);
        setActiveGameId(game.id);
        persistActiveId(game.id);
        setBoard(game.board);
        setBoardRack(game.rack);
        setBoardBlanks(game.blanks);
        showToast(`${game.name} creada`);
    }, [games]);

    const handleExportGames = useCallback(async () => {
        try {
            const filename = await downloadBackup();
            showToast(`Copia descargada: ${filename}`);
        } catch {
            showToast('No se pudo generar la copia');
        }
    }, []);

    const handleImportGames = useCallback(async (file: File) => {
        try {
            const summary = await restoreBackup(await file.text());
            const reloaded = await listGames();
            setGames(reloaded);
            // La copia puede traer palabras vetadas: hay que releerlas o la
            // siguiente búsqueda seguiría usando la lista anterior.
            setBlockedWords(loadBlocked());
            const partes = [
                `${summary.games} ${summary.games === 1 ? 'partida' : 'partidas'}`,
                summary.blocked > 0 ? `${summary.blocked} vetadas` : '',
                summary.glyphs > 0 ? `${summary.glyphs} plantillas` : '',
            ].filter(Boolean);
            showToast(
                summary.games === 0 && summary.blocked === 0 && summary.glyphs === 0
                    ? 'La copia no traía nada nuevo'
                    : `Restaurado: ${partes.join(' · ')}`,
            );
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'No se pudo leer la copia');
        }
    }, []);

    const handleRenameGame = useCallback((id: string, name: string) => {
        setGames(prev => prev.map(g => {
            if (g.id !== id) return g;
            const updated = { ...g, name, updatedAt: Date.now() };
            void saveGame(updated);
            return updated;
        }));
    }, []);

    const handleDeleteGame = useCallback((id: string) => {
        const deleted = games.find(g => g.id === id);
        const remaining = games.filter(g => g.id !== id);
        // El switcher oculta el botón con una sola partida; por si acaso.
        if (!deleted || remaining.length === 0) return;

        const wasActive = id === activeGameId;
        void deleteGame(id);
        setGames(remaining);
        if (wasActive) {
            const next = remaining[0];
            skipSaveRef.current = true;
            setActiveGameId(next.id);
            persistActiveId(next.id);
            setBoard(next.board);
            setBoardRack(next.rack);
            setBoardBlanks(next.blanks);
        }

        // Confirmar no basta: un toque de más en el móvil se lleva un tablero
        // entero. Guardamos la partida y ofrecemos deshacer.
        showToast(`«${deleted.name}» eliminada`, {
            label: 'Deshacer',
            icon: 'fa-rotate-left',
            onClick: () => {
                void saveGame(deleted);
                setGames(prev =>
                    prev.some(g => g.id === deleted.id)
                        ? prev
                        : [...prev, deleted].sort((a, b) => b.updatedAt - a.updatedAt));
                if (wasActive) {
                    skipSaveRef.current = true;
                    setActiveGameId(deleted.id);
                    persistActiveId(deleted.id);
                    setBoard(deleted.board);
                    setBoardRack(deleted.rack);
                    setBoardBlanks(deleted.blanks);
                }
                closeToast();
            },
        });
    }, [games, activeGameId, showToast, closeToast]);

    // Al abrir la pestaña de tablero preparamos el DAWG en segundo plano,
    // así el primer "Mejor jugada" ya lo encuentra listo.
    const warmedRef = useRef(false);
    useEffect(() => {
        if (tab !== 'tablero' || !isWorkerReady || warmedRef.current) return;
        warmedRef.current = true;
        workerRef.current?.postMessage({ type: 'warmupBoard' });
    }, [tab, isWorkerReady]);

    // Cualquier cambio invalida las jugadas ya calculadas.
    useEffect(() => {
        // Una respuesta que ya estuviera calculándose pertenece al estado anterior.
        boardRequestRef.current++;
        setBoardMoves([]);
        setBoardSearched(false);
        setBoardLoading(false);
    }, [board, boardRack, boardBlanks]);

    const handleClear = useCallback(() => {
        searchRequestRef.current++;
        setIsLoading(false);
        setFoundWords([]);
        setHasSearched(false);
        setActiveLettersQuery('');
        setActivePatternQuery('');
    }, []);

    return (
        <div className="min-h-screen font-sans flex flex-col items-center px-4 sm:px-6 lg:px-8 relative">
            {/* Ambient light */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute -top-[15%] -left-[5%] w-[45vw] h-[45vw] rounded-full bg-accent-deep/20 blur-[130px] animate-float"></div>
                <div className="absolute top-[35%] -right-[10%] w-[40vw] h-[40vw] rounded-full bg-aqua/10 blur-[140px] animate-float" style={{ animationDelay: '-7s' }}></div>
            </div>

            <div className="w-full max-w-6xl mx-auto z-10 flex flex-col min-h-screen">
                <Header />

                <main className="flex-grow">
                    <div className="workspace-nav flex gap-1.5 mb-5 surface-inset rounded-2xl p-1.5 w-full sm:w-auto sm:inline-flex">
                        {([['buscador', 'fa-magnifying-glass', 'Buscador'], ['tablero', 'fa-table-cells-large', 'Tablero']] as const).map(([id, icon, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={`focus-ring flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                    tab === id ? 'bg-accent/25 text-white shadow-[0_8px_24px_-12px_rgba(139,92,246,.9),inset_0_0_0_1px_rgba(167,139,250,.45)]' : 'text-brand-subtle hover:text-white hover:bg-white/[.04]'
                                }`}
                            >
                                <i className={`fa-solid ${icon} mr-2`} />{label}
                            </button>
                        ))}
                    </div>

                    <section aria-label="Panel de tablero" className={`surface edge-light rounded-4xl shadow-[0_24px_70px_-30px_rgba(0,0,0,.9)] overflow-hidden animate-rise ${tab === 'tablero' ? '' : 'hidden'}`}>
                        <div className="p-4 sm:p-6">
                            {games.length > 0 && (
                                <GameSwitcher
                                    games={games}
                                    activeId={activeGameId}
                                    onSelect={handleSelectGame}
                                    onCreate={handleCreateGame}
                                    onRename={handleRenameGame}
                                    onDelete={handleDeleteGame}
                                    onExport={handleExportGames}
                                    onImport={handleImportGames}
                                />
                            )}
                            <BoardPanel
                                board={board}
                                rack={boardRack}
                                blanks={boardBlanks}
                                moves={boardMoves}
                                totalMoves={boardTotal}
                                isLoading={boardLoading}
                                isWorkerReady={isWorkerReady}
                                loadError={loadError}
                                hasSearched={boardSearched}
                                onBoardChange={setBoard}
                                onRackChange={setBoardRack}
                                onBlanksChange={setBoardBlanks}
                                onSolve={handleSolveBoard}
                                onShowToast={showToast}
                                ranking={ranking}
                                onRankingChange={handleRankingChange}
                                blockedWords={blockedWords}
                                onBlockWord={handleBlockWord}
                                onUnblockWord={handleUnblockWord}
                            />
                        </div>
                    </section>

                    <section aria-label="Buscador de palabras" className={`surface edge-light rounded-4xl shadow-[0_24px_70px_-30px_rgba(0,0,0,.9)] overflow-hidden animate-rise ${tab === 'buscador' ? '' : 'hidden'}`}>
                        <div className="p-5 sm:p-7">
                            <div className="search-intro flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 mb-6 border-b border-white/[.07]">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-accent-soft">Resuelve tu turno</p>
                                    <h2 className="text-xl font-bold tracking-tight text-brand-text mt-1">Encuentra palabras en segundos</h2>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-brand-subtle">
                                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-400/15 text-emerald-300"><i className="fa-solid fa-bolt" /></span>
                                    <span>Ordenadas para jugar mejor</span>
                                </div>
                            </div>
                            <WordInput
                                rackLetters={rackLetters}
                                blanks={blanks}
                                boardSlots={boardSlots}
                                parallelMode={parallelMode}
                                onRackChange={setRackLetters}
                                onBlanksChange={setBlanks}
                                onBoardChange={setBoardSlots}
                                onParallelModeChange={setParallelMode}
                                onSearch={handleSearch}
                                onClear={handleClear}
                                isLoading={isLoading}
                                isWorkerReady={isWorkerReady}
                                loadError={loadError}
                            />
                        </div>
                    </section>

                    <div className={tab === 'buscador' ? '' : 'hidden'}>
                    <Results
                        isLoading={isLoading}
                        words={foundWords}
                        hasSearched={hasSearched}
                        lettersQuery={activeLettersQuery}
                        patternQuery={activePatternQuery}
                        searchMode={searchMode}
                        onShowToast={showToast}
                    />
                    </div>
                </main>

                <footer className="w-full text-center py-8 mt-8 text-xs text-brand-subtle/55">
                    <p>Tu tablero y tus partidas se guardan en este dispositivo.</p>
                </footer>
            </div>

            <Toast message={toastMessage} action={toastAction} onClose={closeToast} />
        </div>
    );
};

export default App;
