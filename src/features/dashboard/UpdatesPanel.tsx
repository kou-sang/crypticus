// Novedades importantes (ver `updates.ts`). En PC va a la derecha de Inicio; en móvil, debajo del criptico de ejemplo.
import { memo, useId } from 'react';
import { UPDATES, UPDATES_SHOWN } from './updates';

const DATE_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function formatDate(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(at) ? iso : DATE_FORMAT.format(at);
}

export const UpdatesPanel = memo(function UpdatesPanel() {
  // Inicio monta el panel dos veces (PC y móvil): el id del título debe ser único.
  const titleId = useId();
  const entries = UPDATES.slice(0, UPDATES_SHOWN);
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="border-2 border-ink">
      <h2 id={titleId} className="border-b-2 border-ink px-4 py-2.5 font-display text-xl">
        Novedades
      </h2>
      <ol className="divide-y divide-line">
        {entries.map((entry, index) => (
          <li key={entry.version} className="px-4 py-3">
            <p className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-muted">
              <span className={index === 0 ? 'font-semibold text-accent' : ''}>v{entry.version}</span>
              <time dateTime={entry.date}>{formatDate(entry.date)}</time>
            </p>
            <h3 className="mt-0.5 font-semibold leading-snug">{entry.title}</h3>
            <ul className="mt-1 space-y-1 text-sm leading-snug text-muted">
              {entry.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
});
