// Números del modo COOP (manual v2). Todo lo ajustable vive aquí: el motor solo lee estas constantes.
// Sin confirmar: ajustarlos con `scripts/simulate-coop.ts` antes de tocar las reglas.

export type BossCategory = 'easy' | 'medium' | 'difficult' | 'expert' | 'nightmare';
export const BOSS_CATEGORIES: readonly BossCategory[] = ['easy', 'medium', 'difficult', 'expert', 'nightmare'];

export type CoopLevel = 'AT' | 'NT';

/** Dificultad de un criptico de COOP. «veryHard2/3»: muy difícil de 2 o 3 palabras (los de desempate). */
export type CoopTier = 'easy' | 'medium' | 'hard' | 'veryHard2' | 'veryHard3';

export const PARTY_MIN = 4;
export const PARTY_MAX = 8;

export const LEVELS: Record<CoopLevel, { totalMs: number; categories: BossCategory[]; available: boolean; rating: number }> = {
  AT: { totalMs: 22 * 60_000, categories: ['easy', 'medium', 'difficult', 'expert'], available: true, rating: 1500 },
  NT: {
    totalMs: 33 * 60_000,
    categories: ['medium', 'difficult', 'difficult', 'expert', 'expert', 'nightmare', 'nightmare'],
    available: false, // Faltan jefes y personajes: se muestra «Pronto».
    rating: 2000,
  },
};

// --- Jefes ---------------------------------------------------------------------------------------------

/** Factor party = (16 − jugadores) / 8. */
export const partyFactor = (players: number): number => (16 - players) / 8;

export const BOSS_HP_PER_PLAYER: Record<BossCategory, number> = { easy: 105, medium: 125, difficult: 155, expert: 185, nightmare: 225 };
export const BOSS_BASE_DAMAGE_EASY = 50;
export const BOSS_BASE_DAMAGE_STEP = 20; // Por cada categoría por encima de Easy.

export const categoryIndex = (category: BossCategory): number => BOSS_CATEGORIES.indexOf(category);
export const bossBaseDamage = (category: BossCategory): number => BOSS_BASE_DAMAGE_EASY + BOSS_BASE_DAMAGE_STEP * categoryIndex(category);

/** Intervalo entre jefes (presentación del siguiente). El reloj de la partida se detiene. */
export const BOSS_INTRO_MS = 5_000;

// --- Rondas --------------------------------------------------------------------------------------------

/** Rondas normales antes de cada difícil: 2N, D, 2N, D, 3N, D… y luego siempre 5. */
export const NORMAL_RUNS: readonly number[] = [2, 2, 3, 4, 3, 4, 5, 4, 5, 5];
export const NORMAL_RUN_AFTER = 5;

export const NORMAL_ROUND_CRYPTICS = 2;
export const HARD_ROUND_CRYPTICS = 1;
export const DEAD_ROUND_CRYPTICS = 1;

export const NORMAL_ROUND_MS_EASY = 80_000;
export const NORMAL_ROUND_MS_STEP = 7_000;
export const HARD_ROUND_MS_EASY = 30_000;
export const HARD_ROUND_MS_STEP = 3_000;

/** Espera tras una respuesta incorrecta (la aplica el servidor; el motor no penaliza). */
export const WRONG_ANSWER_COOLDOWN_MS = 2_000;

/** Dificultad de los cripticos por número de ronda (desde la ronda `from`). */
export const TIER_TABLE: ReadonlyArray<{ from: number; shares: Partial<Record<CoopTier, number>> }> = [
  { from: 1, shares: { easy: 0.6, medium: 0.4 } },
  { from: 6, shares: { easy: 0.2, medium: 0.5, hard: 0.3 } },
  { from: 11, shares: { medium: 0.6, hard: 0.4 } },
  { from: 21, shares: { medium: 0.2, hard: 0.5, veryHard2: 0.3 } },
  { from: 31, shares: { hard: 0.2, veryHard2: 0.5, veryHard3: 0.3 } },
];
/** Ronda difícil: «difíciles y muy difíciles» (reparto sin confirmar). */
export const HARD_ROUND_TIERS: Partial<Record<CoopTier, number>> = { hard: 0.6, veryHard2: 0.4 };
/** Jugadores muertos: un criptico fácil, medio o difícil. */
export const DEAD_TIERS: Partial<Record<CoopTier, number>> = { easy: 1, medium: 1, hard: 1 };

export const GOLD_PER_ROUND_BASE = 15; // + número de la ronda ganada.
export const DEAD_SOLVE_HEAL = 20; // Al aliado vivo con menos HP.

export const SHOP_MS = 45_000;
export const SHOP_BASE_OPTIONS = 2;
export const INVENTORY_SLOTS = 4;
export const DECISION_MS = 15_000;
/** Votación de rendición: dura 30 s de partida; pasa solo con el «sí» de todos los que siguen en la partida. */
export const SURRENDER_VOTE_MS = 30_000;

// --- Jugadores -----------------------------------------------------------------------------------------

export const PLAYER_BASE_HP = 300;
export const PLAYER_BASE_ATTACK = 30;
export const REVIVE_HP_SHARE = 0.2;
export const HINTS_START = 1;
export const HINTS_MAX = 2;

/** Tick de efectos periódicos (veneno, regeneración de GOLIATH). */
export const PERIODIC_TICK_MS = 5_000;

/** Reducción por armadura: R / (R + 100). */
export const armorReduction = (armor: number): number => (armor <= 0 ? 0 : armor / (armor + 100));

/** Alfabeto del desfase de SERPENTIS (cíclico, con Ñ). */
export const SHIFT_ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
