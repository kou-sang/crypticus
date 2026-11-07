// Equipos (Duel 2 vs 2) y requisitos para iniciar una partida. Puro: lo usan el cliente (lobby) y el Worker (inicio).
import type { CompetitionConfig } from './types';

export type Team = 0 | 1;
export const TEAM_SIZE = 2;
export const TEAM_LABELS: Record<Team, string> = { 0: 'Equipo A', 1: 'Equipo B' };

/** Duel por equipos: 2 contra 2 con vida compartida. */
export function isTeamDuel(config: Pick<CompetitionConfig, 'duel' | 'game'>): boolean {
  return config.game === 'duel' && config.duel?.teams === true;
}

/** Jugadores necesarios para empezar. `null` = cualquier cantidad (desde 1). */
export function requiredPlayers(config: Pick<CompetitionConfig, 'duel' | 'game'>): number | null {
  if (config.game !== 'duel') return null;
  return isTeamDuel(config) ? TEAM_SIZE * 2 : 2;
}

/**
 * Reparte equipos respetando la elección de cada jugador mientras haya lugar.
 * Los que no eligieron (o eligieron un equipo lleno) completan el que tenga menos, en orden de llegada.
 */
export function assignTeams(uids: string[], chosen: Record<string, number> = {}): Record<string, Team> {
  const teams: Record<string, Team> = {};
  const size: [number, number] = [0, 0];
  const pending: string[] = [];
  for (const uid of uids) {
    const pick = chosen[uid];
    if ((pick === 0 || pick === 1) && size[pick] < TEAM_SIZE) {
      teams[uid] = pick;
      size[pick] += 1;
    } else pending.push(uid);
  }
  for (const uid of pending) {
    const team: Team = size[0] <= size[1] ? 0 : 1;
    teams[uid] = team;
    size[team] += 1;
  }
  return teams;
}

/** Motivo por el que todavía no se puede iniciar, o `null` si está todo listo. */
export function startBlocker(config: Pick<CompetitionConfig, 'duel' | 'game'>, participantIds: string[]): string | null {
  if (participantIds.length === 0) return 'No hay jugadores en la sala.';
  const needed = requiredPlayers(config);
  if (needed === null) return null;
  if (participantIds.length !== needed) {
    const missing = needed - participantIds.length;
    return missing > 0
      ? `Duel ${isTeamDuel(config) ? '2 vs 2' : '1 vs 1'} necesita ${needed} jugadores: falta${missing > 1 ? 'n' : ''} ${missing}.`
      : `Duel ${isTeamDuel(config) ? '2 vs 2' : '1 vs 1'} es para ${needed} jugadores exactos.`;
  }
  return null;
}
