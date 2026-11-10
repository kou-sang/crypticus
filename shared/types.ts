// Tipos de dominio compartidos entre el cliente (src/), el servidor y el motor (shared/engine.ts).
// No importar nada de Firebase aquí: este módulo debe ser puro y testeable.
import type { RatingPool } from './ratingPools';

/** Clasificación de cripticos. */
export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** Cómo termina una competencia. */
export type CompetitionMode =
  | 'timed' // Reloj fijo; gana quien más puntos tenga al acabar.
  | 'count'; // Carrera: termina cuando alguien llega a `targetCount` cripticos.

/** Modo de juego elegido en la UI. Define (vía `buildConfig`) las reglas del motor. */
export type GameMode =
  | 'race' // Carrera: gana quien llega antes a la meta.
  | 'royale' // Hasta 8, reloj por jugador estilo ajedrez; gana el último en pie.
  | 'duel' // 1 contra 1 con vida: acertar primero daña al rival.
  | 'coop'; // Cooperativo: de 4 a 8 contra jefes (motor propio en shared/coop).
export const GAME_MODES: readonly GameMode[] = ['race', 'royale', 'duel', 'coop'];

/** COOP: nivel elegido en la sala. */
export interface CoopConfig {
  level: 'AT' | 'NT';
  /** Subnivel 1–3 (AT1, AT2, AT3): escala vida y daño base de los jefes. Ausente en salas anteriores: 2. */
  stage?: 1 | 2 | 3;
}

export type DuelDamage = 'difficulty' | 'speed';

export interface DuelConfig {
  hp: number; // Vida inicial de cada jugador.
  damage: DuelDamage; // El daño depende de la dificultad o de la velocidad.
  combo?: boolean; // Aciertos seguidos golpean más fuerte. Ausente (salas previas a v0.9) = activo.
  teams?: boolean; // 2 vs 2: vida compartida por equipo; cualquiera del equipo puede responder.
}

export interface RoyaleConfig {
  baseSec: number; // Tiempo inicial del reloj de cada jugador.
  incrementSec: number; // Segundos que suma cada acierto.
  skips?: number; // Saltos permitidos por jugador (0 = no se saltea). Cada uno resta tiempo del reloj.
}


/** Cómo se reparten los cripticos. */
export type GameFlow =
  | 'free' // Cada jugador avanza a su ritmo por la misma lista.
  | 'rounds'; // Todos ven el mismo criptico; el primero en acertar gana la ronda.

export type ComebackLevel = 'off' | 'low' | 'high';
export type TierMix = 'balanced' | 'easy' | 'hard' | 'progressive';
export type CompetitionStatus = 'lobby' | 'live' | 'finished';
export type DeviceKind = 'mobile' | 'desktop';
export type CompetitionVisibility = 'public' | 'friends' | 'private';

export interface CompetitionConfig {
  mode: CompetitionMode;
  flow: GameFlow;
  durationSec: number; // Reloj de la partida (en 'count' actúa como tope).
  targetCount: number; // Meta en 'count'.
  winByTwo: boolean; // Hay que sacar 2 cripticos de ventaja para ganar.
  difficultyVote: boolean; // Solo 'rounds': se vota la dificultad del siguiente.
  rivalCountdownSec: number; // Solo 'rounds': tras el primer acierto, segundos para que el resto acierte (0 = cierra al instante).
  comeback: ComebackLevel; // Bonus proporcional para quien va perdiendo.
  maxHintsPerClue: number;
  hintsPerGame?: number; // Tope de pistas por jugador en toda la partida (Race). Ausente = sin tope.
  tierMix: TierMix; // Solo 'free': proporción/orden de dificultades.
  // ---- v0.6: modos de juego (opcionales para compatibilidad con partidas anteriores) ----
  game?: GameMode;
  intervalSec?: number; // 'rounds': pausa entre cripticos (se revela la solución anterior).
  duel?: DuelConfig;
  royale?: RoyaleConfig;
  coop?: CoopConfig;
  cooldownSec?: number; // Espera mínima entre respuestas (anti spam).
  surrender?: { enabled: boolean; maxUses: number }; // Race: rendirse ante un criptico.
}

/** Datos públicos de un criptico (colección `cryptics`). */
export interface CrypticPublic {
  id: string;
  clue: string;
  enumeration: string; // Ej: "(5,3)"
  tier: Difficulty;
  hintCount: number;
  setter?: string;
  tags?: string[];
  rand?: number;
}

/** Datos secretos (colección `crypticSecrets`, solo legible por Admin SDK). */
export interface CrypticSecret {
  answer: string;
  hints: string[];
  explanation?: string;
}

/** Formato del archivo de importación `data/cryptics.json`. */
export interface CrypticImportItem {
  id?: string;
  clue: string;
  answer: string;
  enumeration?: string;
  difficulty?: string | number; // "facil" | "medio" | "dificil" | "easy" | ... | 1-5
  hints?: string[];
  explanation?: string;
  setter?: string;
  tags?: string[];
  /** Pool de desempate (respuestas de 2 o 3 palabras): solo se usa en la muerte súbita. */
  tiebreak?: boolean;
}

export interface Competition extends CompetitionConfig {
  id: string;
  title: string;
  code?: string; // 4 letras (v1.0+): entrar con /s/CODE o desde Jugar. Salas anteriores no lo tienen.
  hostId: string;
  hostName: string;
  status: CompetitionStatus;
  visibility: CompetitionVisibility;
  maxPlayers: number;
  crypticIds: string[]; // 'free': orden de juego. 'rounds': todo el pool.
  pool: Record<Difficulty, string[]>; // Ids por dificultad (selección al crear).
  participantIds: string[];
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  winnerId: string | null;
  invitedIds?: string[]; // Desafío: amigos invitados (ven la sala en Amigos).
  clueCount?: number; // Cantidad pedida al crear; el servidor elige los cripticos al iniciar.
  rematchId?: string; // Partida terminada: última propuesta de revancha (la ven todos los jugadores).
  rematchOf?: string; // Sala de revancha: partida de origen.
  chatId?: string; // Revancha: el chat es el de la primera sala de la serie (`competitions/{chatId}/messages`).
  rematchDepth?: number; // Revancha: número en la serie (1, 2, 3…).
  invitedNames?: Record<string, string>; // Sala de revancha: nombres de los invitados (para mostrar quién falta).
  declinedIds?: string[]; // Sala de revancha: invitados que la rechazaron.
  teams?: Record<string, 0 | 1>; // Duel 2 vs 2: equipo elegido por cada jugador en la sala.
}

export interface Participant {
  uid: string;
  displayName: string;
  team?: 0 | 1; // Duel 2 vs 2.
  score: number;
  solvedIds: string[];
  hintsByClue: Record<string, number>;
  hintsUsed: number;
  attempts: number;
  wrongAttempts: number;
  lastSolvedAt: number | null;
  lastAttemptAt: number | null;
  joinedAt: number;
  device?: DeviceKind;
  // ---- ROYALE ----
  bankMs?: number; // Tiempo total del reloj (base + incrementos ganados). Restante = bankMs - (ahora - inicio).
  eliminatedAt?: number | null;
  cursor?: number; // Posición en la lista de cripticos (avance secuencial).
  // ---- DUEL ----
  streak?: number; // Aciertos consecutivos ganados (combo).
  // ---- Secuencial (Race Pacífico, Royale) ----
  nextOpensAt?: number; // El criptico en `cursor` no se muestra ni se puede responder antes.
  surrenders?: number; // Rendiciones usadas.
  skipsUsed?: number; // Royale: saltos usados.
  tiebreakWon?: boolean; // Ganó la muerte súbita de desempate.
}

/** Estadísticas por modo (escritas por el servidor). */
export interface ModeStats {
  rating: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
}

export type RankedMode = Exclude<GameMode, 'coop'>;
export const RANKED_MODES: readonly RankedMode[] = ['race', 'royale', 'duel'];

export interface UserProfile {
  uid: string;
  displayName: string;
  handle: string;
  rating?: number; // Rating general: obsoleto desde v0.12 (el Elo es por modo). Cuentas antiguas lo conservan.
  stats: { played: number; wins: number; solved: number; hintsUsed: number };
  /**
   * Estadísticas por pool de Elo (ver `shared/ratingPools.ts`). Desde v1.2 Royale se separa por tiempo
   * (`royale_hyperbullet`, `royale_bullet`, `royale_rapid`); `royale` queda congelado y solo siembra esos pools.
   */
  modeStats?: Partial<Record<RankedMode | RatingPool, ModeStats>>;
  createdAt: number;
}

export interface RankedParticipant extends Participant {
  rank: number;
}

/** Entrada de historial por jugador (`users/{uid}/history/{competitionId}`), escrita por el servidor. */
export interface HistoryEntry {
  competitionId: string;
  title: string;
  mode: CompetitionMode;
  game?: GameMode;
  flow: GameFlow;
  finishedAt: number;
  rank: number;
  players: number;
  score: number;
  solved: number;
  hintsUsed: number;
  won: boolean;
  outcome?: 'win' | 'loss' | 'draw';
  endReason: string | null;
  ratingDelta: number; // Cambio de Elo en esta partida (desde v0.12, del modo; antes, del rating general).
  ratingAfter?: number; // Rating general tras la partida (solo partidas anteriores a v0.12).
  /** Elo del modo (Race, Royale o Duel) tras la partida. Solo en partidas puntuables de 2 o más. */
  modeRatingAfter?: number;
  modeRatingDelta?: number; // Cambio del Elo del modo en esta partida.
  /** Pool de Elo de la partida (desde v1.2). En Royale indica la categoría de tiempo. */
  ratingPool?: RatingPool;
  /** Royale: control de tiempo jugado (desde v1.2). */
  royale?: { baseSec: number; incrementSec: number };
  /** COOP: nivel, personaje, jefes derrotados (de `bosses`) y ronda alcanzada. `bosses`/`rounds` desde v1.6. */
  coop?: { level: 'AT' | 'NT'; stage?: 1 | 2 | 3; character: string; bossesDefeated: number; bosses?: number; rounds?: number };
}
