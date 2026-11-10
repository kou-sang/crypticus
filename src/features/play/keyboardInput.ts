// Un único <input> invisible para todo el juego, fuera del árbol de React.
// Por qué: en el celular, si el input con foco se desmonta (cambio de criptico, pausa entre rondas), el teclado
// se cierra y el siguiente toque cae en cualquier parte (p. ej. «Inicio»). iOS además no deja reabrirlo por código.
// Con un solo input que nunca se desmonta, el teclado queda abierto toda la partida; la celda activa
// (AnswerGrid) se "engancha" a él y recibe lo que se escribe.

// Centinela: permite detectar el borrado en teclados móviles que no emiten `keydown` de Backspace.
export const SENTINEL = ' ';

export interface KeyboardHandlers {
  onText: (text: string) => void;
  onErase: () => void;
  onKey: (event: KeyboardEvent) => void; // Flechas, Supr, Enter…
  onFocusChange: (focused: boolean) => void;
}

let element: HTMLInputElement | null = null;
let current: KeyboardHandlers | null = null;

function resetValue(input: HTMLInputElement): void {
  input.value = SENTINEL;
  try {
    input.setSelectionRange(SENTINEL.length, SENTINEL.length);
  } catch {
    // Algunos navegadores no permiten selección en ciertos estados: no afecta al juego.
  }
}

function ensureInput(): HTMLInputElement {
  if (element && document.body.contains(element)) return element;
  const input = document.createElement('input');
  input.type = 'text';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('enterkeyhint', 'send');
  input.setAttribute('aria-label', 'Tu respuesta');
  input.dataset.gameKeyboard = 'true';
  // Fijo arriba y fuera de la vista: el navegador no hace scroll hacia él al enfocarlo.
  // 16px evita el zoom automático de iOS al enfocar.
  Object.assign(input.style, {
    position: 'fixed',
    top: '0',
    left: '50%',
    width: '1px',
    height: '1px',
    opacity: '0',
    fontSize: '16px',
    border: '0',
    padding: '0',
    pointerEvents: 'none',
    caretColor: 'transparent',
  } satisfies Partial<CSSStyleDeclaration>);
  resetValue(input);

  input.addEventListener('input', () => {
    try {
      const value = input.value;
      if (value.length < SENTINEL.length) current?.onErase();
      else {
        const text = value.startsWith(SENTINEL) ? value.slice(SENTINEL.length) : value;
        if (text) current?.onText(text);
      }
    } catch (error) {
      console.error('[teclado] entrada', error);
    } finally {
      resetValue(input);
    }
  });
  input.addEventListener('keydown', (event) => {
    try {
      if (event.key === 'Backspace') {
        event.preventDefault();
        current?.onErase();
        return;
      }
      current?.onKey(event);
    } catch (error) {
      console.error('[teclado] tecla', error);
    }
  });
  input.addEventListener('focus', () => {
    resetValue(input);
    current?.onFocusChange(true);
  });
  input.addEventListener('blur', () => current?.onFocusChange(false));
  document.body.appendChild(input);
  element = input;
  installKeepFocus();
  return input;
}

let keepFocusInstalled = false;

/**
 * Tocar las celdas o los botones del juego (Enviar, Pista, Rendirse…) no le quita el foco al input:
 * el teclado del celular no se cierra ni salta la página. Zona marcada con `data-keep-keyboard`.
 */
function installKeepFocus(): void {
  if (keepFocusInstalled) return;
  keepFocusInstalled = true;
  document.addEventListener(
    'mousedown',
    (event) => {
      if (!isKeyboardFocused()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-keep-keyboard]') && !target.closest('input, textarea, select')) event.preventDefault();
    },
    { capture: true },
  );
}

/** Engancha una grilla al teclado. La última enganchada recibe la entrada. Devuelve la función para soltarla. */
export function attachKeyboard(handlers: KeyboardHandlers): () => void {
  const input = ensureInput();
  current = handlers;
  handlers.onFocusChange(document.activeElement === input);
  return () => {
    if (current === handlers) current = null;
  };
}

/** Enfoca el input (abre el teclado si viene de un toque del usuario). */
export function focusKeyboard(): void {
  try {
    ensureInput().focus({ preventScroll: true });
  } catch (error) {
    console.error('[teclado] foco', error);
  }
}

export function isKeyboardFocused(): boolean {
  return element !== null && document.activeElement === element;
}

/** El jugador escribe en otro campo (chat, formulario): una grilla nueva no debe quitarle el foco. */
export function isTypingElsewhere(): boolean {
  const active = document.activeElement;
  if (!active || active === element) return false;
  return active instanceof HTMLElement && (active.isContentEditable || active.matches('input, textarea, select'));
}

/** Al salir de la partida: cierra el teclado y quita el input. */
export function releaseKeyboard(): void {
  current = null;
  if (!element) return;
  element.blur();
  element.remove();
  element = null;
}

/**
 * Centra un elemento en la parte visible de la pantalla (descontando el teclado).
 * En iOS el teclado no achica la ventana: se usa visualViewport para saber cuánto se ve.
 */
export function centerInView(target: HTMLElement): void {
  try {
    const viewport = window.visualViewport;
    const visibleHeight = viewport?.height ?? window.innerHeight;
    const visibleTop = viewport?.offsetTop ?? 0;
    const rect = target.getBoundingClientRect();
    const offset = rect.top - visibleTop - Math.max(56, (visibleHeight - rect.height) / 2);
    if (Math.abs(offset) < 8) return;
    window.scrollBy({ top: offset, behavior: 'smooth' });
  } catch (error) {
    console.error('[teclado] centrar', error);
  }
}
