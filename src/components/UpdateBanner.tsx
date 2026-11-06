// Aviso de versión nueva: compara el build en ejecución con /version.json (sin caché).
// No recarga solo para no cortar una partida en curso; el jugador decide cuándo.
import { useEffect, useState } from 'react';

const CHECK_EVERY_MS = 5 * 60_000;

async function fetchDeployedBuild(): Promise<string | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { build?: unknown };
    return typeof data.build === 'string' ? data.build : null;
  } catch {
    return null; // Sin red o en desarrollo: no hay nada que avisar.
  }
}

export function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    const check = async () => {
      const deployed = await fetchDeployedBuild();
      if (!cancelled && deployed !== null && deployed !== __APP_BUILD__) setOutdated(true);
    };
    const onVisible = () => document.visibilityState === 'visible' && void check();
    void check();
    const id = window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!outdated) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-ink px-4 py-2 text-sm text-paper">
      <span>Hay una versión nueva de Crypticus.</span>
      <button type="button" onClick={() => window.location.reload()} className="font-semibold underline underline-offset-4">
        Recargar
      </button>
    </div>
  );
}
