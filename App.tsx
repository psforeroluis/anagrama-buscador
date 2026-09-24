import React, { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
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
import { blockWord, loadBlocked, saveBlocked, unblockWord } from './services/wordBlocklist';
import { addCandidates, loadCandidates, removeCandidate, saveCandidates } from './services/wordCandidates';
import { downloadBackup, restoreBackup } from './services/backup';

const slotsToPattern = (slots: BoardSlot[]): string =>
    slots.length === 0 ? '' : slots.map(s => s.letter || '?').join('');

type WorkerMessage =
    | { type: 'ready'; size: number }
    | { type: 'result'; data: FoundWord[]; requestId?: number }
    | { type: 'boardResult'; data: BoardMove[]; total: number; requestId?: number }
    | { type: 'checkWord'; word: string; known: boolean }
    | { type: 'checkWords'; unknown: string[]; requestId?: number }
    | { type: 'error'; operation: string; requestId?: number };

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
    const [candidateWords, setCandidateWords] = useState<string[]>(loadCandidates);
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
    const wordCheckRequestRef = useRef(0);
    const wordCheckResolversRef = useRef(new Map<number, {
        resolve: (words: string[]) => void;
        reject: (error: Error) => void;
        timer: number;
    }>());
    const rejectWordChecks = useCallback((message: string) => {
        for (const pending of wordCheckResolversRef.current.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error(message));
        }
        wordCheckResolversRef.current.clear();
    }, []);

    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
    const pendingWrites = useRef(new Set<Promise<void>>());
    const failedGames = useRef(new Map<string, Game>());
    const persistGame = useCallback((game: Game) => {
        setSaveStatus('saving');
        const operation = saveGame(game);
        pendingWrites.current.add(operation);
        operation.then(() => {
            pendingWrites.current.delete(operation);
            failedGames.current.delete(game.id);
            if (pendingWrites.current.size === 0) setSaveStatus(failedGames.current.size ? 'error' : 'saved');
        }, () => {
            pendingWrites.current.delete(operation);
            failedGames.current.set(game.id, game);
            setSaveStatus('error');
            showToast('No se pudo guardar la partida. Conserva esta pestaña abierta e inténtalo de nuevo.');
        });
        return operation;
    }, [showToast]);

    // --- Web Worker ---
    useEffect(() => {
        const controller = new AbortController();
        let worker: Worker | undefined;
        let workerUrl: string | undefined;
        const init = async () => {
            try {
                const [wRes, dRes] = await Promise.all([
                    fetch('/services/anagramSolver.ts', { signal: controller.signal }),
                    fetch('/services/dictionary.txt', { signal: controller.signal }),
                ]);
                if (!wRes.ok || !dRes.ok) throw new Error('Failed to load');
                const [script, dict] = await Promise.all([wRes.text(), dRes.text()]);
                if (controller.signal.aborted) return;
                workerUrl = URL.createObjectURL(new Blob([script], { type: 'application/javascript' }));
                worker = new Worker(workerUrl);
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
                    else if (e.data.type === 'checkWords') {
                        const pending = e.data.requestId === undefined
                            ? undefined
                            : wordCheckResolversRef.current.get(e.data.requestId);
                        if (pending && e.data.requestId !== undefined) {
                            wordCheckResolversRef.current.delete(e.data.requestId);
                            clearTimeout(pending.timer);
                            pending.resolve(e.data.unknown);
                        }
                    }
                    else if (e.data.type === 'error') {
                        if (e.data.operation === 'checkWords' && e.data.requestId !== undefined) {
                            const pending = wordCheckResolversRef.current.get(e.data.requestId);
                            if (pending) {
                                wordCheckResolversRef.current.delete(e.data.requestId);
                                clearTimeout(pending.timer);
                                pending.reject(new Error('No se pudo comprobar el diccionario.'));
                            }
                        } else {
                            setIsLoading(false);
                            setBoardLoading(false);
                            showToast('No se pudo completar la búsqueda. Inténtalo de nuevo.');
                        }
                    }
                    else if (e.data.type === 'boardResult') {
                        if (e.data.requestId !== boardRequestRef.current) return;
                        setBoardMoves(e.data.data);
                        setBoardTotal(e.data.total ?? e.data.data.length);
                        setBoardLoading(false);
                    }
                };
                worker.onerror = () => {
                    setIsWorkerReady(false);
                    setIsLoading(false);
                    setBoardLoading(false);
                    setLoadError(true);
                    rejectWordChecks('El diccionario dejó de responder.');
                };
                worker.postMessage({ type: 'init', dictionaryText: dict });
            } catch { if (!controller.signal.aborted) { setIsLoading(false); setLoadError(true); } }
        };
        init();
        return () => {
            controller.abort();
            rejectWordChecks('Se cerró la comprobación del diccionario.');
            worker?.terminate();
            if (workerRef.current === worker) workerRef.current = null;
            if (workerUrl) URL.revokeObjectURL(workerUrl);
        };
    }, [rejectWordChecks, showToast]);

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

    const checkUnknownWords = useCallback((words: string[]): Promise<string[]> => {
        if (words.length === 0) return Promise.resolve([]);
        if (!workerRef.current || !isWorkerReady) {
            return Promise.reject(new Error('El diccionario no está disponible.'));
        }
        const requestId = ++wordCheckRequestRef.current;
        return new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => {
                wordCheckResolversRef.current.delete(requestId);
                reject(new Error('La comprobación del diccionario tardó demasiado.'));
            }, 15_000);
            wordCheckResolversRef.current.set(requestId, { resolve, reject, timer });
            workerRef.current!.postMessage({ type: 'checkWords', requestId, payload: { words } });
        });
    }, [isWorkerReady]);

    const handleCollectBoardWords = useCallback(async (words: string[]): Promise<number> => {
        const unknown = await checkUnknownWords(words);
        const before = new Set(loadCandidates());
        const next = addCandidates(unknown);
        setCandidateWords(next);
        return next.filter(word => !before.has(word)).length;
    }, [checkUnknownWords]);

    const handleVerifyMaintenance = useCallback(async (): Promise<{ additions: number; removals: number }> => {
        const additions = loadCandidates();
        const removals = loadBlocked();
        const unknown = new Set(await checkUnknownWords([...new Set([...additions, ...removals])]));

        // Un alta está aplicada cuando ya existe; una baja, cuando ya no existe.
        const pendingAdditions = saveCandidates(additions.filter(word => unknown.has(word)));
        const pendingRemovals = removals.filter(word => !unknown.has(word));
        saveBlocked(pendingRemovals);
        setCandidateWords(pendingAdditions);
        setBlockedWords(pendingRemovals);
        if (boardSearched) runBoardSearch(pendingRemovals, ranking);

        return {
            additions: additions.length - pendingAdditions.length,
            removals: removals.length - pendingRemovals.length,
        };
    }, [checkUnknownWords, boardSearched, runBoardSearch, ranking]);

    const handleRemoveCandidate = useCallback((word: string) => {
        setCandidateWords(removeCandidate(word));
    }, []);

    // --- Carga inicial de partidas (migra el tablero único de la versión previa) ---
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const loaded = await initGames().catch(() => { setSaveStatus('error'); return [createGame('Partida 1')]; });
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

    // Sin temporizador: el estado de la lista se actualiza antes del siguiente
    // evento y cada edición queda encolada para persistir, incluso al cambiar.
    const skipSaveRef = useRef(true);
    useLayoutEffect(() => {
        if (!activeGameId) return;
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }
        const current = games.find(g => g.id === activeGameId);
        if (!current) return;
        const updated: Game = {
            ...current, board, rack: boardRack, blanks: boardBlanks, updatedAt: Date.now(),
        };
        setGames(prev => prev.map(g => g.id === activeGameId ? updated : g));
        void persistGame(updated);
    }, [board, boardRack, boardBlanks, activeGameId, persistGame]);

    const handleSelectGame = useCallback((id: string) => {
        const game = games.find(g => g.id === id);
        if (!game || id === activeGameId) return;
        skipSaveRef.current = true;
        setActiveGameId(id);
        persistActiveId(id);
        setBoard(game.board);
        setBoardRack(game.rack);
        setBoardBlanks(game.blanks);
    }, [games, activeGameId]);

    const handleCreateGame = useCallback(() => {
        const game = createGame(nextGameName(games));
        void persistGame(game);
        skipSaveRef.current = true;
        setGames(prev => [game, ...prev]);
        setActiveGameId(game.id);
        persistActiveId(game.id);
        setBoard(game.board);
        setBoardRack(game.rack);
        setBoardBlanks(game.blanks);
        showToast(`${game.name} creada`);
    }, [games, persistGame, showToast]);

    const handleExportGames = useCallback(async () => {
        try {
            // Reintenta también el estado actual si una escritura anterior falló.
            for (const failed of failedGames.current.values()) {
                await persistGame(games.find(g => g.id === failed.id) ?? failed);
            }
            const current = games.find(g => g.id === activeGameId);
            if (current) await persistGame({ ...current, board, rack: boardRack, blanks: boardBlanks });
            await Promise.all([...pendingWrites.current]);
            const filename = await downloadBackup();
            showToast(`Copia descargada: ${filename}`);
        } catch {
            showToast('No se pudo generar la copia');
        }
    }, [games, activeGameId, board, boardRack, boardBlanks, persistGame]);

    const handleImportGames = useCallback(async (file: File) => {
        try {
            await Promise.all([...pendingWrites.current]);
            const summary = await restoreBackup(await file.text());
            const reloaded = await listGames();
            setGames(reloaded);
            // La copia puede traer palabras vetadas: hay que releerlas o la
            // siguiente búsqueda seguiría usando la lista anterior.
            setBlockedWords(loadBlocked());
            setCandidateWords(loadCandidates());
            const partes = [
                `${summary.games} ${summary.games === 1 ? 'partida' : 'partidas'}`,
                summary.blocked > 0 ? `${summary.blocked} vetadas` : '',
                summary.glyphs > 0 ? `${summary.glyphs} plantillas` : '',
                summary.candidates > 0 ? `${summary.candidates} detectadas` : '',
            ].filter(Boolean);
            showToast(
                summary.games === 0 && summary.blocked === 0 && summary.glyphs === 0 && summary.candidates === 0
                    ? 'La copia no traía nada nuevo'
                    : `Restaurado: ${partes.join(' · ')}`,
            );
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'No se pudo leer la copia');
        }
    }, []);

    const handleRenameGame = useCallback((id: string, name: string) => {
        const game = games.find(g => g.id === id);
        if (!game) return;
        const updated = { ...game, name, updatedAt: Date.now() };
        setGames(prev => prev.map(g => g.id === id ? updated : g));
        void persistGame(updated);
    }, [games, persistGame]);

    const handleDeleteGame = useCallback((id: string) => {
        const deleted = games.find(g => g.id === id);
        const remaining = games.filter(g => g.id !== id);
        // El switcher oculta el botón con una sola partida; por si acaso.
        if (!deleted || remaining.length === 0) return;

        const wasActive = id === activeGameId;
        void deleteGame(id).catch(() => { setSaveStatus('error'); showToast('No se pudo eliminar la partida del almacenamiento.'); });
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
                void persistGame(deleted);
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
    }, [games, activeGameId, showToast, closeToast, persistGame]);

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
            <p role="status" className="relative z-10 text-xs text-brand-subtle mt-3">
                {saveStatus === 'saving' ? 'Guardando…' : saveStatus === 'error' ? 'Error al guardar: descarga una copia para reintentar' : 'Guardado'}
            </p>
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
                                candidateWords={candidateWords}
                                onCollectBoardWords={handleCollectBoardWords}
                                onRemoveCandidate={handleRemoveCandidate}
                                onVerifyMaintenance={handleVerifyMaintenance}
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
