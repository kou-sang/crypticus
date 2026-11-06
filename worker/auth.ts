// Verificación de ID tokens de Firebase sin Admin SDK (JWKS público de Google, cacheado por jose).
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from './errors';

const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  { cooldownDuration: 30_000, cacheMaxAge: 6 * 60 * 60 * 1000 },
);

export interface VerifiedUser {
  uid: string;
  name: string | null;
}

export async function verifyFirebaseToken(token: string, projectId: string): Promise<VerifiedUser> {
  if (!token) throw new AppError(401, 'unauthenticated', 'Falta el token.');
  if (!projectId) throw new AppError(500, 'misconfigured', 'FIREBASE_PROJECT_ID no configurado.');
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new Error('sub vacío');
    return { uid: payload.sub, name: typeof payload.name === 'string' ? payload.name : null };
  } catch {
    throw new AppError(401, 'invalid_token', 'Token inválido o expirado.');
  }
}

export function bearerToken(request: Request): string {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}
