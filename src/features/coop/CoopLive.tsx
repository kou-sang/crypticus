// Partida COOP en vivo: explicación previa y partida. Versión funcional mínima (PR 2/4): valida el circuito
// servidor ↔ cliente. El PR 3 la reemplaza por la pantalla de los bocetos (círculo, zona de cripticos, tienda).
import { useEffect, useState, type FormEvent } from 'react';
import { BOSSES } from '../../../shared/coop/catalog/bosses';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import { ITEMS } from '../../../shared/coop/catalog/items';
import { currentBoss, gameTime, offerPrice } from '../../../shared/coop/engine';
import type { CoopClientAction } from '../../../shared/coop/protocol';
import type { Competition, UserProfile } from '../../../shared/types';
import { Button, EmptyState, ErrorBanner, PageLoader } from '../../components/ui';
import { useCoopChannel } from '../../hooks/useCoopChannel';
import { canPlayCoop, errorMessage } from '../../lib/utils';

function useServerNow(offsetMs: number, everyMs = 500): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offsetMs), everyMs);
    return () => window.clearInterval(id);
  }, [offsetMs, everyMs]);
  return now;
}

const seconds = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))} s`;

export function CoopLive({ competition, profile }: { competition: Competition; profile: UserProfile }) {
  const allowed = canPlayCoop();
  const { view, connection, clockOffsetMs, act } = useCoopChannel(competition.id, allowed);
  const now = useServerNow(clockOffsetMs);
  const [error, setError] = useState<string | null>(null);
  const [guess, setGuess] = useState<Record<number, string>>({});

  if (!allowed) return <EmptyState title="COOP es solo para PC o laptop">Abre esta sala desde una computadora.</EmptyState>;
  if (!view) return <PageLoader />;

  const send = async (action: CoopClientAction) => {
    setError(null);
    try {
      const reply = await act(action);
      if (reply.correct === false) setError('No es correcto.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (view.briefing) {
    const ready = view.briefing.ready.includes(profile.uid);
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="font-display text-3xl">COOP {view.level}</h1>
        <p>
          Derroten a los jefes antes de que se acabe el tiempo. En cada ronda normal resuelve tus 2 cripticos para atacar y ganar oro; si no,
          el jefe te golpea. En las rondas difíciles todos deben resolver el suyo: si lo logran, atacan y se abre la tienda.
        </p>
        <p className="text-sm text-muted">
          Empieza en {seconds(view.briefing.endsAt - now)} o cuando todos estén listos ({view.briefing.ready.length}/{view.players.length}).
        </p>
        <Button disabled={ready} onClick={() => void send({ kind: 'ready' })}>
          {ready ? 'Listo' : 'Estoy listo'}
        </Button>
        <ErrorBanner error={error} />
      </div>
    );
  }

  const game = view.game;
  if (!game) return <PageLoader />;
  const gt = gameTime(game, now);
  const boss = currentBoss(game);
  const me = game.players.find((p) => p.id === profile.uid);

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-muted">
        {connection !== 'open' ? 'Reconectando… · ' : ''}Tiempo restante {seconds(game.totalMs - gt)} · Ronda {game.roundNumber} ({game.roundKind ?? '—'}) ·
        Fase {game.phase}
      </p>
      {boss && (
        <p className="font-display text-2xl">
          {BOSSES[boss.id].name} · {boss.hp}/{boss.maxHp} HP{boss.haman.rex ? ` · REX ASSUERUS ${boss.haman.rex.hp}` : ''}
        </p>
      )}
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {game.players.map((p) => (
          <li key={p.id} className={p.id === profile.uid ? 'font-semibold' : ''}>
            {p.name} · {CHARACTERS[p.character].name} · {p.status === 'alive' ? `${p.hp} HP` : p.status} · {p.gold} oro
          </li>
        ))}
      </ul>

      {game.phase === 'round' && game.roundEndsGt !== null && <p>Termina en {seconds(game.roundEndsGt - gt)}</p>}
      {view.mine.cryptics.map((cryptic) => (
        <form
          key={cryptic.slot}
          className="border border-line p-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void send({ kind: 'answer', slot: cryptic.slot, guess: guess[cryptic.slot] ?? '' });
          }}
        >
          <p>
            {cryptic.clue ?? cryptic.crypticId} {cryptic.enumeration ?? ''} <span className="text-xs text-muted">({cryptic.tier})</span>
          </p>
          {cryptic.hints.map((hint) => (
            <p key={hint} className="text-sm text-muted">
              Pista: {hint}
            </p>
          ))}
          {cryptic.solved ? (
            <p className="text-ok">✓ Resuelto</p>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                className="border border-line bg-paper px-2 py-1"
                value={guess[cryptic.slot] ?? ''}
                onChange={(e) => setGuess((g) => ({ ...g, [cryptic.slot]: e.target.value }))}
              />
              <Button type="submit">Responder</Button>
            </div>
          )}
        </form>
      ))}

      {me && me.status === 'alive' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void send({ kind: 'hint' })}>
            Pista ({me.hints})
          </Button>
          <Button variant="secondary" onClick={() => void send({ kind: 'active' })}>
            Activa ({me.charges ?? '∞'})
          </Button>
          {me.inventory.map((item) => (
            <Button key={item.uid} variant="ghost" onClick={() => void send({ kind: 'item', itemUid: item.uid })}>
              {ITEMS[item.itemId].name}
            </Button>
          ))}
        </div>
      )}

      {game.phase === 'decision' && game.decisions[0] && (
        <div className="flex gap-2">
          <span>Oferta de PHARAONIS ({game.decisions[0].kind})</span>
          <Button onClick={() => void send({ kind: 'vote', decisionId: game.decisions[0]!.id, accept: true })}>Aceptar</Button>
          <Button variant="secondary" onClick={() => void send({ kind: 'vote', decisionId: game.decisions[0]!.id, accept: false })}>
            Rechazar
          </Button>
        </div>
      )}

      {game.phase === 'shop' && game.shop && me && (
        <div className="space-y-2 border border-ink p-3">
          <p>Tienda · cierra en {seconds(game.shop.endsGt - gt)}</p>
          {(game.shop.offers[me.id] ?? []).map((offer) => (
            <div key={offer.id} className="flex items-center gap-2">
              <span>{offer.itemId ? ITEMS[offer.itemId].name : offer.kind}</span>
              <span className="font-mono text-sm">{offerPrice(game, me, offer)} oro</span>
              <Button variant="secondary" disabled={offer.sold} onClick={() => void send({ kind: 'buy', offerId: offer.id })}>
                {offer.sold ? 'Comprado' : 'Comprar'}
              </Button>
            </div>
          ))}
          <Button onClick={() => void send({ kind: 'shopDone' })}>Listo</Button>
        </div>
      )}

      {game.result && <p className="font-display text-3xl">{game.result.won ? '¡Victoria!' : 'Derrota'}</p>}
      <ErrorBanner error={error} />
    </div>
  );
}
