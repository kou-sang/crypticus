// Sonidos de interfaz por delegación: un listener en el documento cubre todos los botones, pestañas,
// enlaces y campos de texto de la app (sin tocar cada componente). `data-sound="off"` en un elemento
// o un ancestro lo silencia; `data-sound="tab|toggle|submit|click"` fuerza el tipo de sonido.
import { playUi, type UiCue } from './sound';

const CLICKABLE = 'button, a[href], [role="tab"], [role="radio"], [role="switch"], [role="checkbox"], summary, select';
const TEXT_TYPES = new Set(['text', 'search', 'email', 'password', 'url', 'tel', 'number', '']);
const FORCED: readonly UiCue[] = ['tab', 'toggle', 'submit', 'click'];

function cueFor(element: Element): UiCue | null {
  const marked = element.closest('[data-sound]');
  const forced = marked?.getAttribute('data-sound');
  if (forced === 'off') return null;
  if (forced && (FORCED as readonly string[]).includes(forced)) return forced as UiCue;
  if (element.matches('[role="tab"]') || element.closest('nav')) return 'tab';
  if (element.matches('[role="radio"], [role="switch"], [role="checkbox"], [aria-pressed]')) return 'toggle';
  if (element.matches('button[type="submit"]')) return 'submit';
  return 'click';
}

let installed = false;

export function installUiSounds(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // pointerdown: el sonido sale al tocar, sin esperar al click (se siente inmediato).
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest(CLICKABLE) : null;
      if (!target || target.matches(':disabled, [aria-disabled="true"]')) return;
      const cue = cueFor(target);
      if (cue) playUi(cue);
    },
    { capture: true, passive: true },
  );

  // Teclado (Enter/Espacio sobre un botón): el click llega con detail = 0.
  document.addEventListener(
    'click',
    (event) => {
      if (event.detail !== 0) return;
      const target = event.target instanceof Element ? event.target.closest(CLICKABLE) : null;
      if (!target || target.matches(':disabled')) return;
      const cue = cueFor(target);
      if (cue) playUi(cue);
    },
    { capture: true, passive: true },
  );

  // Tipeo: `input` cubre teclados físicos y móviles (que no siempre emiten keydown con la tecla real).
  document.addEventListener(
    'input',
    (event) => {
      const target = event.target;
      const isText =
        target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && TEXT_TYPES.has(target.type));
      if (!isText || target.closest('[data-sound="off"]')) return;
      const kind = event instanceof InputEvent ? event.inputType : '';
      playUi(kind.startsWith('delete') ? 'erase' : 'type');
    },
    { capture: true, passive: true },
  );
}
