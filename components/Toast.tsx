import React from 'react';

interface ToastProps {
    message: string | null;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
    if (!message) return null;

    return (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 animate-rise" role="status">
            <div className="surface rounded-2xl px-5 py-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,.95)] flex items-center gap-3 text-sm">
                <i className="fa-solid fa-circle-check text-aqua"></i>
                <span className="font-medium text-brand-text">{message}</span>
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
