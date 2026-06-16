import React from 'react';

interface ToastProps {
    message: string | null;
    onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
    if (!message) return null;

    return (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
            <div className="bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl border border-slate-700 flex items-center gap-3">
                <i className="fa-solid fa-check-circle text-brand-accent"></i>
                <span className="font-medium">{message}</span>
                <button 
                    onClick={onClose}
                    className="ml-2 text-slate-400 hover:text-white transition-colors"
                >
                    <i className="fa-solid fa-times"></i>
                </button>
            </div>
        </div>
    );
};

export default Toast;