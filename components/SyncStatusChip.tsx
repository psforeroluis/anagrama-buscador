import React from 'react';
import type { SyncStatus } from '../services/sync/syncEngine';

interface SyncStatusChipProps {
    saveStatus: 'saved' | 'saving' | 'error';
    syncEnabled: boolean;
    syncStatus: SyncStatus;
    syncLabel: string;
    onOpen: () => void;
}

const SAVE_TEXT = {
    saved: 'Guardado en este aparato',
    saving: 'Guardando…',
    error: 'Error al guardar: descarga una copia',
} as const;

/** Estado de guardado local y de sincronización, por separado, junto a la lista de partidas. */
const SyncStatusChip: React.FC<SyncStatusChipProps> = ({ saveStatus, syncEnabled, syncStatus, syncLabel, onOpen }) => {
    const bad = syncStatus === 'error' || syncStatus === 'tokenRejected';
    return (
        <button
            type="button"
            onClick={onOpen}
            role="status"
            className="focus-ring text-left text-brand-subtle/80 hover:text-accent-soft transition-colors"
            title="Abrir la sincronización entre aparatos"
        >
            <span className={saveStatus === 'error' ? 'text-red-300' : ''}>
                <i className={`fa-solid ${saveStatus === 'error' ? 'fa-triangle-exclamation' : 'fa-floppy-disk'} mr-1.5`} />
                {SAVE_TEXT[saveStatus]}
            </span>
            <span aria-hidden="true" className="mx-2 opacity-40">·</span>
            <span className={bad ? 'text-red-300' : ''}>
                <i className={`fa-solid ${bad ? 'fa-triangle-exclamation' : 'fa-arrows-rotate'} mr-1.5 ${syncStatus === 'syncing' && syncEnabled ? 'animate-spin' : ''}`} />
                {syncLabel}
            </span>
        </button>
    );
};

export default SyncStatusChip;
