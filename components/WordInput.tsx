import React, { useState, useCallback, FormEvent } from 'react';

interface WordInputProps {
    onSearch: (query: { letters: string; pattern: string; blanks: number }) => void;
    isLoading: boolean;
    isWorkerReady: boolean;
    onClear: () => void;
}

const WordInput: React.FC<WordInputProps> = ({ onSearch, isLoading, isWorkerReady, onClear }) => {
    const [letters, setLetters] = useState<string>('');
    const [pattern, setPattern] = useState<string>('');
    const [blanks, setBlanks] = useState<number>(0);
    const [showPatternHelp, setShowPatternHelp] = useState(false);

    const handleSubmit = useCallback((e: FormEvent) => {
        e.preventDefault();
        if ((letters.trim() || pattern.trim()) && !isLoading && isWorkerReady) {
            onSearch({ letters: letters.trim(), pattern: pattern.trim(), blanks });
        }
    }, [letters, pattern, blanks, isLoading, isWorkerReady, onSearch]);

    const handleClearClick = useCallback(() => {
        setLetters('');
        setPattern('');
        setBlanks(0);
        onClear();
    }, [onClear]);

    const isDisabled = isLoading || !isWorkerReady;

    return (
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            {!isWorkerReady && (
                <div className="flex items-center gap-2 text-xs text-brand-subtle mb-4 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
                    <i className="fa-solid fa-circle-notch fa-spin text-brand-accent"></i>
                    <span>Cargando diccionario...</span>
                </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Letters Input */}
                    <div className="group">
                        <label htmlFor="letters-input" className="block text-sm font-semibold text-brand-subtle mb-2 ml-1 group-focus-within:text-brand-accent transition-colors">
                            <i className="fa-solid fa-cubes-stacked mr-2"></i>
                            Tus Letras
                        </label>
                        <div className="relative">
                            <input
                                id="letters-input"
                                type="text"
                                value={letters}
                                onChange={(e) => setLetters(e.target.value)}
                                placeholder="ej: 'amor' o 'rstaeil'"
                                className="w-full px-5 py-4 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent transition-all duration-300 text-lg placeholder-slate-600 text-brand-text disabled:opacity-40"
                                disabled={isDisabled}
                                aria-label="Letras para formar palabras"
                            />
                            {letters && !isDisabled && (
                                <button
                                    type="button"
                                    onClick={() => setLetters('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                >
                                    <i className="fa-solid fa-times-circle"></i>
                                </button>
                            )}
                        </div>

                        {/* Blank tile selector */}
                        <div className="mt-2.5 flex items-center gap-3 ml-1">
                            <span className="text-xs text-brand-subtle font-medium">
                                <i className="fa-regular fa-square mr-1.5 text-yellow-500/70"></i>
                                Comodines (fichas en blanco):
                            </span>
                            <div className="flex gap-1">
                                {[0, 1, 2].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setBlanks(n)}
                                        disabled={isDisabled}
                                        className={`w-8 h-8 rounded-lg text-sm font-bold transition-all border ${
                                            blanks === n
                                                ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-400'
                                                : 'bg-slate-800 border-slate-700 text-brand-subtle hover:border-slate-500 hover:text-white'
                                        } disabled:opacity-40`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Pattern Input */}
                    <div className="group">
                        <div className="flex justify-between items-center mb-2">
                            <label htmlFor="pattern-input" className="block text-sm font-semibold text-brand-subtle ml-1 group-focus-within:text-brand-accent transition-colors">
                                <i className="fa-solid fa-puzzle-piece mr-2"></i>
                                Patrón <span className="text-xs opacity-50 font-normal">(crucigrama / tablero)</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setShowPatternHelp(!showPatternHelp)}
                                className="text-xs text-brand-accent hover:text-white underline decoration-dashed underline-offset-4"
                            >
                                {showPatternHelp ? 'Ocultar' : '¿Cómo funciona?'}
                            </button>
                        </div>
                        <div className="relative">
                            <input
                                id="pattern-input"
                                type="text"
                                value={pattern}
                                onChange={(e) => setPattern(e.target.value)}
                                placeholder="ej: 'c?s?', '-ción', 'pre-'"
                                className="w-full px-5 py-4 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent transition-all duration-300 text-lg placeholder-slate-600 text-brand-text font-mono disabled:opacity-40"
                                disabled={isDisabled}
                                aria-label="Patrón para filtrar palabras"
                            />
                            {pattern && !isDisabled && (
                                <button
                                    type="button"
                                    onClick={() => setPattern('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                >
                                    <i className="fa-solid fa-times-circle"></i>
                                </button>
                            )}
                        </div>

                        {/* Collapsible Help */}
                        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${showPatternHelp ? 'max-h-56 opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
                            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-xs text-brand-subtle space-y-1.5">
                                <p className="text-white/60 font-semibold mb-1">Útil para crucigramas y tablero de Palabrados:</p>
                                <p><code className="text-brand-accent font-bold">?</code> = una letra desconocida — ej: <span className="text-white font-mono">ca?a</span> → caja, cara, cama…</p>
                                <p><code className="text-brand-accent font-bold">-</code> al principio o final = libre — ej: <span className="text-white font-mono">-ción</span>, <span className="text-white font-mono">pre-</span></p>
                                <p><code className="text-brand-accent font-bold">-</code> en ambos lados = contiene — ej: <span className="text-white font-mono">-amor-</span></p>
                                <p><code className="text-brand-accent font-bold">*</code> = cualquier número de letras — ej: <span className="text-white font-mono">c*a</span> → casa, carta…</p>
                                <p className="pt-1 border-t border-slate-700/50 text-white/40">Combinado: escribe tus fichas + un patrón para encontrar palabras que encajen en el tablero.</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row-reverse gap-4">
                    <button
                        type="submit"
                        className="w-full sm:w-2/3 px-8 py-4 bg-gradient-to-r from-brand-accent to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-slate-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center text-lg"
                        disabled={isDisabled || (!letters.trim() && !pattern.trim())}
                        aria-label="Buscar palabras"
                    >
                        {isLoading ? (
                            <><i className="fa-solid fa-circle-notch fa-spin mr-3"></i>Procesando...</>
                        ) : !isWorkerReady ? (
                            <><i className="fa-solid fa-circle-notch fa-spin mr-3"></i>Cargando...</>
                        ) : (
                            <><i className="fa-solid fa-search mr-2"></i>Buscar Palabras</>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={handleClearClick}
                        className="w-full sm:w-1/3 px-6 py-4 bg-slate-800 text-brand-subtle font-semibold rounded-xl border border-slate-700 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-300 flex items-center justify-center disabled:opacity-40"
                        disabled={isDisabled}
                        aria-label="Limpiar búsqueda"
                    >
                        <i className="fa-solid fa-eraser mr-2"></i>Limpiar
                    </button>
                </div>
            </form>
        </div>
    );
};

export default WordInput;
