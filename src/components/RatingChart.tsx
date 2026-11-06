// Evolución del Elo: tiempo en el eje X, Elo en el eje Y. Una serie por modo (y la general). SVG sin librerías.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { GAME_LABELS } from '../../shared/scoring';
import { RANKED_MODES, type HistoryEntry, type RankedMode } from '../../shared/types';
import { niceTicks, timeLabel, timeTicks } from '../lib/chartScale';
import { cx } from '../lib/utils';

type Series = RankedMode | 'general';

const HEIGHT = 240;
const MARGIN = { top: 12, right: 14, bottom: 34, left: 52 };
const POINT_FORMAT = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface Point {
  at: number;
  elo: number;
  delta: number;
  won: boolean;
  title: string;
}

function seriesPoints(history: HistoryEntry[], series: Series): Point[] {
  const sorted = [...history].sort((a, b) => a.finishedAt - b.finishedAt);
  const points: Point[] = [];
  let previous: number | null = null;
  for (const entry of sorted) {
    const elo = series === 'general' ? entry.ratingAfter : entry.game === series ? entry.modeRatingAfter : undefined;
    if (typeof elo !== 'number') continue;
    // En la serie por modo el delta se deduce del punto anterior; en la general se guarda en la partida.
    const delta = series === 'general' ? entry.ratingDelta : previous === null ? 0 : elo - previous;
    points.push({ at: entry.finishedAt, elo, delta, won: entry.won, title: entry.title });
    previous = elo;
  }
  return points;
}

/** Ancho real del contenedor: el SVG se dibuja en píxeles para que el texto no se achique en móvil. */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function Plot({ points, width }: { points: Point[]; width: number }) {
  const first = points[0]!;
  const last = points.at(-1)!;
  const yTicks = niceTicks(Math.min(...points.map((p) => p.elo)), Math.max(...points.map((p) => p.elo)), 5);
  const yMin = yTicks[0]!;
  const yMax = yTicks.at(-1)!;
  // Con una sola partida (o todas al mismo instante) se abre una ventana de una hora para ubicar el punto.
  const tStart = first.at === last.at ? first.at - 1_800_000 : first.at;
  const tEnd = first.at === last.at ? last.at + 1_800_000 : last.at;
  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (t: number) => MARGIN.left + ((t - tStart) / (tEnd - tStart)) * innerW;
  const y = (v: number) => MARGIN.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.at).toFixed(1)},${y(p.elo).toFixed(1)}`).join(' ');
  const xTicks = timeTicks(tStart, tEnd, width < 420 ? 3 : 5);
  const span = tEnd - tStart;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={`Elo de ${first.elo} a ${last.elo}`} className="block overflow-visible">
      {/* Cuadrícula y eje Y (Elo) */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={MARGIN.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--muted)] font-mono text-[11px]">
            {v}
          </text>
        </g>
      ))}
      <text
        transform={`translate(12 ${MARGIN.top + innerH / 2}) rotate(-90)`}
        textAnchor="middle"
        className="fill-[var(--muted)] text-[10px] font-semibold uppercase tracking-widest"
      >
        Elo
      </text>
      {/* Eje X (tiempo) */}
      <line x1={MARGIN.left} x2={width - MARGIN.right} y1={MARGIN.top + innerH} y2={MARGIN.top + innerH} stroke="var(--ink)" strokeWidth="1.5" />
      {xTicks.map((tick, i) => (
        <g key={tick.at}>
          <line x1={x(tick.at)} x2={x(tick.at)} y1={MARGIN.top + innerH} y2={MARGIN.top + innerH + 4} stroke="var(--ink)" />
          <text
            x={x(tick.at)}
            y={MARGIN.top + innerH + 18}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-[var(--muted)] font-mono text-[11px]"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {/* Serie */}
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(p.at)} cy={y(p.elo)} r="4" fill={p.won ? 'var(--ok)' : 'var(--accent)'} stroke="var(--paper)" strokeWidth="1.5">
          <title>
            {`${POINT_FORMAT.format(p.at)} · ${p.title}\nElo ${p.elo} (${p.delta >= 0 ? '+' : ''}${p.delta}) · ${p.won ? 'victoria' : 'derrota'}`}
          </title>
        </circle>
      ))}
      <title>{`Desde ${timeLabel(tStart, span)} hasta ${timeLabel(tEnd, span)}`}</title>
    </svg>
  );
}

export function RatingChart({ history }: { history: HistoryEntry[] }) {
  const available = useMemo(
    () => (['general', ...RANKED_MODES] as Series[]).filter((s) => seriesPoints(history, s).length > 0),
    [history],
  );
  const [series, setSeries] = useState<Series | null>(null);
  const active: Series = series && available.includes(series) ? series : (available.find((s) => s !== 'general') ?? 'general');
  const points = useMemo(() => seriesPoints(history, active), [history, active]);
  const [ref, width] = useWidth<HTMLDivElement>();

  if (points.length === 0) {
    return <p className="text-sm text-muted">Juega una partida con rivales para ver la evolución de tu Elo.</p>;
  }
  const first = points[0]!;
  const last = points.at(-1)!;
  const change = last.elo - (first.elo - first.delta);

  return (
    <figure>
      {available.length > 1 && (
        <div role="tablist" aria-label="Serie" className="mb-3 flex flex-wrap gap-1">
          {available.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === active}
              onClick={() => setSeries(s)}
              className={cx(
                'px-3 py-1 text-xs font-semibold uppercase tracking-widest transition-colors',
                s === active ? 'bg-ink text-paper' : 'border border-line hover:bg-paper-2',
              )}
            >
              {s === 'general' ? 'General' : GAME_LABELS[s].title}
            </button>
          ))}
        </div>
      )}
      <div ref={ref} className="w-full">
        {width > 0 && <Plot points={points} width={width} />}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-muted">
        <span>
          {points.length} {points.length === 1 ? 'partida' : 'partidas'} · Elo actual <strong className="text-ink">{last.elo}</strong> (
          {change >= 0 ? '+' : ''}
          {change})
        </span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-ok" /> victoria
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-accent" /> derrota
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
