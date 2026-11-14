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

// ---------- Posición de la pantalla en el celular (Android e iOS) ----------
// Reglas (v1.9.2):
// - Se recuerda dónde están las casillas en la pantalla, una posición con el teclado cerrado (lectura) y otra
//   con el teclado abierto (escritura). Solo el jugador las cambia, desplazándose con el dedo, la rueda o el teclado.
// - Al abrir el teclado: las casillas vuelven a su posición de escritura; la primera vez se mueve lo mínimo para
//   que el enunciado y las casillas entren arriba del teclado. Al cerrarlo: vuelven a la de lectura.
// - Si la página cambia sola (criptico nuevo, cuenta regresiva, avisos, la página se acorta en la pausa entre
//   cripticos), las casillas se devuelven a la posición recordada antes de pintar: no salta nada.
// - Tipear o tocar casillas no mueve nada.

const KEYBOARD_MIN_PX = 120; // Diferencia de alto que indica teclado abierto (no la barra de direcciones).
const SETTLE_MS = 150; // El teclado anima varios `resize`: se espera a que termine.
const MOMENTUM_MS = 2_500; // Tras soltar el dedo, la inercia sigue desplazando la página.
const USER_SCROLL_QUIET_MS = 400; // Sin desplazamiento del jugador en este lapso, la página se puede reacomodar.
const MIN_TOP_INSET = 64; // Barra fija de arriba (si no se puede medir).
const BOTTOM_MARGIN = 12;

type Mode = 'read' | 'type';

let keeperInstalled = false;
let keyboardShown = false;
/** Posición de las casillas (px desde arriba de lo visible) en cada modo; null: todavía no se fijó. */
const anchors: Record<Mode, number | null> = { read: null, type: null };
let dragging = false; // El dedo está desplazando la página (un toque sin mover no cuenta).
let lastGestureAt = 0; // Último arrastre, rueda o tecla de desplazamiento del jugador.
let lastLayoutChangeAt = 0;
let lastUserScrollAt = 0;
let settleTimer = 0;
let alignQueued = false;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;

const mode = (): Mode => (keyboardShown ? 'type' : 'read');

function offsetTop(): number {
  return window.visualViewport?.offsetTop ?? 0;
}

function visibleHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Casillas del criptico en pantalla (la referencia de todo el acomodo). */
function grid(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.answer-grid');
}

/** Dónde están las casillas, en px desde arriba de lo que se ve. */
function gridPosition(): number | null {
  const element = grid();
  return element ? element.getBoundingClientRect().top - offsetTop() : null;
}

function keyboardIsUp(): boolean {
  const viewport = window.visualViewport;
  if (!viewport || !isKeyboardFocused()) return false;
  if (viewport.scale > 1.05) return keyboardShown; // Con zoom del usuario no se decide nada.
  return window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
}

function userIsScrolling(now = performance.now()): boolean {
  return dragging || now - lastUserScrollAt < USER_SCROLL_QUIET_MS;
}

/** Desplaza la página `delta` px sin animación (no cuenta como desplazamiento del jugador). */
function scrollByNow(delta: number): void {
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
 * Desplazamiento mínimo para que el enunciado y las casillas entren arriba del teclado (0: ya entran).
 * Si no entran las dos cosas, se priorizan las casillas.
 */
function fitDelta(): number {
  const element = grid();
  if (!element) return 0;
  const panel = element.closest<HTMLElement>('[data-clue-panel]');
  const clue = (panel ?? document).querySelector<HTMLElement>('[data-clue-text]') ?? element;
  const offset = offsetTop();
  const clueRect = clue.getBoundingClientRect();
  const gridRect = element.getBoundingClientRect();
  // Enunciado y casillas pueden estar en cualquier orden (en COOP el enunciado va abajo).
  const top = Math.min(clueRect.top, gridRect.top) - offset;
  const bottom = Math.max(clueRect.bottom, gridRect.bottom) - offset;
  const down = bottom - (visibleHeight() - BOTTOM_MARGIN); // > 0: las casillas quedan tapadas por el teclado.
  const up = top - topInset(); // < 0: el enunciado queda bajo la barra.
  if (down > 0) return up > 0 ? Math.min(down, up) : down;
  return up < 0 ? up : 0;
}

/** Devuelve las casillas a la posición recordada del modo actual. */
function align(): void {
  alignQueued = false;
  if (userIsScrolling()) return;
  const want = anchors[mode()];
  const now = gridPosition();
  if (want === null || now === null) return;
  scrollByNow(now - want);
}

/** La página cambió sola: se reacomoda antes de pintar. */
function onLayoutChange(): void {
  lastLayoutChangeAt = performance.now();
  if (alignQueued) return;
  alignQueued = true;
  queueMicrotask(align);
}

function onScroll(): void {
  const now = performance.now();
  // Solo cuenta lo que mueve el jugador: los desplazamientos del navegador o de la página se ignoran.
  if (!dragging && now - lastGestureAt > MOMENTUM_MS) return;
  // Si la página acaba de cambiar sola (p. ej. se acortó en la pausa), el desplazamiento es del navegador.
  if (!dragging && now - lastLayoutChangeAt < 120) {
    onLayoutChange();
    return;
  }
  lastUserScrollAt = now;
  anchors[mode()] = gridPosition();
}

function settle(): void {
  const up = keyboardIsUp();
  if (up === keyboardShown) return;
  keyboardShown = up;
  const want = anchors[mode()];
  const now = gridPosition();
  if (now === null) return;
  if (want !== null) scrollByNow(now - want);
  else if (up) {
    scrollByNow(fitDelta());
    anchors.type = gridPosition();
  }
}

function onViewportResize(): void {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(settle, SETTLE_MS);
}

function onTouchMove(): void {
  dragging = true;
  lastGestureAt = performance.now();
}

function onTouchEnd(): void {
  if (dragging) lastGestureAt = performance.now(); // Empieza la inercia.
  dragging = false;
}

function onGesture(): void {
  lastGestureAt = performance.now();
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse') onGesture(); // Barra de desplazamiento con el mouse (no toques).
}

/** Teclas que desplazan la página (fuera del input del juego). */
function onScrollKey(event: KeyboardEvent): void {
  if (event.target === element) return;
  if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) onGesture();
}

/** Al enfocar: si nunca se fijó la posición de lectura, es la actual. */
function onKeyboardFocus(): void {
  if (!keyboardShown && anchors.read === null) anchors.read = gridPosition();
}

function installViewportKeeper(input: HTMLInputElement): void {
  input.addEventListener('focus', onKeyboardFocus);
  if (keeperInstalled) return;
  keeperInstalled = true;
  anchors.read = gridPosition(); // Donde está la grilla al empezar.
  const passive = { passive: true, capture: true } as const;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.visualViewport?.addEventListener('scroll', onScroll, { passive: true });
  window.visualViewport?.addEventListener('resize', onViewportResize);
  window.addEventListener('touchmove', onTouchMove, passive);
  window.addEventListener('touchend', onTouchEnd, passive);
  window.addEventListener('touchcancel', onTouchEnd, passive);
  window.addEventListener('wheel', onGesture, passive);
  window.addEventListener('pointerdown', onPointerDown, passive);
  window.addEventListener('keydown', onScrollKey, { capture: true });
  // Criptico nuevo, pausa, avisos: cualquier cambio de la página reacomoda las casillas.
  resizeObserver = new ResizeObserver(onLayoutChange);
  resizeObserver.observe(document.body);
  mutationObserver = new MutationObserver(onLayoutChange);
  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function uninstallViewportKeeper(): void {
  if (!keeperInstalled) return;
  keeperInstalled = false;
  const capture = { capture: true } as const;
  window.removeEventListener('scroll', onScroll);
  window.visualViewport?.removeEventListener('scroll', onScroll);
  window.visualViewport?.removeEventListener('resize', onViewportResize);
  window.removeEventListener('touchmove', onTouchMove, capture);
  window.removeEventListener('touchend', onTouchEnd, capture);
  window.removeEventListener('touchcancel', onTouchEnd, capture);
  window.removeEventListener('wheel', onGesture, capture);
  window.removeEventListener('pointerdown', onPointerDown, capture);
  window.removeEventListener('keydown', onScrollKey, capture);
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  resizeObserver = null;
  mutationObserver = null;
  window.clearTimeout(settleTimer);
  keyboardShown = false;
  dragging = false;
  anchors.read = null;
  anchors.type = null;
}
