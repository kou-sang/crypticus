// Landing pública: estilo portada de periódico con una "cuadrícula" animada.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/Logo';
import { useAuth } from '../../hooks/useAuth';
import { SCORING_LABELS } from '../../../shared/scoring';
import type { ScoringRule } from '../../../shared/types';

const DEMO_ANSWER = 'CRYPTICUS';

function DemoGrid() {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setRevealed(DEMO_ANSWER.length);
      return;
    }
    const id = window.setInterval(() => setRevealed((n) => (n >= DEMO_ANSWER.length + 6 ? 0 : n + 1)), 260);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div aria-hidden className="flex flex-wrap gap-1">
      {DEMO_ANSWER.split('').map((letter, index) => (
        <span
          key={index}
          className={`grid-cell transition-colors duration-150 ${index < revealed ? 'bg-ink text-paper' : 'text-transparent'}`}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

const FEATURES = [
  { title: 'Amigos', text: 'Agrega por @usuario, reta en privado y sigue su progreso.' },
  { title: 'Chat', text: 'Sala global, mensajes directos y chat dentro de cada partida.' },
  { title: 'Rankings', text: 'Rating Elo multijugador: sube ganando a rivales fuertes.' },
  { title: 'En vivo', text: 'Marcador en tiempo real. Ves a tus rivales resolver al instante.' },
];

export function LandingPage() {
  const { user, profile } = useAuth();
  const ctaTarget = user && profile ? '/inicio' : '/entrar';
  const ctaLabel = user && profile ? 'Ir a mi panel' : 'Empezar a jugar';

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <Link to={ctaTarget} className="text-sm font-semibold underline decoration-accent decoration-2 underline-offset-4">
          {user && profile ? 'Mi panel' : 'Entrar'}
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 md:pt-16">
        <p className="mb-4 border-y border-ink py-1 text-center text-[11px] font-semibold uppercase tracking-[0.3em]">
          Edición diaria · Cripticos competitivos · Tiempo real
        </p>
        <div className="grid items-end gap-10 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-7xl">
              Resuelve antes
              <br />
              <em className="text-accent">que tus amigos.</em>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted">
              Competencias de cripticos contra reloj o por cantidad, con reglas de puntaje a tu medida.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={ctaTarget}
                className="inline-flex h-12 items-center bg-ink px-6 font-semibold text-paper transition-colors hover:bg-accent"
              >
                {ctaLabel} →
              </Link>
              <a href="#modos" className="inline-flex h-12 items-center border border-ink px-6 font-semibold hover:bg-paper-2">
                Ver modos
              </a>
            </div>
          </div>
          <div className="border-2 border-ink p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">1 horizontal</p>
            <p className="mt-2 font-display text-2xl leading-snug">
              Cifrado astuto que reta a la mente, en latín (9)
            </p>
            <div className="mt-5">
              <DemoGrid />
            </div>
          </div>
        </div>
      </section>

      <section id="modos" className="border-y-2 border-ink bg-paper-2/50">
        <div className="mx-auto grid max-w-6xl gap-px bg-line md:grid-cols-2">
          <div className="bg-paper p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Modo</p>
            <h2 className="mt-1 font-display text-3xl">Por tiempo</h2>
            <p className="mt-2 text-muted">Reloj fijo. Al sonar la campana, gana quien tenga más puntos.</p>
          </div>
          <div className="bg-paper p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Modo</p>
            <h2 className="mt-1 font-display text-3xl">Por cantidad</h2>
            <p className="mt-2 text-muted">Carrera a N cripticos. El primero en llegar se lleva la partida.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-4xl font-semibold">Criterios de puntaje</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(SCORING_LABELS) as ScoringRule[]).map((rule, index) => (
            <article key={rule} className="border-t-2 border-ink pt-3">
              <p className="font-mono text-xs text-muted">0{index + 1}</p>
              <h3 className="mt-1 font-display text-xl">{SCORING_LABELS[rule].title}</h3>
              <p className="mt-1 text-sm text-muted">{SCORING_LABELS[rule].description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <h3 className="font-display text-2xl">{feature.title}</h3>
              <p className="mt-2 text-sm opacity-70">{feature.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted">
        <Logo />
        <span>Hecho para quienes leen las pistas dos veces.</span>
      </footer>
    </div>
  );
}
