// Envoltorio común para Vercel Functions: método, auth, parseo y errores tipados.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminAuth } from './firebaseAdmin.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AuthedContext<TBody> {
  uid: string;
  displayName: string;
  body: TBody;
}

type Validator<TBody> = (raw: unknown) => TBody;

export function postHandler<TBody, TResult>(
  validate: Validator<TBody>,
  handle: (ctx: AuthedContext<TBody>) => Promise<TResult>,
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Solo POST.');

      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) throw new HttpError(401, 'unauthenticated', 'Falta el token.');

      let decoded;
      try {
        decoded = await adminAuth().verifyIdToken(token);
      } catch {
        throw new HttpError(401, 'invalid_token', 'Token inválido o expirado.');
      }

      const body = validate(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
      const result = await handle({
        uid: decoded.uid,
        displayName: (decoded.name as string | undefined) ?? 'Jugador',
        body,
      });
      res.status(200).json({ ok: true, data: result });
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ ok: false, error: { code: 'bad_json', message: 'JSON inválido.' } });
        return;
      }
      console.error('[api] error inesperado', error);
      res.status(500).json({ ok: false, error: { code: 'internal', message: 'Error interno.' } });
    }
  };
}

/** Validador mínimo sin dependencias: exige strings no vacíos en las claves indicadas. */
export function requireStrings<K extends string>(...keys: K[]): Validator<Record<K, string>> {
  return (raw) => {
    if (typeof raw !== 'object' || raw === null) throw new HttpError(400, 'bad_body', 'Body inválido.');
    const record = raw as Record<string, unknown>;
    const out = {} as Record<K, string>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
        throw new HttpError(400, 'bad_body', `Campo inválido: ${key}.`);
      }
      out[key] = value;
    }
    return out;
  };
}
