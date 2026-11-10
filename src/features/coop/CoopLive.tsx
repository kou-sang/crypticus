// Partida COOP en vivo, en pantalla completa (boceto): arena arriba; zona de cripticos, panel propio y
// habilidades abajo; tienda en una ventana. Antes de empezar, la explicación y la presentación de jefes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { coopLevelLabel } from '../../../shared/coop/balance';
import { gameTime } from '../../../shared/coop/engine';
import type { CoopClientAction, CoopReply } from '../../../shared/coop/protocol';
import type { CoopState } from '../../../shared/coop/state';
import type { Competition, UserProfile } from '../../../shared/types';
import { EmptyState, PageLoader } from '../../components/ui';
import { useCoopChannel } from '../../hooks/useCoopChannel';
import { setPlaying } from '../../lib/playing';
import { playCue } from '../../lib/sound';
import { canPlayCoop, cx, errorMessage } from '../../lib/utils';
import { Arena } from './Arena';
import { Briefing } from './Briefing';
import { DraftWindow } from './DraftWindow';
import { CrypticZone } from './CrypticZone';
import { MyPanel } from './MyPanel';
import { PlayerDetails } from './PlayerDetails';
import { ShopWindow } from './ShopWindow';
import { useCoopFx } from './useCoopFx';

/** Hora del servidor, refrescada cada `everyMs` (los relojes de la pantalla). */
function useServerNow(offsetMs: number, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), everyMs);
    return () => window.clearInterval(id);
  }, [offsetMs, everyMs]);
  return now;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * Pantalla completa automática: se intenta al montar (sirve si el clic de «Iniciar» es reciente) y, si el
 * navegador lo bloquea, con el primer clic o tecla del jugador (exigen un gesto). Si el jugador sale con Esc,
 * no se vuelve a forzar: queda el botón. Al desmontar se sale.
 */
function useCoopFullscreen() {
  const [isFull, setIsFull] = useState(() => typeof document !== 'undefined' && document.fullscreenElement !== null);
  const userExited = useRef(false);
  const request = useCallback(() => {
    try {
      if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
    } catch {
      // Navegadores sin la API: se juega en la ventana.
    }
  }, []);
  useEffect(() => {
    let wasFull = document.fullscreenElement !== null;
    const onChange = () => {
      const full = document.fullscreenElement !== null;
      if (wasFull && !full) userExited.current = true;
      wasFull = full;
      setIsFull(full);
    };
    const onGesture = () => {
      if (!userExited.current) request();
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    request();
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [request]);
  const enter = useCallback(() => {
    userExited.current = false;
    request();
  }, [request]);
  return { isFull, enter };
}

function FullscreenButton({ isFull, onEnter }: { isFull: boolean; onEnter: () => void }) {
  if (isFull) return null;
  return (
    <button type="button" onClick={onEnter} className="border border-ink px-3 py-1 text-sm font-semibold" title="Pantalla completa">
      ⛶ Pantalla completa
    </button>
  );
}

/**
 * Rendición por votación: «Rendirse» abre la votación (con confirmación); mientras está abierta, cada uno vota
 * sí o no. Un «no» no la cierra: solo pasa con el sí de todos los que siguen en la partida, o vence a los 30 s.
 */
function SurrenderControl({
  game,
  meId,
  now,
  act,
}: {
  game: CoopState;
  meId: string;
  now: number;
  act: (action: CoopClientAction) => Promise<CoopReply>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = game.players.find((p) => p.id === meId);
  const vote = game.surrender ?? null;
  useEffect(() => setError(null), [vote?.endsGt]);
  if (!me || me.status === 'left' || game.result) return null;

  const send = (accept: boolean) => {
    setError(null);
    setConfirming(false);
    act({ kind: 'surrender', accept }).catch((err: unknown) => setError(errorMessage(err)));
  };

  if (!vote) {
    return (
      <div className="flex items-center gap-2" onMouseLeave={() => setConfirming(false)}>
        {confirming ? (
          <button type="button" onClick={() => send(true)} className="coop-enter border-2 border-accent px-3 py-1 text-sm font-semibold text-accent">
            ¿Proponer rendirse?
          </button>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="border border-ink px-3 py-1 text-sm">
            Rendirse
          </button>
        )}
        {error && <span className="text-xs text-accent">{error}</span>}
      </div>
    );
  }

  const voters = game.players.filter((p) => p.status !== 'left');
  const mine = vote.yes.includes(meId);
  const left = Math.max(0, Math.ceil((vote.endsGt - gameTime(game, now)) / 1000));
  return (
    <div role="group" aria-label="Votación de rendición" className="coop-enter flex items-center gap-2 border-2 border-accent px-2 py-0.5 text-sm">
      <span className="font-semibold text-accent">
        ¿Rendirse? {vote.yes.length}/{voters.length}
      </span>
      <span className="font-mono text-xs tabular-nums text-muted">{left} s</span>
      <button
        type="button"
        aria-pressed={mine}
        onClick={() => send(true)}
        className={cx('border px-2 py-0.5 text-xs font-semibold', mine ? 'border-accent bg-accent text-paper' : 'border-ink')}
      >
        Sí
      </button>
      <button
        type="button"
        aria-pressed={!mine}
        onClick={() => send(false)}
        className={cx('border px-2 py-0.5 text-xs font-semibold', !mine ? 'border-ink bg-ink text-paper' : 'border-ink')}
      >
        No
      </button>
      {error && <span className="text-xs text-accent">{error}</span>}
    </div>
  );
}

/** «Volver» con doble confirmación: salir deja al jugador fuera de combate y cuenta como derrota. */
function LeaveButton({ onLeave }: { onLeave: () => void }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  return (
    <div className="flex items-center gap-2" onMouseLeave={() => setStage(0)}>
      <button type="button" onClick={() => setStage(stage === 0 ? 1 : 0)} className="border-2 border-ink px-3 py-1 text-sm font-semibold uppercase">
        Volver
      </button>
      {stage === 1 && (
        <button type="button" onClick={() => setStage(2)} className="coop-enter border border-accent px-3 py-1 text-sm">
          ¿Salir de la partida?
        </button>
      )}
      {stage === 2 && (
        <button type="button" onClick={onLeave} className="coop-enter border-2 border-accent bg-accent px-3 py-1 text-sm font-semibold text-paper">
          Sí: quedo fuera y pierdo Elo
        </button>
      )}
    </div>
  );
}

export function CoopLive({ competition, profile }: { competition: Competition; profile: UserProfile }) {
  const navigate = useNavigate();
  const allowed = canPlayCoop();
  const { view, connection, clockOffsetMs, act, onEvents } = useCoopChannel(competition.id, allowed);
  const now = useServerNow(clockOffsetMs);
  const game = view?.game ?? null;
  const fx = useCoopFx(onEvents, game, profile.uid);
  const [details, setDetails] = useState<string | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const lowTimeRound = useRef(0);
  const fullscreen = useCoopFullscreen();

  const me = game?.players.find((p) => p.id === profile.uid) ?? null;
  const shopNumber = game?.phase === 'shop' ? game.shop?.number : undefined;

  // Partida en curso para el resto de la app: confirmación al cerrar la pestaña.
  const live = game !== null && !game.result;
  useEffect(() => {
    setPlaying(live);
    if (!live) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [live]);
  useEffect(() => () => setPlaying(false), []);

  // La tienda se abre sola al empezar (los caídos no tienen tienda).
  useEffect(() => {
    if (shopNumber !== undefined && me?.status === 'alive') setShopOpen(true);
    if (shopNumber === undefined) setShopOpen(false);
  }, [shopNumber, me?.status]);

  // Aviso de poco tiempo: una vez por ronda, a los 10 s.
  const roundLeft = game && game.phase === 'round' && game.roundEndsGt !== null ? game.roundEndsGt - gameTime(game, now) : null;
  useEffect(() => {
    if (!game || roundLeft === null || roundLeft > 10_000 || lowTimeRound.current === game.roundNumber) return;
    lowTimeRound.current = game.roundNumber;
    playCue('lowTime');
  }, [game, roundLeft]);

  if (!allowed) return <EmptyState title="COOP es solo para PC o laptop">Abre esta sala desde una computadora.</EmptyState>;

  const leave = () => {
    act({ kind: 'leave' })
      .catch(() => undefined)
      .finally(() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
        navigate('/jugar');
      });
  };

  // Portal al <body>: dentro de la página, la animación de entrada (transform) y la perspectiva del tema Cyber
  // convierten a `.page` en el contenedor de lo `fixed`, y la partida quedaba recortada a su altura.
  return createPortal(
    <div className="coop-screen fixed inset-0 z-40 flex flex-col overflow-hidden bg-paper text-ink">
      {/* Avisos grandes arriba de todo (muerte, resurrección, resultado). */}
      {fx.banners.map((banner, index) => (
        <p
          key={banner.id}
          role="status"
          className={cx(
            'coop-banner fixed left-1/2 z-50 border-2 px-8 py-3 font-display text-3xl font-semibold shadow-lg',
            banner.tone === 'death' && 'border-accent bg-paper text-accent',
            banner.tone === 'revive' && 'border-ok bg-paper text-ok',
            banner.tone === 'result' && 'border-ink bg-ink text-paper',
            banner.tone === 'boss' && 'border-ink bg-paper',
          )}
          style={{ top: 16 + index * 72 }}
        >
          {banner.text}
        </p>
      ))}

      {!view ? (
        <PageLoader />
      ) : view.draft || view.briefing ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3">
            <LeaveButton onLeave={leave} />
            <FullscreenButton isFull={fullscreen.isFull} onEnter={fullscreen.enter} />
          </div>
          <div className="min-h-0 flex-1">
            {view.draft ? (
              <DraftWindow view={view} meId={profile.uid} now={now} act={act} />
            ) : (
              <Briefing view={view} meId={profile.uid} now={now} act={act} />
            )}
          </div>
        </>
      ) : !game ? (
        <PageLoader />
      ) : (
        <>
          <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-ink px-4 py-1.5">
            <div className="flex items-center gap-2">
              <LeaveButton onLeave={leave} />
              <SurrenderControl game={game} meId={profile.uid} now={now} act={act} />
            </div>
            <p className="text-sm font-semibold uppercase tracking-widest">
              COOP {coopLevelLabel(game.level, game.stage)} · Jefe {Math.min(game.bossIndex + 1, game.bosses.length)}/{game.bosses.length}
              {game.roundNumber > 0 && ` · Ronda ${game.roundNumber}${game.roundKind === 'hard' ? ' (difícil)' : ''}`}
            </p>
            <div className="flex items-center justify-end gap-3">
              <FullscreenButton isFull={fullscreen.isFull} onEnter={fullscreen.enter} />
              {connection !== 'open' && <span className="text-xs text-accent">Reconectando…</span>}
              <span className={cx('font-mono text-lg font-bold tabular-nums', game.totalMs - gameTime(game, now) < 60_000 && 'text-accent')}>
                {clock(game.totalMs - gameTime(game, now))}
              </span>
            </div>
          </header>

          <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,0.95fr)_minmax(0,1fr)] gap-3 p-3">
            <Arena state={game} meId={profile.uid} floaters={fx.floaters} hits={fx.hits} heals={fx.heals} onSelect={setDetails} />
            <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-3">
              <CrypticZone
                state={game}
                me={me}
                cryptics={view.mine.cryptics}
                act={act}
                now={now}
                log={fx.log}
                lice={fx.lice}
                onOpenShop={() => setShopOpen(true)}
              />
              {me ? <MyPanel state={game} me={me} now={now} act={act} /> : <EmptyState title="Estás mirando la partida" />}
            </div>
          </main>

          {me && game.phase === 'shop' && me.status === 'alive' && (
            <ShopWindow state={game} me={me} now={now} open={shopOpen} onClose={() => setShopOpen(false)} act={act} />
          )}
          <PlayerDetails state={game} playerId={details} now={now} onClose={() => setDetails(null)} />
          {game.result && (
            <div className="coop-enter fixed bottom-6 left-1/2 z-50 -translate-x-1/2 border-2 border-ink bg-paper px-6 py-3 text-center shadow-lg">
              <p className="font-display text-2xl">{game.result.won ? '¡Victoria!' : game.result.surrendered ? 'Se rindieron' : 'Derrota'}</p>
              <p className="text-sm text-muted">Calculando resultados y Elo…</p>
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
