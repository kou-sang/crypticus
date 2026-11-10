import { Link } from 'react-router';
import type { Competition } from '../../../shared/types';
import { COMEBACK_LABELS, DUEL_DAMAGE_LABELS } from '../../../shared/scoring';
import { formatTimeControl } from '../../../shared/gameModes';
import { Badge } from '../../components/ui';
import { formatRelative } from '../../lib/utils';

const STATUS_LABEL = { lobby: 'En sala', live: 'En vivo', finished: 'Terminada' } as const;

type ModeFields = Pick<
  Competition,
  | 'targetCount'
  | 'flow'
  | 'winByTwo'
  | 'difficultyVote'
  | 'comeback'
  | 'rivalCountdownSec'
  | 'game'
  | 'duel'
  | 'royale'
  | 'maxHintsPerClue'
  | 'hintsPerGame'
  | 'surrender'
  | 'cooldownSec'
  | 'coop'
>;

export function describeMode(c: ModeFields): string {
  if (c.game === 'royale' && c.royale) return `Royale ${formatTimeControl(c.royale.baseSec, c.royale.incrementSec)}`;
  if (c.game === 'duel' && c.duel) return `Duel ${c.duel.teams ? '2 vs 2' : '1 vs 1'} · ${c.duel.hp} de vida`;
  if (c.game === 'race') return `Race a ${c.targetCount}`;
  if (c.game === 'coop') return `COOP ${c.coop?.level ?? 'AT'}`;
  return 'Partida'; // Salas anteriores a los modos (v0.6).
}

/** Etiquetas cortas de los modificadores activos. */
export function describeModifiers(c: ModeFields): string[] {
  if (c.game === 'royale') return ['Progresiva', 'Último en pie', c.royale?.skips ? `Saltear ×${c.royale.skips}` : 'Sin saltear'];
  if (c.game === 'coop') return ['4 a 8 jugadores', c.coop?.level === 'NT' ? '7 jefes · 33 min' : '4 jefes · 22 min', 'Solo PC'];
  if (c.game === 'duel') {
    const tags = [`Daño por ${DUEL_DAMAGE_LABELS[c.duel?.damage ?? 'difficulty'].title.toLowerCase()}`];
    if (c.duel?.combo !== false) tags.push('Combo');
    if (c.surrender?.enabled) tags.push(`Rendirse ×${c.surrender.maxUses}`);
    if (c.comeback && c.comeback !== 'off') tags.push(COMEBACK_LABELS[c.comeback]);
    return tags;
  }
  if (c.game === 'race') {
    const tags = [c.flow === 'rounds' ? `Hardcore · muerte súbita ${c.rivalCountdownSec}s` : 'Pacífico'];
    if (c.difficultyVote) tags.push('Vota dificultad');
    if (c.winByTwo) tags.push('Diferencia de dos');
    if (c.surrender?.enabled) tags.push(`Rendirse ×${c.surrender.maxUses}`);
    tags.push(c.maxHintsPerClue === 0 ? 'Sin pistas' : c.hintsPerGame ? `${c.hintsPerGame} ${c.hintsPerGame === 1 ? 'pista' : 'pistas'} por partida` : 'Con pistas');
    if (c.cooldownSec) tags.push(`Cooldown ${c.cooldownSec}s`);
    tags.push('10 min');
    return tags;
  }
  return [];
}

export function CompetitionCard({ competition }: { competition: Competition }) {
  const tone = competition.status === 'live' ? 'accent' : competition.status === 'finished' ? 'neutral' : 'ok';
  return (
    <Link
      to={`/c/${competition.id}`}
      className="group block border border-line p-4 transition-colors hover:border-ink hover:bg-paper-2/60"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl leading-tight group-hover:underline group-hover:decoration-accent group-hover:underline-offset-4">
          {competition.title}
        </h3>
        <Badge tone={tone}>{STATUS_LABEL[competition.status]}</Badge>
      </div>
      <p className="mt-2 font-mono text-xs uppercase tracking-wider text-muted">
        {describeMode(competition)} · {describeModifiers(competition).slice(0, 3).join(' · ')}
      </p>
      <div className="mt-3 flex items-center justify-between text-xs text-muted">
        <span>
          {competition.participantIds.length}/{competition.maxPlayers} jugadores · por {competition.hostName}
        </span>
        <span>{formatRelative(competition.createdAt)}</span>
      </div>
    </Link>
  );
}
