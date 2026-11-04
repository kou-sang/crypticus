// Sala de competencia: orquesta lobby -> cuenta regresiva -> juego -> resultados.
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { api } from '../../lib/api';
import { useSession } from '../../hooks/useAuth';
import { useLiveDoc, useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { useNow } from '../../hooks/useNow';
import { formatClock, cx } from '../../lib/utils';
import type { Competition, Participant } from '../../../shared/types';
import { EmptyState, PageHeader, PageLoader } from '../../components/ui';
import { ChatPanel } from '../chat/ChatPanel';
import { LobbyView } from './LobbyView';
import { PlayView } from './PlayView';
import { ResultsView } from './ResultsView';
import { Scoreboard } from './Scoreboard';

export default function CompetitionRoom() {
  const { competitionId = '' } = useParams();
  const { profile } = useSession();
  const { friendIds } = useFriends(profile.uid);

  const competition = useLiveDoc<Competition>(doc(db, 'competitions', competitionId), [competitionId]);
  const participants = useLiveQuery<Participant>(collection(db, 'competitions', competitionId, 'participants'), [competitionId]);
  const comp = competition.data;
  const now = useNow(250, comp?.status === 'live');

  // Al expirar el tiempo, un participante solicita el cierre (idempotente en el servidor).
  const finalizeRequested = useRef(false);
  const isParticipant = comp?.participantIds.includes(profile.uid) ?? false;
  const expired = comp?.status === 'live' && comp.endsAt !== null && now >= comp.endsAt;
  useEffect(() => {
    if (!expired || !isParticipant || finalizeRequested.current) return;
    finalizeRequested.current = true;
    api.finalize(competitionId).catch((error: unknown) => {
      console.error('[room] finalize', error);
      finalizeRequested.current = false; // Reintenta en el siguiente tick.
    });
  }, [expired, isParticipant, competitionId]);

  if (competition.loading) return <PageLoader />;
  if (!comp) return <EmptyState title="Esta competencia no existe o fue cancelada" />;

  const me = participants.data.find((p) => p.uid === profile.uid);
  const canJoin = comp.visibility !== 'friends' || comp.hostId === profile.uid || friendIds.includes(comp.hostId);
  const countdown = comp.status === 'live' && comp.startedAt !== null && now < comp.startedAt;
  const remaining = comp.endsAt !== null ? comp.endsAt - now : 0;

  return (
    <>
      <PageHeader
        kicker={`Anfitrión: ${comp.hostName}`}
        title={comp.title}
        action={
          comp.status === 'live' &&
          !countdown && (
            <div
              className={cx(
                'font-mono text-4xl font-semibold tabular-nums',
                remaining < 30_000 && 'text-accent',
              )}
              aria-live="off"
            >
              {formatClock(remaining)}
            </div>
          )
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {comp.status === 'lobby' && (
            <LobbyView competition={comp} participants={participants.data} profile={profile} canJoin={canJoin} />
          )}

          {countdown && comp.startedAt !== null && (
            <div className="flex min-h-[40dvh] flex-col items-center justify-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Comienza en</p>
              <p key={Math.ceil((comp.startedAt - now) / 1000)} className="font-display text-9xl fade-in">
                {Math.ceil((comp.startedAt - now) / 1000)}
              </p>
            </div>
          )}

          {comp.status === 'live' && !countdown && (me ? (
            expired ? (
              <EmptyState title="¡Tiempo!">Calculando resultados…</EmptyState>
            ) : (
              <PlayView competition={comp} me={me} />
            )
          ) : (
            <EmptyState title="Estás mirando como espectador">La partida ya comenzó.</EmptyState>
          ))}

          {comp.status === 'finished' && <ResultsView competition={comp} meId={profile.uid} />}
        </div>

        <aside className="space-y-6">
          {comp.status !== 'lobby' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Marcador</h3>
              <Scoreboard competition={comp} participants={participants.data} meId={profile.uid} />
            </section>
          )}
          {isParticipant && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Chat de sala</h3>
              <ChatPanel target={{ kind: 'competition', competitionId }} compact />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
