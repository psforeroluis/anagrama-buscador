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
        <div>
            {loadError ? (
                <div className="flex items-center gap-2.5 text-xs text-red-200 mb-5 bg-red-500/10 rounded-xl px-3.5 py-2.5 border border-red-400/25">
                    <i className="fa-solid fa-triangle-exclamation text-red-300"></i>
                    <span>No se pudo cargar el diccionario. Recarga la página para intentarlo de nuevo.</span>
                </div>
            ) : !isWorkerReady && (
                <div className="flex items-center gap-2.5 text-xs text-brand-subtle mb-5 surface-inset rounded-xl px-3.5 py-2.5">
                    <i className="fa-solid fa-circle-notch fa-spin text-accent-soft"></i>
                    <span>Cargando diccionario…</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                {/* Row 1: Rack + Board */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="group">
                        <label htmlFor="rack-input" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-subtle mb-2.5 ml-0.5 group-focus-within:text-accent-soft transition-colors">
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
                                className="w-full px-5 py-4 surface-inset rounded-2xl focus:outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/15 transition-all duration-200 text-lg font-mono placeholder:font-sans placeholder-brand-subtle/40 text-brand-text disabled:opacity-40 uppercase tracking-[0.2em]"
                                disabled={isDisabled}
                                aria-label="Tus fichas del maletín"
                            />
                            {rackLetters && !isDisabled && (
                                <button
                                    type="button"
                                    onClick={() => onRackChange('')}
                                    className="focus-ring absolute right-4 top-1/2 -translate-y-1/2 text-brand-subtle/60 hover:text-white transition-colors"
                                    aria-label="Borrar fichas"
                                >
                                    <i className="fa-solid fa-circle-xmark"></i>
                                </button>
                            )}
                        </div>

                        {/* Blank tile selector */}
                        <div className="mt-3 flex items-center gap-3 ml-0.5 flex-wrap">
                            <span className="text-xs text-brand-subtle font-medium">
                                <i className="fa-regular fa-square mr-1.5 text-amber-300/70"></i>
                                Fichas en blanco (comodín)
                            </span>
                            <div className="flex gap-1.5">
                                {[0, 1, 2].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => onBlanksChange(n)}
                                        disabled={isDisabled}
                                        className={`focus-ring w-9 h-9 rounded-xl text-sm font-bold transition-all ${
                                            blanks === n
                                                ? 'bg-amber-400/15 text-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,.5)]'
                                                : 'tile text-brand-subtle hover:text-white'
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
                        <div className="flex items-center justify-between mb-2.5 ml-0.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-subtle">
                                <i className="fa-solid fa-table-cells mr-2"></i>
                                Encajar en el tablero
                            </span>
                            {boardSlots.length > 0 && (
                                <span className="text-xs text-accent-soft font-mono bg-accent/10 px-2 py-0.5 rounded-md uppercase">
                                    {boardSlots.map(s => s.letter || '?').join('')}
                                </span>
                            )}
                        </div>
                        <div className="surface-inset rounded-2xl p-3.5 min-h-[92px] flex items-center">
                            <BoardBuilder
                                slots={boardSlots}
                                onChange={onBoardChange}
                                disabled={isDisabled}
                            />
                        </div>
                        <p className="text-xs text-brand-subtle/60 mt-2 ml-0.5 leading-relaxed">
                            {parallelMode ? (
                                <>Modo paralelo: la letra violeta <strong className="text-brand-subtle">no</strong> se escribe, solo indica que hay una ficha vecina en el tablero — tu palabra sale entera del maletín.</>
                            ) : (
                                <>Letra violeta = ya está en el tablero · Casilla ámbar = pones tu ficha.</>
                            )}
                        </p>

                        <label className="flex items-center justify-between gap-3 mt-3.5 ml-0.5 select-none cursor-pointer">
                            <span className="text-xs font-medium text-brand-subtle flex items-center gap-1.5">
                                <i className="fa-solid fa-arrows-left-right-to-line text-accent-soft"></i>
                                ¿Es una jugada en paralelo?
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={parallelMode}
                                disabled={isDisabled}
                                onClick={() => onParallelModeChange(!parallelMode)}
                                className={`focus-ring relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-40 ${
                                    parallelMode ? 'bg-accent' : 'bg-ink-500'
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
                        className="focus-ring text-xs text-brand-subtle hover:text-accent-soft transition-colors flex items-center gap-2"
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
                        className="focus-ring w-full sm:w-2/3 px-8 py-4 rounded-2xl bg-gradient-to-r from-accent-deep via-accent to-aqua text-white font-bold tracking-tight hover:shadow-[0_18px_44px_-18px_rgba(124,58,237,.95)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center text-base"
                        disabled={!canSearch}
                    >
                        {isLoading ? (
                            <><i className="fa-solid fa-circle-notch fa-spin mr-3"></i>Procesando…</>
                        ) : loadError ? (
                            <><i className="fa-solid fa-triangle-exclamation mr-2"></i>Diccionario no disponible</>
                        ) : !isWorkerReady ? (
                            <><i className="fa-solid fa-circle-notch fa-spin mr-3"></i>Cargando…</>
                        ) : (
                            <><i className="fa-solid fa-magnifying-glass mr-2.5"></i>Buscar palabras</>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={onClear}
                        className="focus-ring w-full sm:w-1/3 px-6 py-4 tile rounded-2xl text-brand-subtle font-semibold hover:text-white hover:border-white/20 transition-all duration-200 flex items-center justify-center disabled:opacity-40"
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
