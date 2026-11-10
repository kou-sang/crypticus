// Código de sala: 4 letras mayúsculas (A–Z). Identifica salas abiertas (en espera o en vivo) para entrar sin enlace.
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = /^[A-Z]{4}$/;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Código aleatorio. `randomByte` inyectable para tests (por defecto, crypto del entorno). */
export function generateRoomCode(randomByte: () => number = defaultRandomByte): string {
  let code = '';
  // 256 % 26 ≠ 0: se descartan los bytes ≥ 234 para no sesgar las primeras letras.
  while (code.length < ROOM_CODE_LENGTH) {
    const byte = randomByte();
    if (byte < 234) code += LETTERS[byte % LETTERS.length];
  }
  return code;
}

function defaultRandomByte(): number {
  return crypto.getRandomValues(new Uint8Array(1))[0]!;
}

/** Normaliza lo que escribe el usuario ("ab cd", "abcd") a "ABCD". Devuelve null si no es un código válido. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z]/g, '');
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

/** Nombre de la sala: código + anfitrión. */
/**
 * Id fijo de la sala de revancha de una partida: dos pedidos a la vez apuntan a la misma sala.
 * `<primera sala>-r<n>`: corto aunque se encadenen muchas revanchas (los ids de sala tienen tope de 64).
 */
export function rematchRoomId(origin: { id: string; chatId?: string; rematchDepth?: number }): string {
  return `${origin.chatId ?? origin.id}-r${(origin.rematchDepth ?? 0) + 1}`;
}

export function roomTitle(code: string, hostName: string): string {
  return `${code} · ${hostName}`.slice(0, 60);
}
