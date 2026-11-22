import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Game, sortByUsage } from '../services/gamesStore';
import { countTiles } from '../services/boardLayout';
import Overlay from './Overlay';
import SyncStatusChip from './SyncStatusChip';
import type { SyncStatus } from '../services/sync/syncEngine';
import { TOMBSTONE_DAYS } from '../services/sync/constants';

interface GameSwitcherProps {
    games: Game[];
    activeId: string;
    onSelect: (id: string) => void;
    /** Crea y abre una partida; devuelve la nueva para poder nombrarla. */
    onCreate: () => Game;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onExport: () => void;
    onImport: (file: File) => void;
    syncLabel: string;
    syncEnabled: boolean;
    syncStatus: SyncStatus;
    saveStatus: 'saved' | 'saving' | 'error';
    onOpenSync: () => void;
    /** Partidas borradas que aún se pueden restaurar (la papelera). */
    deletedGames: Game[];
    onRestore: (id: string) => void;
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

/** Sin tildes ni mayúsculas, para que "Martín" se encuentre escribiendo "martin". */
const foldText = (text: string): string =>
    text.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/ñ/g, 'n');

/** Umbral a partir del cual el buscador aporta más de lo que estorba. */
const SEARCH_FROM = 3;

const GameSwitcher: React.FC<GameSwitcherProps> = ({
    games, activeId, onSelect, onCreate, onRename, onDelete, onExport, onImport, syncLabel, syncEnabled, syncStatus, saveStatus,
    onOpenSync, deletedGames, onRestore,
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [confirming, setConfirming] = useState<Game | null>(null);
    const [query, setQuery] = useState('');
    const editRef = useRef<HTMLInputElement | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const [backupOpen, setBackupOpen] = useState(false);
    const [trashOpen, setTrashOpen] = useState(false);

    const [naming, setNaming] = useState<Game | null>(null);
    const [newName, setNewName] = useState('');

    // Las más usadas arriba; las de poco movimiento se hunden hacia el final.
    const ordered = useMemo(() => sortByUsage(games), [games]);
    const showSearch = games.length >= SEARCH_FROM;
    const needle = foldText(query.trim());
    const visible = needle
        ? ordered.filter(g => foldText(g.name).includes(needle))
        : ordered;

    useEffect(() => { if (editingId) editRef.current?.select(); }, [editingId]);

    const startCreate = () => {
        const game = onCreate();
        setNewName(game.name);
        setNaming(game);
    };

    const finishNaming = (keepDefault: boolean) => {
        if (!naming) return;
        const name = newName.trim().slice(0, 40);
        if (!keepDefault && name && name !== naming.name) onRename(naming.id, name);
        setNaming(null);
    };

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
        <div className="mb-5">
            <div className="flex items-center justify-between mb-2.5 ml-0.5 gap-3 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-subtle">
                    <i className="fa-solid fa-layer-group mr-2" />
                    Partidas · {games.length}
                </span>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                    <SyncStatusChip
                        saveStatus={saveStatus}
                        syncEnabled={syncEnabled}
                        syncStatus={syncStatus}
                        syncLabel={syncLabel}
                        onOpen={onOpenSync}
                    />
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setBackupOpen(open => !open)}
                            aria-haspopup="menu"
                            aria-expanded={backupOpen}
                            className="focus-ring text-brand-subtle/80 hover:text-accent-soft transition-colors"
                            title="Copia de seguridad de las partidas (archivo JSON, sin cuenta)"
                        >
                            <i className="fa-solid fa-box-archive mr-1.5" />Copia de seguridad
                        </button>
                        {backupOpen && (
                            <>
                                <button type="button" aria-label="Cerrar menú" className="fixed inset-0 z-10 cursor-default" onClick={() => setBackupOpen(false)} />
                                <div role="menu" className="absolute right-0 top-full mt-1 z-20 surface rounded-xl p-1 min-w-[11rem] shadow-[0_20px_50px_-20px_rgba(0,0,0,.95)]">
                                    <button
                                        type="button" role="menuitem"
                                        onClick={() => { setBackupOpen(false); onExport(); }}
                                        className="focus-ring w-full text-left px-3 py-2 rounded-lg text-brand-text hover:bg-white/[.06]"
                                    >
                                        <i className="fa-solid fa-download mr-2" />Exportar copia
                                    </button>
                                    <button
                                        type="button" role="menuitem"
                                        onClick={() => { setBackupOpen(false); fileRef.current?.click(); }}
                                        className="focus-ring w-full text-left px-3 py-2 rounded-lg text-brand-text hover:bg-white/[.06]"
                                    >
                                        <i className="fa-solid fa-upload mr-2" />Restaurar copia
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (file) onImport(file);
                        }}
                    />
                </div>
            </div>

            {showSearch && (
                <div className="relative mb-2">
                    <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-subtle/50 text-xs" />
                    <input
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Buscar partida…"
                        className="w-full pl-9 pr-9 py-2 surface-inset rounded-xl text-sm text-white placeholder-brand-subtle/40 focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15 transition-all"
                        aria-label="Buscar partida por nombre"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="focus-ring absolute right-3 top-1/2 -translate-y-1/2 text-brand-subtle/60 hover:text-white transition-colors text-xs"
                            aria-label="Borrar búsqueda"
                        >
                            <i className="fa-solid fa-circle-xmark" />
                        </button>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                {visible.length === 0 && (
                    <p className="text-xs text-brand-subtle/60 px-3.5 py-3">
                        Ninguna partida se llama así.
                    </p>
                )}
                {visible.map(game => {
                    const isActive = game.id === activeId;
                    const tiles = countTiles(game.board.letters);

                    return (
                        <div
                            key={game.id}
                            onClick={() => { if (!isActive) onSelect(game.id); }}
                            className={`group relative rounded-xl px-3.5 py-2.5 flex items-center gap-3 transition-all cursor-pointer ${
                                isActive
                                    ? 'bg-accent/15 shadow-[inset_0_0_0_1.5px_rgba(167,139,250,.5)]'
                                    : 'tile hover:bg-white/[.05]'
                            }`}
                        >
                            <i className={`fa-solid fa-table-cells text-xs shrink-0 ${isActive ? 'text-accent-soft' : 'text-brand-subtle/40'}`} />

                            <div className="min-w-0 flex-1">
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
                                        className={`text-sm font-semibold truncate ${isActive ? 'text-accent-soft' : 'text-brand-text'}`}
                                    >
                                        {game.name}
                                    </div>
                                )}
                            </div>

                            <span className="text-[11px] text-brand-subtle/70 shrink-0 hidden sm:block">
                                {tiles} fichas
                            </span>
                            <span className="text-[11px] text-brand-subtle/50 shrink-0 w-[76px] text-right hidden sm:block">
                                {relativeTime(game.updatedAt)}
                            </span>

                            {editingId !== game.id && (
                                <div className="flex gap-1 shrink-0 opacity-60 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); startRename(game); }}
                                        className="focus-ring w-7 h-7 rounded-lg text-brand-subtle/70 hover:text-white hover:bg-white/10 transition-colors text-[11px]"
                                        aria-label={`Renombrar ${game.name}`}
                                    >
                                        <i className="fa-solid fa-pen" />
                                    </button>
                                    {games.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); setConfirming(game); }}
                                            className="focus-ring w-7 h-7 rounded-lg text-brand-subtle/70 hover:text-red-300 hover:bg-red-500/15 transition-colors text-[11px]"
                                            aria-label={`Eliminar ${game.name}`}
                                        >
                                            <i className="fa-solid fa-trash-can" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                onClick={startCreate}
                className="focus-ring w-full mt-1.5 rounded-xl px-3.5 py-2.5 border border-dashed border-white/15 text-brand-subtle/70 hover:border-accent/60 hover:text-accent-soft transition-all text-sm font-semibold text-left"
            >
                <i className="fa-solid fa-plus mr-2.5" />Nueva partida
            </button>

            <p className="text-[11px] text-brand-subtle/50 mt-2 ml-1">
                Cada partida guarda su tablero y su atril. Las más usadas suben; las de poco movimiento pasan al final. Doble clic en el nombre para renombrarla.
            </p>

            {/* Nombre de la partida recién creada: ya existe con un nombre por
                defecto, así que cerrar el diálogo nunca la pierde. */}
            {naming && (
                <Overlay onClose={() => finishNaming(true)}>
                    <form
                        className="bg-ink-700 border border-white/10 rounded-3xl w-full max-w-sm p-6 my-auto shadow-[0_30px_80px_-20px_rgba(0,0,0,.95)]"
                        onClick={e => e.stopPropagation()}
                        onSubmit={e => { e.preventDefault(); finishNaming(false); }}
                    >
                        <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
                                <i className="fa-solid fa-pen text-accent-soft" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold tracking-tight">Nueva partida</h3>
                                <p className="text-sm text-brand-subtle mt-1">Ponle un nombre para reconocerla.</p>
                            </div>
                        </div>

                        <input
                            value={newName}
                            autoFocus
                            maxLength={40}
                            onFocus={e => e.currentTarget.select()}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); finishNaming(true); } }}
                            className="w-full mt-5 px-4 py-3 surface-inset rounded-xl text-sm text-white focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15 transition-all"
                            aria-label="Nombre de la nueva partida"
                        />

                        <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-6">
                            <button
                                type="button"
                                onClick={() => finishNaming(true)}
                                className="focus-ring flex-1 px-5 py-3 rounded-2xl tile text-brand-subtle font-semibold hover:text-white transition-colors"
                            >
                                Dejar «{naming.name}»
                            </button>
                            <button
                                type="submit"
                                className="focus-ring flex-1 px-5 py-3 rounded-2xl bg-accent/15 text-accent-soft font-bold hover:bg-accent/25 transition-colors"
                            >
                                Guardar nombre
                            </button>
                        </div>
                    </form>
                </Overlay>
            )}

            {deletedGames.length > 0 && (
                <div className="mt-3">
                    <button
                        type="button"
                        onClick={() => setTrashOpen(open => !open)}
                        aria-expanded={trashOpen}
                        className="focus-ring text-xs text-brand-subtle/80 hover:text-accent-soft transition-colors"
                    >
                        <i className={`fa-solid ${trashOpen ? 'fa-chevron-down' : 'fa-chevron-right'} mr-1.5`} />
                        Eliminadas recientemente · {deletedGames.length}
                    </button>
                    {trashOpen && (
                        <ul className="mt-2 space-y-1.5">
                            {deletedGames.map(game => {
                                const left = Math.max(0, Math.ceil(TOMBSTONE_DAYS - (Date.now() - (game.deletedAt ?? Date.now())) / 86_400_000));
                                return (
                                    <li key={game.id} className="flex items-center gap-3 rounded-xl tile px-3.5 py-2.5 text-sm">
                                        <span className="min-w-0 flex-1 truncate text-brand-text">{game.name}</span>
                                        <span className="text-xs text-brand-subtle shrink-0">
                                            {left === 1 ? 'queda 1 día' : `quedan ${left} días`}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onRestore(game.id)}
                                            className="focus-ring shrink-0 rounded-lg px-2.5 py-1 bg-accent/20 text-accent-soft font-semibold hover:bg-accent/30 hover:text-white transition-colors"
                                        >
                                            Restaurar
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {/* Confirmación de borrado: en su propio diálogo y no donde acabas
                de tocar la papelera, para que un toque de más no borre nada. */}
            {confirming && (
                <Overlay onClose={() => setConfirming(null)}>
                    <div
                        className="bg-ink-700 border border-white/10 rounded-3xl w-full max-w-sm p-6 my-auto shadow-[0_30px_80px_-20px_rgba(0,0,0,.95)]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-2xl bg-red-500/15 flex items-center justify-center shrink-0">
                                <i className="fa-solid fa-trash-can text-red-300" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="font-bold tracking-tight">¿Eliminar esta partida?</h3>
                                <p className="text-sm text-brand-subtle mt-1 break-words">
                                    <strong className="text-brand-text">{confirming.name}</strong>
                                    {' · '}
                                    {countTiles(confirming.board.letters)} fichas en el tablero
                                </p>
                                {syncEnabled && (
                                    <p className="text-sm text-amber-200/90 mt-2">
                                        La sincronización está activa: también se eliminará en tus demás aparatos.
                                        Podrás restaurarla desde «Eliminadas recientemente» durante {TOMBSTONE_DAYS} días.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-6">
                            <button
                                type="button"
                                onClick={() => setConfirming(null)}
                                className="focus-ring flex-1 px-5 py-3 rounded-2xl bg-accent/15 text-accent-soft font-bold hover:bg-accent/25 transition-colors"
                                autoFocus
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => { onDelete(confirming.id); setConfirming(null); }}
                                className="focus-ring flex-1 px-5 py-3 rounded-2xl tile text-red-300 font-semibold hover:bg-red-500/15 hover:text-red-200 transition-colors"
                            >
                                <i className="fa-solid fa-trash-can mr-2" />Eliminar
                            </button>
                        </div>
                    </div>
                </Overlay>
            )}
        </div>
    );
};

export default GameSwitcher;
