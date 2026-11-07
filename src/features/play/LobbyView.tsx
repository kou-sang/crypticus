// Sala de espera: unirse, salir, compartir enlace e iniciar.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Competition, Participant, UserProfile } from '../../../shared/types';
import { api } from '../../lib/api';
import { configOf, deleteCompetition, joinCompetition, leaveCompetition } from '../../lib/repo';
import { settingsFromConfig } from '../../../shared/gameModes';
import type { RematchDraft } from './RematchPanel';
import { errorMessage } from '../../lib/utils';
import { Avatar, Badge, Button, ErrorBanner } from '../../components/ui';
import { describeMode, describeModifiers } from '../competitions/CompetitionCard';

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

  // Revancha: empieza sola cuando aceptan todos los invitados.
  const invited = competition.rematchOf ? (competition.invitedIds ?? []) : [];
  const declined = competition.declinedIds ?? [];
  const allAccepted = invited.length > 0 && invited.every((id) => competition.participantIds.includes(id));
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!isHost || !allAccepted || autoStarted.current) return;
    autoStarted.current = true;
    api.start(competition.id).catch((err: unknown) => setError(errorMessage(err)));
  }, [isHost, allAccepted, competition.id]);

  const changeParameters = () => {
    const draft: RematchDraft = {
      fromId: competition.rematchOf!,
      title: competition.title,
      settings: settingsFromConfig(configOf(competition)),
      visibility: competition.visibility,
      invitedIds: invited,
      invitedNames: competition.invitedNames ?? {},
      replaceId: competition.id,
    };
    navigate('/jugar/nueva', { state: { rematch: draft } });
  };

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
        {describeModifiers(competition).map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
        {!competition.game && <Badge>{competition.maxHintsPerClue} pistas c/u</Badge>}
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

      {invited.length > 0 && (
        <section aria-label="Revancha" className="border-l-4 border-ink bg-paper-2/60 px-4 py-3 text-sm">
          <p className="font-semibold">Revancha: empieza cuando acepten todos.</p>
          <ul className="mt-2 space-y-1">
            {invited.map((id) => {
              const status = competition.participantIds.includes(id) ? 'aceptó' : declined.includes(id) ? 'rechazó' : 'pendiente';
              return (
                <li key={id} className="flex justify-between gap-4">
                  <span>{competition.invitedNames?.[id] ?? 'Jugador'}</span>
                  <span className={status === 'aceptó' ? 'text-ok' : status === 'rechazó' ? 'text-accent' : 'text-muted'}>{status}</span>
                </li>
              );
            })}
          </ul>
          {isHost && declined.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={changeParameters}>
                Cambiar parámetros
              </Button>
              <span className="text-xs text-muted">o inicia igual con quienes aceptaron.</span>
            </div>
          )}
        </section>
      )}

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
                  navigate('/jugar');
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
