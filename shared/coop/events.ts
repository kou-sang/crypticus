// Eventos que produce el motor COOP: la UI los anima (y suena) en orden. Solo describen lo que ya pasó.
import type { HintKind } from '../hints';
import type { CoopTier } from './balance';
import type { BossId, PharaonisEffect } from './catalog/bosses';
import type { ItemId } from './catalog/items';
import type { DecisionKind, RoundKind } from './state';

export type HealSource = 'potion' | 'nathan' | 'naaman' | 'harp' | 'moses' | 'urias' | 'deadSolve' | 'cross' | 'goliath';
export type DamageSource = 'boss' | 'burn' | 'poison' | 'pharaonis' | 'apple' | 'offer' | 'gedeon' | 'naaman';

export type CoopEvent =
  | { type: 'bossIntro'; gt: number; bossIndex: number; bossId: BossId }
  | { type: 'roundStart'; gt: number; round: number; kind: RoundKind; endsGt: number; tiers: Record<string, CoopTier[]> }
  | { type: 'solved'; gt: number; playerId: string; slot: number }
  | { type: 'roundEnd'; gt: number; round: number; kind: RoundKind; winners: string[]; hardSuccess: boolean | null }
  | { type: 'playerHit'; gt: number; playerId: string; target: 'boss' | 'rex'; amount: number; evaded: boolean; soldier: boolean; sacrifice: boolean }
  | { type: 'bossHit'; gt: number; playerId: string; amount: number; crit: boolean; evaded: boolean; absorbed: number; redirected: number }
  | { type: 'damage'; gt: number; playerId: string; amount: number; source: DamageSource }
  | { type: 'heal'; gt: number; playerId: string; amount: number; source: HealSource }
  | { type: 'bossHeal'; gt: number; amount: number; source: 'goliath' | 'jezabel' }
  | { type: 'gold'; gt: number; playerId: string; amount: number; source: 'cryptic' | 'offer' | 'tubalcain' | 'nathan' | 'stolen' }
  | { type: 'death'; gt: number; playerId: string }
  | { type: 'revive'; gt: number; playerId: string; hp: number }
  | { type: 'bossAbility'; gt: number; bossId: BossId; ability: PharaonisEffect | 'summonRex' | 'rexDown' | 'hideCells' | 'shift' | 'inhibit' | 'burn' | 'surcharge'; detail?: string }
  | { type: 'lice'; gt: number; seed: number }
  | { type: 'bossDefeated'; gt: number; bossIndex: number; bossId: BossId }
  | { type: 'decisionOpen'; gt: number; id: string; kind: DecisionKind; endsGt: number }
  | { type: 'decisionResult'; gt: number; id: string; kind: DecisionKind; accepted: string[]; approved: boolean; secret: boolean }
  | { type: 'shopOpen'; gt: number; number: number; endsGt: number; free: boolean }
  | { type: 'shopClose'; gt: number }
  | { type: 'purchase'; gt: number; playerId: string; offerId: string; itemId: ItemId | null; price: number }
  | { type: 'secretRevealed'; gt: number; secret: 'apple' | 'loneAccept' | 'cross'; playerId: string | null }
  | { type: 'activeUsed'; gt: number; playerId: string; targetId: string | null }
  | { type: 'itemUsed'; gt: number; playerId: string; itemId: ItemId; targetId: string | null }
  | { type: 'hintRevealed'; gt: number; playerId: string; slot: number; level: number; kind?: HintKind }
  /** Pista ganada (tienda, manzana): de un tipo al azar. */
  | { type: 'hintGained'; gt: number; playerId: string; kind: HintKind; source: 'shop' | 'apple' }
  | { type: 'shopSwap'; gt: number; playerId: string; targetId: string }
  | { type: 'surrenderVote'; gt: number; playerId: string; accept: boolean; yes: number; needed: number; endsGt: number }
  | { type: 'surrenderEnd'; gt: number; passed: boolean }
  | { type: 'gameOver'; gt: number; won: boolean; surrendered?: boolean };
