// Efectos de estado de un jugador en un instante (para mostrarlos): perjudiciales de los jefes y beneficios
// temporales o permanentes. Función pura derivada del estado; no cambia reglas del motor.
import { LEVIATHAN, PHARAONIS } from './catalog/bosses';
import { CHARACTER_PARAMS } from './catalog/characters';
import { PERIODIC_TICK_MS } from './balance';
import type { Buff, CoopState, PlayerState } from './state';

export interface StatusEffect {
  key: string;
  /** Texto corto (chip). */
  label: string;
  /** Explicación completa (tooltip y detalle del jugador). */
  detail: string;
  tone: 'bad' | 'good';
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
