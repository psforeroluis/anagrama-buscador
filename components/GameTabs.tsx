import React, { useState, useRef, useEffect } from 'react';
import { SavedGame } from '../types';

interface GameTabsProps {
    games: SavedGame[];
    currentId: string;
    onSwitch: (id: string) => void;
    onAdd: () => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
}

const GameTabs: React.FC<GameTabsProps> = ({ games, currentId, onSwitch, onAdd, onRename, onDelete }) => {
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameVal, setRenameVal] = useState('');
    const renameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (renamingId) renameRef.current?.focus();
    }, [renamingId]);

    const startRename = (game: SavedGame) => {
        setRenamingId(game.id);
        setRenameVal(game.name);
    };

    const commitRename = (id: string) => {
        if (renameVal.trim()) onRename(id, renameVal.trim());
        setRenamingId(null);
    };

    const handleDelete = (game: SavedGame) => {
        if (games.length === 1) return;
        if (window.confirm(`¿Eliminar "${game.name}"?`)) onDelete(game.id);
    };

    return (
        <div className="mb-5">
            <div className="flex items-center gap-1 text-xs text-brand-subtle mb-2 ml-0.5">
                <i className="fa-solid fa-gamepad text-brand-accent text-xs"></i>
                <span>Mis partidas</span>
                <span className="text-slate-600">— doble clic en la pestaña activa para renombrar</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {games.map(game => {
                    const isActive = game.id === currentId;
                    return (
                        <div
                            key={game.id}
                            className={`group flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all flex-shrink-0 border ${
                                isActive
                                    ? 'bg-brand-accent/10 border-brand-accent/40 text-brand-accent'
                                    : 'bg-slate-800/60 border-slate-700 text-brand-subtle hover:text-white hover:border-slate-500 cursor-pointer'
                            }`}
                        >
                            {renamingId === game.id ? (
                                <input
                                    ref={renameRef}
                                    value={renameVal}
                                    onChange={e => setRenameVal(e.target.value)}
                                    onBlur={() => commitRename(game.id)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') commitRename(game.id);
                                        if (e.key === 'Escape') setRenamingId(null);
                                    }}
                                    className="bg-transparent outline-none w-28 text-sm"
                                    maxLength={24}
                                />
                            ) : (
                                <button
                                    onClick={() => !isActive && onSwitch(game.id)}
                                    onDoubleClick={() => startRename(game)}
                                    className="text-left leading-none"
                                >
                                    <i className="fa-solid fa-dice mr-1.5 opacity-50 text-xs"></i>
                                    {game.name}
                                </button>
                            )}

                            {isActive && renamingId !== game.id && (
                                <button
                                    onClick={() => startRename(game)}
                                    className="opacity-40 hover:opacity-100 transition-opacity ml-0.5"
                                    title="Renombrar partida"
                                >
                                    <i className="fa-solid fa-pencil text-xs"></i>
                                </button>
                            )}

                            {games.length > 1 && (
                                <button
                                    onClick={() => handleDelete(game)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all ml-0.5"
                                    title="Eliminar partida"
                                >
                                    <i className="fa-solid fa-xmark text-xs"></i>
                                </button>
                            )}
                        </div>
                    );
                })}

                <button
                    onClick={onAdd}
                    className="flex-shrink-0 w-9 h-9 rounded-xl border border-dashed border-slate-600 text-slate-500 hover:border-brand-accent hover:text-brand-accent transition-all flex items-center justify-center"
                    title="Nueva partida"
                >
                    <i className="fa-solid fa-plus text-sm"></i>
                </button>
            </div>
        </div>
    );
};

export default GameTabs;
