// Cliente HTTP del Worker (crear/editar sala, iniciar y soluciones; respuestas y pistas van por WebSocket, ver gameChannel.ts).
import { auth } from './firebase';
import type { Solution } from '../../shared/protocol';

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

async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: object): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError('unauthenticated', 'Inicia sesión primero.', 401);

  let response: Response;
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${await user.getIdToken()}` };
    if (body) headers['Content-Type'] = 'application/json';
    response = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
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

export const api = {
  create: (input: object) => request<{ id: string; existing?: boolean }>('POST', 'competitions', input),
  update: (competitionId: string, input: object) =>
    request<{ id: string }>('PATCH', `competitions/${encodeURIComponent(competitionId)}`, input),
  start: (competitionId: string) =>
    request<{ startedAt: number; endsAt: number }>('POST', 'competitions/start', { competitionId }),
  solutions: (competitionId: string) =>
    request<Solution[]>('GET', `competitions/${encodeURIComponent(competitionId)}/solutions`),
};
