// Marca: "C" cursiva en Fraunces sobre cuadro de tinta. Mismo diseño que /favicon.svg.
export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-grid place-items-center bg-ink text-paper ${className}`}>
      <span className="font-display text-[1.15em] font-semibold italic leading-none">C</span>
    </span>
  );
}

export function Logo({ large = false }: { large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark className={large ? 'size-10 text-2xl' : 'size-7 text-lg'} />
      <span className={`font-display font-semibold tracking-tight ${large ? 'text-3xl' : 'text-xl'}`}>Crypticus</span>
    </span>
  );
}
