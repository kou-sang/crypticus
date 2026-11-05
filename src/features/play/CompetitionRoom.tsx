// Sala de competencia: lobby (Firestore) -> juego en vivo (WebSocket al Durable Object) -> resultados (Firestore).
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveDoc, useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { useGameChannel } from '../../hooks/useGameChannel';
import { useNow } from '../../hooks/useNow';
import { formatClock, cx } from '../../lib/utils';
import { ApiError } from '../../lib/api';
import type { Competition, Participant } from '../../../shared/types';
import { EmptyState, PageHeader, PageLoader } from '../../components/ui';
import { ChatPanel } from '../chat/ChatPanel';
import { LobbyView } from './LobbyView';
import { PlayView, type GameActions } from './PlayView';
import { ResultsView } from './ResultsView';
import { Scoreboard } from './Scoreboard';

export default function CompetitionRoom() {
  const { competitionId = '' } = useParams();
  const { profile } = useSession();
  const { friendIds } = useFriends(profile.uid);

  const competition = useLiveDoc<Competition>(doc(db, 'competitions', competitionId), [competitionId]);
  const comp = competition.data;
  const isLive = comp?.status === 'live';

  // Lobby y resultados leen Firestore; en vivo, el marcador llega por WebSocket.
  const lobbyParticipants = useLiveQuery<Participant>(
    isLive ? null : collection(db, 'competitions', competitionId, 'participants'),
    [competitionId, isLive],
  );
  const game = useGameChannel(competitionId, isLive);
  const now = useNow(250, isLive) + game.clockOffsetMs;

  const actions = useMemo<GameActions>(
    () => ({
      answer: (crypticId, guess) =>
        game.channel ? game.channel.answer(crypticId, guess) : Promise.reject(new ApiError('offline', 'Conectando…', 0)),
      hint: (crypticId, reveal) =>
        game.channel ? game.channel.hint(crypticId, reveal) : Promise.reject(new ApiError('offline', 'Conectando…', 0)),
    }),
    [game.channel],
  );

  if (competition.loading) return <PageLoader />;
  if (!comp) return <EmptyState title="Esta competencia no existe o fue cancelada" />;

  const participants = isLive ? game.participants : lobbyParticipants.data;
  const isParticipant = comp.participantIds.includes(profile.uid);
  const me = participants.find((p) => p.uid === profile.uid);
  const canJoin = comp.visibility !== 'friends' || comp.hostId === profile.uid || friendIds.includes(comp.hostId);
  const countdown = isLive && comp.startedAt !== null && now < comp.startedAt;
  const remaining = comp.endsAt !== null ? comp.endsAt - now : 0;
  const ended = isLive && (game.finished || remaining <= 0);

  return (
    <>
      <PageHeader
        kicker={`Anfitrión: ${comp.hostName}`}
        title={comp.title}
        action={
          isLive &&
          !countdown && (
            <div className="flex items-center gap-3">
              <span
                title={game.connection === 'open' ? 'Conectado' : 'Reconectando'}
                className={cx('size-2 rounded-full', game.connection === 'open' ? 'bg-ok' : 'animate-pulse bg-accent')}
              />
              <div className={cx('font-mono text-4xl font-semibold tabular-nums', remaining < 30_000 && 'text-accent')}>
                {formatClock(remaining)}
              </div>
            </div>
          )
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {comp.status === 'lobby' && (
            <LobbyView competition={comp} participants={participants} profile={profile} canJoin={canJoin} />
          )}

          {countdown && comp.startedAt !== null && (
            <div className="flex min-h-[40dvh] flex-col items-center justify-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Comienza en</p>
              <p key={Math.ceil((comp.startedAt - now) / 1000)} className="font-display text-9xl fade-in">
                {Math.ceil((comp.startedAt - now) / 1000)}
              </p>
            </div>
          )}

          {isLive && !countdown && (
            ended ? (
              <EmptyState title="¡Fin!">Calculando resultados…</EmptyState>
            ) : !isParticipant ? (
              <EmptyState title="Estás mirando como espectador">La partida ya comenzó.</EmptyState>
            ) : me ? (
              <PlayView competition={comp} me={me} actions={actions} />
            ) : (
              <PageLoader />
            )
          )}

          {comp.status === 'finished' && <ResultsView competition={comp} meId={profile.uid} />}
        </div>

        <aside className="space-y-6">
          {comp.status !== 'lobby' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Marcador</h3>
              <Scoreboard competition={comp} participants={participants} meId={profile.uid} />
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
