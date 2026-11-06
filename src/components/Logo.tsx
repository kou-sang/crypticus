export function Logo({ large = false }: { large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={`grid grid-cols-2 gap-px bg-ink p-px ${large ? 'size-9' : 'size-6'}`}>
        <span className="bg-paper" />
        <span className="bg-accent" />
        <span className="bg-paper" />
        <span className="bg-paper" />
      </span>
      <span className={`font-display font-semibold tracking-tight ${large ? 'text-3xl' : 'text-xl'}`}>
        Crypticus
      </span>
    </span>
  );
}
