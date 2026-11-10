// Protocolo WebSocket del modo COOP (mismo socket que el resto de los modos, mensajes propios).
import type { CoopLevel, CoopTier } from './balance';
import type { BossId } from './catalog/bosses';
import type { CharacterId } from './catalog/characters';
import type { CoopEvent } from './events';
import type { BossCategory } from './balance';
import type { CoopState, PlayerStats, PlayerStatus } from './state';

/** Acciones del jugador. El servidor las valida y las traduce al motor. */
export type CoopClientAction =
  | { kind: 'ready' } // Saltear la explicación previa.
  | { kind: 'answer'; slot: number; guess: string }
  | { kind: 'hint' }
  | { kind: 'active'; targetId?: string; amount?: number }
  | { kind: 'item'; itemUid: string; targetId?: string }
  | { kind: 'buy'; offerId: string }
  | { kind: 'swap'; targetId: string }
  | { kind: 'shopDone' }
  | { kind: 'vote'; decisionId: string; accept: boolean }
  | { kind: 'leave' };

export interface CoopReply {
  ok: true;
  correct?: boolean;
  explanation?: string | null;
  cooldownUntil?: number;
}

/** Criptico asignado al jugador en la ronda (el enunciado llega con la ronda: sin lecturas extra). */
export interface CoopCrypticView {
  slot: number;
  crypticId: string;
  tier: CoopTier;
  clue: string | null; // null: secretos anteriores a COOP; el cliente lo lee de Firestore.
  enumeration: string | null;
  hints: string[]; // Solo las pistas ya reveladas.
  solved: boolean;
}

export interface CoopPlayerSetup {
  uid: string;
  name: string;
  character: CharacterId;
}

export interface CoopView {
  competitionId: string;
  title: string;
  level: CoopLevel;
  players: CoopPlayerSetup[];
  /** Jefes en orden (se conocen desde la explicación previa, para presentarlos). */
  bosses: BossId[];
  /** Explicación previa (salteable): termina al vencer o cuando todos están listos. */
  briefing: { endsAt: number; ready: string[] } | null;
  /** Estado del motor sin la semilla (con ella se podrían predecir las tiradas). */
  game: CoopState | null;
  mine: { cryptics: CoopCrypticView[]; cooldownUntil: number };
  /** Eventos desde la última difusión, para animar. Vacío al reconectar. */
  events: CoopEvent[];
  serverTime: number;
}

export const COOP_BRIEFING_MS = 90_000;

/** Resumen guardado en `competitions/{id}.coopResult` al terminar (lo lee la pantalla de resultados). */
export interface CoopResultSummary {
  level: CoopLevel;
  won: boolean;
  endedGt: number;
  rounds: number;
  bossesDefeated: number;
  bosses: Array<{
    id: BossId;
    category: BossCategory;
    maxHp: number;
    hp: number;
    defeatedGt: number | null;
    rounds: number;
    damageTaken: number;
    damageDealt: number;
  }>;
  players: Array<
    PlayerStats & {
      uid: string;
      displayName: string;
      character: CharacterId;
      status: PlayerStatus;
      ratingDelta: number;
    }
  >;
}
