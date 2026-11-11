// Pistas elegibles (v1.9): botones por tipo y resaltado de las partes reveladas en el enunciado.
import type { ReactNode } from 'react';
import { HINT_KIND_LABELS, HINT_KINDS, type HintKind, type RevealedHint } from '../../../shared/hints';
import { cx } from '../../lib/utils';

/** Estilo de cada parte revelada en el enunciado. */
const PART_CLASS: Record<Exclude<HintKind, 'letra'>, string> = {
  definicion: 'underline decoration-2 decoration-ok underline-offset-4',
  indicador: 'bg-accent/15 text-accent',
  relleno: 'bg-ink/10 underline decoration-dotted underline-offset-4',
};

/** Una letra por carácter (sin tildes, en minúsculas): conserva las posiciones del texto original. */
function fold(text: string): string {
  return [...text].map((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c).join('');
}

/** Enunciado con las partes ya reveladas resaltadas (definición, indicador, relleno). */
export function highlightClue(text: string, revealed: readonly RevealedHint[] | undefined): ReactNode {
  const marks: Array<{ from: number; to: number; kind: Exclude<HintKind, 'letra'> }> = [];
  const folded = fold(text);
  for (const hint of revealed ?? []) {
    if (hint.kind === 'letra') continue;
    for (const part of hint.parts) {
      const at = folded.indexOf(fold(part));
      if (at >= 0 && !marks.some((m) => at < m.to && at + part.length > m.from)) marks.push({ from: at, to: at + part.length, kind: hint.kind });
    }
  }
  if (marks.length === 0) return text;
  marks.sort((a, b) => a.from - b.from);
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.from > cursor) out.push(text.slice(cursor, mark.from));
    out.push(
      <mark key={mark.from} className={cx('rounded-sm bg-transparent px-0.5 text-inherit', PART_CLASS[mark.kind])} title={HINT_KIND_LABELS[mark.kind]}>
        {text.slice(mark.from, mark.to)}
      </mark>,
    );
    cursor = mark.to;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/** Lista de pistas reveladas (las letras como «Letra 3: M»). */
export function RevealedHints({ revealed }: { revealed: readonly RevealedHint[] }) {
  if (revealed.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2 text-xs">
      {revealed.map((hint, i) => (
        <li key={i} className="border border-line px-2 py-1">
          <span className="font-semibold uppercase tracking-widest text-muted">{HINT_KIND_LABELS[hint.kind]}</span>{' '}
          {hint.kind === 'letra' ? (
            <span className="font-mono">
              {hint.index + 1}.ª → <strong>{hint.letter}</strong>
            </span>
          ) : (
            hint.parts.map((p) => `«${p}»`).join(', ')
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Botones para pedir una pista de un tipo. `available`: tipos que el criptico todavía admite;
 * `counts` (COOP): pistas de cada tipo que tiene el jugador.
 */
export function HintPicker({
  available,
  onPick,
  disabled,
  busy,
  counts,
}: {
  available: readonly HintKind[];
  onPick: (kind: HintKind) => void;
  disabled?: boolean;
  busy?: HintKind | null;
  counts?: Partial<Record<HintKind, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Pedir una pista">
      {HINT_KINDS.map((kind) => {
        const count = counts?.[kind];
        const off = disabled || !available.includes(kind) || (counts !== undefined && !count);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            disabled={off || busy != null}
            className={cx(
              'border px-2 py-1 text-xs font-semibold transition-colors',
              off ? 'border-line text-muted opacity-50' : 'border-ink hover:bg-ink hover:text-paper',
              busy === kind && 'animate-pulse',
            )}
          >
            {HINT_KIND_LABELS[kind]}
            {counts !== undefined && <span className="ml-1 font-mono opacity-70">{count ?? 0}</span>}
          </button>
        );
      })}
    </div>
  );
}
