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

/** Modo de juego elegido en la UI. Define (vía `buildConfig`) las reglas del motor. */
export type GameMode =
  | 'race' // Carrera: gana quien llega antes a la meta.
  | 'royale' // Hasta 8, reloj por jugador estilo ajedrez; gana el último en pie.
  | 'duel' // 1 contra 1 con vida: acertar primero daña al rival.
  | 'boss'; // Cooperativo contra un jefe (próximamente).
export const GAME_MODES: readonly GameMode[] = ['race', 'royale', 'duel', 'boss'];

export type DuelDamage = 'difficulty' | 'speed';

export interface DuelConfig {
  hp: number; // Vida inicial de cada jugador.
  damage: DuelDamage; // El daño depende de la dificultad o de la velocidad.
  combo?: boolean; // Aciertos seguidos golpean más fuerte. Ausente (salas previas a v0.9) = activo.
}

export interface RoyaleConfig {
  baseSec: number; // Tiempo inicial del reloj de cada jugador.
  incrementSec: number; // Segundos que suma cada acierto.
}

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
  hintsPerGame?: number; // Tope de pistas por jugador en toda la partida (Race). Ausente = sin tope.
  wrongPenalty: number; // Puntos restados por respuesta incorrecta.
  tierMix: TierMix; // Solo 'free': proporción/orden de dificultades.
  hideScoreboard: boolean; // Puntajes ocultos hasta el final.
  // ---- v0.6: modos de juego (opcionales para compatibilidad con partidas anteriores) ----
  game?: GameMode;
  intervalSec?: number; // 'rounds': pausa entre cripticos (se revela la solución anterior).
  duel?: DuelConfig;
  royale?: RoyaleConfig;
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
  invitedNames?: Record<string, string>; // Sala de revancha: nombres de los invitados (para mostrar quién falta).
  declinedIds?: string[]; // Sala de revancha: invitados que la rechazaron.
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
  // ---- ROYALE ----
  bankMs?: number; // Tiempo total del reloj (base + incrementos ganados). Restante = bankMs - (ahora - inicio).
  eliminatedAt?: number | null;
  cursor?: number; // Posición en la lista de cripticos (avance secuencial).
  // ---- DUEL ----
  streak?: number; // Aciertos consecutivos ganados (combo).
  // ---- Secuencial (Race Pacífico, Royale) ----
  nextOpensAt?: number; // El criptico en `cursor` no se muestra ni se puede responder antes.
  surrenders?: number; // Rendiciones usadas.
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

export type RankedMode = Exclude<GameMode, 'boss'>;
export const RANKED_MODES: readonly RankedMode[] = ['race', 'royale', 'duel'];

export interface UserProfile {
  uid: string;
  displayName: string;
  handle: string;
  rating: number;
  stats: { played: number; wins: number; solved: number; hintsUsed: number };
  modeStats?: Partial<Record<RankedMode, ModeStats>>;
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
  ratingDelta: number;
  ratingAfter: number;
  /** Elo del modo (Race, Royale o Duel) tras la partida. Solo en partidas puntuables de 2 o más. */
  modeRatingAfter?: number;
}
