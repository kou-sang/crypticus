// "Hay una partida en curso" para el resto de la app: AppShell oculta la barra inferior del celular y pide
// confirmación antes de salir por los enlaces de la barra superior (un toque accidental ya no saca del juego).
import { useSyncExternalStore } from 'react';

let playing = false;
const listeners = new Set<() => void>();

export function setPlaying(next: boolean): void {
  if (playing === next) return;
  playing = next;
  listeners.forEach((listener) => listener());
}

export function isPlaying(): boolean {
  return playing;
}

export function usePlaying(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => playing,
    () => false,
  );
}

export const LEAVE_GAME_MESSAGE = 'Estás en una partida. Si sales, sigues compitiendo pero sin responder. ¿Salir igual?';

/** Para enlaces durante la partida: pregunta antes de navegar. */
export function confirmLeaveGame(event: { preventDefault: () => void }): void {
  if (playing && !window.confirm(LEAVE_GAME_MESSAGE)) event.preventDefault();
}
