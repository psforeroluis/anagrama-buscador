import React from 'react';

const TWO_LETTER_GROUPS: { label: string; words: string }[] = [
    { label: 'Vocales (para limpiar el atril)', words: 'ea, eo, ae, oe, oi' },
    { label: 'Con H (comodines fáciles de encajar)', words: 'ah, ha, oh, ho, he' },
    { label: 'Muy comunes', words: 'al, el, ar, es, en, de, se, te, me, mi, su, tu, lo, un, va, ve' },
    { label: 'Con letras de alto valor', words: 'ox, xi (X) · za (Z) · ña (Ñ) · ya, yo, ay (Y)' },
];

const THREE_LETTER_GROUPS: { label: string; words: string }[] = [
    { label: 'Con X, Z, J', words: 'tex, lux, hex · zas, paz, faz, zen, zar · aji, eje, ojo' },
    { label: 'Con Y', words: 'rey, soy, voy, muy, ley, cuy' },
    { label: 'Con H', words: 'ahi, hui, hao' },
];

const ShortWordsGuide: React.FC = () => (
    <div className="mt-3 surface-inset rounded-2xl p-4 text-xs text-brand-subtle space-y-3.5 animate-fade-in">
        <p className="text-brand-subtle/90 leading-relaxed">
            Encajar palabras de 2-3 letras en paralelo a las del tablero es la forma más fiable de sumar puntos extra sin arriesgar el turno. Vale la pena memorizarlas.
        </p>
        <div>
            <p className="font-semibold text-brand-text mb-1.5">Palabras de 2 letras</p>
            <ul className="space-y-1">
                {TWO_LETTER_GROUPS.map(g => (
                    <li key={g.label}>
                        <span className="text-brand-subtle/60">{g.label}:</span>{' '}
                        <span className="font-mono text-accent-soft">{g.words}</span>
                    </li>
                ))}
            </ul>
        </div>
        <div>
            <p className="font-semibold text-brand-text mb-1.5">Palabras de 3 letras</p>
            <ul className="space-y-1">
                {THREE_LETTER_GROUPS.map(g => (
                    <li key={g.label}>
                        <span className="text-brand-subtle/60">{g.label}:</span>{' '}
                        <span className="font-mono text-accent-soft">{g.words}</span>
                    </li>
                ))}
            </ul>
        </div>
        <p className="text-brand-subtle/70 border-t border-white/5 pt-3 leading-relaxed">
            Truco: si al lado de una palabra del tablero (p. ej. <span className="font-mono">ROMA</span>) quieres jugar <span className="font-mono">SOL</span> en paralelo, cada letra tuya forma un par de 2 letras con la que tiene justo encima o debajo. Activa <strong className="text-brand-subtle/90 leading-relaxed">"¿Es una jugada en paralelo?"</strong> arriba para que el buscador solo te muestre palabras cuyos pares laterales existan de verdad en el diccionario.
        </p>
    </div>
);

export default ShortWordsGuide;
