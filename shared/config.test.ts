import { describe, expect, it } from 'vitest';
import { normalizeConfig, normalizeRoom, validateRoom } from './config';
import { buildConfig, DEFAULT_MODE_SETTINGS } from './gameModes';

describe('normalizeConfig', () => {
  it('conserva la configuración de cada modo', () => {
    for (const game of ['race', 'royale', 'duel'] as const) {
      const { config } = buildConfig({ ...DEFAULT_MODE_SETTINGS, game });
      expect(normalizeConfig(JSON.parse(JSON.stringify(config)))).toEqual(config);
    }
  });

  it('descarta campos desconocidos o viejos y corrige tipos', () => {
    const config = normalizeConfig({ mode: 'hack', scoring: 'speed', extraTime: { enabled: true }, durationSec: '999', evil: 1 });
    expect(config.mode).toBe('timed');
    expect('scoring' in config).toBe(false);
    expect('extraTime' in config).toBe(false);
    expect('evil' in config).toBe(false);
    expect(config.durationSec).toBe(600);
  });
});

describe('validateRoom', () => {
  it('rechaza reglas inválidas y salas sin título', () => {
    const { config, maxPlayers } = buildConfig({ ...DEFAULT_MODE_SETTINGS, game: 'duel' });
    expect(validateRoom(config, normalizeRoom({ title: 'Duelo', maxPlayers, clueCount: 30 }))).toEqual([]);
    expect(validateRoom(config, normalizeRoom({ title: 'Duelo', maxPlayers: 50, clueCount: 30 })).length).toBeGreaterThan(0);
    expect(validateRoom(config, normalizeRoom({ title: '  ', maxPlayers, clueCount: 30 }))).toContain('La sala necesita un título.');
  });
});
