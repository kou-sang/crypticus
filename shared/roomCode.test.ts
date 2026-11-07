import { describe, expect, it } from 'vitest';
import { generateRoomCode, normalizeRoomCode, roomTitle, ROOM_CODE_PATTERN } from './roomCode';

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
