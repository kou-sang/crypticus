// Detalle de un jugador (clic en el círculo): vida, oro, objetos y habilidades.
import { memo } from 'react';
import { CHARACTERS } from '../../../shared/coop/catalog/characters';
import { ITEMS } from '../../../shared/coop/catalog/items';
import { statusEffects } from '../../../shared/coop/effects';
import { gameTime } from '../../../shared/coop/engine';
import type { CoopState } from '../../../shared/coop/state';
import { armor, attackPower, maxHp } from '../../../shared/coop/stats';
import { Modal } from '../../components/Modal';
import { cx } from '../../lib/utils';
import { HpBar, effectChipClass } from './Arena';
import { itemName } from './MyPanel';
import { ItemSilhouette } from './silhouettes';

export const PlayerDetails = memo(function PlayerDetails({
  state,
  playerId,
  now,
  onClose,
}: {
  state: CoopState;
  playerId: string | null;
  now: number;
  onClose: () => void;
}) {
  const player = state.players.find((p) => p.id === playerId);
  const gt = gameTime(state, now);
  const character = player ? CHARACTERS[player.character] : null;
  const effects = player ? statusEffects(state, player, gt) : [];
  return (
    <Modal open={Boolean(player)} onClose={onClose} title={player && character ? `${player.name} · ${character.name}` : ''}>
      {player && character && (
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <HpBar hp={player.hp} max={maxHp(state, player)} className="h-4" />
              <p className="font-mono text-xs">
                {player.status === 'alive' ? 'En combate' : player.status === 'dead' ? 'Caído' : 'Salió'} · Oro {player.gold} · Daño{' '}
                {Math.round(attackPower(state, player, gt, state.bosses[state.bossIndex]?.id === 'goliath'))} · Armadura {Math.round(armor(player, gt))} ·
                Pistas {player.hints}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Efectos de estado</p>
            {effects.length === 0 ? (
              <p className="text-muted">Sin efectos.</p>
            ) : (
              <ul className="space-y-1">
                {effects.map((effect) => (
                  <li key={effect.key} className="flex items-baseline gap-2">
                    <span className={cx('shrink-0', effectChipClass(effect.tone))}>
                      {effect.label}
                    </span>
                    <span className="text-xs">{effect.detail}.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Pasiva</p>
            <p>{character.passive}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Activa · {player.charges === null ? 'sin límite' : `${player.charges}/${character.maxCharges}`}
            </p>
            <p>{character.active}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Objetos</p>
            {player.inventory.length === 0 ? (
              <p className="text-muted">Sin objetos.</p>
            ) : (
              <ul className="space-y-2">
                {player.inventory.map((item) => (
                  <li key={item.uid} className="flex items-center gap-3">
                    <span className="coop-halo shrink-0">
                      <ItemSilhouette id={item.itemId} className="size-8" />
                    </span>
                    <span>
                      <strong>{itemName(item)}</strong> — {ITEMS[item.itemId].description}
                      {item.effectBonus > 0 && ` (+${Math.round(item.effectBonus * 100)} %)`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
});
