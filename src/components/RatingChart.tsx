// Evolución del Elo: tiempo en el eje X, Elo en el eje Y. Una serie por modo. SVG sin librerías.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryEntry, RankedMode } from '../../shared/types';
import { niceTicks, timeLabel, timeTicks } from '../lib/chartScale';

export type Series = RankedMode;

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
    const elo = entry.game === series ? entry.modeRatingAfter : undefined;
    if (typeof elo !== 'number') continue;
    const delta = entry.modeRatingDelta ?? (previous === null ? 0 : elo - previous);
    points.push({ at: entry.finishedAt, elo, delta, won: entry.won, title: entry.title });
    previous = elo;
  }
  return points;
}

/**
 * Ancho real del contenedor: el SVG se dibuja en píxeles para que el texto no se achique en móvil.
 * Ref por callback: el contenedor puede aparecer después (cuando llega el historial) y hay que medirlo entonces.
 */
function useWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    setWidth(node.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)));
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
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

/** Evolución del Elo de un modo. */
export function RatingChart({ history, series }: { history: HistoryEntry[]; series: Series }) {
  const points = useMemo(() => seriesPoints(history, series), [history, series]);
  const [ref, width] = useWidth();

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted">
        {history.length > 0
          ? 'Las partidas anteriores a la versión 0.8 no guardaron el Elo del modo: el gráfico empieza con la próxima.'
          : 'Juega una partida con rivales en este modo para ver la evolución de tu Elo.'}
      </p>
    );
  }
  const first = points[0]!;
  const last = points.at(-1)!;
  const change = last.elo - (first.elo - first.delta);

  return (
    <figure>
      <div ref={ref} className="w-full">
        {width > 0 && <Plot points={points} width={width} />}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-muted">
        <span>
          {points.length} {points.length === 1 ? 'partida' : 'partidas'} · Elo {last.elo} ({change >= 0 ? '+' : ''}
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
