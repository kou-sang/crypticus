// Protocolo WebSocket del modo COOP (mismo socket que el resto de los modos, mensajes propios).
import type { HintKind, RevealedHint } from '../hints';
import type { CoopLevel, CoopStage, CoopTier } from './balance';
import type { BossId } from './catalog/bosses';
import type { CharacterId } from './catalog/characters';
import type { CoopEvent } from './events';
import type { BossCategory } from './balance';
import type { CoopState, PlayerStats, PlayerStatus } from './state';

/** Acciones del jugador. El servidor las valida y las traduce al motor. */
export type CoopClientAction =
  | { kind: 'pick'; character: CharacterId } // Selección de personaje (se puede cambiar hasta confirmar).
  | { kind: 'lock' } // Confirmar el personaje elegido.
  | { kind: 'ready' } // Carga lista / saltear la explicación.
  | { kind: 'answer'; slot: number; guess: string }
  | { kind: 'hint'; hintKind: HintKind } // Pista del tipo elegido (v1.9).
  | { kind: 'active'; targetId?: string; amount?: number }
  | { kind: 'item'; itemUid: string; targetId?: string }
  | { kind: 'buy'; offerId: string }
  | { kind: 'swap'; targetId: string }
  | { kind: 'shopDone' }
  | { kind: 'vote'; decisionId: string; accept: boolean }
  /** Rendición: «sí» abre o suma; «no» retira el voto propio (no cierra la votación). */
  | { kind: 'surrender'; accept: boolean }
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
  revealed?: RevealedHint[]; // Pistas elegibles (v1.9): para resaltar el enunciado y mostrar letras.
  /** Tipos de pista que el criptico todavía admite (v1.9). Solo en el criptico en pantalla. */
  hintKinds?: HintKind[];
  solved: boolean;
}

export interface CoopPlayerSetup {
  uid: string;
  name: string;
  character: CharacterId;
}

/** Jugador al iniciar la sala, antes de elegir personaje. */
export interface CoopSeat {
  uid: string;
  name: string;
}

/** Selección de personajes (tras «Iniciar»): elegir, confirmar; al vencer, se asigna uno libre al azar. */
export interface CoopDraftView {
  endsAt: number;
  picks: Record<string, CharacterId>;
  locked: string[];
}

export interface CoopView {
  competitionId: string;
  title: string;
  level: CoopLevel;
  /** AT1/AT2/AT3. */
  stage: CoopStage;
  /** Durante la selección, `character` puede faltar (ver `draft.picks`). */
  players: Array<CoopSeat & { character?: CharacterId }>;
  draft: CoopDraftView | null;
  /** Jefes en orden (se conocen desde la explicación previa, para presentarlos). */
  bosses: BossId[];
  /** Carga y explicación previa (salteable): termina al vencer o cuando todos están listos. */
  briefing: { endsAt: number; ready: string[] } | null;
  /** Estado del motor sin la semilla (con ella se podrían predecir las tiradas). */
  game: CoopState | null;
  mine: { cryptics: CoopCrypticView[]; cooldownUntil: number };
  /** Eventos desde la última difusión, para animar. Vacío al reconectar. */
  events: CoopEvent[];
  serverTime: number;
}

export const COOP_BRIEFING_MS = 90_000;
export const COOP_DRAFT_MS = 60_000;

/** Resumen guardado en `competitions/{id}.coopResult` al terminar (lo lee la pantalla de resultados). */
export interface CoopResultSummary {
  level: CoopLevel;
  /** Ausente en resultados anteriores a los subniveles (= 2). */
  stage?: CoopStage;
  won: boolean;
  endedGt: number;
  /** La party se rindió por votación unánime. */
  surrendered?: boolean;
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
