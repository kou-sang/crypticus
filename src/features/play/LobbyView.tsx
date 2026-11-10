// Sala de espera: unirse, salir, compartir enlace e iniciar.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Competition, Participant, UserProfile } from '../../../shared/types';
import { api } from '../../lib/api';
import { chooseTeam, deleteCompetition, joinCompetition, leaveCompetition } from '../../lib/repo';
import { assignTeams, isTeamDuel, startBlocker, TEAM_LABELS, TEAM_SIZE, type Team } from '../../../shared/teams';
import { RoomSettingsDialog } from './RoomSettingsDialog';
import { canPlayCoop, errorMessage } from '../../lib/utils';
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
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [editing, setEditing] = useState(false);

  const isHost = competition.hostId === profile.uid;
  const joined = competition.participantIds.includes(profile.uid);
  const full = competition.participantIds.length >= competition.maxPlayers;
  // Lo mismo que valida el servidor al iniciar (p. ej. Duel sin rival).
  const blocker = startBlocker(competition, competition.participantIds);
  const coop = competition.game === 'coop';
  // COOP es solo para PC o laptop: en el celular no se puede entrar.
  const deviceBlocked = coop && !canPlayCoop();
  const teamDuel = isTeamDuel(competition);
  const ordered = [...participants].sort((a, b) => a.joinedAt - b.joinedAt);
  const teams = teamDuel ? assignTeams(ordered.map((p) => p.uid), competition.teams ?? {}) : {};

  // Revancha: quien acepta entra a la sala; el anfitrión la inicia cuando quiera (ya no empieza sola).
  const invited = competition.rematchOf ? (competition.invitedIds ?? []) : [];
  const declined = competition.declinedIds ?? [];
  const allAccepted = invited.length > 0 && invited.every((id) => competition.participantIds.includes(id));

  // Editar la sala actual en una ventana: los que ya entraron siguen dentro y ven las reglas nuevas.
  const changeParameters = () => setEditing(true);
  const code = competition.code ?? null;
  // Enlace corto con el código (v1.0); salas anteriores usan la URL de la sala.
  const shareLink = code ? `${window.location.origin}/s/${code}` : window.location.href;

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

  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'code' && code ? code : shareLink);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setError(what === 'code' ? 'No se pudo copiar el código.' : 'No se pudo copiar el enlace.');
    }
  };

  return (
    <div className="space-y-6">
      {isHost && <RoomSettingsDialog competition={competition} open={editing} onClose={() => setEditing(false)} />}
      {code && (
        <section aria-label="Código de sala" className="surface flex flex-wrap items-center gap-4 border-2 border-ink px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Código de sala</p>
            <p className="room-code font-mono text-4xl font-bold tracking-[0.35em]">{code}</p>
          </div>
          <p className="min-w-40 flex-1 text-xs text-muted">
            {competition.visibility === 'private'
              ? 'Sala privada: solo se entra con este código o el enlace.'
              : competition.visibility === 'friends'
                ? 'Sala de amigos: la ven tus amigos; con el código o el enlace también se puede abrir.'
                : 'Sala pública: aparece en Jugar y también se entra con el código.'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void copy('code')}>
              {copied === 'code' ? '✓ Copiado' : 'Copiar código'}
            </Button>
            <Button variant="ghost" onClick={() => void copy('link')}>
              {copied === 'link' ? '✓ Copiado' : 'Copiar enlace'}
            </Button>
          </div>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Badge tone="ok">En sala</Badge>
        <Badge>{describeMode(competition)}</Badge>
        {describeModifiers(competition).map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
        {!competition.game && <Badge>{competition.maxHintsPerClue} pistas c/u</Badge>}
      </div>

      {teamDuel ? (
        <section aria-label="Equipos">
          <h2 className="mb-3 font-display text-xl">
            Equipos {competition.participantIds.length}/{competition.maxPlayers}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {([0, 1] as Team[]).map((team) => {
              const members = ordered.filter((p) => teams[p.uid] === team);
              const canMove = joined && teams[profile.uid] !== team && members.length < TEAM_SIZE;
              return (
                <div key={team} className="border border-ink p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">{TEAM_LABELS[team]} · vida compartida</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {members.map((p) => (
                      <li key={p.uid} className="flex items-center gap-2">
                        <Avatar name={p.displayName} size="sm" />
                        {p.uid === profile.uid ? 'Tú' : p.displayName}
                      </li>
                    ))}
                    {Array.from({ length: TEAM_SIZE - members.length }, (_, i) => (
                      <li key={`free${i}`} className="text-muted">Lugar libre</li>
                    ))}
                  </ul>
                  {canMove && (
                    <Button variant="ghost" className="mt-2" loading={busy === `team${team}`} onClick={() => run(`team${team}`, () => chooseTeam(competition.id, profile.uid, team))}>
                      Pasarme a {TEAM_LABELS[team]}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
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
      )}

      {deviceBlocked && (
        <p role="alert" className="border-l-4 border-accent pl-3 text-sm">
          COOP es solo para PC o laptop: abre esta sala desde una computadora.
        </p>
      )}

      {blocker && <p className="border-l-4 border-line pl-3 text-sm text-muted">{blocker}</p>}

      {invited.length > 0 && (
        <section aria-label="Revancha" className="border-l-4 border-ink bg-paper-2/60 px-4 py-3 text-sm">
          <p className="font-semibold">
            {allAccepted
              ? isHost
                ? 'Revancha: aceptaron todos. Inicia la partida cuando quieras.'
                : 'Revancha: aceptaron todos. Esperando a que el anfitrión la inicie.'
              : 'Revancha: el anfitrión la inicia cuando estén todos.'}
          </p>
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
              {!blocker && <span className="text-xs text-muted">o inicia igual con quienes aceptaron.</span>}
            </div>
          )}
        </section>
      )}

      <ErrorBanner error={error} />

      <div className="flex flex-wrap gap-3">
        {isHost ? (
          <>
            <Button loading={busy === 'start'} disabled={blocker !== null} onClick={() => run('start', () => api.start(competition.id))}>
              Iniciar competencia
            </Button>
            <Button variant="secondary" onClick={changeParameters}>
              Parámetros
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
            disabled={full || !canJoin || deviceBlocked}
            onClick={() => run('join', () => joinCompetition(competition.id, profile))}
          >
            {full ? 'Sala llena' : deviceBlocked ? 'Solo PC o laptop' : canJoin ? 'Unirme' : 'Solo amigos del anfitrión'}
          </Button>
        )}
        {!code && (
          <Button variant="ghost" onClick={() => void copy('link')}>
            {copied === 'link' ? '✓ Copiado' : 'Copiar enlace'}
          </Button>
        )}
      </div>

      {!isHost && joined && <p className="text-sm text-muted">Esperando a que {competition.hostName} inicie…</p>}
    </div>
  );
}
