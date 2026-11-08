// Pantalla cuando el servidor no confirmó el perfil: se ofrece reintentar en lugar de mandar al alta.
import { useAuth } from '../hooks/useAuth';
import { Button } from './ui';

export function ProfileOffline() {
  const { retryProfile, profileError } = useAuth();
  return (
    <div role="alert" className="mx-auto flex min-h-[60dvh] max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-2xl">No pudimos cargar tu perfil</h1>
      <p className="text-sm text-muted">
        El servidor no respondió. Revisa la conexión y desactiva los bloqueadores de contenido para este sitio (Brave: escudos; Firefox:
        protección contra rastreo; Safari: bloqueadores y Relay privado).
      </p>
      {profileError && <p className="font-mono text-xs text-muted">({profileError})</p>}
      <Button onClick={retryProfile} className="mx-auto">
        Reintentar
      </Button>
    </div>
  );
}
