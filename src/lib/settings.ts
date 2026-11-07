// Preferencias locales del jugador (por navegador). localStorage puede fallar: siempre con try/catch.
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark'; // Modo de color (solo tema Normal).
/** Tema visual: colores, tipografía, fondo, animaciones y sonidos. */
export type Skin = 'normal' | 'medieval' | 'cyber';
export const SKINS: Record<Skin, { title: string; description: string }> = {
  normal: { title: 'Normal', description: 'Papel y tinta. Claro u oscuro.' },
  medieval: { title: 'Medieval', description: 'Una cripta de piedra a la luz de las antorchas.' },
  cyber: { title: 'Cyber', description: 'Realidad virtual de neón y hologramas.' },
};
export type MotionPreference = 'system' | 'full' | 'reduced';

/** Grupos de sonidos que se pueden activar por separado en Ajustes. */
export type SoundGroup = 'interface' | 'typing' | 'answers' | 'rivals' | 'lowTime' | 'countdown' | 'results';
export const SOUND_GROUPS: Record<SoundGroup, { title: string; description: string }> = {
  interface: { title: 'Interfaz', description: 'Botones, pestañas y ventanas.' },
  typing: { title: 'Tipeo', description: 'Al escribir letras y borrar.' },
  answers: { title: 'Aciertos y errores', description: 'Al responder.' },
  rivals: { title: 'Rivales', description: 'Cuando un rival acierta o te golpea.' },
  lowTime: { title: 'Peligro', description: 'Reloj por agotarse (Royale), vida baja y a un golpe de perder (Duel).' },
  countdown: { title: 'Cuenta atrás', description: 'Inicio de partida y siguiente criptico.' },
  results: { title: 'Resultado final', description: 'Victoria o derrota.' },
};

export interface Settings {
  sound: boolean;
  volume: number; // 0..1
  sounds: Record<SoundGroup, boolean>;
  motion: MotionPreference;
  theme: ThemePreference;
  skin: Skin;
}

const STORAGE_KEY = 'crypticus.settings.v1';
const DEFAULTS: Settings = {
  sound: true,
  volume: 0.6,
  sounds: { interface: true, typing: true, answers: true, rivals: true, lowTime: true, countdown: true, results: true },
  motion: 'system',
  theme: 'system',
  skin: 'normal',
};

const SKIN_IDS: readonly Skin[] = ['normal', 'medieval', 'cyber'];

function read(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const skin = SKIN_IDS.includes(parsed.skin as Skin) ? (parsed.skin as Skin) : DEFAULTS.skin;
    return { ...DEFAULTS, ...parsed, skin, sounds: { ...DEFAULTS.sounds, ...(parsed.sounds ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = typeof window === 'undefined' ? DEFAULTS : read();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Modo privado o almacenamiento lleno: se mantiene en memoria.
  }
  applyDocumentSettings(current);
  listeners.forEach((listener) => listener());
}

/** Suscripción fuera de React (fuentes del tema, etc.). Devuelve la función para desuscribirse. */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULTS,
  );
}

/** Refleja tema y movimiento en <html> para que el CSS reaccione. */
export function applyDocumentSettings(settings: Settings = current): void {
  const root = document.documentElement;
  if (settings.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);
  root.setAttribute('data-motion', settings.motion);
  root.setAttribute('data-skin', settings.skin);
  // Barra del navegador móvil acorde al tema.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', settings.skin === 'medieval' ? '#0e0c0a' : settings.skin === 'cyber' ? '#05060d' : '#f4efe4');
}

export function prefersReducedMotion(): boolean {
  if (current.motion === 'reduced') return true;
  if (current.motion === 'full') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
