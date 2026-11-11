// Secretos de cripticos empaquetados con el Worker (nunca llegan al navegador).
// Generados por `npm run import:cryptics`; el archivo está en .gitignore.
// `scripts/ensure-secrets.mjs` crea un placeholder vacío para que el build no falle.
import rawSecrets from './generated/cryptic-secrets.json';
import { revealableIds, type CatalogEntry, type LiveState } from '../shared/engine';
import type { Solution } from '../shared/protocol';
import type { HintKinds } from '../shared/hints';
import { DIFFICULTIES, type CrypticParts, type Difficulty } from '../shared/types';

export interface WorkerCrypticSecret {
  hash: string; // HMAC-SHA256(ANSWER_HMAC_KEY, `${id}:${respuesta normalizada}`)
  tier: Difficulty;
  hints: string[];
  /** Partes del criptico y pistas elegibles (v1.9). Importes anteriores: pistas en orden fijo (`hints`). */
  parts?: CrypticParts;
  hintKinds?: HintKinds;
  explanation?: string;
  answer?: string; // Forma legible para mostrar al final (los importes anteriores no la tienen).
  tiebreak?: boolean; // Obsoleto (v1.9): ya no hay muerte súbita; se sortea como cualquier otro.
  kind?: string; // Tipo principal (primer tag). Importes anteriores a v1.0 no lo tienen.
  /** Enunciado y enumeración (COOP los manda con cada ronda). Importes anteriores a COOP no los tienen. */
  clue?: string;
  enumeration?: string;
}

const secrets = rawSecrets as unknown as Record<string, WorkerCrypticSecret>;

export function getCrypticSecret(crypticId: string): WorkerCrypticSecret | null {
  return Object.prototype.hasOwnProperty.call(secrets, crypticId) ? (secrets[crypticId] ?? null) : null;
}

/** Todos los cripticos empaquetados, por dificultad. */
let byTierCache: Record<Difficulty, string[]> | null = null;
export function catalogByTier(): Record<Difficulty, string[]> {
  if (!byTierCache) {
    byTierCache = Object.fromEntries(DIFFICULTIES.map((tier) => [tier, [] as string[]])) as unknown as Record<Difficulty, string[]>;
    for (const [id, secret] of Object.entries(secrets)) byTierCache[secret.tier]?.push(id);
  }
  return byTierCache;
}

/** Tipo de criptico para repartir la selección (undefined si el import no lo trae). */
export function crypticKind(crypticId: string): string | undefined {
  return getCrypticSecret(crypticId)?.kind;
}

/** Catálogo (dificultad, pistas y tipo) de los ids que tengan secreto disponible. */
export function buildCatalog(ids: string[]): Record<string, CatalogEntry> {
  const catalog: Record<string, CatalogEntry> = {};
  for (const id of ids) {
    const secret = getCrypticSecret(id);
    if (!secret) continue;
    catalog[id] = {
      tier: secret.tier,
      hintCount: secret.hints.length,
      ...(secret.hintKinds ? { hintKinds: secret.hintKinds } : {}),
      ...(secret.kind ? { kind: secret.kind } : {}),
    };
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
