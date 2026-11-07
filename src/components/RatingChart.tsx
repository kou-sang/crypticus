// Evolución del Elo de un pool: un punto por día (Elo al cierre del día) en el eje X, Elo en el eje Y. SVG sin librerías.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryEntry } from '../../shared/types';
import type { RatingPool } from '../../shared/ratingPools';
import { dayLabel, dayTicks, niceTicks } from '../lib/chartScale';
import { entryPool } from '../lib/pools';
import { dailyPoints, type DayPoint } from '../lib/ratingSeries';

const HEIGHT = 240;
const MARGIN = { top: 12, right: 14, bottom: 34, left: 52 };

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

function dayTitle(p: DayPoint): string {
  const games = `${p.games} ${p.games === 1 ? 'partida' : 'partidas'}`;
  const draws = p.games - p.wins - p.losses;
  return `${dayLabel(p.day, true)} · ${games} (${p.wins}V ${p.losses}D${draws > 0 ? ` ${draws}E` : ''})\nElo ${p.elo} (${p.delta >= 0 ? '+' : ''}${p.delta})`;
}

function Plot({ points, width }: { points: DayPoint[]; width: number }) {
  const first = points[0]!;
  const last = points.at(-1)!;
  const yTicks = niceTicks(Math.min(...points.map((p) => p.elo)), Math.max(...points.map((p) => p.elo)), 5);
  const yMin = yTicks[0]!;
  const yMax = yTicks.at(-1)!;
  // Con un solo día se abre un día a cada lado para centrar el punto.
  const dStart = first.day === last.day ? first.day - 1 : first.day;
  const dEnd = first.day === last.day ? last.day + 1 : last.day;
  const innerW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (day: number) => MARGIN.left + ((day - dStart) / (dEnd - dStart)) * innerW;
  const y = (v: number) => MARGIN.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.elo).toFixed(1)}`).join(' ');
  const xTicks = first.day === last.day ? dayTicks(first.day, first.day) : dayTicks(dStart, dEnd, width < 420 ? 3 : 6);

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
      {/* Eje X (días) */}
      <line x1={MARGIN.left} x2={width - MARGIN.right} y1={MARGIN.top + innerH} y2={MARGIN.top + innerH} stroke="var(--ink)" strokeWidth="1.5" />
      {xTicks.map((tick, i) => {
        const single = xTicks.length === 1;
        return (
          <g key={tick.day}>
            <line x1={x(tick.day)} x2={x(tick.day)} y1={MARGIN.top + innerH} y2={MARGIN.top + innerH + 4} stroke="var(--ink)" />
            <text
              x={x(tick.day)}
              y={MARGIN.top + innerH + 18}
              textAnchor={single ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
              className="fill-[var(--muted)] font-mono text-[11px]"
            >
              {tick.label}
            </text>
          </g>
        );
      })}
      {/* Serie: un punto por día */}
      <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.day} cx={x(p.day)} cy={y(p.elo)} r="4" fill={p.delta >= 0 ? 'var(--ok)' : 'var(--accent)'} stroke="var(--paper)" strokeWidth="1.5">
          <title>{dayTitle(p)}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Evolución diaria del Elo de un pool (Race, Royale por tiempo o Duel). */
export function RatingChart({ history, pool }: { history: HistoryEntry[]; pool: RatingPool }) {
  const points = useMemo(() => dailyPoints(history, pool), [history, pool]);
  const [ref, width] = useWidth();

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted">
        {history.some((h) => entryPool(h) === pool && h.players >= 2)
          ? 'Las partidas anteriores a la versión 0.8 no guardaron el Elo del modo: el gráfico empieza con la próxima.'
          : 'Juega una partida con rivales en este modo para ver la evolución de tu Elo.'}
      </p>
    );
  }
  const first = points[0]!;
  const last = points.at(-1)!;
  const change = last.elo - (first.elo - first.delta);
  const games = points.reduce((sum, p) => sum + p.games, 0);

  return (
    <figure>
      <div ref={ref} className="w-full">
        {width > 0 && <Plot points={points} width={width} />}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-muted">
        <span>
          {points.length} {points.length === 1 ? 'día' : 'días'} · {games} {games === 1 ? 'partida' : 'partidas'} · Elo {last.elo} (
          {change >= 0 ? '+' : ''}
          {change})
        </span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-ok" /> día en alza
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-accent" /> día en baja
          </span>
        </span>
      </figcaption>
    </figure>
  );
}
