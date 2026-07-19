import React, { useCallback, useState, FormEvent } from 'react';
import BoardBuilder from './BoardBuilder';
import ShortWordsGuide from './ShortWordsGuide';
import { BoardSlot } from '../types';

interface WordInputProps {
    rackLetters: string;
    blanks: number;
    boardSlots: BoardSlot[];
    parallelMode: boolean;
    onRackChange: (v: string) => void;
    onBlanksChange: (v: number) => void;
    onBoardChange: (slots: BoardSlot[]) => void;
    onParallelModeChange: (v: boolean) => void;
    onSearch: () => void;
    onClear: () => void;
    isLoading: boolean;
    isWorkerReady: boolean;
    loadError: boolean;
}

const WordInput: React.FC<WordInputProps> = ({
    rackLetters,
    blanks,
    boardSlots,
    parallelMode,
    onRackChange,
    onBlanksChange,
    onBoardChange,
    onParallelModeChange,
    onSearch,
    onClear,
    isLoading,
    isWorkerReady,
    loadError,
}) => {
    const [showGuide, setShowGuide] = useState(false);
    const canSearch = isWorkerReady && !isLoading && (rackLetters.trim().length > 0 || boardSlots.length > 0);

    const handleSubmit = useCallback((e: FormEvent) => {
        e.preventDefault();
        if (canSearch) onSearch();
    }, [canSearch, onSearch]);

    const isDisabled = isLoading || !isWorkerReady;

    return (
        <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>
            {loadError ? (
                <div className="flex items-center gap-2 text-xs text-red-300 mb-4 bg-red-950/40 rounded-lg px-3 py-2 border border-red-700/50">
                    <i className="fa-solid fa-triangle-exclamation text-red-400"></i>
                    <span>No se pudo cargar el diccionario. Recarga la página para intentarlo de nuevo.</span>
                </div>
            ) : !isWorkerReady && (
                <div className="flex items-center gap-2 text-xs text-brand-subtle mb-4 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
                    <i className="fa-solid fa-circle-notch fa-spin text-brand-accent"></i>
                    <span>Cargando diccionario...</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Row 1: Rack + Blanks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="group">
                        <label htmlFor="rack-input" className="block text-sm font-semibold text-brand-subtle mb-2 ml-1 group-focus-within:text-brand-accent transition-colors">
                            <i className="fa-solid fa-cubes-stacked mr-2"></i>
                            Tus fichas del maletín
                        </label>
                        <div className="relative">
                            <input
                                id="rack-input"
                                type="text"
                                value={rackLetters}
                                onChange={e => onRackChange(e.target.value)}
                                placeholder="ej: rstaeil"
                                className="w-full px-5 py-4 bg-slate-900/50 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-accent/50 focus:border-brand-accent transition-all duration-300 text-lg placeholder-slate-600 text-brand-text disabled:opacity-40 uppercase tracking-widest"
                                disabled={isDisabled}
                                aria-label="Tus fichas del maletín"
                            />
                            {rackLetters && !isDisabled && (
                                <button
                                    type="button"
                                    onClick={() => onRackChange('')}
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
                                Fichas en blanco (comodín):
                            </span>
                            <div className="flex gap-1">
                                {[0, 1, 2].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => onBlanksChange(n)}
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

                    {/* Board context column */}
                    <div>
                        <div className="flex items-center justify-between mb-2 ml-1">
                            <span className="text-sm font-semibold text-brand-subtle">
                                <i className="fa-solid fa-table-cells mr-2"></i>
                                Encajar en el tablero
                            </span>
                            {boardSlots.length > 0 && (
                                <span className="text-xs text-brand-accent font-mono bg-brand-accent/10 px-2 py-0.5 rounded">
                                    {boardSlots.map(s => s.letter || '?').join('')}
                                </span>
                            )}
                        </div>
                        <div className="bg-slate-900/40 rounded-xl border border-slate-700 p-3 min-h-[88px] flex items-center">
                            <BoardBuilder
                                slots={boardSlots}
                                onChange={onBoardChange}
                                disabled={isDisabled}
                            />
                        </div>
                        <p className="text-xs text-slate-600 mt-1.5 ml-1">
                            {parallelMode ? (
                                <>Modo paralelo: la letra azul <strong className="text-slate-500">no</strong> se escribe, solo indica que hay una ficha vecina en el tablero — tu palabra sale entera del maletín.</>
                            ) : (
                                <>Letra azul = ya está en el tablero · Casilla ámbar = pones tu ficha · <strong className="text-slate-500">Doble clic en el Tablero</strong> para rellenar automático.</>
                            )}
                        </p>

                        <label className="flex items-center justify-between gap-3 mt-3 ml-1 select-none cursor-pointer">
                            <span className="text-xs font-medium text-brand-subtle flex items-center gap-1.5">
                                <i className="fa-solid fa-arrows-left-right-to-line text-brand-accent/80"></i>
                                ¿Es una jugada en paralelo?
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={parallelMode}
                                disabled={isDisabled}
                                onClick={() => onParallelModeChange(!parallelMode)}
                                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
                                    parallelMode ? 'bg-brand-accent' : 'bg-slate-700'
                                }`}
                            >
                                <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                        parallelMode ? 'translate-x-5' : ''
                                    }`}
                                />
                            </button>
                        </label>
                    </div>
                </div>

                <div>
                    <button
                        type="button"
                        onClick={() => setShowGuide(v => !v)}
                        className="text-xs text-brand-subtle hover:text-brand-accent transition-colors flex items-center gap-1.5"
                    >
                        <i className={`fa-solid fa-chevron-${showGuide ? 'down' : 'right'} text-[10px]`}></i>
                        <i className="fa-solid fa-graduation-cap"></i>
                        Trucos: palabras cortas útiles
                    </button>
                    {showGuide && <ShortWordsGuide />}
                </div>

                {/* Buttons */}
                <div className="flex flex-col sm:flex-row-reverse gap-3">
                    <button
                        type="submit"
                        className="w-full sm:w-2/3 px-8 py-4 bg-gradient-to-r from-brand-accent to-blue-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-slate-900 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center text-lg"
                        disabled={!canSearch}
                    >
                        {isLoading ? (
                            <><i className="fa-solid fa-circle-notch fa-spin mr-3"></i>Procesando...</>
                        ) : loadError ? (
                            <><i className="fa-solid fa-triangle-exclamation mr-2"></i>Diccionario no disponible</>
                        ) : !isWorkerReady ? (
                            <><i className="fa-solid fa-circle-notch fa-spin mr-3"></i>Cargando...</>
                        ) : (
                            <><i className="fa-solid fa-search mr-2"></i>Buscar Palabras</>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        className="w-full sm:w-1/3 px-6 py-4 bg-slate-800 text-brand-subtle font-semibold rounded-xl border border-slate-700 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500 transition-all duration-300 flex items-center justify-center disabled:opacity-40"
                        disabled={isDisabled}
                    >
                        <i className="fa-solid fa-eraser mr-2"></i>Limpiar
                    </button>
                </div>
            </form>
        </div>
    );
};

export default WordInput;
