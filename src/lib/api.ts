// Cliente de las Vercel Functions con token de Firebase y errores tipados.
import { auth } from './firebase';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError('unauthenticated', 'Inicia sesión primero.', 401);

  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 'Sin conexión con el servidor.', 0);
  }

  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError('bad_response', 'Respuesta inválida del servidor.', response.status);
  }
  if (!payload.ok) throw new ApiError(payload.error.code, payload.error.message, response.status);
  return payload.data;
}

export interface AnswerResult {
  correct: boolean;
  points: number;
  finished: boolean;
  answer?: string;
  explanation?: string | null;
}

export interface HintResult {
  hints: string[];
  remaining: number;
}

export const api = {
  start: (competitionId: string) => post<{ startedAt: number; endsAt: number }>('competitions/start', { competitionId }),
  answer: (competitionId: string, crypticId: string, guess: string) =>
    post<AnswerResult>('competitions/answer', { competitionId, crypticId, guess }),
  hint: (competitionId: string, crypticId: string, reveal: boolean) =>
    post<HintResult>('competitions/hint', { competitionId, crypticId, reveal }),
  finalize: (competitionId: string) =>
    post<{ finished: boolean; winnerId: string | null }>('competitions/finalize', { competitionId }),
};
