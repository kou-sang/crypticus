// Tienda COOP (boceto): ventana sobre la arena con el oro actual y una tarjeta por opción.
// La descripción va en un desplegable para que las tarjetas queden compactas.
import { memo, useState } from 'react';
import { CHARACTERS, CHARACTER_PARAMS } from '../../../shared/coop/catalog/characters';
import { ITEMS } from '../../../shared/coop/catalog/items';
import { INVENTORY_SLOTS } from '../../../shared/coop/balance';
import { gameTime, offerPrice } from '../../../shared/coop/engine';
import type { CoopClientAction, CoopReply } from '../../../shared/coop/protocol';
import type { CoopState, PlayerState, ShopOffer } from '../../../shared/coop/state';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/ui';
import { cx, errorMessage } from '../../lib/utils';
import { itemName } from './MyPanel';
import { CharacterSilhouette, ItemSilhouette } from './silhouettes';

function offerTitle(offer: ShopOffer): string {
  if (offer.kind === 'rechargeUrias') return `Recargar activa de ${CHARACTERS.urias.name}`;
  if (offer.kind === 'rechargeDebbora') return `Recargar activa de ${CHARACTERS.debbora.name}`;
  return itemName({ itemId: offer.itemId!, variant: offer.variant });
}

function offerDescription(offer: ShopOffer): string {
  if (offer.kind === 'rechargeUrias') return `Una carga más de tu activa (${CHARACTER_PARAMS.urias.rechargeCost} de oro).`;
  if (offer.kind === 'rechargeDebbora') return 'Una carga más de tu activa. Cada recarga cuesta 50 de oro más.';
  return ITEMS[offer.itemId!].description;
}

export const ShopWindow = memo(function ShopWindow({
  state,
  me,
  now,
  open,
  onClose,
  act,
}: {
  state: CoopState;
  me: PlayerState;
  now: number;
  open: boolean;
  onClose: () => void;
  act: (action: CoopClientAction) => Promise<CoopReply>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState('');
  const shop = state.shop;
  if (!shop) return null;
  const offers = shop.offers[me.id] ?? [];
  const left = Math.max(0, Math.ceil((shop.endsGt - gameTime(state, now)) / 1000));
  const full = me.inventory.length >= INVENTORY_SLOTS;
  const canSwap = shop.swapAvailable.includes(me.id);

  const run = async (key: string, action: CoopClientAction) => {
    setBusy(key);
    setError(null);
    try {
      await act(action);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Tienda${shop.free ? ' · ¡todo gratis!' : ''}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-sm">Cierra en {left} s</span>
          <Button loading={busy === 'done'} onClick={() => void run('done', { kind: 'shopDone' }).then(onClose)}>
            Listo
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Inventario {me.inventory.length}/{INVENTORY_SLOTS}
          {state.shopSurcharge > 0 && ` · recargo de HAMAN +${state.shopSurcharge}`}
        </p>
        <p className="border-2 border-ink px-4 py-2 font-mono text-xl font-bold">Oro {me.gold}</p>
      </div>
      {canSwap && (
        <div className="mb-4 flex flex-wrap items-center gap-2 border border-ink p-2 text-sm">
          <span>Hiram: intercambia tu tienda con</span>
          <select value={swapTarget} onChange={(event) => setSwapTarget(event.target.value)} className="border border-ink bg-paper px-2 py-1">
            <option value="">elegir jugador…</option>
            {state.players
              .filter((p) => p.id !== me.id && p.status === 'alive')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <Button variant="secondary" disabled={!swapTarget} loading={busy === 'swap'} onClick={() => void run('swap', { kind: 'swap', targetId: swapTarget })}>
            Intercambiar
          </Button>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {offers.map((offer) => {
          const price = offerPrice(state, me, offer);
          const item = offer.itemId ? ITEMS[offer.itemId] : null;
          const needsSlot = item ? item.storage !== 'instant' : false;
          const buyable = Number.isFinite(price);
          const blocked = offer.sold || !buyable || price > me.gold || (needsSlot && full);
          return (
            <li key={offer.id} className={cx('coop-enter flex flex-col gap-2 border-2 border-ink p-3', offer.sold && 'opacity-50')}>
              <p className="font-display text-lg leading-tight">{offerTitle(offer)}</p>
              <span className="coop-halo mx-auto">
                {item ? <ItemSilhouette id={item.id} className="size-20" /> : <CharacterSilhouette id={me.character} className="size-20" />}
              </span>
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-muted">Efecto</summary>
                <p className="mt-1 leading-snug">{offerDescription(offer)}</p>
              </details>
              <p className="mt-auto font-mono text-lg font-bold">{buyable ? `${price} oro` : 'No se compra'}</p>
              <Button disabled={blocked} loading={busy === offer.id} onClick={() => void run(offer.id, { kind: 'buy', offerId: offer.id })}>
                {offer.sold ? 'Comprado' : needsSlot && full ? 'Inventario lleno' : 'Comprar'}
              </Button>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-3 text-sm text-accent">{error}</p>}
    </Modal>
  );
});
