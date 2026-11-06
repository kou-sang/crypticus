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
import { EndVote } from './EndVote';
import { GameClock, StartCountdown } from './GameClock';

export default function CompetitionRoom() {
  const { competitionId = '' } = useParams();
  const { profile } = useSession();
  const { friendIds } = useFriends(profile.uid);

  const competition = useLiveDoc<Competition>(doc(db, 'competitions', competitionId), [competitionId]);
  const comp = competition.data;
  const isMember = comp?.participantIds.includes(profile.uid) ?? false;
  // El WebSocket se abre ya en el lobby: al iniciar, el estado llega directo del DO (sin esperar a Firestore).
  const game = useGameChannel(competitionId, comp !== null && comp.status !== 'finished' && (isMember || comp.status === 'live'));
  const offset = game.clockOffsetMs;
  const isLive = comp?.status === 'live' || (comp?.status === 'lobby' && game.state !== null);

  // Lobby y resultados leen Firestore; en vivo, todo llega por WebSocket.
  const lobbyParticipants = useLiveQuery<Participant>(
    isLive ? null : collection(db, 'competitions', competitionId, 'participants'),
    [competitionId, isLive],
  );

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
      <PageHeader kicker={`Anfitrión: ${comp.hostName}`} title={comp.title} />

      {/* Barra fija: el tiempo sigue a la vista al hacer scroll o con el teclado del móvil abierto. */}
      {isLive && !countdown && (
        <div className="sticky top-14 z-10 -mx-4 -mt-4 mb-6 flex items-center justify-end gap-3 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur">
          {live?.participants[profile.uid] && !live.boss && !live.config.hideScoreboard && !live.config.royale && (
            <span className="mr-auto font-mono text-sm">
              Tú: <strong>{live.participants[profile.uid]!.score}</strong> {live.config.duel ? 'de vida' : 'pts'}
            </span>
          )}
          {live?.overtimeEndsAt != null && <Badge tone="accent">Prórroga</Badge>}
          <span
            title={game.connection === 'open' ? 'Conectado' : 'Reconectando'}
            className={cx('size-2 rounded-full', game.connection === 'open' ? 'bg-ok' : 'animate-pulse bg-accent')}
          />
          {game.rttMs !== null && (
            <span className="font-mono text-[11px] text-muted" title="Latencia con el servidor">
              {game.rttMs} ms
            </span>
          )}
          {/* En Royale cada jugador tiene su reloj (ver ChessClocks); el tope global no se muestra. */}
          {deadline !== null && !live?.config.royale && <GameClock deadline={deadline} offsetMs={offset} />}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {comp.status !== 'finished' && <DeviceNotice participants={participants} />}
          {comp.status === 'lobby' && !isLive && (
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
                <PlayView state={live} uid={profile.uid} actions={game.actions} solutions={game.solutions} offsetMs={offset} />
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
          {(comp.status !== 'lobby' || isLive) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Marcador</h3>
              <Scoreboard
                participants={participants}
                meId={profile.uid}
                total={total}
                metric={live ? rankMetric(live.config) : 'score'}
                hideScores={live !== null && live.config.hideScoreboard && live.status === 'live'}
                isBoss={comp.mode === 'boss'}
                unit={comp.game === 'duel' ? 'vida' : undefined}
              />
            </section>
          )}
          {live && <EventFeed state={live} />}
          {live?.status === 'live' && !ended && live.participants[profile.uid] && (
            <EndVote state={live} uid={profile.uid} actions={game.actions} />
          )}
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
