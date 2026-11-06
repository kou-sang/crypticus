// Secretos de cripticos empaquetados con el Worker (nunca llegan al navegador).
// Generados por `npm run import:cryptics`; el archivo está en .gitignore.
// `scripts/ensure-secrets.mjs` crea un placeholder vacío para que el build no falle.
import rawSecrets from './generated/cryptic-secrets.json';
import type { CatalogEntry } from '../shared/engine';
import type { Difficulty } from '../shared/types';

export interface WorkerCrypticSecret {
  hash: string; // HMAC-SHA256(ANSWER_HMAC_KEY, `${id}:${respuesta normalizada}`)
  tier: Difficulty;
  hints: string[];
  explanation?: string;
}

const secrets = rawSecrets as unknown as Record<string, WorkerCrypticSecret>;

export function getCrypticSecret(crypticId: string): WorkerCrypticSecret | null {
  return Object.prototype.hasOwnProperty.call(secrets, crypticId) ? (secrets[crypticId] ?? null) : null;
}

/** Catálogo (dificultad + nº de pistas) de los ids que tengan secreto disponible. */
export function buildCatalog(ids: string[]): Record<string, CatalogEntry> {
  const catalog: Record<string, CatalogEntry> = {};
  for (const id of ids) {
    const secret = getCrypticSecret(id);
    if (secret) catalog[id] = { tier: secret.tier, hintCount: secret.hints.length };
  }
  return catalog;
}
