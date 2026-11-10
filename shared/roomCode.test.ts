import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode, rematchRoomId, roomTitle, ROOM_CODE_PATTERN } from './roomCode';

describe('roomCode', () => {
  it('genera 4 letras mayúsculas', () => {
    for (let i = 0; i < 100; i++) expect(ROOM_CODE_PATTERN.test(generateRoomCode())).toBe(true);
  });

  it('descarta bytes que sesgarían la distribución', () => {
    const bytes = [250, 0, 255, 1, 2, 25];
    expect(generateRoomCode(() => bytes.shift()!)).toBe('ABCZ');
  });

  it('normaliza lo que escribe el usuario', () => {
    expect(normalizeRoomCode(' ab-cd ')).toBe('ABCD');
    expect(normalizeRoomCode('abc')).toBeNull();
    expect(normalizeRoomCode('abcde')).toBeNull();
  });

  it('el título es código + anfitrión', () => {
    expect(roomTitle('QWER', 'Ana')).toBe('QWER · Ana');
  });
});

describe('rematchRoomId', () => {
  it('es fijo por partida y corto en una serie de revanchas', () => {
    expect(rematchRoomId({ id: 'AbCdEfGhIjKlMnOpQrSt' })).toBe('AbCdEfGhIjKlMnOpQrSt-r1');
    expect(rematchRoomId({ id: 'AbCdEfGhIjKlMnOpQrSt-r1', chatId: 'AbCdEfGhIjKlMnOpQrSt', rematchDepth: 1 })).toBe('AbCdEfGhIjKlMnOpQrSt-r2');
    expect(rematchRoomId({ id: 'x', chatId: 'AbCdEfGhIjKlMnOpQrSt', rematchDepth: 99 }).length).toBeLessThanOrEqual(64);
  });
});
