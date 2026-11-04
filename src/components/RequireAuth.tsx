// Guardas de ruta: sesión obligatoria y perfil completo (onboarding).
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { PageLoader } from './ui';

export function RequireAuth() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (!profile) return <Navigate to="/bienvenida" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Solo para invitados: si ya hay sesión con perfil, va al inicio. */
export function GuestOnly() {
  const { user, profile, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user && profile) return <Navigate to="/inicio" replace />;
  if (user && !profile) return <Navigate to="/bienvenida" replace />;
  return <Outlet />;
}
