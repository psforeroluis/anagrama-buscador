import React from 'react';

const Header: React.FC = () => {
    return (
        <header className="text-center animate-fade-in py-4">
            <div className="inline-block mb-2">
                <span className="bg-brand-accent/10 text-brand-accent px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-brand-accent/20">
                    Versión 2.0
                </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-brand-text via-brand-accent to-brand-text tracking-tight drop-shadow-sm">
                <i className="fa-solid fa-wand-magic-sparkles mr-3 text-brand-accent"></i>
                Anagrama
            </h1>
            <p className="mt-4 text-lg text-brand-subtle max-w-2xl mx-auto leading-relaxed">
                Descubre palabras ocultas, resuelve crucigramas o mejora tu vocabulario. 
            </p>
        </header>
    );
};

export default Header;