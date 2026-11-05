// Error tipado compartido por el Worker y el Durable Object.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
  }
  console.error('[worker] error inesperado', error);
  return json({ ok: false, error: { code: 'internal', message: 'Error interno.' } }, 500);
}
