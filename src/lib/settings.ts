// Preferencias locales del jugador (por navegador). localStorage puede fallar: siempre con try/catch.
import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type MotionPreference = 'system' | 'full' | 'reduced';

/** Grupos de sonidos que se pueden activar por separado en Ajustes. */
export type SoundGroup = 'answers' | 'rivals' | 'lowTime' | 'countdown' | 'results';
export const SOUND_GROUPS: Record<SoundGroup, { title: string; description: string }> = {
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
}

const STORAGE_KEY = 'crypticus.settings.v1';
const DEFAULTS: Settings = {
  sound: true,
  volume: 0.6,
  sounds: { answers: true, rivals: true, lowTime: true, countdown: true, results: true },
  motion: 'system',
  theme: 'system',
};

function read(): Settings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed, sounds: { ...DEFAULTS.sounds, ...(parsed.sounds ?? {}) } };
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
