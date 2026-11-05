// HMAC-SHA256 de respuestas normalizadas. Usa WebCrypto: funciona igual en Node 20+ y en Workers.
// La clave (ANSWER_HMAC_KEY) solo existe en el servidor; sin ella, los hashes no se pueden atacar por diccionario.
import { normalizeAnswer } from './answer';

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keyCache.set(secret, key);
  }
  return key;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hash de una respuesta. `crypticId` actúa como sal: la misma palabra produce hashes distintos por criptico. */
export async function hashAnswer(secret: string, crypticId: string, rawAnswer: string): Promise<string> {
  if (!secret) throw new Error('ANSWER_HMAC_KEY vacío.');
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${crypticId}:${normalizeAnswer(rawAnswer)}`));
  return toHex(signature);
}

/** Comparación en tiempo constante para no filtrar información por timing. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyAnswer(secret: string, crypticId: string, guess: string, expectedHash: string): Promise<boolean> {
  if (!normalizeAnswer(guess)) return false;
  return safeEqualHex(await hashAnswer(secret, crypticId, guess), expectedHash);
}
