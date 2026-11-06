// Modos de juego: configuración de la UI -> reglas del motor. Puro: lo usan el cliente (al crear) y los tests.
import { DEFAULT_CONFIG } from './scoring';
import type {
  ComebackLevel,
  CompetitionConfig,
  Difficulty,
  DuelDamage,
  GameMode,
} from './types';

export type RaceIntensity = 'peaceful' | 'hardcore';
export const SUDDEN_DEATH_OPTIONS = [0, 3, 5, 10] as const;
export const RACE_TARGET_OPTIONS = [3, 5, 7, 10] as const;
export const DUEL_HP_OPTIONS = [100, 150, 200] as const;
export const ROUND_INTERVAL_SEC = 3;
export const RACE_DURATION_SEC = 10 * 60; // Tope de una carrera.
export const COOLDOWN_OPTIONS = [1, 2, 3, 5] as const;
export const SURRENDER_USES_OPTIONS = [1, 2, 3, 5] as const;

export interface RaceSettings {
  target: number;
  intensity: RaceIntensity;
  suddenDeathSec: number; // Hardcore: segundos para que el resto acierte tras el primero (0 = instantáneo).
  difficultyVote: boolean; // Hardcore: votar dificultad del próximo (si no, aleatoria).
  winByTwo: boolean;
  surrender: { enabled: boolean; maxUses: number };
  hints: boolean;
  cooldownSec: number;
}

export interface RoyaleSettings {
  baseSec: number;
  incrementSec: number;
  cooldownSec: number;
}

export interface DuelSettings {
  hp: number;
  damage: DuelDamage;
  comeback: ComebackLevel;
  cooldownSec: number;
}

export interface ModeSettings {
  game: GameMode;
  race: RaceSettings;
  royale: RoyaleSettings;
  duel: DuelSettings;
}

/** Controles de tiempo de Royale, al estilo de las plataformas de ajedrez: minutos + segundos por acierto. */
export const ROYALE_PRESETS: ReadonlyArray<{ name: string; baseSec: number; incrementSec: number }> = [
  { name: 'Hyperbullet', baseSec: 60, incrementSec: 0 },
  { name: 'Hyperbullet', baseSec: 60, incrementSec: 5 },
  { name: 'Bullet', baseSec: 120, incrementSec: 0 },
  { name: 'Bullet', baseSec: 120, incrementSec: 5 },
  { name: 'Rapid', baseSec: 180, incrementSec: 0 },
  { name: 'Rapid', baseSec: 180, incrementSec: 5 },
];

/** Royale siempre es progresivo: 10 fáciles, 10 medios y después solo difíciles. */
export const ROYALE_TIER_COUNTS: Record<Difficulty, number> = { easy: 10, medium: 10, hard: 40 };

export const DEFAULT_MODE_SETTINGS: ModeSettings = {
  game: 'race',
  race: {
    target: 5,
    intensity: 'hardcore',
    suddenDeathSec: 5,
    difficultyVote: false,
    winByTwo: false,
    surrender: { enabled: true, maxUses: 2 },
    hints: true,
    cooldownSec: 2,
  },
  royale: { baseSec: 120, incrementSec: 5, cooldownSec: 1 },
  duel: { hp: 150, damage: 'difficulty', comeback: 'low', cooldownSec: 2 },
};

export const MODE_MAX_PLAYERS: Record<GameMode, number> = { race: 8, royale: 8, duel: 2, boss: 4 };

export function formatTimeControl(baseSec: number, incrementSec: number): string {
  const minutes = baseSec / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}+${incrementSec}`;
}

export interface BuiltGame {
  config: CompetitionConfig;
  maxPlayers: number;
  clueCount: number;
  title: string;
}

export function buildConfig(settings: ModeSettings): BuiltGame {
  const base: CompetitionConfig = { ...DEFAULT_CONFIG, game: settings.game, intervalSec: 0, maxHintsPerClue: 0 };

  if (settings.game === 'royale') {
    const { baseSec, incrementSec } = settings.royale;
    return {
      config: {
        ...base,
        mode: 'timed',
        flow: 'free',
        tierMix: 'progressive',
        durationSec: 60 * 60,
        royale: { baseSec, incrementSec },
        cooldownSec: settings.royale.cooldownSec,
      },
      maxPlayers: MODE_MAX_PLAYERS.royale,
      clueCount: ROYALE_TIER_COUNTS.easy + ROYALE_TIER_COUNTS.medium + ROYALE_TIER_COUNTS.hard,
      title: `Royale ${formatTimeControl(baseSec, incrementSec)}`,
    };
  }

  if (settings.game === 'duel') {
    const { hp, damage, comeback } = settings.duel;
    return {
      config: {
        ...base,
        mode: 'timed',
        flow: 'rounds',
        durationSec: 30 * 60,
        rivalCountdownSec: 0,
        intervalSec: ROUND_INTERVAL_SEC,
        difficultyVote: false,
        comeback,
        duel: { hp, damage },
        cooldownSec: settings.duel.cooldownSec,
      },
      maxPlayers: MODE_MAX_PLAYERS.duel,
      clueCount: 30,
      title: `Duel ${hp} HP`,
    };
  }

  // Race (y Boss, que la validación rechaza mientras esté "próximamente").
  const race = settings.race;
  const hardcore = race.intensity === 'hardcore';
  return {
    config: {
      ...base,
      mode: 'count',
      flow: hardcore ? 'rounds' : 'free',
      targetCount: race.target,
      durationSec: RACE_DURATION_SEC,
      rivalCountdownSec: hardcore ? race.suddenDeathSec : 0,
      intervalSec: ROUND_INTERVAL_SEC, // Pausa de 3 s con la solución (en Pacífico, por jugador).
      difficultyVote: hardcore && race.difficultyVote,
      winByTwo: race.winByTwo,
      extraTime: { enabled: false, seconds: 60, maxUses: 1 },
      surrender: race.surrender,
      maxHintsPerClue: race.hints ? 2 : 0,
      cooldownSec: race.cooldownSec,
    },
    maxPlayers: settings.game === 'boss' ? MODE_MAX_PLAYERS.boss : MODE_MAX_PLAYERS.race,
    // Se gana por meta, no por agotar la lista: hay cripticos de sobra para los 10 minutos.
    clueCount: hardcore ? 30 : 60,
    title: `Race a ${race.target}${hardcore ? ' · Hardcore' : ''}`,
  };
}
