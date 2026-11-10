// Eventos de la partida (resoluciones, rondas, tiempo extra, prórroga) como líneas del chat de sala.
import type { GameEvent, LiveState } from '../../../shared/engine';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';
import type { SystemLine } from '../chat/ChatPanel';

function describe(event: GameEvent, state: LiveState): string | null {
  const name = event.uid ? (state.participants[event.uid]?.displayName ?? 'Alguien') : '';
  const tier = event.tier ? DIFFICULTY_LABELS[event.tier].toLowerCase() : '';
  switch (event.kind) {
    case 'surrender':
      return state.config.royale ? `${name} salteó (${event.seconds ?? 0} s)` : `${name} se rindió`;
    case 'solve':
      if (state.config.game === 'race') {
        const solved = event.uid ? (state.participants[event.uid]?.solvedIds.length ?? 0) : 0;
        return `${name} acertó · ${solved}/${state.config.targetCount}`;
      }
      if (state.config.royale) return `${name} acertó (+${event.seconds ?? 0}s)`;
      return `${name} resolvió uno ${tier} (+${event.points})`;
    case 'damage':
      return `${name} quitó ${event.points} de vida${(event.combo ?? 1) >= 2 ? ` (combo ×${event.combo})` : ''}`;
    case 'eliminated':
      return `${name} quedó eliminado`;
    case 'round':
      return `Nueva ronda: ${tier}`;
    case 'overtime':
      return '¡Prórroga! Hace falta ventaja de dos';
    default:
      return null;
  }
}

/** Eventos de la partida como líneas del chat (los últimos `limit`, del más viejo al más nuevo). */
export function gameEventLines(state: LiveState, limit = 40): SystemLine[] {
  const lines: SystemLine[] = [];
  for (const event of state.events) {
    const text = describe(event, state);
    // Clave estable aunque la lista de eventos se recorte por el principio.
    if (text) lines.push({ key: `ev-${event.at}-${event.kind}-${event.uid ?? ''}-${event.crypticId ?? ''}`, at: event.at, text });
  }
  return lines.slice(-limit);
}
