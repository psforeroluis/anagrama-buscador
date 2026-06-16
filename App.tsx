import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Header from './components/Header';
import WordInput from './components/WordInput';
import Results from './components/Results';
import Toast from './components/Toast';
import GameTabs from './components/GameTabs';
import BoardView from './components/BoardView';
import { SavedGame, FoundWord, SearchMode, BoardSlot, PlayRecord } from './types';

// --- localStorage (versioned key avoids conflicts with old data) ---
const STORAGE_KEY = 'apalabrados_games_v2';
const CURRENT_KEY = 'apalabrados_current_v2';

const tryParse = <T,>(key: string, fallback: T): T => {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
};
const trySet = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
};

const createGame = (name: string): SavedGame => ({
    id: crypto.randomUUID(),
    name,
    rackLetters: '',
    blanks: 0,
    boardSlots: [],
    plays: [],
    updatedAt: Date.now(),
});

// Ensure games loaded from old localStorage versions have all fields
const migrateGame = (g: Partial<SavedGame>): SavedGame => ({
    plays: [],
    blanks: 0,
    boardSlots: [],
    rackLetters: '',
    ...g,
    id: g.id ?? crypto.randomUUID(),
    name: g.name ?? 'Partida',
    updatedAt: g.updatedAt ?? Date.now(),
});

const slotsToPattern = (slots: BoardSlot[]): string =>
    slots.length === 0 ? '' : slots.map(s => s.letter || '?').join('');

type WorkerMessage =
    | { type: 'ready'; size: number }
    | { type: 'result'; data: FoundWord[] };

type AppTab = 'search' | 'board';

const App: React.FC = () => {
    // --- Games ---
    const [games, setGames] = useState<SavedGame[]>([]);
    const [currentGameId, setCurrentGameId] = useState<string>('');
    const [activeTab, setActiveTab] = useState<AppTab>('search');

    const currentGame = useMemo(
        () => games.find(g => g.id === currentGameId) ?? null,
        [games, currentGameId]
    );

    // --- Search results (ephemeral — not persisted) ---
    const [foundWords, setFoundWords] = useState<FoundWord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isWorkerReady, setIsWorkerReady] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchMode, setSearchMode] = useState<SearchMode>('anagram');
    const [activeLettersQuery, setActiveLettersQuery] = useState('');
    const [activePatternQuery, setActivePatternQuery] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const workerRef = useRef<Worker | null>(null);

    // --- Init games ---
    useEffect(() => {
        const saved = (tryParse<Partial<SavedGame>[]>(STORAGE_KEY, [])).map(migrateGame);
        const savedId = tryParse<string | null>(CURRENT_KEY, null);
        if (saved.length === 0) {
            const initial = createGame('Partida 1');
            setGames([initial]);
            setCurrentGameId(initial.id);
        } else {
            setGames(saved);
            setCurrentGameId(saved.find(g => g.id === savedId)?.id ?? saved[0].id);
        }
    }, []);

    // --- Auto-save ---
    useEffect(() => { if (games.length > 0) trySet(STORAGE_KEY, games); }, [games]);
    useEffect(() => { if (currentGameId) trySet(CURRENT_KEY, currentGameId); }, [currentGameId]);

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
                };
                worker.onerror = () => setIsLoading(false);
                worker.postMessage({ type: 'init', dictionaryText: dict });
            } catch { setIsLoading(false); }
        };
        init();
        return () => workerRef.current?.terminate();
    }, []);

    // --- Game management ---
    const updateCurrentGame = useCallback((updates: Partial<SavedGame>) => {
        setGames(prev => prev.map(g =>
            g.id === currentGameId ? { ...g, ...updates, updatedAt: Date.now() } : g
        ));
    }, [currentGameId]);

    const switchGame = useCallback((id: string) => {
        setCurrentGameId(id);
        setFoundWords([]);
        setHasSearched(false);
    }, []);

    const addGame = useCallback(() => {
        const game = createGame(`Partida ${games.length + 1}`);
        setGames(prev => [...prev, game]);
        setCurrentGameId(game.id);
        setFoundWords([]);
        setHasSearched(false);
    }, [games.length]);

    const renameGame = useCallback((id: string, name: string) => {
        setGames(prev => prev.map(g => g.id === id ? { ...g, name, updatedAt: Date.now() } : g));
    }, []);

    const deleteGame = useCallback((id: string) => {
        setGames(prev => {
            const next = prev.filter(g => g.id !== id);
            if (id === currentGameId && next.length > 0) setCurrentGameId(next[0].id);
            return next;
        });
        setFoundWords([]);
        setHasSearched(false);
    }, [currentGameId]);

    // --- Play management ---
    const addPlay = useCallback((playData: Omit<PlayRecord, 'id'>) => {
        const play: PlayRecord = { ...playData, id: crypto.randomUUID() };
        updateCurrentGame({ plays: [...(currentGame?.plays ?? []), play] });
    }, [currentGame, updateCurrentGame]);

    const removePlay = useCallback((id: string) => {
        updateCurrentGame({ plays: (currentGame?.plays ?? []).filter(p => p.id !== id) });
    }, [currentGame, updateCurrentGame]);

    // --- Search ---
    const handleSearch = useCallback(() => {
        if (!currentGame) return;
        const pattern = slotsToPattern(currentGame.boardSlots);
        const letters = currentGame.rackLetters.trim();
        if (!letters && !pattern) return;
        setIsLoading(true);
        setHasSearched(true);
        setActiveLettersQuery(letters);
        setActivePatternQuery(pattern);
        setSearchMode(letters && pattern ? 'combined' : pattern ? 'pattern' : 'anagram');
        workerRef.current?.postMessage({ type: 'solve', payload: { letters, pattern, blanks: currentGame.blanks } });
    }, [currentGame]);

    const handleClear = useCallback(() => {
        setFoundWords([]);
        setHasSearched(false);
        setActiveLettersQuery('');
        setActivePatternQuery('');
    }, []);

    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    }, []);

    const boardPlayCount = currentGame?.plays?.length ?? 0;

    // --- Export / Import ---
    const importInputRef = useRef<HTMLInputElement>(null);

    const handleExport = useCallback(() => {
        const data = JSON.stringify(games, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `apalabrados-partidas-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Partidas exportadas correctamente');
    }, [games, showToast]);

    const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target?.result as string);
                if (!Array.isArray(parsed)) throw new Error('Formato inválido');
                const incoming: SavedGame[] = parsed.map(migrateGame);
                // Merge: incoming games replace existing ones with same id; new ones are appended
                setGames(prev => {
                    const existingIds = new Set(prev.map(g => g.id));
                    const merged = prev.map(g => incoming.find(ig => ig.id === g.id) ?? g);
                    const newOnes = incoming.filter(ig => !existingIds.has(ig.id));
                    return [...merged, ...newOnes];
                });
                showToast(`${incoming.length} partida(s) importada(s)`);
            } catch {
                showToast('Error: el archivo no es válido');
            }
        };
        reader.readAsText(file);
        // Reset so same file can be re-imported
        e.target.value = '';
    }, [showToast]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-primary to-[#0f172a] font-sans flex flex-col items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand-accent/5 blur-[120px]"></div>
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[100px]"></div>
            </div>

            <div className="w-full max-w-4xl mx-auto z-10 flex flex-col min-h-[calc(100vh-4rem)]">
                <Header />

                <main className="mt-6 flex-grow">
                    {/* Game tabs */}
                    {games.length > 0 && (
                        <GameTabs
                            games={games}
                            currentId={currentGameId}
                            onSwitch={switchGame}
                            onAdd={addGame}
                            onRename={renameGame}
                            onDelete={deleteGame}
                        />
                    )}

                    {/* Export / Import bar */}
                    <div className="flex justify-end gap-2 mb-2 px-1">
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={handleImport}
                        />
                        <button
                            onClick={() => importInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-subtle border border-slate-700 bg-slate-900/60 hover:text-white hover:border-slate-500 transition-all"
                            title="Importar partidas desde archivo JSON"
                        >
                            <i className="fa-solid fa-upload"></i>
                            Importar
                        </button>
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-subtle border border-slate-700 bg-slate-900/60 hover:text-white hover:border-slate-500 transition-all"
                            title="Exportar todas las partidas a JSON"
                        >
                            <i className="fa-solid fa-download"></i>
                            Exportar
                        </button>
                    </div>

                    {/* Main card */}
                    <div className="bg-brand-secondary/50 backdrop-blur-md border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
                        {/* Tab bar */}
                        <div className="flex border-b border-slate-700/60">
                            <button
                                onClick={() => setActiveTab('search')}
                                className={`flex-1 px-4 py-3 text-sm font-semibold transition-all ${
                                    activeTab === 'search'
                                        ? 'text-brand-accent border-b-2 border-brand-accent bg-brand-accent/5'
                                        : 'text-brand-subtle hover:text-white'
                                }`}
                            >
                                <i className="fa-solid fa-magnifying-glass mr-2"></i>
                                Buscar palabras
                            </button>
                            <button
                                onClick={() => setActiveTab('board')}
                                className={`flex-1 px-4 py-3 text-sm font-semibold transition-all relative ${
                                    activeTab === 'board'
                                        ? 'text-brand-accent border-b-2 border-brand-accent bg-brand-accent/5'
                                        : 'text-brand-subtle hover:text-white'
                                }`}
                            >
                                <i className="fa-solid fa-border-all mr-2"></i>
                                Tablero
                                {boardPlayCount > 0 && (
                                    <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                                        activeTab === 'board' ? 'bg-brand-accent text-slate-900' : 'bg-slate-700 text-slate-300'
                                    }`}>
                                        {boardPlayCount}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Tab content */}
                        <div className="p-4 sm:p-6">
                            {activeTab === 'search' && currentGame && (
                                <WordInput
                                    rackLetters={currentGame.rackLetters}
                                    blanks={currentGame.blanks}
                                    boardSlots={currentGame.boardSlots}
                                    onRackChange={v => updateCurrentGame({ rackLetters: v })}
                                    onBlanksChange={v => updateCurrentGame({ blanks: v })}
                                    onBoardChange={slots => updateCurrentGame({ boardSlots: slots })}
                                    onSearch={handleSearch}
                                    onClear={handleClear}
                                    isLoading={isLoading}
                                    isWorkerReady={isWorkerReady}
                                />
                            )}

                            {activeTab === 'board' && currentGame && (
                                <BoardView
                                    plays={currentGame.plays ?? []}
                                    onAddPlay={addPlay}
                                    onRemovePlay={removePlay}
                                />
                            )}
                        </div>
                    </div>

                    {/* Results (only in search tab) */}
                    {activeTab === 'search' && (
                        <Results
                            isLoading={isLoading}
                            words={foundWords}
                            hasSearched={hasSearched}
                            lettersQuery={activeLettersQuery}
                            patternQuery={activePatternQuery}
                            searchMode={searchMode}
                            onShowToast={showToast}
                        />
                    )}
                </main>

                <footer className="w-full text-center py-6 mt-8 text-brand-subtle text-sm opacity-60 hover:opacity-100 transition-opacity">
                    <p>Creado con React, TypeScript y Tailwind CSS.</p>
                </footer>
            </div>

            <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
        </div>
    );
};

export default App;
