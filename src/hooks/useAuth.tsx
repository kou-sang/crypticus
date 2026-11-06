// Contexto de sesión: usuario de Firebase Auth + perfil de Firestore en tiempo real.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import type { UserProfile } from '../../shared/types';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean; // true hasta conocer usuario y perfil
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

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
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setProfileReady(true);
      },
      (error) => {
        console.error('[auth] perfil', error);
        setProfileReady(true);
      },
    );
  }, [user]);

  const value = useMemo(
    () => ({ user, profile, loading: !authReady || !profileReady }),
    [user, profile, authReady, profileReady],
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
