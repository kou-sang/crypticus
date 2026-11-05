// Secretos de cripticos empaquetados con el Worker (nunca llegan al navegador).
// Generados por `npm run import:cryptics`; el archivo está en .gitignore.
// `scripts/ensure-secrets.mjs` crea un placeholder vacío para que el build no falle.
import rawSecrets from './generated/cryptic-secrets.json';

export interface WorkerCrypticSecret {
  hash: string; // HMAC-SHA256(ANSWER_HMAC_KEY, `${id}:${respuesta normalizada}`)
  difficulty: 1 | 2 | 3 | 4 | 5;
  hints: string[];
  explanation?: string;
}

const secrets = rawSecrets as unknown as Record<string, WorkerCrypticSecret>;

export function getCrypticSecret(crypticId: string): WorkerCrypticSecret | null {
  return Object.prototype.hasOwnProperty.call(secrets, crypticId) ? (secrets[crypticId] ?? null) : null;
}
