import React from 'react';

interface SyncErrorBannerProps {
    message: string;
    actionLabel: string;
    busy?: boolean;
    onAction: () => void;
}

/** Franja persistente para errores de sincronización: no desaparece sola como un aviso. */
const SyncErrorBanner: React.FC<SyncErrorBannerProps> = ({ message, actionLabel, busy, onAction }) => (
    <div
        role="alert"
        className="mb-4 flex items-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
        <i className="fa-solid fa-triangle-exclamation shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words">{message}</span>
        <button
            type="button"
            onClick={onAction}
            disabled={busy}
            className="focus-ring shrink-0 rounded-lg px-3 py-1.5 bg-red-500/20 font-semibold hover:bg-red-500/30 transition-colors disabled:opacity-50"
        >
            {actionLabel}
        </button>
    </div>
);

export default SyncErrorBanner;
