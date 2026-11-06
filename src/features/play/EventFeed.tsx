// Últimos eventos de la partida (resoluciones, rondas, tiempo extra, prórroga).
import { memo } from 'react';
import type { GameEvent, LiveState } from '../../../shared/engine';
import { DIFFICULTY_LABELS } from '../../../shared/scoring';

function describe(event: GameEvent, state: LiveState): string | null {
  const name = event.uid ? (state.participants[event.uid]?.displayName ?? 'Alguien') : '';
  const tier = event.tier ? DIFFICULTY_LABELS[event.tier].toLowerCase() : '';
  switch (event.kind) {
    case 'solve':
      if (state.config.royale) return `${name} acertó (+${event.seconds ?? 0}s)`;
      if (state.config.hideScoreboard) return `${name} resolvió uno ${tier}`;
      return state.boss ? `${name} golpeó al jefe (−${event.points})` : `${name} resolvió uno ${tier} (+${event.points})`;
    case 'damage':
      return `${name} quitó ${event.points} de vida${(event.combo ?? 1) >= 2 ? ` (combo ×${event.combo})` : ''}`;
    case 'eliminated':
      return `${name} quedó eliminado`;
    case 'round':
      return `Nueva ronda: ${tier}`;
    case 'skip':
      return 'Ronda pasada por acuerdo';
    case 'extraTime':
      return `+${event.seconds}s añadidos`;
    case 'overtime':
      return '¡Prórroga! Hace falta ventaja de dos';
    default:
      return null;
  }
}

export const EventFeed = memo(function EventFeed({ state }: { state: LiveState }) {
  const items = state.events
    .slice()
    .reverse()
    .map((event) => ({ event, text: describe(event, state) }))
    .filter((item): item is { event: GameEvent; text: string } => item.text !== null)
    .slice(0, 8);
  if (items.length === 0) return null;
  return (
    <ol className="space-y-1 text-xs text-muted" aria-live="polite">
      {items.map(({ event, text }, index) => (
        <li key={`${event.at}-${index}`} className="fade-in">
          {text}
        </li>
      ))}
    </ol>
  );
});
