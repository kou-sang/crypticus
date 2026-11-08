// Aviso de versión nueva: compara el build en ejecución con /version.json (sin caché).
// Solo avisa si lo desplegado es más nuevo (antes bastaba con que fuera distinto) y muestra las versiones,
// para distinguir un deploy real de un /version.json desfasado.
// No recarga solo para no cortar una partida en curso; el jugador decide cuándo.
import { useEffect, useState } from 'react';
import { isNewerBuild } from '../lib/buildInfo';

const CHECK_EVERY_MS = 5 * 60_000;

interface Deployed {
  version: string;
  build: string;
}

async function fetchDeployed(): Promise<Deployed | null> {
  try {
    const response = await fetch('/version.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as { version?: unknown; build?: unknown };
    if (typeof data.build !== 'string') return null;
    return { build: data.build, version: typeof data.version === 'string' ? data.version : '?' };
  } catch {
    return null; // Sin red o en desarrollo: no hay nada que avisar.
  }
}

export function UpdateBanner() {
  const [newer, setNewer] = useState<Deployed | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    const check = async () => {
      const deployed = await fetchDeployed();
      if (cancelled || deployed === null) return;
      if (isNewerBuild(deployed.build, __APP_BUILD__)) setNewer(deployed);
      else if (deployed.build !== __APP_BUILD__) console.warn('[version] desplegado no es más nuevo:', deployed.build, '· en ejecución:', __APP_BUILD__);
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

  if (!newer) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-ink px-4 py-2 text-sm text-paper">
      <span>
        Hay una versión nueva de Crypticus{' '}
        <span className="font-mono text-xs opacity-80">
          (v{__APP_VERSION__} → v{newer.version})
        </span>
        .
      </span>
      <button type="button" onClick={() => window.location.reload()} className="font-semibold underline underline-offset-4">
        Recargar
      </button>
    </div>
  );
}
