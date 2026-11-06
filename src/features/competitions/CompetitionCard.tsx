import { Link } from 'react-router';
import type { Competition } from '../../../shared/types';
import { BOSS_LABELS, COMEBACK_LABELS, DUEL_DAMAGE_LABELS, FLOW_LABELS, GAME_LABELS, SCORING_LABELS } from '../../../shared/scoring';
import { formatTimeControl } from '../../../shared/gameModes';
import { Badge } from '../../components/ui';
import { formatRelative } from '../../lib/utils';

const STATUS_LABEL = { lobby: 'En sala', live: 'En vivo', finished: 'Terminada' } as const;

type ModeFields = Pick<
  Competition,
  | 'mode'
  | 'durationSec'
  | 'targetCount'
  | 'scoring'
  | 'flow'
  | 'winByTwo'
  | 'bossLevel'
  | 'difficultyVote'
  | 'extraTime'
  | 'comeback'
  | 'hideScoreboard'
  | 'wrongPenalty'
  | 'rivalCountdownSec'
  | 'game'
  | 'duel'
  | 'royale'
  | 'maxHintsPerClue'
>;

export function describeMode(c: ModeFields): string {
  if (c.game === 'royale' && c.royale) return `Royale ${formatTimeControl(c.royale.baseSec, c.royale.incrementSec)}`;
  if (c.game === 'duel' && c.duel) return `Duel · ${c.duel.hp} de vida`;
  if (c.game === 'race') return `Race a ${c.targetCount}`;
  const minutes = `${Math.round(c.durationSec / 60)} min`;
  if (c.mode === 'boss') return `Jefe ${BOSS_LABELS[c.bossLevel] ?? ''} · ${minutes}`;
  if (c.mode === 'count') return `${c.flow === 'rounds' ? 'Primero a' : 'Carrera a'} ${c.targetCount}`;
  return minutes;
}

/** Etiquetas cortas de los modificadores activos. */
export function describeModifiers(c: ModeFields): string[] {
  if (c.game === 'royale') return ['Progresiva', 'Último en pie'];
  if (c.game === 'duel') {
    const tags = [`Daño por ${DUEL_DAMAGE_LABELS[c.duel?.damage ?? 'difficulty'].title.toLowerCase()}`];
    if (c.comeback && c.comeback !== 'off') tags.push(COMEBACK_LABELS[c.comeback]);
    return tags;
  }
  if (c.game === 'race') {
    const tags = [c.flow === 'rounds' ? `Hardcore · muerte súbita ${c.rivalCountdownSec}s` : 'Pacífico'];
    if (c.difficultyVote) tags.push('Vota dificultad');
    if (c.winByTwo) tags.push('Diferencia de dos');
    if (c.extraTime?.enabled) tags.push(`+${c.extraTime.seconds}s ×${c.extraTime.maxUses}`);
    tags.push(c.maxHintsPerClue > 0 ? 'Con pistas' : 'Sin pistas');
    return tags;
  }
  const tags: string[] = [FLOW_LABELS[c.flow]?.title ?? 'Libre'];
  if (c.mode !== 'boss') tags.push(SCORING_LABELS[c.scoring]?.title ?? 'Clásico');
  if (c.winByTwo) tags.push('Diferencia de dos');
  if (c.difficultyVote) tags.push('Vota dificultad');
  if (c.rivalCountdownSec > 0) tags.push(`Cuenta atrás ${c.rivalCountdownSec}s`);
  if (c.comeback && c.comeback !== 'off') tags.push(COMEBACK_LABELS[c.comeback]);
  if (c.extraTime?.enabled) tags.push(`+${c.extraTime.seconds}s ×${c.extraTime.maxUses}`);
  if (c.wrongPenalty > 0) tags.push(`−${c.wrongPenalty} por error`);
  if (c.hideScoreboard) tags.push('Marcador oculto');
  return tags;
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
