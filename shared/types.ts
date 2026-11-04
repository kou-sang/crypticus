// Tipos de dominio compartidos entre el cliente (src/) y las Vercel Functions (api/).
// No importar nada de Firebase aquí: este módulo debe ser puro y testeable.

/** Cómo termina una competencia. */
export type CompetitionMode =
  | 'timed' // Duración fija; gana quien más puntos tenga al acabar el tiempo.
  | 'count'; // Carrera: termina cuando alguien resuelve `targetCount` cripticos.

/** Cómo se puntúa cada criptico resuelto. */
export type ScoringRule =
  | 'standard' // Puntos fijos por dificultad.
  | 'fewestHints' // Penaliza cada pista usada.
  | 'speed' // Bonus por resolver rápido.
  | 'winByTwo'; // 1 punto por criptico; gana quien saque 2 de ventaja (duelo).

export type CompetitionStatus = 'lobby' | 'live' | 'finished';
export type CompetitionVisibility = 'public' | 'friends' | 'private';
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/** Datos públicos de un criptico (colección `cryptics`). */
export interface CrypticPublic {
  id: string;
  clue: string;
  enumeration: string; // Ej: "(5,3)"
  difficulty: Difficulty;
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
  difficulty?: Difficulty;
  hints?: string[];
  explanation?: string;
  setter?: string;
  tags?: string[];
}

export interface CompetitionConfig {
  mode: CompetitionMode;
  scoring: ScoringRule;
  durationSec: number; // Usado en 'timed' (y como tope de seguridad en 'count').
  targetCount: number; // Usado en 'count'.
  winByTwoMinScore: number; // Puntos mínimos del líder en 'winByTwo'.
  maxHintsPerClue: number;
}

export interface Competition extends CompetitionConfig {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  status: CompetitionStatus;
  visibility: CompetitionVisibility;
  maxPlayers: number;
  crypticIds: string[];
  participantIds: string[];
  createdAt: number; // epoch ms
  startedAt: number | null;
  endsAt: number | null;
  finishedAt: number | null;
  winnerId: string | null;
}

export interface Participant {
  uid: string;
  displayName: string;
  score: number;
  solvedIds: string[];
  hintsByClue: Record<string, number>;
  hintsUsed: number;
  attempts: number;
  lastSolvedAt: number | null; // epoch ms, desempate
  lastAttemptAt: number | null;
  joinedAt: number;
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
