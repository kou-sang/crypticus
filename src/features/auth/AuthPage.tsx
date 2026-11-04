// Inicio de sesión / registro con email o Google.
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth } from '../../lib/firebase';
import { Button, ErrorBanner, Input } from '../../components/ui';
import { Logo } from '../../components/Logo';

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/email-already-in-use': 'Ese email ya tiene cuenta. Inicia sesión.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'Email inválido.',
  'auth/popup-closed-by-user': 'Se cerró la ventana de Google.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
};

function describeAuthError(error: unknown): string {
  if (error instanceof FirebaseError) return AUTH_ERRORS[error.code] ?? error.message;
  return 'No se pudo iniciar sesión.';
}

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/inicio';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate(from, { replace: true });
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10 fade-in">
      <Link to="/" className="mb-10 self-start">
        <Logo large />
      </Link>

      <div className="mb-6 grid grid-cols-2 border border-ink">
        {(['login', 'register'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMode(tab)}
            className={`h-10 text-sm font-semibold ${mode === tab ? 'bg-ink text-paper' : ''}`}
          >
            {tab === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoComplete="name" />
        )}
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Input
          label="Contraseña"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
        <ErrorBanner error={error} />
        <Button type="submit" loading={busy} className="w-full">
          {mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
        <span className="h-px flex-1 bg-line" /> o <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="secondary" onClick={handleGoogle} disabled={busy} className="w-full">
        Continuar con Google
      </Button>
    </div>
  );
}
