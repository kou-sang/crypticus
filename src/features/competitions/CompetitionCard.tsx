import { Link } from 'react-router';
import type { Competition } from '../../../shared/types';
import { SCORING_LABELS } from '../../../shared/scoring';
import { Badge } from '../../components/ui';
import { formatRelative } from '../../lib/utils';

const STATUS_LABEL = { lobby: 'En sala', live: 'En vivo', finished: 'Terminada' } as const;

export function describeMode(competition: Pick<Competition, 'mode' | 'durationSec' | 'targetCount' | 'scoring'>): string {
  if (competition.scoring === 'winByTwo') return 'Duelo a 2 de ventaja';
  return competition.mode === 'timed'
    ? `${Math.round(competition.durationSec / 60)} min`
    : `Carrera a ${competition.targetCount}`;
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
        {describeMode(competition)} · {SCORING_LABELS[competition.scoring].title} · {competition.crypticIds.length} pistas
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
