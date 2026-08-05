import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Capa a pantalla completa montada directamente en <body>.
 *
 * No basta con `position: fixed`: la tarjeta que envuelve el tablero conserva
 * un `transform` de su animación de entrada, y un ancestro transformado pasa a
 * ser el bloque contenedor de sus descendientes fijos. Dentro de ella, un
 * modal se posiciona respecto a la tarjeta y no respecto a la ventana. El
 * portal lo saca de ahí.
 */
const Overlay: React.FC<{ children: React.ReactNode; onClose?: () => void; className?: string }> = ({
    children,
    onClose,
    className = 'items-center justify-center',
}) => createPortal(
    <div
        className={`fixed inset-0 z-50 bg-ink-900/92 flex p-4 overflow-y-auto ${className}`}
        onClick={onClose}
    >
        {children}
    </div>,
    document.body,
);

export default Overlay;
