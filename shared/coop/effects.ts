// Efectos de estado de un jugador en un instante (para mostrarlos): perjudiciales de los jefes y beneficios
// temporales o permanentes. Función pura derivada del estado; no cambia reglas del motor.
import { GOLIATH, LEVIATHAN, PHARAONIS, PHARAONIS_EFFECTS, type PharaonisEffect } from './catalog/bosses';
import { CHARACTER_PARAMS } from './catalog/characters';
import { PERIODIC_TICK_MS } from './balance';
import type { BossState, Buff, CoopState, PlayerState } from './state';

export interface StatusEffect {
  key: string;
  /** Texto corto (chip). */
  label: string;
  /** Explicación completa (tooltip y detalle del jugador). */
  detail: string;
  /** `info`: aviso neutro (por ejemplo, la próxima plaga). */
  tone: 'bad' | 'good' | 'info';
}

const pct = (value: number) => `${Math.round(value * 100)} %`;
const secs = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))} s`;

/** Textos de los buffs temporales; los que no figuran no se muestran. */
const BUFF_TEXT: Partial<Record<`${Buff['source']}:${Buff['stat']}`, (buff: Buff) => { label: string; detail: string }>> = {
  'mathusala:armor': (b) => ({ label: `Armadura +${Math.round(b.amount)}`, detail: `Mathusala: +${Math.round(b.amount)} de armadura` }),
  'urias:rage': () => ({ label: 'Furia', detail: 'Urias: más ataque cuanta menos vida le queda' }),
  'eliseus:attack': (b) => ({ label: `Ataque +${pct(b.amount)}`, detail: `Eliseus: +${pct(b.amount)} de ataque` }),
  'eliseus:gold': (b) => ({ label: `Oro +${pct(b.amount)}`, detail: `Eliseus: +${pct(b.amount)} de oro` }),
  'strengthPotion:attack': (b) => ({ label: `Fuerza +${pct(b.amount)}`, detail: `Poción de fuerza: +${pct(b.amount)} de ataque` }),
};

/** Efectos activos del jugador en el tiempo de partida `gt`. Los que salieron no tienen ninguno. */
export function statusEffects(state: CoopState, player: PlayerState, gt: number): StatusEffect[] {
  if (player.status === 'left') return [];
  const effects: StatusEffect[] = [];
  const boss = state.bosses[state.bossIndex];
  const alive = player.status === 'alive';

  // --- Perjudiciales ---
  if (alive && player.burns.length > 0) {
    const perRound = Math.round((LEVIATHAN.burnTotal / LEVIATHAN.burnTicks) * player.burns.length);
    effects.push({
      key: 'burn',
      label: `Quemado ×${player.burns.length}`,
      detail: `LEVIATHAN: pierde ${perRound} de vida al final de cada ronda (dura ${Math.max(...player.burns)} ronda${Math.max(...player.burns) === 1 ? '' : 's'} más)`,
      tone: 'bad',
    });
  }
  if (alive && boss?.id === 'pharaonis' && boss.pharaonis.poison && boss.hp > 0 && boss.spawnGt !== null) {
    effects.push({
      key: 'poison',
      label: 'Envenenado',
      detail: `PHARAONIS: −${PHARAONIS.poisonDamage} de vida cada ${PERIODIC_TICK_MS / 1000} s`,
      tone: 'bad',
    });
  }
  if (player.inhibitedRound !== null && player.inhibitedRound === state.roundNumber && state.phase === 'round') {
    effects.push({ key: 'inhibit', label: 'Inhibido', detail: 'JEZABEL: esta ronda no resuelve (ni gana ni pierde)', tone: 'bad' });
  } else if (player.inhibitedRound !== null && player.inhibitedRound > state.roundNumber) {
    effects.push({ key: 'inhibitNext', label: 'Inhibido (próx.)', detail: 'JEZABEL: no resolverá en la próxima ronda', tone: 'bad' });
  }

  // --- Beneficios ---
  if (player.soldierHp > 0) {
    effects.push({ key: 'soldier', label: `Soldado ${player.soldierHp}`, detail: 'Soldado de GEDEON: recibe primero los golpes y ataca junto a él', tone: 'good' });
  }
  if (alive && player.enochGuardUntilGt !== null && gt <= player.enochGuardUntilGt) {
    effects.push({
      key: 'enoch',
      label: `Resguardo ${secs(player.enochGuardUntilGt - gt)}`,
      detail: `Enoch: si muere, vuelve con ${pct(CHARACTER_PARAMS.enoch.reviveShare)} de vida`,
      tone: 'good',
    });
  }
  for (const buff of player.buffs) {
    if (buff.untilGt <= gt) continue;
    const text = BUFF_TEXT[`${buff.source}:${buff.stat}`]?.(buff);
    if (!text) continue;
    effects.push({
      key: `${buff.source}:${buff.stat}:${buff.untilGt}`,
      label: `${text.label} · ${secs(buff.untilGt - gt)}`,
      detail: `${text.detail} (quedan ${secs(buff.untilGt - gt)})`,
      tone: 'good',
    });
  }
  if (player.sacrificePending) {
    effects.push({
      key: 'sacrifice',
      label: 'Sacrificio',
      detail: `Samson: golpe ×${CHARACTER_PARAMS.samson.sacrificeMultiplier} al cerrar la ronda`,
      tone: 'good',
    });
  }
  if (player.winStacks > 0) {
    effects.push({
      key: 'samson',
      label: `Fuerza ×${player.winStacks}`,
      detail: `Samson: +${pct(CHARACTER_PARAMS.samson.statsPerWin * player.winStacks)} de vida y ataque por rondas superadas`,
      tone: 'good',
    });
  }
  if (player.uriasBlessing > 0) {
    effects.push({
      key: 'urias',
      label: `Bendición +${pct(player.uriasBlessing)}`,
      detail: `Urias cayó: +${pct(player.uriasBlessing)} de ataque permanente`,
      tone: 'good',
    });
  }
  return effects;
}

// --- Jefe ---------------------------------------------------------------------------------------------------

/** Plagas de PHARAONIS: nombre corto y qué hacen en la partida. */
export const PHARAONIS_EFFECT_INFO: Record<PharaonisEffect, { name: string; detail: string }> = {
  damage1: { name: 'Furia', detail: `+${pct(PHARAONIS.damageBonus)} de daño a sus golpes` },
  groupOffer: {
    name: 'Oferta grupal',
    detail: `Votación: ${PHARAONIS.groupOfferGold} de oro a cada uno si la mayoría acepta, y él gana +${pct(PHARAONIS.groupOfferDamageBonus)} de daño`,
  },
  lice: { name: 'Piojos', detail: 'Cada golpe que recibe deja manchas sobre los cripticos hasta la ronda siguiente' },
  individualOffer: {
    name: 'Oferta individual',
    detail: `Votación: ${PHARAONIS.individualOfferGold} de oro a quien acepte; él gana +${pct(PHARAONIS.individualOfferDamagePerAccept)} de daño por cada uno`,
  },
  burst: { name: 'Estallido', detail: `Todos pierden el ${pct(PHARAONIS.burstMaxHpShare)} de su vida máxima, una vez` },
  poison: { name: 'Veneno', detail: `Todos pierden ${PHARAONIS.poisonDamage} de vida cada ${PERIODIC_TICK_MS / 1000} s mientras él viva` },
  noCells: { name: 'Sin casillas', detail: 'Las respuestas se escriben en un campo libre, sin ver el largo' },
};

/** Vida (proporción) a la que se activa la plaga número `index` (desde 0): cada 12 % perdido. */
export const pharaonisThreshold = (index: number): number => 1 - (index + 1) * PHARAONIS.thresholdShare;

export type PlagueStatus = 'active' | 'pending' | 'upcoming';

/**
 * Estado de cada plaga: `active` ya actuó, `pending` se cruzó el umbral y actúa al cerrar la ronda,
 * `upcoming` todavía no. (Las ofertas y el estallido «activos» ya ocurrieron; el resto sigue en juego.)
 */
export function pharaonisPlagues(state: CoopState, boss: BossState): Array<{ effect: PharaonisEffect; status: PlagueStatus; atShare: number }> {
  const pending = boss.id === state.bosses[state.bossIndex]?.id ? state.pendingPharaonis : [];
  return PHARAONIS_EFFECTS.map((effect, index) => ({
    effect,
    atShare: pharaonisThreshold(index),
    status: pending.includes(effect) ? 'pending' : index < boss.pharaonis.triggered ? 'active' : 'upcoming',
  }));
}

/** Efectos visibles del jefe: bonus de daño, plagas en curso y la próxima, bandas de GOLIATH. */
export function bossEffects(state: CoopState, boss: BossState): StatusEffect[] {
  const effects: StatusEffect[] = [];
  if (boss.damageBonus > 0) {
    effects.push({ key: 'damage', label: `Daño +${pct(boss.damageBonus)}`, detail: `Sus golpes hacen ${pct(boss.damageBonus)} más de daño`, tone: 'bad' });
  }
  if (boss.id === 'pharaonis') {
    const plagues = pharaonisPlagues(state, boss);
    for (const effect of ['lice', 'poison', 'noCells'] as const) {
      if (boss.pharaonis[effect]) {
        const info = PHARAONIS_EFFECT_INFO[effect];
        effects.push({ key: effect, label: info.name, detail: info.detail, tone: 'bad' });
      }
    }
    for (const plague of plagues.filter((p) => p.status === 'pending')) {
      const info = PHARAONIS_EFFECT_INFO[plague.effect];
      effects.push({ key: `pending:${plague.effect}`, label: `${info.name} al cerrar la ronda`, detail: info.detail, tone: 'bad' });
    }
    const next = plagues.find((p) => p.status === 'upcoming');
    if (next) {
      const info = PHARAONIS_EFFECT_INFO[next.effect];
      effects.push({
        key: 'next',
        label: `Próxima: ${info.name} al ${Math.round(next.atShare * 100)} %`,
        detail: `Cuando su vida baje del ${Math.round(next.atShare * 100)} %: ${info.detail}`,
        tone: 'info',
      });
    }
  }
  if (boss.id === 'goliath' && boss.hp > 0) {
    const share = boss.hp / boss.maxHp;
    const band = GOLIATH.bands.find((b) => share > b.above) ?? GOLIATH.bands[GOLIATH.bands.length - 1]!;
    if (band.armor > 0) effects.push({ key: 'armor', label: `Armadura ${band.armor}`, detail: 'Reduce el daño físico que recibe', tone: 'bad' });
    if (band.regen > 0) effects.push({ key: 'regen', label: `Se cura ${band.regen}/5 s`, detail: `Recupera ${band.regen} de vida cada 5 s`, tone: 'bad' });
  }
  return effects;
}
