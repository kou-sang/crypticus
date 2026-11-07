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
  tiebreak?: boolean; // Pool de desempate: nunca entra en la selección normal.
  kind?: string; // Tipo principal (primer tag). Importes anteriores a v1.0 no lo tienen.
}

const secrets = rawSecrets as unknown as Record<string, WorkerCrypticSecret>;

export function getCrypticSecret(crypticId: string): WorkerCrypticSecret | null {
  return Object.prototype.hasOwnProperty.call(secrets, crypticId) ? (secrets[crypticId] ?? null) : null;
}

/** Todos los cripticos empaquetados, por dificultad: los normales y los de desempate por separado. */
let byTierCache: { regular: Record<Difficulty, string[]>; tiebreak: Record<Difficulty, string[]> } | null = null;
function buildByTier() {
  if (!byTierCache) {
    byTierCache = { regular: { easy: [], medium: [], hard: [] }, tiebreak: { easy: [], medium: [], hard: [] } };
    for (const [id, secret] of Object.entries(secrets)) byTierCache[secret.tiebreak ? 'tiebreak' : 'regular'][secret.tier]?.push(id);
  }
  return byTierCache;
}

/** Base de la selección sin repetir (excluye el pool de desempate). */
export function catalogByTier(): Record<Difficulty, string[]> {
  return buildByTier().regular;
}

/** Tipo de criptico para repartir la selección (undefined si el import no lo trae). */
export function crypticKind(crypticId: string): string | undefined {
  return getCrypticSecret(crypticId)?.kind;
}

/** Pool de desempate (respuestas de 2 y 3 palabras), por dificultad. */
export function catalogTiebreak(): Record<Difficulty, string[]> {
  return buildByTier().tiebreak;
}

/** Catálogo (dificultad + nº de pistas) de los ids que tengan secreto disponible. */
export function buildCatalog(ids: string[]): Record<string, CatalogEntry> {
  const catalog: Record<string, CatalogEntry> = {};
  for (const id of ids) {
    const secret = getCrypticSecret(id);
    if (secret) catalog[id] = { tier: secret.tier, hintCount: secret.hints.length, ...(secret.kind ? { kind: secret.kind } : {}) };
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
      solvedBy:
        state.tiebreak?.played.includes(crypticId) === true
          ? state.tiebreak.winnerId && state.tiebreak.crypticId === crypticId ? [state.tiebreak.winnerId] : []
          : participants.filter((p) => p.solvedIds.includes(crypticId)).map((p) => p.uid),
    };
  });
}
