// Estado de una partida COOP. Serializable (JSON): lo guarda el Durable Object y se difunde recortado.
// Tiempos: `gt` = tiempo de partida en ms (se detiene en la presentación de cada jefe); `wall` = Date.now().
import type { BossCategory, CoopLevel, CoopTier } from './balance';
import type { BossId, PharaonisEffect } from './catalog/bosses';
import type { CharacterId } from './catalog/characters';
import type { DamageType, ItemId, WeaponVariant } from './catalog/items';

export type CoopPhase = 'bossIntro' | 'round' | 'decision' | 'shop' | 'victory' | 'defeat';
export type RoundKind = 'normal' | 'hard';
export type PlayerStatus = 'alive' | 'dead' | 'left';

export interface Assignment {
  tier: CoopTier;
  solved: boolean;
  hintsRevealed: number; // 0–2: pistas del criptico ya mostradas.
}

export type BuffStat = 'armor' | 'attack' | 'gold' | 'rage';
export interface Buff {
  source: 'mathusala' | 'urias' | 'eliseus' | 'strengthPotion';
  stat: BuffStat;
  amount: number;
  untilGt: number;
}

export interface ItemInstance {
  uid: string;
  itemId: ItemId;
  variant?: WeaponVariant;
  /** Mejoras acumuladas por la activa de TUBALCAIN (+0,2 cada una). */
  effectBonus: number;
}

export interface PlayerStats {
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  healingReceived: number;
  goldEarned: number;
  goldSpent: number;
  crypticsSolved: number;
  roundsWon: number;
  deaths: number;
  hintsUsed: number;
  activesUsed: number;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: number; // Orden en el círculo, igual para todos.
  character: CharacterId;
  status: PlayerStatus;
  hp: number;
  /** Bonus permanente de estadísticas por rondas ganadas (SAMSON). */
  winStacks: number;
  /** +15 % de ataque permanente al morir URIAS. */
  uriasBlessing: number;
  gold: number;
  hints: number;
  charges: number | null; // null: sin límite.
  activeUsedRound: number | null;
  inventory: ItemInstance[];
  damageType: DamageType;
  buffs: Buff[];
  soldierHp: number;
  /** Quemaduras de LEVIATHAN: rondas restantes de cada acumulación. */
  burns: number[];
  inhibitedRound: number | null;
  enochGuardUntilGt: number | null;
  sacrificePending: boolean; // SAMSON: daño al final de la ronda.
  harpReady: boolean;
  /** Progreso de recarga de la activa (rondas contadas) y rondas necesarias (NATHAN suma una por uso). */
  rechargeProgress: number;
  rechargeNeeded: number;
  usesCount: number;
  debboraRecharges: number;
  hiramSwapArmed: boolean;
  assignments: Assignment[];
  stats: PlayerStats;
}

export interface RexState {
  hp: number;
  maxHp: number;
}

export interface BossState {
  id: BossId;
  category: BossCategory;
  maxHp: number;
  hp: number;
  /** Suma de bonus de daño (+0,05…). */
  damageBonus: number;
  spawnGt: number | null;
  defeatedGt: number | null;
  roundsFought: number;
  /** Daño recibido por jugador en la ronda en curso (JEZABEL). */
  roundDamageBy: Record<string, number>;
  damageTaken: number;
  damageDealt: number;
  pharaonis: { triggered: number; lice: boolean; poison: boolean; noCells: boolean };
  haman: { gold: number; summons: number; rex: RexState | null };
}

export interface RoundModifiers {
  hideCells: boolean;
  shift: number; // Desfase de letras (SERPENTIS): 0, ±1, ±2.
}

export type ShopOfferKind = 'item' | 'rechargeUrias' | 'rechargeDebbora';
export interface ShopOffer {
  id: string;
  kind: ShopOfferKind;
  itemId?: ItemId;
  variant?: WeaponVariant;
  sold: boolean;
}

export interface ShopState {
  number: number;
  endsGt: number;
  free: boolean; // Cruz de Jesús: todo gratis.
  offers: Record<string, ShopOffer[]>;
  done: string[]; // Jugadores que cerraron la tienda.
  swapAvailable: string[]; // HIRAM con la activa armada.
}

export type DecisionKind = 'groupOffer' | 'individualOffer';
export interface DecisionState {
  id: string;
  kind: DecisionKind;
  endsGt: number;
  votes: Record<string, boolean>;
}

export type FlowStep = 'decisions' | 'shop' | 'bossIntro' | 'round';

export interface CoopState {
  version: 1;
  seed: number;
  level: CoopLevel;
  totalMs: number;
  partySize: number;
  phase: CoopPhase;
  /** Reloj de partida: gt = baseGt + (wall − anchorWall) mientras corre. */
  clock: { baseGt: number; anchorWall: number | null };
  introEndsWall: number | null;
  nextTickGt: number;
  roundNumber: number;
  roundKind: RoundKind | null;
  roundEndsGt: number | null;
  modifiers: RoundModifiers;
  nextModifiers: RoundModifiers;
  bosses: BossState[];
  bossIndex: number;
  players: PlayerState[];
  shop: ShopState | null;
  shopsOpened: number;
  /** Recargo permanente de la tienda (HAMAN). */
  shopSurcharge: number;
  /** Cruz de Jesús vista: próxima tienda gratis y próxima ronda con curación total. */
  cross: { freeNextShop: boolean; healNextRound: boolean; seen: boolean };
  appleBought: boolean;
  pendingPharaonis: PharaonisEffect[];
  decisions: DecisionState[];
  flow: FlowStep[];
  result: { won: boolean; endedGt: number } | null;
}

export const emptyStats = (): PlayerStats => ({
  damageDealt: 0,
  damageTaken: 0,
  healingDone: 0,
  healingReceived: 0,
  goldEarned: 0,
  goldSpent: 0,
  crypticsSolved: 0,
  roundsWon: 0,
  deaths: 0,
  hintsUsed: 0,
  activesUsed: 0,
});
