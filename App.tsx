import React, { useState, useCallback, useEffect, useRef } from 'react';
import Header from './components/Header';
import WordInput from './components/WordInput';
import Results from './components/Results';
import Toast from './components/Toast';

export type SearchMode = 'anagram' | 'pattern' | 'combined';
export interface FoundWord {
    word: string;
    score: number;
}

type WorkerMessage =
    | { type: 'ready'; size: number }
    | { type: 'result'; data: FoundWord[] };

const App: React.FC = () => {
    const [foundWords, setFoundWords] = useState<FoundWord[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isWorkerReady, setIsWorkerReady] = useState<boolean>(false);
    const [hasSearched, setHasSearched] = useState<boolean>(false);
    const [searchMode, setSearchMode] = useState<SearchMode>('anagram');
    const [activeLettersQuery, setActiveLettersQuery] = useState('');
    const [activePatternQuery, setActivePatternQuery] = useState('');

    // Toast State
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        const initializeWorker = async () => {
            try {
                const [workerResponse, dictionaryResponse] = await Promise.all([
                    fetch('/services/anagramSolver.ts'),
                    fetch('/services/dictionary.txt')
                ]);

                if (!workerResponse.ok) throw new Error('Could not load worker script.');
                if (!dictionaryResponse.ok) throw new Error('Could not load dictionary.');

                const workerScript = await workerResponse.text();
                const dictionaryText = await dictionaryResponse.text();

                const blob = new Blob([workerScript], { type: 'application/javascript' });
                const worker = new Worker(URL.createObjectURL(blob));
                workerRef.current = worker;

                worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
                    const msg = event.data;
                    if (msg.type === 'ready') {
                        setIsWorkerReady(true);
                    } else if (msg.type === 'result') {
                        setFoundWords(msg.data);
                        setIsLoading(false);
                    }
                };

                worker.onerror = (error) => {
                    console.error('Worker error:', error);
                    setIsLoading(false);
                };

                worker.postMessage({ type: 'init', dictionaryText });

            } catch (error) {
                console.error('Failed to initialize web worker:', error);
                setIsLoading(false);
            }
        };

        initializeWorker();

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const handleSearch = useCallback(({ letters, pattern, blanks }: { letters: string, pattern: string, blanks: number }) => {
        setIsLoading(true);
        setHasSearched(true);
        setActiveLettersQuery(letters);
        setActivePatternQuery(pattern);

        if (letters && pattern) {
            setSearchMode('combined');
        } else if (pattern) {
            setSearchMode('pattern');
        } else {
            setSearchMode('anagram');
        }

        workerRef.current?.postMessage({ type: 'solve', payload: { letters, pattern, blanks } });

    }, []);
    
    const handleClear = useCallback(() => {
        setFoundWords([]);
        setHasSearched(false);
        setActiveLettersQuery('');
        setActivePatternQuery('');
    }, []);

    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        // Auto hide handled by the Toast component or a timeout here, 
        // but typically the component handles its own exit animation or we just clear it.
        setTimeout(() => setToastMessage(null), 3000);
    }, []);


    return (
        <div className="min-h-screen bg-gradient-to-br from-brand-primary to-[#0f172a] font-sans flex flex-col items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand-accent/5 blur-[120px]"></div>
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-indigo-500/5 blur-[100px]"></div>
            </div>

            <div className="w-full max-w-4xl mx-auto z-10 flex flex-col min-h-[calc(100vh-4rem)]">
                <Header />
                <main className="mt-8 flex-grow">
                    <div className="bg-brand-secondary/50 backdrop-blur-md border border-white/5 p-4 sm:p-6 rounded-2xl shadow-2xl">
                       <WordInput
                           onSearch={handleSearch}
                           isLoading={isLoading}
                           isWorkerReady={isWorkerReady}
                           onClear={handleClear}
                       />
                    </div>
                    
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
                
                <footer className="w-full text-center py-6 mt-8 text-brand-subtle text-sm opacity-60 hover:opacity-100 transition-opacity">
                    <p>Creado con React, TypeScript y Tailwind CSS.</p>
                </footer>
            </div>
            
            <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
        </div>
    );
};

export default App;