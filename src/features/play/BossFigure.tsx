// Figuras originales de jefes (SVG propio). Cada nivel tiene su criatura.
import type { BossLevel } from '../../../shared/types';

/** Normal: "Borrón", una mancha de tinta con ojos. */
function InkBlot({ hurt }: { hurt: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label="Borrón, el jefe de tinta">
      <path
        d="M60 12c14 0 18 12 30 14s20 14 16 28 6 22-4 34-24 10-34 18-26 2-34-8-22-10-20-26 6-18 4-30 12-22 24-24 4-6 18-6z"
        fill="var(--ink)"
      />
      <circle cx="22" cy="96" r="6" fill="var(--ink)" />
      <circle cx="104" cy="22" r="4" fill="var(--ink)" />
      <ellipse cx="45" cy="55" rx="10" ry={hurt ? 2 : 12} fill="var(--paper)" />
      <ellipse cx="77" cy="55" rx="10" ry={hurt ? 2 : 12} fill="var(--paper)" />
      {!hurt && <circle cx="48" cy="58" r="4" fill="var(--ink)" />}
      {!hurt && <circle cx="80" cy="58" r="4" fill="var(--ink)" />}
      <path d={hurt ? 'M44 86q17-10 34 0' : 'M44 82q17 12 34 0'} stroke="var(--paper)" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Duro: "Cuadrigolem", un gólem hecho de casillas de crucigrama. */
function GridGolem({ hurt }: { hurt: boolean }) {
  const cells = [
    [30, 18], [50, 18], [70, 18],
    [20, 38], [40, 38], [60, 38], [80, 38],
    [30, 58], [50, 58], [70, 58],
    [20, 78], [80, 78], [40, 78], [60, 78],
  ];
  return (
    <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label="Cuadrigolem, el gólem de casillas">
      {cells.map(([x, y], i) => (
        <rect
          key={i}
          x={x! + 0}
          y={y! + 0}
          width="20"
          height="20"
          fill={i % 4 === 1 ? 'var(--ink)' : 'var(--paper)'}
          stroke="var(--ink)"
          strokeWidth="2"
        />
      ))}
      <rect x="40" y="38" width="20" height="20" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2" />
      <rect x="60" y="38" width="20" height="20" fill="var(--accent)" stroke="var(--ink)" strokeWidth="2" />
      <rect x={hurt ? 46 : 46} y={hurt ? 47 : 44} width="8" height={hurt ? 2 : 8} fill="var(--ink)" />
      <rect x={hurt ? 66 : 66} y={hurt ? 47 : 44} width="8" height={hurt ? 2 : 8} fill="var(--ink)" />
      <text x="34" y="34" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink)">
        1
      </text>
    </svg>
  );
}

/** Épico: "Plumadragón", una pluma estilográfica con alas y fuego de tinta. */
function QuillDragon({ hurt }: { hurt: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className="size-full" role="img" aria-label="Plumadragón, la pluma alada">
      <path d="M18 50c14-22 30-26 42-20-10 2-18 10-20 20 8-8 18-10 26-6-12 2-20 10-22 18z" fill="var(--ink)" />
      <path d="M102 50c-14-22-30-26-42-20 10 2 18 10 20 20-8-8-18-10-26-6 12 2 20 10 22 18z" fill="var(--ink)" />
      <path d="M60 22l14 40-14 44-14-44z" fill="var(--accent)" stroke="var(--ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M60 62v38" stroke="var(--ink)" strokeWidth="3" />
      <circle cx="60" cy="58" r="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="53" cy="42" r={hurt ? 1.5 : 3} fill="var(--paper)" />
      <circle cx="67" cy="42" r={hurt ? 1.5 : 3} fill="var(--paper)" />
      <path d="M56 106q4 8 8 0" fill="var(--ink)" />
      {!hurt && <path d="M60 108c-6 4-2 10 0 10s6-6 0-10z" fill="var(--ink)" opacity="0.6" />}
    </svg>
  );
}

export function BossFigure({ level, hurt }: { level: BossLevel; hurt: boolean }) {
  if (level === 'epic') return <QuillDragon hurt={hurt} />;
  if (level === 'hard') return <GridGolem hurt={hurt} />;
  return <InkBlot hurt={hurt} />;
}

export const BOSS_NAMES: Record<BossLevel, string> = { normal: 'Borrón', hard: 'Cuadrigolem', epic: 'Plumadragón' };
