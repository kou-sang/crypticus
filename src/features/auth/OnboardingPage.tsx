// Primer ingreso: elegir nombre visible y @usuario único.
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { createProfile } from '../../lib/repo';
import { errorMessage, toHandle } from '../../lib/utils';
import { Button, ErrorBanner, Input, PageLoader } from '../../components/ui';
import { Logo } from '../../components/Logo';
import { ProfileOffline } from '../../components/ProfileOffline';

export default function OnboardingPage() {
  const { user, profile, loading, profileOffline, adoptProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/inicio';

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [handle, setHandle] = useState(toHandle(user?.displayName ?? ''));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (profileOffline) return <ProfileOffline />;
  if (profile) return <Navigate to={from} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (displayName.trim().length < 2) return setError('El nombre debe tener al menos 2 caracteres.');
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) return setError('El usuario debe tener 3–20 caracteres: a-z, 0-9 o _.');
    setBusy(true);
    try {
      // Se adopta el perfil antes de navegar: si el listener tarda o está bloqueado, la guarda de rutas
      // ya lo ve y no devuelve a /bienvenida.
      adoptProfile(await createProfile(user.uid, displayName, handle));
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10 fade-in">
      <Logo large />
      <h1 className="mt-10 font-display text-3xl">Firma tu primera partida</h1>
      <p className="mt-2 text-sm text-muted">Así te verán tus rivales en el marcador.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input label="Nombre visible" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} required />
        <Input
          label="Usuario"
          value={handle}
          onChange={(e) => setHandle(toHandle(e.target.value))}
          hint="Tus amigos te encontrarán como @usuario."
          // iOS: sin mayúscula inicial ni autocorrector (cambiaban el texto mientras se escribía).
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          spellCheck={false}
          inputMode="text"
          required
        />
        <ErrorBanner error={error} />
        <Button type="submit" loading={busy} className="w-full">
          Continuar
        </Button>
      </form>
    </div>
  );
}
