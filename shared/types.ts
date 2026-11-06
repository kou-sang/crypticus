// Tipos de dominio compartidos entre el cliente (src/), el servidor y el motor (shared/engine.ts).
// No importar nada de Firebase aquí: este módulo debe ser puro y testeable.

/** Clasificación de cripticos. */
export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** Cómo termina una competencia. */
export type CompetitionMode =
  | 'timed' // Reloj fijo; gana quien más puntos tenga al acabar.
  | 'count' // Carrera: termina cuando alguien llega a `targetCount` cripticos.
  | 'boss'; // Cooperativo: todos contra un jefe con barra de vida.

/** Cómo se puntúa cada criptico resuelto (modos competitivos). */
export type ScoringRule = 'standard' | 'fewestHints' | 'speed';

/** Cómo se reparten los cripticos. */
export type GameFlow =
  | 'free' // Cada jugador avanza a su ritmo por la misma lista.
  | 'rounds'; // Todos ven el mismo criptico; el primero en acertar gana la ronda.

export type ComebackLevel = 'off' | 'low' | 'high';
export type TierMix = 'balanced' | 'easy' | 'hard' | 'progressive';
export type BossLevel = 'normal' | 'hard' | 'epic';
export type CompetitionStatus = 'lobby' | 'live' | 'finished';
export type DeviceKind = 'mobile' | 'desktop';
export type CompetitionVisibility = 'public' | 'friends' | 'private';

export interface ExtraTimeConfig {
  enabled: boolean;
  seconds: number; // Segundos añadidos por uso.
  maxUses: number;
}

export interface CompetitionConfig {
  mode: CompetitionMode;
  scoring: ScoringRule;
  flow: GameFlow;
  durationSec: number; // Reloj de la partida (en 'count' actúa como tope).
  targetCount: number; // Meta en 'count'.
  winByTwo: boolean; // Hay que sacar 2 cripticos de ventaja para ganar.
  difficultyVote: boolean; // Solo 'rounds': se vota la dificultad del siguiente.
  rivalCountdownSec: number; // Solo 'rounds': tras el primer acierto, segundos para que el resto acierte (0 = cierra al instante).
  comeback: ComebackLevel; // Bonus proporcional para quien va perdiendo.
  extraTime: ExtraTimeConfig;
  bossLevel: BossLevel;
  maxHintsPerClue: number;
  wrongPenalty: number; // Puntos restados por respuesta incorrecta.
  tierMix: TierMix; // Solo 'free': proporción/orden de dificultades.
  hideScoreboard: boolean; // Puntajes ocultos hasta el final.
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
}

export interface Competition extends CompetitionConfig {
  id: string;
  title: string;
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
}

export interface Participant {
  uid: string;
  displayName: string;
  score: number; // En 'boss' = daño infligido.
  solvedIds: string[];
  hintsByClue: Record<string, number>;
  hintsUsed: number;
  attempts: number;
  wrongAttempts: number;
  lastSolvedAt: number | null;
  lastAttemptAt: number | null;
  joinedAt: number;
  device?: DeviceKind;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  handle: string;
  rating: number;
  stats: { played: number; wins: number; solved: number; hintsUsed: number };
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
  flow: GameFlow;
  finishedAt: number;
  rank: number;
  players: number;
  score: number;
  solved: number;
  hintsUsed: number;
  won: boolean;
  endReason: string | null;
  ratingDelta: number;
  ratingAfter: number;
}
