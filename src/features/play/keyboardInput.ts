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
  installViewportKeeper(input);
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
  uninstallViewportKeeper();
  if (!element) return;
  element.blur();
  element.remove();
  element = null;
}

// ---------- Posición de la pantalla con el teclado del celular ----------
// Reglas (v1.9.1):
// - La página recuerda dos posiciones: la de lectura (teclado cerrado) y la de escritura (teclado abierto).
// - Al abrir el teclado: vuelve a la última posición de escritura; la primera vez, mueve lo mínimo para que
//   el enunciado y las casillas entren en lo visible.
// - Al cerrar el teclado: vuelve a la última posición de lectura.
// - Tipear, tocar casillas o pasar al criptico siguiente no mueve nada. Si el jugador se desplaza con el
//   teclado abierto, esa pasa a ser la posición de escritura.

const KEYBOARD_MIN_PX = 120; // Diferencia de alto que indica teclado abierto (no la barra de direcciones).
const SETTLE_MS = 150; // El teclado anima varios `resize`: se espera a que termine.
const IGNORE_MS = 600; // Desplazamientos propios (o del navegador al enfocar) que no cuentan como del jugador.
const MIN_TOP_INSET = 64; // Barra fija de arriba (si no se puede medir).
const BOTTOM_MARGIN = 12;

let keeperInstalled = false;
let keyboardShown = false;
let readTop: number | null = null; // Posición con el teclado cerrado.
let typeTop: number | null = null; // Posición con el teclado abierto (null: la primera vez se calcula).
let ignoreUntil = 0;
let settleTimer = 0;

/** Parte de arriba de lo que se ve, en coordenadas de página (iOS: el teclado no achica la ventana). */
function visibleTop(): number {
  const viewport = window.visualViewport;
  return viewport ? viewport.pageTop : window.scrollY;
}

function visibleHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

function keyboardIsUp(): boolean {
  const viewport = window.visualViewport;
  if (!viewport || !isKeyboardFocused()) return false;
  if (viewport.scale > 1.05) return keyboardShown; // Con zoom del usuario no se decide nada.
  return window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
}

function moveTo(top: number): void {
  ignoreUntil = performance.now() + IGNORE_MS;
  const delta = top - visibleTop();
  if (Math.abs(delta) >= 2) window.scrollBy({ top: delta, behavior: 'instant' });
}

/** Alto tapado arriba de lo visible: cabecera fija y barra de la partida (`data-sticky-top`). */
function topInset(): number {
  let inset = MIN_TOP_INSET;
  for (const bar of document.querySelectorAll<HTMLElement>('header, [data-sticky-top]')) {
    const style = getComputedStyle(bar);
    if (style.position !== 'fixed' && style.position !== 'sticky') continue;
    // Donde queda pegada (su `top`) más su alto: no depende de cuánto se haya desplazado la página.
    inset = Math.max(inset, (Number.parseFloat(style.top) || 0) + bar.getBoundingClientRect().height + 8);
  }
  return inset;
}

/**
 * Posición mínima para que el enunciado y las casillas entren arriba del teclado (null: ya entran).
 * Si no entran las dos cosas, se priorizan las casillas.
 */
function fitTop(): number | null {
  const panel = document.querySelector<HTMLElement>('[data-clue-panel]');
  const grid = panel?.querySelector<HTMLElement>('.answer-grid') ?? document.querySelector<HTMLElement>('.answer-grid');
  if (!grid) return null;
  const clue = (panel ?? document).querySelector<HTMLElement>('[data-clue-text]') ?? grid;
  const current = visibleTop();
  const offset = window.visualViewport?.offsetTop ?? 0;
  const clueRect = clue.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  // Enunciado y casillas pueden estar en cualquier orden (en COOP el enunciado va abajo).
  const clueTop = Math.min(clueRect.top, gridRect.top) - offset + current;
  const gridBottom = Math.max(clueRect.bottom, gridRect.bottom) - offset + current;
  const lowest = gridBottom - visibleHeight() + BOTTOM_MARGIN; // Más arriba no: las casillas quedan tapadas.
  const highest = clueTop - topInset(); // Más abajo no: el enunciado queda bajo la barra.
  if (lowest > highest) return lowest;
  if (current >= lowest && current <= highest) return null;
  return Math.min(Math.max(current, lowest), highest);
}

function onScroll(): void {
  if (performance.now() < ignoreUntil) return;
  if (keyboardShown) typeTop = visibleTop();
  else readTop = visibleTop();
}

function settle(): void {
  const up = keyboardIsUp();
  if (up === keyboardShown) return;
  keyboardShown = up;
  if (up) {
    const target = typeTop ?? fitTop();
    if (target !== null) moveTo(target);
    typeTop = target ?? visibleTop();
  } else if (readTop !== null) {
    moveTo(readTop);
  }
}

function onViewportResize(): void {
  ignoreUntil = performance.now() + IGNORE_MS;
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(settle, SETTLE_MS);
}

/** Al enfocar: se guarda la posición de lectura antes de que el navegador mueva nada. */
function onKeyboardFocus(): void {
  if (!keyboardShown) readTop = visibleTop();
  ignoreUntil = performance.now() + IGNORE_MS;
}

function installViewportKeeper(input: HTMLInputElement): void {
  input.addEventListener('focus', onKeyboardFocus);
  if (keeperInstalled) return;
  keeperInstalled = true;
  readTop = visibleTop();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.visualViewport?.addEventListener('scroll', onScroll, { passive: true });
  window.visualViewport?.addEventListener('resize', onViewportResize);
}

function uninstallViewportKeeper(): void {
  if (!keeperInstalled) return;
  keeperInstalled = false;
  window.removeEventListener('scroll', onScroll);
  window.visualViewport?.removeEventListener('scroll', onScroll);
  window.visualViewport?.removeEventListener('resize', onViewportResize);
  window.clearTimeout(settleTimer);
  keyboardShown = false;
  readTop = null;
  typeTop = null;
}
