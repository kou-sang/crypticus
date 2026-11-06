// Evolución del rating (SVG ligero, sin librerías).
import type { HistoryEntry } from '../../shared/types';

export function RatingChart({ history, height = 120 }: { history: HistoryEntry[]; height?: number }) {
  const points = [...history].sort((a, b) => a.finishedAt - b.finishedAt);
  if (points.length < 2) {
    return <p className="text-sm text-muted">Juega al menos dos partidas para ver tu evolución.</p>;
  }
  const values = points.map((p) => p.ratingAfter);
  const min = Math.min(...values) - 10;
  const max = Math.max(...values) + 10;
  const width = 600;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / (max - min)) * height;
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1]!;
  const first = values[0]!;

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label={`Rating de ${first} a ${last}`}>
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={points[i]!.won ? 'var(--ok)' : 'var(--accent)'} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-xs text-muted">
        <span>{first}</span>
        <span>
          {last} ({last - first >= 0 ? '+' : ''}
          {last - first})
        </span>
      </figcaption>
    </figure>
  );
}
