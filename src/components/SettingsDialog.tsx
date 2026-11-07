// Ajustes como ventana superpuesta: el engranaje la abre y la cierra sin salir de la pantalla actual.
// Queda debajo de la barra superior para que el mismo engranaje siga a mano para cerrarla.
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Spinner } from './ui';

const SettingsPanel = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPanel })));

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-[15] flex justify-end">
      <button type="button" aria-label="Cerrar ajustes" onClick={onClose} className="backdrop absolute inset-0 bg-ink/30 fade-in" tabIndex={-1} />
      <div
        ref={panel}
        role="dialog"
        aria-labelledby="ajustes-titulo"
        tabIndex={-1}
        className="surface settings-panel relative h-full w-full max-w-3xl overflow-y-auto border-l-2 border-ink bg-paper pb-24 shadow-xl outline-none md:pb-6"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-2 border-ink bg-paper px-5 py-3">
          <h2 id="ajustes-titulo" className="font-display text-2xl">
            Ajustes
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar ajustes" className="inline-flex size-9 items-center justify-center text-xl hover:bg-paper-2">
            ✕
          </button>
        </div>
        <div className="px-5 pt-2">
          <Suspense fallback={<Spinner />}>
            <SettingsPanel />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
