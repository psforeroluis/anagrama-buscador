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

type SortOption = 'score' | 'length' | 'alpha';

const Results: React.FC<ResultsProps> = ({
    isLoading,
    words,
    hasSearched,
    lettersQuery,
    patternQuery,
    searchMode,
    onShowToast
}) => {
    const [sortBy, setSortBy] = useState<SortOption>('score');
    const [filterLength, setFilterLength] = useState<number | null>(null);

    const sortedWords = useMemo(() => {
        const items = [...words];
        switch (sortBy) {
            case 'length':
                return items.sort((a, b) => b.word.length - a.word.length || b.score - a.score);
            case 'alpha':
                return items.sort((a, b) => a.word.localeCompare(b.word, 'es'));
            case 'score':
            default:
                return items.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, 'es'));
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
        () => Array.from(byLength.keys()).sort((a: number, b: number) => a - b),
        [byLength]
    );

    const filteredWords = useMemo(() => {
        if (filterLength === null) return sortedWords;
        return sortedWords.filter(({ word }) => word.length === filterLength);
    }, [sortedWords, filterLength]);

    const handleCopy = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(word).then(() => {
            onShowToast(`"${word}" copiado al portapapeles`);
        });
    };

    const handleDefine = (e: React.MouseEvent, word: string) => {
        e.stopPropagation();
        window.open(`https://dle.rae.es/${word}`, '_blank', 'noopener,noreferrer');
    };

    const handleCopyAll = () => {
        const text = filteredWords.map(w => w.word).join(', ');
        navigator.clipboard.writeText(text).then(() => {
            onShowToast(`${filteredWords.length} palabras copiadas`);
        });
    };

    if (isLoading) {
        return (
            <div className="mt-12 flex flex-col items-center justify-center text-brand-subtle animate-fade-in">
                <div className="bg-slate-800/50 p-8 rounded-full mb-6 relative">
                    <div className="absolute inset-0 bg-brand-accent/10 rounded-full animate-pulse"></div>
                    <Spinner />
                </div>
                <p className="text-xl font-medium text-brand-text">Analizando diccionario...</p>
                <p className="text-sm mt-2">Buscando las mejores combinaciones</p>
            </div>
        );
    }

    if (!hasSearched) {
        return (
            <div className="mt-8 text-center text-brand-subtle py-16 px-4 border-2 border-dashed border-slate-700 rounded-2xl animate-fade-in bg-slate-900/20" style={{ animationDelay: '200ms' }}>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
                    <i className="fa-solid fa-lightbulb text-yellow-500 text-2xl"></i>
                </div>
                <h3 className="text-xl font-bold text-brand-text mb-2">¿Listo para jugar?</h3>
                <p className="max-w-md mx-auto">
                    Introduce tus fichas para encontrar palabras válidas, o usa el patrón para encajar en el tablero.
                </p>
            </div>
        );
    }

    if (words.length === 0) {
        return (
            <div className="mt-8 text-center text-brand-subtle py-16 px-4 bg-slate-800/50 rounded-2xl animate-fade-in border border-slate-700" style={{ animationDelay: '200ms' }}>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700 mb-4">
                    <i className="fa-solid fa-wind text-brand-subtle text-2xl"></i>
                </div>
                <h3 className="text-xl font-bold text-brand-text mb-2">Sin resultados</h3>
                <p className="max-w-md mx-auto">
                    No encontramos palabras válidas. Prueba con más fichas, un comodín, o menos restricciones de patrón.
                </p>
            </div>
        );
    }

    const showing = filteredWords.length;
    const total = words.length;

    return (
        <div className="mt-10 animate-fade-in" style={{ animationDelay: '200ms' }}>
            {/* Header row */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-brand-text flex items-center gap-2">
                        Resultados <i className="fa-solid fa-check text-green-500 text-sm"></i>
                    </h2>
                    <p className="text-sm text-brand-subtle mt-0.5">
                        <span className="text-brand-accent font-bold">{showing}</span>
                        {showing !== total && <span className="text-slate-500"> de {total}</span>}
                        <>
                            <span> palabras</span>
                            {lettersQuery && <span> con <span className="text-white font-mono bg-slate-700 px-1 rounded text-xs mx-1">{lettersQuery}</span></span>}
                            {patternQuery && <span> patrón <span className="text-white font-mono bg-slate-700 px-1 rounded text-xs mx-1">{patternQuery}</span></span>}
                        </>
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <button
                        onClick={handleCopyAll}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium text-brand-subtle border border-slate-700 bg-slate-900/80 hover:text-white hover:border-slate-500 transition-all"
                        title="Copiar todas las palabras visibles"
                    >
                        <i className="fa-regular fa-copy mr-1.5"></i>
                        Copiar todo
                    </button>

                    <div className="bg-slate-900/80 p-1 rounded-lg flex text-sm font-medium border border-slate-700">
                        {(['score', 'length', 'alpha'] as SortOption[]).map((opt, i) => {
                            const labels = ['Puntos', 'Largo', 'A-Z'];
                            return (
                                <button
                                    key={opt}
                                    onClick={() => setSortBy(opt)}
                                    className={`px-3 py-1.5 rounded-md transition-all ${sortBy === opt ? 'bg-slate-700 text-brand-accent shadow' : 'text-brand-subtle hover:text-white'}`}
                                >
                                    {labels[i]}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Length filter — exact lengths for Scrabble workflow */}
            {availableLengths.length > 1 && (
                <div className="flex items-center gap-2 mb-5 flex-wrap">
                    <span className="text-xs text-brand-subtle font-medium whitespace-nowrap">Filtrar por letras:</span>
                    <button
                        onClick={() => setFilterLength(null)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${filterLength === null ? 'bg-brand-accent text-brand-primary' : 'bg-slate-800 text-brand-subtle border border-slate-700 hover:text-white'}`}
                    >
                        Todas ({total})
                    </button>
                    {availableLengths.map(len => (
                        <button
                            key={len}
                            onClick={() => setFilterLength(filterLength === len ? null : len)}
                            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                                filterLength === len
                                    ? 'bg-brand-accent text-brand-primary'
                                    : 'bg-slate-800 text-brand-subtle border border-slate-700 hover:text-white'
                            }`}
                        >
                            {len} <span className="opacity-60">({byLength.get(len)})</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Grid */}
            {filteredWords.length === 0 ? (
                <div className="text-center text-brand-subtle py-10">
                    <p>No hay palabras de {filterLength} letras. <button onClick={() => setFilterLength(null)} className="text-brand-accent underline">Ver todas</button></p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredWords.map(({ word, score }) => (
                        <div
                            key={word}
                            onClick={(e) => handleCopy(e, word)}
                            className="group relative bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-brand-accent/50 rounded-xl p-3 transition-all duration-200 cursor-pointer hover:-translate-y-1 hover:shadow-lg flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-bold text-slate-500 group-hover:text-brand-accent transition-colors">
                                    {word.length} letras
                                </span>
                                <span className="text-xs font-mono font-bold bg-slate-900 text-brand-accent rounded px-1.5 py-0.5">
                                    {score} pts
                                </span>
                            </div>
                            <div className="text-center my-2">
                                <p className="text-lg font-medium text-brand-text group-hover:text-white break-all capitalize">
                                    {word}
                                </p>
                            </div>

                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 backdrop-blur-[1px] rounded-xl gap-2">
                                <button
                                    onClick={(e) => handleCopy(e, word)}
                                    className="w-8 h-8 rounded-full bg-brand-accent text-brand-primary flex items-center justify-center hover:scale-110 transition-transform"
                                    title="Copiar"
                                >
                                    <i className="fa-regular fa-copy"></i>
                                </button>
                                <button
                                    onClick={(e) => handleDefine(e, word)}
                                    className="w-8 h-8 rounded-full bg-slate-600 text-white flex items-center justify-center hover:bg-slate-500 hover:scale-110 transition-transform"
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
