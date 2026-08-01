import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import WordInput from './components/WordInput';
import Results from './components/Results';
import Toast from './components/Toast';
import { FoundWord, SearchMode, BoardSlot } from './types';

const slotsToPattern = (slots: BoardSlot[]): string =>
    slots.length === 0 ? '' : slots.map(s => s.letter || '?').join('');

type WorkerMessage =
    | { type: 'ready'; size: number }
    | { type: 'result'; data: FoundWord[] };

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
                };
                worker.onerror = () => { setIsLoading(false); setLoadError(true); };
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
                    <section className="surface edge-light rounded-4xl shadow-[0_24px_70px_-30px_rgba(0,0,0,.9)] overflow-hidden animate-rise">
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

                    <Results
                        isLoading={isLoading}
                        words={foundWords}
                        hasSearched={hasSearched}
                        lettersQuery={activeLettersQuery}
                        patternQuery={activePatternQuery}
                        searchMode={searchMode}
                        onShowToast={showToast}
                    />
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
