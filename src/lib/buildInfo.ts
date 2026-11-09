// Identificador de build: `${versión}+${marca de tiempo en base 36}` (ver vite.config.ts).
// Sirve para avisar solo cuando lo desplegado es MÁS NUEVO que lo que corre en el navegador.

export interface BuildId {
  version: number[]; // [mayor, menor, parche]
  builtAt: number; // ms; NaN si no se puede leer.
}

export function parseBuild(build: string): BuildId {
  const [version = '', stamp = ''] = build.split('+');
  return {
    version: version.split('.').map((part) => Number.parseInt(part, 10) || 0),
    builtAt: Number.parseInt(stamp, 36),
  };
}

/** true si `deployed` es posterior a `running`: versión mayor o, a igual versión, compilada después. */
export function isNewerBuild(deployed: string, running: string): boolean {
  if (deployed === running) return false;
  const a = parseBuild(deployed);
  const b = parseBuild(running);
  for (let i = 0; i < Math.max(a.version.length, b.version.length); i += 1) {
    const diff = (a.version[i] ?? 0) - (b.version[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  if (Number.isNaN(a.builtAt) || Number.isNaN(b.builtAt)) return false;
  return a.builtAt > b.builtAt;
}
