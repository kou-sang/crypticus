// Sala de espera: unirse, salir, compartir enlace e iniciar.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Competition, Participant, UserProfile } from '../../../shared/types';
import { SCORING_LABELS } from '../../../shared/scoring';
import { api } from '../../lib/api';
import { deleteCompetition, joinCompetition, leaveCompetition } from '../../lib/repo';
import { errorMessage } from '../../lib/utils';
import { Avatar, Badge, Button, ErrorBanner } from '../../components/ui';
import { describeMode } from '../competitions/CompetitionCard';

export function LobbyView({
  competition,
  participants,
  profile,
  canJoin,
}: {
  competition: Competition;
  participants: Participant[];
  profile: UserProfile;
  canJoin: boolean;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isHost = competition.hostId === profile.uid;
  const joined = competition.participantIds.includes(profile.uid);
  const full = competition.participantIds.length >= competition.maxPlayers;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('No se pudo copiar el enlace.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Badge tone="ok">En sala</Badge>
        <Badge>{describeMode(competition)}</Badge>
        <Badge>{SCORING_LABELS[competition.scoring].title}</Badge>
        <Badge>{competition.crypticIds.length} cripticos</Badge>
        <Badge>{competition.maxHintsPerClue} pistas c/u</Badge>
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl">
          Jugadores {competition.participantIds.length}/{competition.maxPlayers}
        </h2>
        <ul className="flex flex-wrap gap-3">
          {participants.map((p) => (
            <li key={p.uid} className="flex items-center gap-2 border border-line px-3 py-2 text-sm fade-in">
              <Avatar name={p.displayName} size="sm" />
              {p.displayName}
              {p.uid === competition.hostId && <span className="text-xs text-accent">anfitrión</span>}
            </li>
          ))}
        </ul>
      </section>

      <ErrorBanner error={error} />

      <div className="flex flex-wrap gap-3">
        {isHost ? (
          <>
            <Button loading={busy === 'start'} onClick={() => run('start', () => api.start(competition.id))}>
              Iniciar competencia
            </Button>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              onClick={() =>
                run('delete', async () => {
                  await deleteCompetition(competition.id, profile.uid);
                  navigate('/competencias');
                })
              }
            >
              Cancelar sala
            </Button>
          </>
        ) : joined ? (
          <Button variant="secondary" loading={busy === 'leave'} onClick={() => run('leave', () => leaveCompetition(competition.id, profile.uid))}>
            Salir de la sala
          </Button>
        ) : (
          <Button
            loading={busy === 'join'}
            disabled={full || !canJoin}
            onClick={() => run('join', () => joinCompetition(competition.id, profile))}
          >
            {full ? 'Sala llena' : canJoin ? 'Unirme' : 'Solo amigos del anfitrión'}
          </Button>
        )}
        <Button variant="ghost" onClick={copyLink}>
          {copied ? '✓ Copiado' : 'Copiar enlace'}
        </Button>
      </div>

      {!isHost && joined && <p className="text-sm text-muted">Esperando a que {competition.hostName} inicie…</p>}
    </div>
  );
}
