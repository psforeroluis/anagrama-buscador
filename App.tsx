import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import WordInput from './components/WordInput';
import Results from './components/Results';
import Toast from './components/Toast';
import BoardPanel from './components/BoardPanel';
import GameSwitcher from './components/GameSwitcher';
import { FoundWord, SearchMode, BoardSlot, BoardMove, BoardState } from './types';
import { emptyBoard } from './services/boardLayout';
import {
    Game, createGame, deleteGame, initGames, nextGameName, saveGame,
    getActiveId, setActiveId as persistActiveId,
} from './services/gamesStore';

const slotsToPattern = (slots: BoardSlot[]): string =>
    slots.length === 0 ? '' : slots.map(s => s.letter || '?').join('');

type WorkerMessage =
    | { type: 'ready'; size: number }
    | { type: 'result'; data: FoundWord[] }
    | { type: 'boardResult'; data: BoardMove[]; total: number };

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

    const workerRef = useRef<Worker | null>(null);

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
                    else if (e.data.type === 'result') { setFoundWords(e.data.data); setIsLoading(false); }
                    else if (e.data.type === 'boardResult') {
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
        setSearchMode(isParallel ? 'parallel' : letters && pattern ? 'combined' : pattern ? 'pattern' : 'anagram');
        workerRef.current?.postMessage({
            type: 'solve',
            payload: { letters, pattern, blanks, parallelMode: isParallel },
        });
    }, [rackLetters, boardSlots, blanks, parallelMode]);

    // --- Búsqueda de mejor jugada en el tablero ---
    const handleSolveBoard = useCallback(() => {
        if (!boardRack.trim() && boardBlanks === 0) return;
        setBoardLoading(true);
        setBoardSearched(true);
        workerRef.current?.postMessage({
            type: 'solveBoard',
            payload: {
                board: board.letters,
                blanksBoard: board.blanks,
                rack: boardRack,
                blanks: boardBlanks,
                limit: 120,
            },
        });
    }, [board, boardRack, boardBlanks]);

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

    const handleRenameGame = useCallback((id: string, name: string) => {
        setGames(prev => prev.map(g => {
            if (g.id !== id) return g;
            const updated = { ...g, name, updatedAt: Date.now() };
            void saveGame(updated);
            return updated;
        }));
    }, []);

    const handleDeleteGame = useCallback((id: string) => {
        const remaining = games.filter(g => g.id !== id);
        // El switcher oculta el botón con una sola partida; por si acaso.
        if (remaining.length === 0) return;
        void deleteGame(id);
        setGames(remaining);
        if (id === activeGameId) {
            const next = remaining[0];
            skipSaveRef.current = true;
            setActiveGameId(next.id);
            persistActiveId(next.id);
            setBoard(next.board);
            setBoardRack(next.rack);
            setBoardBlanks(next.blanks);
        }
        showToast('Partida eliminada');
    }, [games, activeGameId]);

    // Al abrir la pestaña de tablero preparamos el DAWG en segundo plano,
    // así el primer "Mejor jugada" ya lo encuentra listo.
    const warmedRef = useRef(false);
    useEffect(() => {
        if (tab !== 'tablero' || !isWorkerReady || warmedRef.current) return;
        warmedRef.current = true;
        workerRef.current?.postMessage({ type: 'warmupBoard' });
    }, [tab, isWorkerReady]);

    // Cualquier cambio invalida las jugadas ya calculadas.
    useEffect(() => { setBoardMoves([]); setBoardSearched(false); }, [board, boardRack, boardBlanks]);

    const handleClear = useCallback(() => {
        setFoundWords([]);
        setHasSearched(false);
        setActiveLettersQuery('');
        setActivePatternQuery('');
    }, []);

    const toastTimerRef = useRef<number | null>(null);
    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 3000);
    }, []);

    return (
        <div className="min-h-screen font-sans flex flex-col items-center px-4 sm:px-6 lg:px-8 relative">
            {/* Ambient light */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute -top-[15%] -left-[5%] w-[45vw] h-[45vw] rounded-full bg-accent-deep/20 blur-[130px] animate-float"></div>
                <div className="absolute top-[35%] -right-[10%] w-[40vw] h-[40vw] rounded-full bg-aqua/10 blur-[140px] animate-float" style={{ animationDelay: '-7s' }}></div>
            </div>

            <div className="w-full max-w-5xl mx-auto z-10 flex flex-col min-h-screen">
                <Header />

                <main className="flex-grow">
                    <div className="flex gap-1.5 mb-4 surface-inset rounded-2xl p-1.5 w-full sm:w-auto sm:inline-flex">
                        {([['buscador', 'fa-magnifying-glass', 'Buscador'], ['tablero', 'fa-table-cells-large', 'Tablero']] as const).map(([id, icon, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={`focus-ring flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                    tab === id ? 'bg-accent/15 text-accent-soft shadow-[inset_0_0_0_1px_rgba(167,139,250,.35)]' : 'text-brand-subtle hover:text-white'
                                }`}
                            >
                                <i className={`fa-solid ${icon} mr-2`} />{label}
                            </button>
                        ))}
                    </div>

                    <section className={`surface edge-light rounded-4xl shadow-[0_24px_70px_-30px_rgba(0,0,0,.9)] overflow-hidden animate-rise ${tab === 'tablero' ? '' : 'hidden'}`}>
                        <div className="p-4 sm:p-6">
                            {games.length > 0 && (
                                <GameSwitcher
                                    games={games}
                                    activeId={activeGameId}
                                    onSelect={handleSelectGame}
                                    onCreate={handleCreateGame}
                                    onRename={handleRenameGame}
                                    onDelete={handleDeleteGame}
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
                            />
                        </div>
                    </section>

                    <section className={`surface edge-light rounded-4xl shadow-[0_24px_70px_-30px_rgba(0,0,0,.9)] overflow-hidden animate-rise ${tab === 'buscador' ? '' : 'hidden'}`}>
                        <div className="p-5 sm:p-7">
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

                <footer className="w-full text-center py-10 mt-10 text-xs text-brand-subtle/60">
                    <p>Hecho con React, TypeScript y Tailwind CSS.</p>
                </footer>
            </div>

            <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
        </div>
    );
};

export default App;
