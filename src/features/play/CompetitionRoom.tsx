// Sala de competencia: lobby (Firestore) -> juego en vivo (WebSocket al Durable Object) -> resultados (Firestore).
import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useSession } from '../../hooks/useAuth';
import { useLiveDoc, useLiveQuery } from '../../hooks/useFirestore';
import { useFriends } from '../../hooks/useFriends';
import { useGameChannel } from '../../hooks/useGameChannel';
import { useReached } from '../../hooks/useNow';
import { cx } from '../../lib/utils';
import { setPlaying } from '../../lib/playing';
import { releaseKeyboard } from './keyboardInput';
import { gameDeadline, rankMetric } from '../../../shared/engine';
import type { Competition, Participant } from '../../../shared/types';
import { Badge, EmptyState, PageHeader, PageLoader } from '../../components/ui';
import { BackLink } from '../../components/BackLink';
import { ChatPanel } from '../chat/ChatPanel';
import { DeviceNotice } from './DeviceNotice';
import { FaintOverlay } from './FaintOverlay';
import { RivalToasts } from './RivalToasts';
import { gameEventLines } from './EventFeed';
import { LobbyView } from './LobbyView';
import { PlayView } from './PlayView';
import { ResultsView } from './ResultsView';
import { Scoreboard } from './Scoreboard';
import { EndVote } from './EndVote';
import { GameClock, StartCountdown } from './GameClock';
import { CoopLive } from '../coop/CoopLive';

export default function CompetitionRoom() {
  const { competitionId = '' } = useParams();
  const { profile } = useSession();
  const { friendIds } = useFriends(profile.uid);

  const competition = useLiveDoc<Competition>(doc(db, 'competitions', competitionId), [competitionId]);
  const comp = competition.data;
  const isMember = comp?.participantIds.includes(profile.uid) ?? false;
  // El WebSocket se abre ya en el lobby: al iniciar, el estado llega directo del DO (sin esperar a Firestore).
  // COOP usa su propio canal (CoopLive): aquí solo los demás modos.
  const coopRoom = comp?.game === 'coop';
  const game = useGameChannel(competitionId, comp !== null && !coopRoom && comp.status !== 'finished' && (isMember || comp.status === 'live'));
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
  // Revancha: mismo chat que la sala anterior (`chatId`), escribiendo desde esta.
  const chatRoot = competition.data?.chatId ?? competitionId;
  const chatTarget = useMemo(() => ({ kind: 'competition' as const, competitionId: chatRoot, viaId: competitionId }), [chatRoot, competitionId]);
  // Avisos de la partida para el chat (se recalculan solo cuando cambian los eventos).
  const systemLines = useMemo(() => (live ? gameEventLines(live) : undefined), [live]);

  // Partida en curso para el resto de la app (barra inferior oculta, confirmación al salir, aviso al cerrar).
  const playingNow =
    comp !== null &&
    comp.participantIds.includes(profile.uid) &&
    live !== null &&
    live.status === 'live' &&
    !(expired && !live.tiebreak);
  useEffect(() => {
    setPlaying(playingNow);
    if (!playingNow) {
      releaseKeyboard();
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [playingNow]);
  // Al salir de la sala: se libera todo.
  useEffect(
    () => () => {
      setPlaying(false);
      releaseKeyboard();
    },
    [],
  );

  if (competition.loading) return <PageLoader />;
  if (!comp)
    return (
      <>
        <BackLink to="/jugar" />
        <EmptyState title="Esta competencia no existe o fue cancelada" />
      </>
    );

  const isParticipant = comp.participantIds.includes(profile.uid);
  // COOP en vivo: pantalla completa propia (lobby y resultados siguen siendo los comunes).
  if (coopRoom && comp.status === 'live') return <CoopLive competition={comp} profile={profile} />;
  const canJoin =
    comp.visibility !== 'friends' ||
    comp.hostId === profile.uid ||
    friendIds.includes(comp.hostId) ||
    (comp.invitedIds ?? []).includes(profile.uid);
  const countdown = isLive && startedAt !== null && !started;
  // Con muerte súbita en curso el reloj de la partida ya venció, pero el juego sigue.
  const ended = live !== null && (live.status === 'finished' || (expired && !live.tiebreak));
  // Durante la partida no se ofrece «Volver»: evita salir por accidente con un toque.
  const playing = isLive && !ended && isParticipant;
  const total = live
    ? live.config.mode === 'count'
      ? live.config.targetCount
      : live.crypticIds.length
    : comp.mode === 'count'
      ? comp.targetCount
      : (comp.clueCount ?? comp.crypticIds.length);

  return (
    <>
      {!playing && <BackLink to="/jugar" label="Volver a Jugar" />}
      <PageHeader kicker={`Anfitrión: ${comp.hostName}`} title={comp.title} />

      {/* Barra fija: el tiempo sigue a la vista al hacer scroll o con el teclado del móvil abierto. */}
      {isLive && !countdown && (
        <div className="sticky top-14 z-10 -mx-4 -mt-4 mb-6 flex items-center justify-end gap-3 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur">
          {live?.participants[profile.uid] && !live.config.royale && (
            <span className="mr-auto font-mono text-sm">
              {live.config.game === 'race' ? (
                <>
                  Tú: <strong>{live.participants[profile.uid]!.solvedIds.length}</strong>/{live.config.targetCount}
                </>
              ) : (
                <>
                  Tú: <strong>{live.participants[profile.uid]!.score}</strong> {live.config.duel ? 'de vida' : 'pts'}
                </>
              )}
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
          {(comp.status !== 'lobby' || isLive) && !(live?.config.game === 'race' && live.status === 'live') && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Marcador</h3>
              <Scoreboard
                participants={participants}
                meId={profile.uid}
                total={total}
                metric={live ? rankMetric(live.config) : 'score'}
                unit={comp.game === 'duel' ? 'vida' : undefined}
              />
            </section>
          )}
          {live?.status === 'live' && !ended && live.participants[profile.uid] && (
            <EndVote state={live} uid={profile.uid} actions={game.actions} />
          )}
          {/* Chat con los avisos de la partida intercalados (antes iban en una lista aparte). Los espectadores lo leen. */}
          {(isParticipant || live) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Chat de sala</h3>
              <ChatPanel target={chatTarget} compact readOnly={!isParticipant} systemLines={systemLines} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
