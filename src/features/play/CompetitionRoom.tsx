// Sala de competencia: lobby (Firestore) -> juego en vivo (WebSocket al Durable Object) -> resultados (Firestore).
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveDoc, useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { useGameChannel } from '../../hooks/useGameChannel';
import { useReached } from '../../hooks/useNow';
import { cx } from '../../lib/utils';
import { gameDeadline, rankMetric } from '../../../shared/engine';
import type { Competition, Participant } from '../../../shared/types';
import { Badge, EmptyState, PageHeader, PageLoader } from '../../components/ui';
import { ChatPanel } from '../chat/ChatPanel';
import { BossBar } from './BossBar';
import { DeviceNotice } from './DeviceNotice';
import { FaintOverlay } from './FaintOverlay';
import { RivalToasts } from './RivalToasts';
import { EventFeed } from './EventFeed';
import { LobbyView } from './LobbyView';
import { PlayView } from './PlayView';
import { ResultsView } from './ResultsView';
import { Scoreboard } from './Scoreboard';
import { GameClock, StartCountdown } from './GameClock';

export default function CompetitionRoom() {
  const { competitionId = '' } = useParams();
  const { profile } = useSession();
  const { friendIds } = useFriends(profile.uid);

  const competition = useLiveDoc<Competition>(doc(db, 'competitions', competitionId), [competitionId]);
  const comp = competition.data;
  const isLive = comp?.status === 'live';

  // Lobby y resultados leen Firestore; en vivo, todo llega por WebSocket.
  const lobbyParticipants = useLiveQuery<Participant>(
    isLive ? null : collection(db, 'competitions', competitionId, 'participants'),
    [competitionId, isLive],
  );
  const game = useGameChannel(competitionId, isLive);
  const offset = game.clockOffsetMs;

  const live = isLive ? game.state : null;
  const startedAt = live?.startedAt ?? comp?.startedAt ?? null;
  const deadline = live ? gameDeadline(live) : (comp?.endsAt ?? null);
  // Sin intervalos: solo se re-renderiza al empezar y al vencer el plazo (los relojes se pintan aparte).
  const started = useReached(isLive ? startedAt : null, offset);
  const expired = useReached(live ? deadline : null, offset);
  const participants = useMemo(
    () => (live ? Object.values(live.participants) : lobbyParticipants.data),
    [live, lobbyParticipants.data],
  );
  const chatTarget = useMemo(() => ({ kind: 'competition' as const, competitionId }), [competitionId]);

  if (competition.loading) return <PageLoader />;
  if (!comp) return <EmptyState title="Esta competencia no existe o fue cancelada" />;

  const isParticipant = comp.participantIds.includes(profile.uid);
  const canJoin = comp.visibility !== 'friends' || comp.hostId === profile.uid || friendIds.includes(comp.hostId);
  const countdown = isLive && startedAt !== null && !started;
  const ended = live !== null && (live.status === 'finished' || expired);
  const total = live
    ? live.config.flow === 'rounds' && live.config.mode === 'count'
      ? live.config.targetCount
      : live.crypticIds.length
    : comp.crypticIds.length;

  return (
    <>
      <PageHeader
        kicker={`Anfitrión: ${comp.hostName}`}
        title={comp.title}
        action={
          isLive &&
          !countdown && (
            <div className="flex items-center gap-3">
              {live?.overtimeEndsAt !== null && live?.overtimeEndsAt !== undefined && <Badge tone="accent">Prórroga</Badge>}
              <span
                title={game.connection === 'open' ? 'Conectado' : 'Reconectando'}
                className={cx('size-2 rounded-full', game.connection === 'open' ? 'bg-ok' : 'animate-pulse bg-accent')}
              />
              {deadline !== null && <GameClock deadline={deadline} offsetMs={offset} />}
            </div>
          )
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {comp.status !== 'finished' && <DeviceNotice participants={participants} />}
          {comp.status === 'lobby' && (
            <LobbyView competition={comp} participants={participants} profile={profile} canJoin={canJoin} />
          )}

          {countdown && startedAt !== null && (
            <StartCountdown startedAt={startedAt} offsetMs={offset} />
          )}

          {isLive && !countdown && (
            !live ? (
              <PageLoader />
            ) : ended ? (
              <EmptyState title="¡Fin!">Calculando resultados…</EmptyState>
            ) : !isParticipant || !live.participants[profile.uid] ? (
              <EmptyState title="Estás mirando como espectador">La partida ya comenzó.</EmptyState>
            ) : (
              <>
                {live.boss && <BossBar hp={live.boss.hp} maxHp={live.boss.maxHp} level={live.config.bossLevel} />}
                <PlayView state={live} uid={profile.uid} actions={game.actions} />
                <RivalToasts state={live} uid={profile.uid} />
                {live.round?.closesAt != null && !live.round.solvedBy.includes(profile.uid) && (
                  <FaintOverlay closesAt={live.round.closesAt} totalMs={live.config.rivalCountdownSec * 1000} offsetMs={offset} />
                )}
              </>
            )
          )}

          {comp.status === 'finished' && <ResultsView competition={comp} meId={profile.uid} />}
        </div>

        <aside className="space-y-6">
          {comp.status !== 'lobby' && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Marcador</h3>
              <Scoreboard
                participants={participants}
                meId={profile.uid}
                total={total}
                metric={live ? rankMetric(live.config) : 'score'}
                hideScores={live !== null && live.config.hideScoreboard && live.status === 'live'}
                isBoss={comp.mode === 'boss'}
              />
            </section>
          )}
          {live && <EventFeed state={live} />}
          {isParticipant && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Chat de sala</h3>
              <ChatPanel target={chatTarget} compact />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
