// Normalización de configuración y datos de sala. La usa el Worker al crear, editar e iniciar
// (lo que llega del cliente o de Firestore nunca se usa sin pasar por aquí) y el cliente para copiar reglas.
import { DEFAULT_CONFIG, validateConfig } from './scoring';
import type {
  BossLevel,
  ComebackLevel,
  CompetitionConfig,
  CompetitionMode,
  CompetitionVisibility,
  DuelDamage,
  GameFlow,
  GameMode,
  TierMix,
} from './types';

type Raw = Record<string, unknown>;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const num = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const int = (value: unknown, fallback: number): number => Math.round(num(value, fallback));
const obj = (value: unknown): Raw | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null);

const MODES: readonly CompetitionMode[] = ['timed', 'count', 'boss'];
const FLOWS: readonly GameFlow[] = ['free', 'rounds'];
const GAMES: readonly GameMode[] = ['race', 'royale', 'duel', 'boss'];
const COMEBACKS: readonly ComebackLevel[] = ['off', 'low', 'high'];
const BOSS_LEVELS: readonly BossLevel[] = ['normal', 'hard', 'epic'];
const TIER_MIXES: readonly TierMix[] = ['balanced', 'easy', 'hard', 'progressive'];
const DAMAGES: readonly DuelDamage[] = ['difficulty', 'speed'];
export const VISIBILITIES: readonly CompetitionVisibility[] = ['public', 'friends', 'private'];

/** Reglas de juego con tipos y valores permitidos; descarta cualquier campo desconocido. */
export function normalizeConfig(raw: Raw): CompetitionConfig {
  const d = DEFAULT_CONFIG;
  const duel = obj(raw.duel);
  const royale = obj(raw.royale);
  const surrender = obj(raw.surrender);
  const game = GAMES.includes(raw.game as GameMode) ? (raw.game as GameMode) : undefined;
  return {
    mode: oneOf(raw.mode, MODES, d.mode),
    flow: oneOf(raw.flow, FLOWS, d.flow),
    durationSec: int(raw.durationSec, d.durationSec),
    targetCount: int(raw.targetCount, d.targetCount),
    winByTwo: raw.winByTwo === true,
    difficultyVote: raw.difficultyVote === true,
    rivalCountdownSec: int(raw.rivalCountdownSec, 0),
    comeback: oneOf(raw.comeback, COMEBACKS, d.comeback),
    bossLevel: oneOf(raw.bossLevel, BOSS_LEVELS, d.bossLevel),
    maxHintsPerClue: int(raw.maxHintsPerClue, 0),
    tierMix: oneOf(raw.tierMix, TIER_MIXES, d.tierMix),
    ...(typeof raw.hintsPerGame === 'number' ? { hintsPerGame: int(raw.hintsPerGame, 1) } : {}),
    ...(game ? { game } : {}),
    ...(typeof raw.intervalSec === 'number' ? { intervalSec: int(raw.intervalSec, 0) } : {}),
    ...(typeof raw.cooldownSec === 'number' ? { cooldownSec: int(raw.cooldownSec, 0) } : {}),
    ...(duel
      ? {
          duel: {
            hp: int(duel.hp, 150),
            damage: oneOf(duel.damage, DAMAGES, 'difficulty'),
            combo: duel.combo !== false,
            ...(duel.teams === true ? { teams: true } : {}),
          },
        }
      : {}),
    ...(royale
      ? { royale: { baseSec: int(royale.baseSec, 120), incrementSec: int(royale.incrementSec, 0), skips: int(royale.skips, 0) } }
      : {}),
    ...(surrender ? { surrender: { enabled: surrender.enabled === true, maxUses: int(surrender.maxUses, 1) } } : {}),
  };
}

/** Datos de sala que elige el anfitrión además de las reglas. */
export interface RoomInput {
  title: string;
  visibility: CompetitionVisibility;
  maxPlayers: number;
  clueCount: number;
}

export const MAX_TITLE = 60;
export const MAX_CLUES = 150;

export function normalizeRoom(raw: Raw): RoomInput {
  return {
    title: String(raw.title ?? '').trim().slice(0, MAX_TITLE),
    visibility: oneOf(raw.visibility, VISIBILITIES, 'public'),
    maxPlayers: int(raw.maxPlayers, 2),
    clueCount: int(raw.clueCount, 30),
  };
}

/** Errores de reglas y de sala juntos (lo que el servidor rechaza al crear o editar). */
export function validateRoom(config: CompetitionConfig, room: RoomInput): string[] {
  const errors = validateConfig(config, room.maxPlayers);
  if (!room.title) errors.push('La sala necesita un título.');
  if (room.clueCount < 1 || room.clueCount > MAX_CLUES) errors.push(`La cantidad de cripticos debe estar entre 1 y ${MAX_CLUES}.`);
  return errors;
}

/** Campos de reglas: al editar se reemplazan todos (los que falten se borran del documento). */
export const CONFIG_KEYS = [
  'mode',
  'flow',
  'durationSec',
  'targetCount',
  'winByTwo',
  'difficultyVote',
  'rivalCountdownSec',
  'comeback',
  'bossLevel',
  'maxHintsPerClue',
  'tierMix',
  'hintsPerGame',
  'game',
  'intervalSec',
  'cooldownSec',
  'duel',
  'royale',
  'surrender',
  // Campos de versiones anteriores que una edición limpia.
  'scoring',
  'extraTime',
  'wrongPenalty',
  'hideScoreboard',
] as const;
