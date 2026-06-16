import React, { useRef } from 'react';
import { BoardSlot } from '../types';

interface BoardBuilderProps {
    slots: BoardSlot[];
    onChange: (slots: BoardSlot[]) => void;
    disabled?: boolean;
}

const newSlot = (letter = ''): BoardSlot => ({ id: crypto.randomUUID(), letter });

const BoardBuilder: React.FC<BoardBuilderProps> = ({ slots, onChange, disabled }) => {
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const updateLetter = (id: string, letter: string) => {
        onChange(slots.map(s => s.id === id ? { ...s, letter } : s));
    };

    const removeSlot = (i: number) => {
        onChange(slots.filter((_, idx) => idx !== i));
        setTimeout(() => inputRefs.current[Math.max(0, i - 1)]?.focus(), 0);
    };

    const addSlot = (letter = '') => {
        onChange([...slots, newSlot(letter)]);
        setTimeout(() => inputRefs.current[slots.length]?.focus(), 0);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>, id: string, i: number) => {
        const raw = e.target.value;
        if (raw === '') { updateLetter(id, ''); return; }
        const clean = raw.replace(/[^a-záéíóúüñ]/gi, '').slice(-1).toLowerCase();
        if (!clean) return;
        updateLetter(id, clean);
        setTimeout(() => inputRefs.current[i + 1]?.focus(), 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
        if (e.key === 'Backspace' && slots[i].letter === '') {
            e.preventDefault();
            removeSlot(i);
            return;
        }
        if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
            e.preventDefault();
            if (i < slots.length - 1) inputRefs.current[i + 1]?.focus();
            else if (e.key === 'Tab') addSlot();
            return;
        }
        if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
            e.preventDefault();
            if (i > 0) inputRefs.current[i - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, startIndex: number) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text')
            .replace(/[^a-záéíóúüñ]/gi, '')
            .toLowerCase();
        if (!text) return;
        const next = [...slots];
        for (let i = 0; i < text.length; i++) {
            if (startIndex + i < next.length) {
                next[startIndex + i] = { ...next[startIndex + i], letter: text[i] };
            } else {
                next.push(newSlot(text[i]));
            }
        }
        onChange(next);
        setTimeout(() => inputRefs.current[Math.min(startIndex + text.length, next.length - 1)]?.focus(), 0);
    };

    const pattern = slots.map(s => s.letter || '?').join('');
    const hasBoard = slots.some(s => s.letter !== '');

    return (
        <div>
            <div className="flex items-end gap-1.5 flex-wrap">
                {slots.map((slot, i) => {
                    const isFixed = slot.letter !== '';
                    return (
                        <div key={slot.id} className="relative group flex flex-col items-center gap-0.5">
                            <span className="text-xs text-slate-600 leading-none mb-0.5">{i + 1}</span>
                            <div className={`w-11 h-11 rounded-lg border-2 transition-all ${
                                isFixed
                                    ? 'bg-blue-950/60 border-blue-500/60'
                                    : 'bg-amber-950/40 border-amber-600/30'
                            }`}>
                                <input
                                    ref={el => { inputRefs.current[i] = el; }}
                                    type="text"
                                    value={slot.letter.toUpperCase()}
                                    placeholder="?"
                                    disabled={disabled}
                                    onChange={e => handleChange(e, slot.id, i)}
                                    onKeyDown={e => handleKeyDown(e, i)}
                                    onPaste={e => handlePaste(e, i)}
                                    className={`w-full h-full bg-transparent text-center text-lg font-bold uppercase outline-none rounded-lg ${
                                        isFixed
                                            ? 'text-blue-300 placeholder-blue-800'
                                            : 'text-amber-400 placeholder-amber-800'
                                    } disabled:opacity-40`}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => removeSlot(i)}
                                disabled={disabled}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-700 text-slate-400 hover:bg-red-900 hover:text-red-300 transition-all items-center justify-center opacity-0 group-hover:opacity-100 text-xs leading-none flex z-10"
                            >
                                ×
                            </button>
                            <span className={`text-xs leading-none mt-0.5 ${isFixed ? 'text-blue-600' : 'text-amber-700'}`}>
                                {isFixed ? 'tablero' : 'ficha'}
                            </span>
                        </div>
                    );
                })}

                <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-transparent leading-none mb-0.5">0</span>
                    <button
                        type="button"
                        onClick={() => addSlot()}
                        disabled={disabled}
                        className="w-11 h-11 rounded-lg border-2 border-dashed border-slate-600 text-slate-500 hover:border-brand-accent hover:text-brand-accent transition-all flex items-center justify-center disabled:opacity-40"
                        title="Añadir posición"
                    >
                        <i className="fa-solid fa-plus text-sm"></i>
                    </button>
                    <span className="text-xs text-transparent leading-none mt-0.5">x</span>
                </div>

                {slots.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        disabled={disabled}
                        className="self-center ml-1 text-xs text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                        title="Eliminar todo el patrón"
                    >
                        <i className="fa-solid fa-trash-can mr-1"></i>
                        Limpiar
                    </button>
                )}
            </div>

            {slots.length > 0 && (
                <div className="flex gap-4 mt-2 text-xs text-slate-600 items-center flex-wrap">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-blue-950 border border-blue-500/50 inline-block"></span>
                        Letra del tablero <span className="text-slate-700">(no gasta ficha)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-amber-950 border border-amber-600/30 inline-block"></span>
                        Hueco para tu ficha
                    </span>
                    {hasBoard && (
                        <span className="ml-auto text-slate-700 font-mono">
                            patrón: <span className="text-brand-accent">{pattern}</span>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default BoardBuilder;
