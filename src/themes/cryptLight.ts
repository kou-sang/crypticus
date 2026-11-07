// Luz de las antorchas del tema Cripta: titileo orgánico, ráfagas de viento y paralaje con el puntero.
// Un solo bucle (~30 fps) escribe variables CSS en la escena; el CSS hace el resto (opacidad y transform:
// solo composición, sin layout). Se detiene con la pestaña oculta y no corre con movimiento reducido.
import { prefersReducedMotion } from '../lib/settings';

const FRAME_MS = 33;
const PARALLAX_PX = 14;

interface Gust {
  start: number; // ms
  rise: number;
  hold: number;
  fall: number;
  strength: number; // 0..1
  direction: 1 | -1;
}

/** Ruido suave sin dependencias: suma de senos de frecuencias no armónicas. */
function smoothNoise(t: number, seed: number): number {
  return (
    Math.sin(t * 1.7 + seed) * 0.5 +
    Math.sin(t * 2.9 + seed * 2.3) * 0.3 +
    Math.sin(t * 5.3 + seed * 0.7) * 0.2
  );
}

function gustValue(gust: Gust | null, now: number): number {
  if (!gust) return 0;
  const t = now - gust.start;
  if (t < 0) return 0;
  if (t < gust.rise) return (t / gust.rise) * gust.strength;
  if (t < gust.rise + gust.hold) return gust.strength;
  const decay = t - gust.rise - gust.hold;
  return decay < gust.fall ? (1 - decay / gust.fall) * gust.strength : 0;
}

function nextGust(now: number): Gust {
  return {
    start: now + 3500 + Math.random() * 8000, // Cada 3,5–11,5 s.
    rise: 350 + Math.random() * 500,
    hold: 300 + Math.random() * 1300,
    fall: 1200 + Math.random() * 1400,
    strength: 0.35 + Math.random() * 0.65,
    direction: Math.random() < 0.5 ? -1 : 1,
  };
}

/**
 * Arranca la animación sobre `scene` (que contiene las antorchas). Devuelve la función para detenerla.
 * Con movimiento reducido deja valores fijos y no anima.
 */
export function startCryptLight(scene: HTMLElement): () => void {
  const torches = Array.from(scene.querySelectorAll<HTMLElement>('[data-torch]'));
  const setStatic = () => {
    torches.forEach((torch) => {
      torch.style.setProperty('--f', '0.85');
      torch.style.setProperty('--lean', '0deg');
      torch.style.setProperty('--shift', '0px');
    });
    scene.style.setProperty('--ambient', '0.85');
  };
  if (prefersReducedMotion()) {
    setStatic();
    return () => undefined;
  }

  // Estado por antorcha: un paseo aleatorio suavizado para que el titileo no sea periódico.
  const jitter = torches.map(() => 0);
  let gust: Gust = nextGust(performance.now());
  let frame = 0;
  let last = 0;
  let running = true;

  const tick = (now: number) => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    if (now - last < FRAME_MS) return;
    last = now;
    try {
      if (now > gust.start + gust.rise + gust.hold + gust.fall) gust = nextGust(now);
      const t = now / 1000;
      // Viento: brisa constante y suave + la ráfaga actual (con dirección).
      const breeze = smoothNoise(t * 0.35, 1.3) * 0.25;
      const gustNow = gustValue(gust, now);
      const wind = breeze + gustNow * gust.direction;
      let total = 0;
      torches.forEach((torch, index) => {
        // La ráfaga llega un poco después a la antorcha más lejana.
        const delayed = gustValue(gust, now - index * 180);
        jitter[index] = jitter[index]! * 0.82 + (Math.random() - 0.5) * 0.22;
        const flicker = 0.86 + smoothNoise(t * 3.1, index * 4.1) * 0.07 + jitter[index]! * 0.35 - delayed * 0.32;
        const intensity = Math.min(1.15, Math.max(0.35, flicker));
        total += intensity;
        const lean = wind * 14 + smoothNoise(t * 4.3, index * 2.7) * 3;
        torch.style.setProperty('--f', intensity.toFixed(3));
        torch.style.setProperty('--lean', `${lean.toFixed(2)}deg`);
        torch.style.setProperty('--shift', `${(wind * 26).toFixed(1)}px`);
      });
      scene.style.setProperty('--ambient', (total / Math.max(1, torches.length)).toFixed(3));
    } catch (error) {
      console.warn('[crypt] animación de luz detenida', error);
      running = false;
      setStatic();
    }
  };

  // Paralaje: el muro se desplaza un poco hacia donde va el puntero (solo con mouse).
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const x = (event.clientX / window.innerWidth - 0.5) * -2 * PARALLAX_PX;
    const y = (event.clientY / window.innerHeight - 0.5) * -1 * PARALLAX_PX;
    scene.style.setProperty('--px', `${x.toFixed(1)}px`);
    scene.style.setProperty('--py', `${y.toFixed(1)}px`);
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
    } else if (running) {
      frame = requestAnimationFrame(tick);
    }
  };

  frame = requestAnimationFrame(tick);
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    running = false;
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
