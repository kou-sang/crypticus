import type { CompetitionRoom } from './competitionRoom';

export interface Env {
  ASSETS: Fetcher;
  COMPETITION_ROOM: DurableObjectNamespace<CompetitionRoom>;
  FIREBASE_PROJECT_ID: string; // var pública (wrangler.jsonc)
  FIREBASE_SERVICE_ACCOUNT: string; // secret: JSON o base64
  ANSWER_HMAC_KEY: string; // secret
  DO_LOCATION_HINT?: string; // var: región preferida de las salas (p. ej. 'sam' = Sudamérica)
}
