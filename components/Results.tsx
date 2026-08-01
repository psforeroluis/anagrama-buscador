import React, { useState, useMemo } from 'react';
import Spinner from './Spinner';
import { SearchMode, FoundWord } from '../types';

interface ResultsProps {
    isLoading: boolean;
    words: FoundWord[];
    hasSearched: boolean;
    lettersQuery: string;
    patternQuery: string;
    searchMode: SearchMode;
    onShowToast: (msg: string) => void;
}

type SortOption = 'length' | 'score' | 'alpha';

const SORT_LABELS: Record<SortOption, string> = {
    length: 'Largo',
    score: 'Puntos',
    alpha: 'A-Z',
};

const Results: React.FC<ResultsProps> = ({
    isLoading,
    words,
    hasSearched,
    lettersQuery,
    patternQuery,
    searchMode,
    onShowToast
}) => {
    // Default: longest words first, and within the same length the highest score first.
    const [sortBy, setSortBy] = useState<SortOption>('length');
    const [filterLength, setFilterLength] = useState<number | null>(null);

    const sortedWords = useMemo(() => {
        const items = [...words];
        switch (sortBy) {
            case 'score':
                return items.sort((a, b) => b.score - a.score || b.word.length - a.word.length || a.word.localeCompare(b.word, 'es'));
            case 'alpha':
                return items.sort((a, b) => a.word.localeCompare(b.word, 'es'));
            case 'length':
            default:
                return items.sort((a, b) => b.word.length - a.word.length || b.score - a.score || a.word.localeCompare(b.word, 'es'));
        }
    }, [words, sortBy]);

    // Group words by length for the filter bar
    const byLength = useMemo(() => {
        const map = new Map<number, number>();
        for (const { word } of words) {
            map.set(word.length, (map.get(word.length) ?? 0) + 1);
        }
        return map;
    }, [words]);

    const availableLengths = useMemo(
        () => Array.from(byLength.keys()).sort((a: number, b: number) => b - a),
        [byLength]
    );

    const filteredWords = useMemo(() => {
        if (filterLength === null) return sortedWords;
        return sortedWords.filter(({ word }) => word.length === filterLength);
    }, [sortedWords, filterLength]);

    const handleCopy = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(word).then(
            () => onShowToast(`"${word}" copiado al portapapeles`),
            () => onShowToast('No se pudo copiar al portapapeles')
        );
    };

    const handleDefine = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        window.open(`https://dle.rae.es/${word}`, '_blank', 'noopener,noreferrer');
    };

    const handleCopyAll = () => {
        const text = filteredWords.map(w => w.word).join(', ');
        navigator.clipboard.writeText(text).then(
            () => onShowToast(`${filteredWords.length} palabras copiadas`),
            () => onShowToast('No se pudo copiar al portapapeles')
        );
    };

    if (isLoading) {
        return (
            <div className="mt-14 flex flex-col items-center justify-center text-brand-subtle animate-fade-in">
                <div className="relative mb-7 p-7 rounded-full surface">
                    <div className="absolute inset-0 rounded-full bg-accent/10 animate-pulse"></div>
                    <Spinner />
                </div>
                <p className="text-lg font-semibold text-brand-text tracking-tight">Analizando diccionario…</p>
                <p className="text-sm mt-1.5">Buscando las mejores combinaciones</p>
            </div>
        );
    }

    if (!hasSearched) {
        return (
            <div className="mt-8 text-center text-brand-subtle py-16 px-6 rounded-4xl border border-dashed border-white/10 bg-white/[.015] animate-fade-in">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl surface-inset mb-5">
                    <i className="fa-regular fa-lightbulb text-accent-soft text-xl"></i>
                </div>
                <h3 className="text-xl font-bold text-brand-text tracking-tight mb-2">¿Listo para jugar?</h3>
                <p className="max-w-md mx-auto text-sm leading-relaxed">
                    Introduce tus fichas para encontrar palabras válidas, o usa el patrón para encajar en el tablero.
                </p>
            </div>
        );
    }

    if (words.length === 0) {
        return (
            <div className="mt-8 text-center text-brand-subtle py-16 px-6 rounded-4xl surface animate-fade-in">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl surface-inset mb-5">
                    <i className="fa-solid fa-wind text-brand-subtle text-xl"></i>
                </div>
                <h3 className="text-xl font-bold text-brand-text tracking-tight mb-2">Sin resultados</h3>
                <p className="max-w-md mx-auto text-sm leading-relaxed">
                    No encontramos palabras válidas. Prueba con más fichas, un comodín, o menos restricciones de patrón.
                </p>
            </div>
        );
    }

    const showing = filteredWords.length;
    const total = words.length;
    const best = filteredWords[0];

    return (
        <div className="mt-12 animate-fade-in">
            {/* Header row */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-5 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-brand-text tracking-tight">Resultados</h2>
                    <p className="text-sm text-brand-subtle mt-1">
                        <span className="text-accent-soft font-semibold">{showing}</span>
                        {showing !== total && <span className="text-brand-subtle/60"> de {total}</span>}
                        <span> palabras</span>
                        {lettersQuery && (
                            <span> con <span className="font-mono text-xs text-white surface-inset rounded-md px-1.5 py-0.5 mx-1 uppercase">{lettersQuery}</span></span>
                        )}
                        {patternQuery && (
                            <span>
                                {' '}{searchMode === 'parallel' ? 'en paralelo a' : 'patrón'}{' '}
                                <span className="font-mono text-xs text-white surface-inset rounded-md px-1.5 py-0.5 mx-1 uppercase">{patternQuery}</span>
                            </span>
                        )}
                        {searchMode === 'parallel' && (
                            <span className="ml-1 text-aqua">
                                <i className="fa-solid fa-arrows-left-right-to-line mr-1"></i>modo paralelo
                            </span>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                        onClick={handleCopyAll}
                        className="focus-ring px-3.5 py-2 rounded-xl text-sm font-medium text-brand-subtle tile hover:text-white hover:border-white/20 transition-all"
                        title="Copiar todas las palabras visibles"
                    >
                        <i className="fa-regular fa-copy mr-1.5"></i>
                        Copiar todo
                    </button>

                    <div className="tile p-1 rounded-xl flex text-sm font-medium">
                        {(Object.keys(SORT_LABELS) as SortOption[]).map(opt => (
                            <button
                                key={opt}
                                onClick={() => setSortBy(opt)}
                                className={`focus-ring px-3.5 py-1.5 rounded-lg transition-all ${
                                    sortBy === opt
                                        ? 'bg-accent/20 text-accent-soft shadow-[inset_0_0_0_1px_rgba(167,139,250,.35)]'
                                        : 'text-brand-subtle hover:text-white'
                                }`}
                            >
                                {SORT_LABELS[opt]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Best play highlight */}
            {best && (
                <div className="surface edge-light rounded-3xl p-4 sm:p-5 mb-5 flex items-center gap-4 sm:gap-5 animate-pop">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent-deep to-aqua flex items-center justify-center shrink-0 shadow-[0_10px_30px_-10px_rgba(124,58,237,.9)]">
                        <i className="fa-solid fa-trophy text-white"></i>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-brand-subtle font-semibold">Mejor jugada</p>
                        <p className="text-2xl sm:text-3xl font-extrabold tracking-tight capitalize break-all">{best.word}</p>
                    </div>
                    <div className="ml-auto text-right shrink-0">
                        <p className="text-2xl font-extrabold text-accent-soft font-mono leading-none">{best.score}</p>
                        <p className="text-[11px] text-brand-subtle mt-1">{best.word.length} letras · pts</p>
                    </div>
                </div>
            )}

            {/* Length filter — exact lengths for Scrabble workflow */}
            {availableLengths.length > 1 && (
                <div className="flex items-center gap-2 mb-6 flex-wrap">
                    <span className="text-xs text-brand-subtle/80 font-medium whitespace-nowrap">Filtrar por letras:</span>
                    <button
                        onClick={() => setFilterLength(null)}
                        className={`focus-ring px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            filterLength === null
                                ? 'bg-accent text-ink-900'
                                : 'surface text-brand-subtle hover:text-white'
                        }`}
                    >
                        Todas ({total})
                    </button>
                    {availableLengths.map(len => (
                        <button
                            key={len}
                            onClick={() => setFilterLength(filterLength === len ? null : len)}
                            className={`focus-ring px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                filterLength === len
                                    ? 'bg-accent text-ink-900'
                                    : 'surface text-brand-subtle hover:text-white'
                            }`}
                        >
                            {len} <span className="opacity-60">({byLength.get(len)})</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Grid */}
            {filteredWords.length === 0 ? (
                <div className="text-center text-brand-subtle py-10 text-sm">
                    <p>No hay palabras de {filterLength} letras. <button onClick={() => setFilterLength(null)} className="text-accent-soft underline underline-offset-2">Ver todas</button></p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredWords.map(({ word, score, leave, leaveQuality }) => (
                        <div
                            key={word}
                            onClick={(e) => handleCopy(e, word)}
                            className="group relative tile rounded-2xl p-3.5 transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_18px_40px_-24px_rgba(124,58,237,.9)] flex flex-col"
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[11px] font-semibold text-brand-subtle/70 group-hover:text-accent-soft transition-colors">
                                    {word.length} letras
                                </span>
                                <span className="text-[11px] font-mono font-bold text-accent-soft surface-inset rounded-md px-1.5 py-0.5">
                                    {score}
                                </span>
                            </div>
                            <div className="text-center my-2.5">
                                <p className="text-lg font-semibold tracking-tight text-brand-text group-hover:text-white break-all capitalize">
                                    {word}
                                </p>
                            </div>
                            {leave && (
                                <div
                                    className={`text-[10px] font-mono text-center rounded-lg px-1 py-1 mt-auto ${
                                        leaveQuality === 'good'
                                            ? 'text-emerald-300 bg-emerald-400/10'
                                            : leaveQuality === 'warn'
                                                ? 'text-amber-300 bg-amber-400/10'
                                                : 'text-brand-subtle bg-white/5'
                                    }`}
                                    title="Letras que te quedan en el maletín si juegas esta palabra"
                                >
                                    sobra: {leave.toUpperCase()}
                                </div>
                            )}

                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-ink-900/80 backdrop-blur-[2px] rounded-2xl gap-2">
                                <button
                                    onClick={(e) => handleCopy(e, word)}
                                    className="focus-ring w-9 h-9 rounded-full bg-accent text-ink-900 flex items-center justify-center hover:scale-110 transition-transform"
                                    title="Copiar"
                                >
                                    <i className="fa-regular fa-copy"></i>
                                </button>
                                <button
                                    onClick={(e) => handleDefine(e, word)}
                                    className="focus-ring w-9 h-9 rounded-full surface-inset text-white flex items-center justify-center hover:scale-110 transition-transform"
                                    title="Definición RAE"
                                >
                                    <i className="fa-solid fa-book"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Results;
