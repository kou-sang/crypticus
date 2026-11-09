// Novedades en Inicio: las últimas versiones destacadas y un botón que abre el historial completo.
// En PC va a la derecha de Inicio; en móvil, debajo del criptico de ejemplo.
import { memo, useId, useState } from 'react';
import { Modal } from '../../components/Modal';
import { HIGHLIGHTS_SHOWN, RELEASES, type Release } from './updates';

const DATE_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG_DATE_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function formatDate(iso: string, format = DATE_FORMAT): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(at) ? iso : format.format(at);
}

function Bullets({ items, mark = '·' }: { items: string[]; mark?: string }) {
  return (
    <ul className="space-y-1 text-sm leading-snug">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="shrink-0">
            {mark}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Historial completo en lenguaje común: novedades y arreglos de cada versión. */
function ReleaseNotes({ releases }: { releases: readonly Release[] }) {
  return (
    <ol className="space-y-6">
      {releases.map((release) => (
        <li key={release.version}>
          <p className="flex items-baseline justify-between gap-2 font-mono text-xs text-muted">
            <span className="font-semibold">v{release.version}</span>
            <time dateTime={release.date}>{formatDate(release.date, LONG_DATE_FORMAT)}</time>
          </p>
          <h3 className="mb-2 font-display text-lg leading-snug">{release.title}</h3>
          {release.news.length > 0 && <Bullets items={release.news} />}
          {release.fixes && release.fixes.length > 0 && (
            <div className={release.news.length > 0 ? 'mt-2' : ''}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted">Arreglos</p>
              <Bullets items={release.fixes} mark="✓" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export const UpdatesPanel = memo(function UpdatesPanel() {
  // Inicio monta el panel dos veces (PC y móvil): el id del título debe ser único.
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const highlights = RELEASES.filter((release) => release.highlight).slice(0, HIGHLIGHTS_SHOWN);
  if (highlights.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className="border-2 border-ink">
      <h2 id={titleId} className="border-b-2 border-ink px-4 py-2.5 font-display text-xl">
        Novedades
      </h2>
      <ol className="divide-y divide-line">
        {highlights.map((release, index) => (
          <li key={release.version} className="px-4 py-3">
            <p className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-muted">
              <span className={index === 0 ? 'font-semibold text-accent' : ''}>v{release.version}</span>
              <time dateTime={release.date}>{formatDate(release.date)}</time>
            </p>
            <h3 className="mt-0.5 font-semibold leading-snug">{release.title}</h3>
            <div className="mt-1 text-muted">
              <Bullets items={release.news.slice(0, 3)} />
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-line px-4 py-2.5 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 border border-line px-3 py-1 text-sm font-semibold hover:border-ink"
        >
          Mostrar todo
          <span aria-hidden>→</span>
        </button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Todas las novedades" wide>
        <ReleaseNotes releases={RELEASES} />
      </Modal>
    </section>
  );
});
