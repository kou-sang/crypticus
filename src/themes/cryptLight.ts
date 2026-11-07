// Luz de las antorchas del tema Cripta: titileo orgánico, ráfagas de viento y paralaje con el puntero.
// Rendimiento: un solo bucle a ~20 fps que escribe `transform` y `opacity` directamente en elementos con capa
// propia (will-change). Sin variables CSS heredadas, filtros ni mezclas: solo composición, nada de layout ni repintado.
// Se pausa con la pestaña oculta y queda fijo con movimiento reducido.
import { prefersReducedMotion } from '../lib/settings';

const FRAME_MS = 50; // 20 fps: suficiente para una llama y deja el hilo libre para el juego.
const PARALLAX_PX = 14;
const PARALLAX_EASE = 0.3; // Fracción del camino que recorre el paralaje en cada cuadro (suavizado).

interface Gust {
  start: number; // ms
  rise: number;
  hold: number;
  fall: number;
  strength: number; // 0..1
  direction: 1 | -1;
}

interface TorchNodes {
  light: HTMLElement | null;
  flame: HTMLElement | null;
}

/** Ruido suave sin dependencias: suma de senos de frecuencias no armónicas. */
function smoothNoise(t: number, seed: number): number {
  return Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 2.9 + seed * 2.3) * 0.3 + Math.sin(t * 5.3 + seed * 0.7) * 0.2;
}

function gustValue(gust: Gust, now: number): number {
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

function paint(torch: TorchNodes, intensity: number, lean: number, shift: number): void {
  if (torch.light) {
    torch.light.style.opacity = (intensity * 0.92).toFixed(3);
    torch.light.style.transform = `translate3d(${shift.toFixed(1)}px,0,0) scale(${(0.86 + intensity * 0.18).toFixed(3)})`;
  }
  if (torch.flame) {
    torch.flame.style.transform = `skewX(${lean.toFixed(2)}deg) scale(${(1.08 - intensity * 0.12).toFixed(3)}, ${(0.72 + intensity * 0.4).toFixed(3)})`;
  }
}

/**
 * Arranca la animación sobre `scene` (que contiene .crypt-parallax, .crypt-shade y las antorchas).
 * Devuelve la función para detenerla. Con movimiento reducido deja valores fijos y no anima.
 */
export function startCryptLight(scene: HTMLElement): () => void {
  const torches: TorchNodes[] = Array.from(scene.querySelectorAll<HTMLElement>('[data-torch]')).map((torch) => ({
    light: torch.querySelector<HTMLElement>('.torch-light'),
    flame: torch.querySelector<HTMLElement>('.torch-flame'),
  }));
  const shade = scene.querySelector<HTMLElement>('.crypt-shade');
  const parallax = scene.querySelector<HTMLElement>('.crypt-parallax');
  const setShade = (ambient: number) => {
    if (shade) shade.style.opacity = Math.min(1, 0.78 + (1 - ambient) * 0.9).toFixed(3);
  };

  if (prefersReducedMotion()) {
    torches.forEach((torch) => paint(torch, 0.85, 0, 0));
    setShade(0.85);
    return () => undefined;
  }

  const jitter = torches.map(() => 0);
  let gust = nextGust(performance.now());
  let frame = 0;
  let last = 0;
  let running = true;
  // Paralaje: objetivo (puntero) y posición actual, suavizada en el mismo bucle.
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };

  const tick = (now: number) => {
    if (!running) return;
    frame = requestAnimationFrame(tick);
    if (now - last < FRAME_MS) return;
    last = now;
    try {
      if (now > gust.start + gust.rise + gust.hold + gust.fall) gust = nextGust(now);
      const t = now / 1000;
      // Viento: brisa suave constante + la ráfaga actual (con dirección).
      const wind = smoothNoise(t * 0.35, 1.3) * 0.25 + gustValue(gust, now) * gust.direction;
      let total = 0;
      torches.forEach((torch, index) => {
        // La ráfaga llega un poco después a la antorcha más lejana.
        const delayed = gustValue(gust, now - index * 180);
        jitter[index] = jitter[index]! * 0.8 + (Math.random() - 0.5) * 0.24;
        const flicker = 0.86 + smoothNoise(t * 3.1, index * 4.1) * 0.07 + jitter[index]! * 0.35 - delayed * 0.32;
        const intensity = Math.min(1.15, Math.max(0.35, flicker));
        total += intensity;
        paint(torch, intensity, wind * 14 + smoothNoise(t * 4.3, index * 2.7) * 3, wind * 26);
      });
      setShade(total / Math.max(1, torches.length));

      if (parallax) {
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          current.x += dx * PARALLAX_EASE;
          current.y += dy * PARALLAX_EASE;
          parallax.style.transform = `translate3d(${current.x.toFixed(1)}px,${current.y.toFixed(1)}px,0)`;
        }
      }
    } catch (error) {
      console.warn('[crypt] animación de luz detenida', error);
      running = false;
    }
  };

  // Solo con mouse: guarda el objetivo; el movimiento real lo hace el bucle (una escritura por cuadro como máximo).
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    target.x = (event.clientX / window.innerWidth - 0.5) * -2 * PARALLAX_PX;
    target.y = (event.clientY / window.innerHeight - 0.5) * -1 * PARALLAX_PX;
  };

  const onVisibility = () => {
    cancelAnimationFrame(frame);
    if (!document.hidden && running) frame = requestAnimationFrame(tick);
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
