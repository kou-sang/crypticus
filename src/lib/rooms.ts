// Salas abandonadas: una sala que nadie inició ni cerró queda «en espera» o «en vivo» para siempre en Firestore.
// No se borran (no hay tarea programada); se ocultan de las listas pasado un plazo razonable.

/** Una sala en espera más antigua que esto se considera abandonada. */
export const LOBBY_TTL_MS = 6 * 60 * 60_000;
/** Ninguna partida dura tanto: una sala «en vivo» más antigua quedó sin cerrar. */
export const LIVE_TTL_MS = 3 * 60 * 60_000;

interface RoomTimes {
  status: 'lobby' | 'live' | 'finished';
  createdAt: number;
  startedAt?: number | null;
}

/** true si la sala sigue abierta (en espera o en vivo) y no está abandonada. */
export function isActiveRoom(room: RoomTimes, now: number): boolean {
  if (room.status === 'lobby') return now - room.createdAt < LOBBY_TTL_MS;
  if (room.status === 'live') return now - (room.startedAt ?? room.createdAt) < LIVE_TTL_MS;
  return false;
}
