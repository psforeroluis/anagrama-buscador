import React from 'react';

const Header: React.FC = () => (
    <header className="pt-10 pb-8 sm:pt-14 sm:pb-10 animate-fade-in">
        <div className="flex flex-col items-center text-center gap-5">
            <span className="inline-flex items-center gap-2 surface-inset rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-subtle">
                <span className="w-1.5 h-1.5 rounded-full bg-aqua shadow-[0_0_10px_2px_rgba(34,211,238,.6)]"></span>
                Diccionario español offline
            </span>

            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-[-0.04em] leading-none">
                <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-accent-soft">
                    Anagrama
                </span>
            </h1>

            <p className="text-brand-subtle text-base sm:text-lg max-w-xl leading-relaxed">
                Encuentra la jugada con más letras y más puntos a partir de tus fichas
                y del hueco que tienes en el tablero.
            </p>
        </div>
    </header>
);

export default Header;
