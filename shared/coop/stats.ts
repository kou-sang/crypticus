// Estadísticas derivadas de un jugador en un instante: vida máxima, ataque, armadura, evasión…
// Los bonus porcentuales se suman y multiplican una vez: base × (1 + Σ%). Funciones puras.
import { PLAYER_BASE_ATTACK, PLAYER_BASE_HP } from './balance';
import { CHARACTER_PARAMS } from './catalog/characters';
import { ITEM_PARAMS, type ItemId } from './catalog/items';
import type { CoopState, ItemInstance, PlayerState } from './state';

/** Eficacia de un objeto: TUBALCAIN (+20 %), HIRAM (+20 % en equipados) y mejoras de la activa de TUBALCAIN. */
export function itemEffectiveness(owner: PlayerState, item: ItemInstance): number {
  let bonus = item.effectBonus;
  if (owner.character === 'tubalcain') bonus += CHARACTER_PARAMS.tubalcain.itemEffectBonus;
  if (owner.character === 'hiram') bonus += CHARACTER_PARAMS.hiram.itemEffectBonus;
  return 1 + bonus;
}

export function hasItem(player: PlayerState, itemId: ItemId): boolean {
  return player.inventory.some((item) => item.itemId === itemId);
}

/** Suma de un parámetro de objeto equipado, con su eficacia. */
function itemSum(player: PlayerState, pick: (item: ItemInstance) => number): number {
  return player.inventory.reduce((sum, item) => sum + pick(item) * itemEffectiveness(player, item), 0);
}

/** Bonus porcentual a las estadísticas básicas (vida y ataque) del personaje. */
export function baseStatsBonus(state: CoopState, player: PlayerState): number {
  switch (player.character) {
    case 'debbora':
      return CHARACTER_PARAMS.debbora.statsBonus;
    case 'gedeon':
      return CHARACTER_PARAMS.gedeon.statsPerPlayer * state.partySize;
    case 'samson':
      return CHARACTER_PARAMS.samson.statsPerWin * player.winStacks;
    default:
      return 0;
  }
}

export function maxHp(state: CoopState, player: PlayerState): number {
  const characterHp = player.character === 'mathusala' ? CHARACTER_PARAMS.mathusala.hpBonus : 0;
  return Math.round(PLAYER_BASE_HP * (1 + baseStatsBonus(state, player) + characterHp));
}

const activeBuffs = (player: PlayerState, gt: number) => player.buffs.filter((buff) => buff.untilGt > gt);

export function trumpetActive(state: CoopState): boolean {
  const holders = state.players.filter((p) => p.status !== 'left' && hasItem(p, 'jerichoTrumpet')).length;
  return holders > 0 && holders >= state.partySize * ITEM_PARAMS.jerichoTrumpet.holdersShare;
}

/** Ataque de un golpe del jugador contra el jefe actual (sin las defensas del jefe). */
export function attackPower(state: CoopState, player: PlayerState, gt: number, vsGoliath: boolean): number {
  let bonus = baseStatsBonus(state, player) + player.uriasBlessing;
  bonus += itemSum(player, (item) => {
    switch (item.itemId) {
      case 'commonWeapon':
        return ITEM_PARAMS.commonWeapon.attackBonus;
      case 'goliathSword':
        return ITEM_PARAMS.goliathSword.attackBonus + (vsGoliath ? ITEM_PARAMS.goliathSword.vsGoliathBonus : 0);
      case 'jonathanBow':
        return ITEM_PARAMS.jonathanBow.attackBonus;
      case 'pharaohRing':
        return ITEM_PARAMS.pharaohRing.attackBonus;
      default:
        return 0;
    }
  });
  if (trumpetActive(state)) bonus += ITEM_PARAMS.jerichoTrumpet.attackBonus;
  const hpMax = maxHp(state, player);
  for (const buff of activeBuffs(player, gt)) {
    if (buff.stat === 'attack') bonus += buff.amount;
    // URIAS: 1,5 × porcentaje de vida faltante, calculado en el momento del golpe.
    if (buff.stat === 'rage') bonus += buff.amount * Math.max(0, 1 - Math.max(0, player.hp) / hpMax);
  }
  return PLAYER_BASE_ATTACK * (1 + bonus);
}

export function armor(player: PlayerState, gt: number): number {
  let total = player.character === 'gedeon' ? CHARACTER_PARAMS.gedeon.armor : 0;
  total += itemSum(player, (item) =>
    item.itemId === 'commonVest' ? ITEM_PARAMS.commonVest.armor : item.itemId === 'josephTunic' ? ITEM_PARAMS.josephTunic.armor : 0,
  );
  for (const buff of activeBuffs(player, gt)) if (buff.stat === 'armor') total += buff.amount;
  return total;
}

/** Probabilidad de evadir un golpe del jefe (Manto de Elías). */
export function evasion(player: PlayerState): number {
  return Math.min(0.9, itemSum(player, (item) => (item.itemId === 'eliasMantle' ? ITEM_PARAMS.eliasMantle.evasion : 0)));
}

/** Reducción de todo el daño recibido (Burra de Balaam). */
export function damageTakenReduction(player: PlayerState): number {
  return Math.min(0.9, itemSum(player, (item) => (item.itemId === 'balaamDonkey' ? ITEM_PARAMS.balaamDonkey.damageTakenReduction : 0)));
}

export function goldBonus(player: PlayerState, gt: number): number {
  return activeBuffs(player, gt).reduce((sum, buff) => sum + (buff.stat === 'gold' ? buff.amount : 0), 0);
}

