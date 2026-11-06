// Secretos de cripticos empaquetados con el Worker (nunca llegan al navegador).
// Generados por `npm run import:cryptics`; el archivo está en .gitignore.
// `scripts/ensure-secrets.mjs` crea un placeholder vacío para que el build no falle.
import rawSecrets from './generated/cryptic-secrets.json';
import { revealableIds, type CatalogEntry, type LiveState } from '../shared/engine';
import type { Solution } from '../shared/protocol';
import type { Difficulty } from '../shared/types';

export interface WorkerCrypticSecret {
  hash: string; // HMAC-SHA256(ANSWER_HMAC_KEY, `${id}:${respuesta normalizada}`)
  tier: Difficulty;
  hints: string[];
  explanation?: string;
  answer?: string; // Forma legible para mostrar al final (los importes anteriores no la tienen).
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

/** Soluciones que el estado permite mostrar, con quién resolvió cada una. */
export function solutionsFor(state: LiveState): Solution[] {
  const participants = Object.values(state.participants);
  return revealableIds(state).map((crypticId) => {
    const secret = getCrypticSecret(crypticId);
    return {
      crypticId,
      answer: secret?.answer ?? null,
      explanation: secret?.explanation ?? null,
      solvedBy: participants.filter((p) => p.solvedIds.includes(crypticId)).map((p) => p.uid),
    };
  });
}
