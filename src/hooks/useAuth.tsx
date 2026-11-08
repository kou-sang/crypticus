// Contexto de sesión: usuario de Firebase Auth + perfil de Firestore en tiempo real.
// «Sin perfil» solo se decide con una respuesta del servidor: la caché vacía o un listener caído no cuentan,
// porque mandaban a /bienvenida a usuarios que ya tenían perfil (y de vuelta tras cada «Continuar»).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDocFromServer, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { withTimeout } from '../lib/utils';
import type { UserProfile } from '../../shared/types';

/** loading: esperando al servidor · ready: perfil (o su ausencia) confirmado · offline: el servidor no respondió. */
type ProfileStatus = 'loading' | 'ready' | 'offline';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean; // true hasta conocer usuario y perfil
  /** No se pudo confirmar el perfil con el servidor: mostrar error de conexión, nunca el alta. */
  profileOffline: boolean;
  /** Último error al leer el perfil (código de Firestore), para diagnosticar desde la pantalla de error. */
  profileError: string | null;
  retryProfile: () => void;
  /** Usa de inmediato el perfil recién creado, sin esperar al listener. */
  adoptProfile: (profile: UserProfile) => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  profileOffline: false,
  profileError: null,
  retryProfile: () => undefined,
  adoptProfile: () => undefined,
});

const PROFILE_WAIT_MS = 8_000; // Sin confirmación del listener en este plazo, se pregunta una vez al servidor.
const PROFILE_FETCH_TIMEOUT_MS = 12_000;
const RETRY_MAX_MS = 30_000;

function describe(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) return String((error as { code: unknown }).code);
  return error instanceof Error ? error.message : String(error);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
      }),
    [],
  );

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setStatus('ready');
      return;
    }
    setStatus('loading');
    setProfileError(null);
    const ref = doc(db, 'users', user.uid);
    let cancelled = false;
    let unsubscribe: Unsubscribe | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const settle = (next: UserProfile | null) => {
      if (cancelled) return;
      clearTimeout(fallbackTimer);
      setProfile(next);
      setStatus('ready');
    };

    // Respaldo: el listener puede no llegar nunca al servidor (bloqueadores, Private Relay, protección de rastreo).
    fallbackTimer = setTimeout(async () => {
      try {
        const snap = await withTimeout(getDocFromServer(ref), PROFILE_FETCH_TIMEOUT_MS, 'Sin respuesta del servidor.');
        settle(snap.exists() ? (snap.data() as UserProfile) : null);
      } catch (error) {
        console.error('[auth] perfil (servidor)', error);
        if (cancelled) return;
        setProfileError((current) => current ?? describe(error));
        setStatus((current) => (current === 'loading' ? 'offline' : current));
      }
    }, PROFILE_WAIT_MS);

    const listen = () => {
      unsubscribe = onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snap) => {
          failures = 0;
          if (snap.exists()) settle(snap.data() as UserProfile);
          // Documento ausente: solo es definitivo si viene del servidor, no de la caché local.
          else if (!snap.metadata.fromCache) settle(null);
        },
        (error) => {
          // El error de un listener es definitivo: se vuelve a suscribir con espera creciente.
          console.error('[auth] perfil', error.code, error.message);
          unsubscribe = null;
          if (cancelled) return;
          setProfileError(describe(error));
          retryTimer = setTimeout(listen, Math.min(RETRY_MAX_MS, 1_000 * 2 ** failures));
          failures += 1;
        },
      );
    };
    listen();

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      clearTimeout(retryTimer);
      unsubscribe?.();
    };
  }, [user, attempt]);

  const retryProfile = useCallback(() => setAttempt((n) => n + 1), []);
  const adoptProfile = useCallback((next: UserProfile) => {
    setProfile(next);
    setStatus('ready');
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading: !authReady || (user !== null && status === 'loading'),
      profileOffline: user !== null && profile === null && status === 'offline',
      profileError,
      retryProfile,
      adoptProfile,
    }),
    [user, profile, authReady, status, profileError, retryProfile, adoptProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/** Versión para rutas protegidas: garantiza usuario y perfil. */
export function useSession(): { user: User; profile: UserProfile } {
  const { user, profile } = useAuth();
  if (!user || !profile) throw new Error('useSession requiere una ruta protegida.');
  return { user, profile };
}
