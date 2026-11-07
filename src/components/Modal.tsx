// Ventana modal genérica: centrada en PC, hoja inferior en móvil. Animación de entrada y salida según el tema
// (clases .modal-backdrop / .modal-panel en index.css y en los temas). Escape y el fondo la cierran.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { playUi } from '../lib/sound';
import { cx } from '../lib/utils';

const EXIT_MS = 160;

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  // Montaje diferido al cerrar: deja correr la animación de salida antes de desmontar.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      playUi('open');
      return;
    }
    if (!mounted) return;
    setClosing(true);
    playUi('close');
    const timer = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const requestClose = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && requestClose();
    document.addEventListener('keydown', onKey);
    panel.current?.focus({ preventScroll: true });
    // Sin scroll de fondo mientras está abierta.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, requestClose]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" data-closing={closing || undefined}>
      <button type="button" aria-label="Cerrar" tabIndex={-1} data-sound="off" onClick={requestClose} className="backdrop modal-backdrop absolute inset-0 bg-black/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'modal-panel surface relative flex max-h-[92dvh] w-full flex-col border-2 border-ink bg-paper outline-none md:max-h-[88dvh]',
          wide ? 'md:max-w-3xl' : 'md:max-w-lg',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b-2 border-ink px-5 py-3">
          <h2 className="font-display text-2xl leading-none">{title}</h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className="inline-flex size-9 items-center justify-center text-xl hover:bg-paper-2"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
