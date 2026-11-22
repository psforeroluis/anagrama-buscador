import React, { useState } from 'react';
import Overlay from './Overlay';
import type { SyncState } from '../services/sync/syncEngine';

interface SyncPanelProps {
    state: SyncState;
    enabled: boolean;
    chipText: string;
    onEnable: (token: string) => void;
    onDisable: () => void;
    onSyncNow: () => void;
    onClose: () => void;
}

const SyncPanel: React.FC<SyncPanelProps> = ({ state, enabled, chipText, onEnable, onDisable, onSyncNow, onClose }) => {
    const [token, setToken] = useState('');
    const busy = state.status === 'syncing';

    return (
        <Overlay onClose={onClose}>
            <form
                className="bg-ink-700 border border-white/10 rounded-3xl w-full max-w-md p-6 my-auto shadow-[0_30px_80px_-20px_rgba(0,0,0,.95)]"
                onClick={e => e.stopPropagation()}
                onSubmit={e => { e.preventDefault(); if (token.trim()) { onEnable(token); setToken(''); } }}
            >
                <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center shrink-0">
                        <i className="fa-solid fa-arrows-rotate text-accent-soft" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold tracking-tight">Sincronización</h3>
                        <p className="text-sm text-brand-subtle mt-1">
                            Guarda tus partidas en tu propio almacén de Vercel para verlas en el móvil y en el ordenador.
                            Sin token, todo sigue solo en este aparato.
                        </p>
                    </div>
                </div>

                <div className="mt-5 rounded-2xl surface-inset p-4 text-sm" role="status" aria-live="polite">
                    <div className="font-semibold text-brand-text">{chipText}</div>
                    {enabled && state.pending > 0 && state.status !== 'offline' && (
                        <div className="text-brand-subtle mt-1">{state.pending} {state.pending === 1 ? 'partida pendiente' : 'partidas pendientes'} de subir</div>
                    )}
                    {state.status === 'tokenRejected' && (
                        <div className="text-red-300 mt-1">El servidor no aceptó el token. Vuelve a pegarlo.</div>
                    )}
                    {state.error && <div className="text-red-300 mt-1">{state.error}</div>}
                </div>

                {!enabled ? (
                    <>
                        <label className="block mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-brand-subtle" htmlFor="sync-token">
                            Token personal
                        </label>
                        <input
                            id="sync-token"
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="Pega aquí el valor de SYNC_TOKEN"
                            className="w-full mt-2 px-4 py-3 surface-inset rounded-xl text-sm text-white focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15 transition-all"
                        />
                    </>
                ) : (
                    state.status === 'tokenRejected' && (
                        <input
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder="Nuevo token"
                            aria-label="Nuevo token"
                            className="w-full mt-5 px-4 py-3 surface-inset rounded-xl text-sm text-white focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15 transition-all"
                        />
                    )
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-2.5 mt-6">
                    <button type="button" onClick={onClose}
                        className="focus-ring flex-1 px-5 py-3 rounded-2xl tile text-brand-subtle font-semibold hover:text-white transition-colors">
                        Cerrar
                    </button>
                    {enabled && state.status !== 'tokenRejected' ? (
                        <>
                            <button type="button" onClick={onDisable}
                                className="focus-ring flex-1 px-5 py-3 rounded-2xl tile text-red-300 font-semibold hover:bg-red-500/15 transition-colors">
                                Desactivar
                            </button>
                            <button type="button" onClick={onSyncNow} disabled={busy}
                                className="focus-ring flex-1 px-5 py-3 rounded-2xl bg-accent/15 text-accent-soft font-bold hover:bg-accent/25 transition-colors disabled:opacity-50">
                                Sincronizar ahora
                            </button>
                        </>
                    ) : (
                        <button type="submit" disabled={!token.trim() || busy}
                            className="focus-ring flex-1 px-5 py-3 rounded-2xl bg-accent/15 text-accent-soft font-bold hover:bg-accent/25 transition-colors disabled:opacity-50">
                            Activar
                        </button>
                    )}
                </div>
            </form>
        </Overlay>
    );
};

export default SyncPanel;
