import React, { useEffect, useRef, useState } from 'react';
import { Game } from '../services/gamesStore';
import { countTiles } from '../services/boardLayout';

interface GameSwitcherProps {
    games: Game[];
    activeId: string;
    onSelect: (id: string) => void;
    onCreate: () => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
}

const relativeTime = (ts: number): string => {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return days === 1 ? 'ayer' : `hace ${days} días`;
};

const GameSwitcher: React.FC<GameSwitcherProps> = ({ games, activeId, onSelect, onCreate, onRename, onDelete }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [confirmingId, setConfirmingId] = useState<string | null>(null);
    const editRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => { if (editingId) editRef.current?.select(); }, [editingId]);

    const startRename = (game: Game) => {
        setDraft(game.name);
        setEditingId(game.id);
    };

    const commitRename = () => {
        if (!editingId) return;
        const name = draft.trim();
        if (name) onRename(editingId, name.slice(0, 40));
        setEditingId(null);
    };

    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {games.map(game => {
                    const isActive = game.id === activeId;
                    const tiles = countTiles(game.board.letters);

                    return (
                        <div
                            key={game.id}
                            onClick={() => { if (!isActive) { onSelect(game.id); setConfirmingId(null); } }}
                            className={`group relative shrink-0 rounded-2xl px-3.5 py-2.5 min-w-[168px] transition-all cursor-pointer ${
                                isActive
                                    ? 'bg-accent/15 shadow-[inset_0_0_0_1.5px_rgba(167,139,250,.5)]'
                                    : 'tile hover:bg-white/[.05]'
                            }`}
                        >
                            {editingId === game.id ? (
                                <input
                                    ref={editRef}
                                    value={draft}
                                    autoFocus
                                    onChange={e => setDraft(e.target.value)}
                                    onBlur={commitRename}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                                        if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    className="w-full bg-transparent text-sm font-semibold text-white outline-none border-b border-accent/50 pb-0.5"
                                    aria-label="Nombre de la partida"
                                />
                            ) : (
                                <div
                                    onDoubleClick={e => { e.stopPropagation(); startRename(game); }}
                                    className={`text-sm font-semibold truncate pr-10 ${isActive ? 'text-accent-soft' : 'text-brand-text'}`}
                                >
                                    {game.name}
                                </div>
                            )}

                            <div className="text-[11px] text-brand-subtle/70 mt-0.5 flex items-center gap-2">
                                <span>{tiles} fichas</span>
                                <span className="opacity-50">·</span>
                                <span>{relativeTime(game.updatedAt)}</span>
                            </div>

                            {editingId !== game.id && (
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); startRename(game); }}
                                        className="focus-ring w-6 h-6 rounded-lg text-brand-subtle/70 hover:text-white hover:bg-white/10 transition-colors text-[11px]"
                                        aria-label={`Renombrar ${game.name}`}
                                    >
                                        <i className="fa-solid fa-pen" />
                                    </button>
                                    {games.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); setConfirmingId(game.id); }}
                                            className="focus-ring w-6 h-6 rounded-lg text-brand-subtle/70 hover:text-red-300 hover:bg-red-500/15 transition-colors text-[11px]"
                                            aria-label={`Eliminar ${game.name}`}
                                        >
                                            <i className="fa-solid fa-trash-can" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {confirmingId === game.id && (
                                <div
                                    className="absolute inset-0 rounded-2xl bg-ink-800/95 flex items-center justify-center gap-2 text-xs z-10"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <span className="text-brand-subtle">¿Eliminar?</span>
                                    <button
                                        type="button"
                                        onClick={() => { onDelete(game.id); setConfirmingId(null); }}
                                        className="focus-ring px-2 py-1 rounded-lg bg-red-500/20 text-red-200 font-semibold hover:bg-red-500/30 transition-colors"
                                    >
                                        Sí
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmingId(null)}
                                        className="focus-ring px-2 py-1 rounded-lg tile text-brand-subtle hover:text-white transition-colors"
                                    >
                                        No
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}

                <button
                    type="button"
                    onClick={onCreate}
                    className="focus-ring shrink-0 rounded-2xl px-4 py-2.5 border border-dashed border-white/15 text-brand-subtle/70 hover:border-accent/60 hover:text-accent-soft transition-all text-sm font-semibold h-full min-h-[62px]"
                >
                    <i className="fa-solid fa-plus mr-2" />Nueva partida
                </button>
            </div>

            <p className="text-[11px] text-brand-subtle/50 mt-1.5 ml-1">
                Cada partida guarda su tablero y su atril. Doble clic en el nombre para renombrarla.
            </p>
        </div>
    );
};

export default GameSwitcher;
