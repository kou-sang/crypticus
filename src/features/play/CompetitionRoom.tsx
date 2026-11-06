// Sala de competencia: lobby (Firestore) -> juego en vivo (WebSocket al Durable Object) -> resultados (Firestore).
import { useParams } from 'react-router';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveDoc, useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { useGameChannel } from '../../hooks/useGameChannel';
import { useNow } from '../../hooks/useNow';
import { formatClock, cx } from '../../lib/utils';
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
  const now = useNow(250, isLive) + game.clockOffsetMs;

  if (competition.loading) return <PageLoader />;
  if (!comp) return <EmptyState title="Esta competencia no existe o fue cancelada" />;

  const live = isLive ? game.state : null;
  const participants = live ? Object.values(live.participants) : lobbyParticipants.data;
  const isParticipant = comp.participantIds.includes(profile.uid);
  const canJoin = comp.visibility !== 'friends' || comp.hostId === profile.uid || friendIds.includes(comp.hostId);
  const startedAt = live?.startedAt ?? comp.startedAt;
  const countdown = isLive && startedAt !== null && now < startedAt;
  const deadline = live ? gameDeadline(live) : (comp.endsAt ?? 0);
  const remaining = deadline - now;
  const ended = live !== null && (live.status === 'finished' || remaining <= 0);
  const total = live
    ? live.config.flow === 'rounds'
      ? live.config.mode === 'count'
        ? live.config.targetCount
        : live.crypticIds.length
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
              <div className={cx('font-mono text-4xl font-semibold tabular-nums', remaining < 30_000 && 'text-accent')}>
                {formatClock(remaining)}
              </div>
            </div>
          )
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          {comp.status !== 'finished' && <DeviceNotice participants={participants} />}
          {comp.status === 'lobby' && (
            <LobbyView competition={comp} participants={participants} profile={profile} canJoin={canJoin} />
          )}

          {countdown && startedAt !== null && (
            <div className="flex min-h-[40dvh] flex-col items-center justify-center">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">Comienza en</p>
              <p key={Math.ceil((startedAt - now) / 1000)} className="font-display text-9xl fade-in">
                {Math.ceil((startedAt - now) / 1000)}
              </p>
            </div>
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
                  <FaintOverlay closesAt={live.round.closesAt} totalMs={live.config.rivalCountdownSec * 1000} now={now} />
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
              <ChatPanel target={{ kind: 'competition', competitionId }} compact />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
