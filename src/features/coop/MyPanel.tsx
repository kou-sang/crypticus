// Panel propio (boceto): nombre y rol, vida, daño actual y oro; 4 casillas de objetos; pasiva y activa.
import { memo, useState } from 'react';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import { ITEMS, WEAPON_VARIANT_NAMES, type DamageType } from '../../../shared/coop/catalog/items';
import { gameTime } from '../../../shared/coop/engine';
import { INVENTORY_SLOTS } from '../../../shared/coop/balance';
import type { CoopClientAction, CoopReply } from '../../../shared/coop/protocol';
import type { CoopState, ItemInstance, PlayerState } from '../../../shared/coop/state';
import { armor, attackPower, maxHp } from '../../../shared/coop/stats';
import { Button } from '../../components/ui';
import { cx, errorMessage } from '../../lib/utils';
import { HpBar } from './Arena';
import { ItemSilhouette } from './silhouettes';

const DAMAGE_TYPE_LABEL = (type: DamageType) =>
  `${type.kind === 'physical' ? 'Físico' : 'Mágico'} · ${type.range === 'melee' ? 'cuerpo a cuerpo' : 'a distancia'}`;

export function itemName(item: Pick<ItemInstance, 'itemId' | 'variant'>): string {
  return item.itemId === 'commonWeapon' && item.variant ? WEAPON_VARIANT_NAMES[item.variant] : ITEMS[item.itemId].name;
}

const USABLE = new Set(['healingPotion', 'strengthPotion', 'davidHarp']);

export const MyPanel = memo(function MyPanel({
  state,
  me,
  now,
  act,
}: {
  state: CoopState;
  me: PlayerState;
  now: number;
  act: (action: CoopClientAction) => Promise<CoopReply>;
}) {
  const character = CHARACTERS[me.character];
  const [targetId, setTargetId] = useState('');
  const [amount, setAmount] = useState(20);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gt = gameTime(state, now);
  const boss = state.bosses[state.bossIndex];
  const allies = state.players.filter((p) => p.id !== me.id && p.status === 'alive');
  const needsTarget = character.target === 'ally' || character.target === 'allyAndAmount';
  const canAct = me.status === 'alive' && (state.phase === 'round' || state.phase === 'shop' || state.phase === 'decision');
  const usedThisRound = me.activeUsedRound === state.roundNumber;
  const noCharges = me.charges !== null && me.charges <= 0;

  const run = (action: CoopClientAction) => {
    setError(null);
    act(action).catch((err: unknown) => setError(errorMessage(err)));
  };

  const useActive = () => {
    if (character.confirm && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    run({ kind: 'active', ...(needsTarget ? { targetId } : {}), ...(character.target === 'allyAndAmount' ? { amount } : {}) });
  };

  const slots: Array<ItemInstance | null> = [...me.inventory, ...Array<null>(Math.max(0, INVENTORY_SLOTS - me.inventory.length)).fill(null)];

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)] gap-3">
      <section aria-label="Tu personaje" className="surface flex min-h-0 flex-col gap-2 overflow-hidden border-2 border-ink p-2.5">
        <p className="shrink-0 truncate border border-ink px-3 py-1 text-sm font-semibold">
          {me.name} — <span className="uppercase">{character.name}</span>
          {me.status !== 'alive' && <span className="ml-2 text-accent">{me.status === 'dead' ? 'Caído' : 'Saliste'}</span>}
        </p>
        <div className="grid shrink-0 grid-cols-[minmax(0,1.4fr)_auto_auto] items-center gap-4 border border-ink px-3 py-1.5 text-sm">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Vida</p>
            <HpBar hp={me.hp} max={maxHp(state, me)} className="h-4" />
          </div>
          <div title={DAMAGE_TYPE_LABEL(me.damageType)}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Daño actual</p>
            <p className="font-mono text-base font-bold leading-tight">{Math.round(attackPower(state, me, gt, boss?.id === 'goliath'))}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Oro</p>
            <p className="font-mono text-base font-bold leading-tight">{me.gold}</p>
          </div>
        </div>
        <p className="shrink-0 truncate text-xs text-muted">
          {DAMAGE_TYPE_LABEL(me.damageType)} · Armadura {Math.round(armor(me, gt))} · Pistas {me.hints}
        </p>
        <ul className="grid min-h-0 flex-1 grid-cols-4 gap-2">
          {slots.map((item, index) => (
            <li key={item?.uid ?? `empty${index}`}>
              {item ? (
                <button
                  type="button"
                  disabled={!USABLE.has(item.itemId) || !canAct || (item.itemId === 'davidHarp' && !me.harpReady)}
                  onClick={() => run({ kind: 'item', itemUid: item.uid, ...(item.itemId === 'davidHarp' && targetId ? { targetId } : {}) })}
                  title={ITEMS[item.itemId].description}
                  className="flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden border border-ink p-1.5 text-center text-[11px] font-semibold leading-tight enabled:hover:bg-paper-2 disabled:cursor-default"
                >
                  <span className="coop-halo shrink-0">
                    <ItemSilhouette id={item.itemId} className="size-7" />
                  </span>
                  <span className="line-clamp-2">{itemName(item)}</span>
                  {USABLE.has(item.itemId) && <span className="text-[10px] font-normal text-muted">{item.itemId === 'davidHarp' ? (me.harpReady ? 'Usar' : 'Recargando') : 'Usar'}</span>}
                </button>
              ) : (
                <div className="flex h-full w-full items-center justify-center border border-dashed border-line text-[11px] text-muted">Vacío</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Habilidades" className="surface flex min-h-0 flex-col gap-2 overflow-y-auto border-2 border-ink p-2.5 text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Pasiva</p>
          <p className="leading-snug">{character.passive}</p>
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            Activa · {me.charges === null ? 'sin límite' : `${me.charges}/${character.maxCharges} cargas`}
          </p>
          <p className="leading-snug">{character.active}</p>
        </div>
        {(needsTarget || me.inventory.some((i) => i.itemId === 'davidHarp')) && (
          <select
            aria-label="Aliado"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="border border-ink bg-paper px-2 py-1 text-sm"
          >
            <option value="">Elegir aliado…</option>
            {allies.map((ally) => (
              <option key={ally.id} value={ally.id}>
                {ally.name} ({ally.hp} HP)
              </option>
            ))}
          </select>
        )}
        {character.target === 'allyAndAmount' && (
          <label className="flex items-center gap-2 text-xs">
            Vida a dar
            <input
              type="number"
              min={1}
              max={Math.max(1, me.hp - 1)}
              value={amount}
              onChange={(event) => setAmount(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
              className="w-20 border border-ink bg-paper px-2 py-1 font-mono"
            />
          </label>
        )}
        <Button
          variant={confirming ? 'danger' : 'primary'}
          disabled={!canAct || usedThisRound || noCharges || (needsTarget && !targetId)}
          onClick={useActive}
          onBlur={() => setConfirming(false)}
        >
          {confirming ? '¿Seguro? Confirmar' : usedThisRound ? 'Usada esta ronda' : 'Usar activa'}
        </Button>
        {error && <p className={cx('text-xs text-accent')}>{error}</p>}
      </section>
    </div>
  );
});
