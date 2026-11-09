import { describe, expect, it } from 'vitest';
import { LIVE_TTL_MS, LOBBY_TTL_MS, isActiveRoom } from './rooms';

describe('isActiveRoom', () => {
  const now = 1_000_000_000;
  it('muestra salas recientes en espera o en vivo', () => {
    expect(isActiveRoom({ status: 'lobby', createdAt: now - 60_000 }, now)).toBe(true);
    expect(isActiveRoom({ status: 'live', createdAt: now - LOBBY_TTL_MS * 2, startedAt: now - 60_000 }, now)).toBe(true);
  });
  it('oculta salas abandonadas y terminadas', () => {
    expect(isActiveRoom({ status: 'lobby', createdAt: now - LOBBY_TTL_MS }, now)).toBe(false);
    expect(isActiveRoom({ status: 'live', createdAt: now - LIVE_TTL_MS - 1, startedAt: null }, now)).toBe(false);
    expect(isActiveRoom({ status: 'finished', createdAt: now }, now)).toBe(false);
  });
});
