import React from 'react';

export interface ToastAction {
    label: string;
    icon?: string;
    onClick: () => void;
}

interface ToastProps {
    message: string | null;
    action?: ToastAction | null;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, action, onClose }) => {
    if (!message) return null;

    return (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 animate-rise max-w-[calc(100vw-2rem)]" role="status">
            <div className="surface rounded-2xl px-5 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,.95)] flex items-center gap-3 text-sm">
                <i className="fa-solid fa-circle-check text-aqua"></i>
                <span className="font-medium text-brand-text">{message}</span>
                {action && (
                    <button
                        onClick={action.onClick}
                        className="focus-ring ml-1 shrink-0 rounded-lg px-2.5 py-1 bg-accent/20 text-accent-soft font-semibold hover:bg-accent/30 hover:text-white transition-colors"
                    >
                        {action.icon && <i className={`fa-solid ${action.icon} mr-1.5`} />}
                        {action.label}
                    </button>
                )}
                <button
                    onClick={onClose}
                    className="focus-ring ml-1 text-brand-subtle hover:text-white transition-colors"
                    aria-label="Cerrar"
                >
                    <i className="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>
    );
};

export default Toast;
