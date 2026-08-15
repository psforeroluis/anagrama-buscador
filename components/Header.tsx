import React from 'react';

const Header: React.FC = () => (
    <header className="pt-7 pb-7 sm:pt-10 sm:pb-9 animate-fade-in">
        <div className="flex flex-col items-center text-center gap-4">
            <span className="inline-flex items-center gap-2 surface-inset rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-aqua shadow-[0_0_10px_2px_rgba(34,211,238,.6)]"></span>
                Diccionario español · sin conexión
            </span>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-0.05em] leading-none">
                <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-accent-soft">
                    Anagrama
                </span>
            </h1>

            <p className="text-brand-subtle text-sm sm:text-base max-w-xl leading-relaxed">
                Convierte tus fichas y el hueco del tablero en la mejor palabra posible.
            </p>
        </div>
    </header>
);

export default Header;
