// Landing pública: estilo portada de periódico con una "cuadrícula" animada.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/Logo';
import { useAuth } from '../../hooks/useAuth';
import { GAME_LABELS } from '../../../shared/scoring';
import { GAME_MODES } from '../../../shared/types';

const RULES = [
  { title: 'Clásico', text: 'Fácil, medio o difícil: más dificultad, más puntos.' },
  { title: 'Menos pistas', text: 'Cada pista usada resta puntos.' },
  { title: 'Velocidad', text: 'Bonus por resolver antes que el reloj.' },
  { title: 'Diferencia de dos', text: 'Gana quien saque dos cripticos de ventaja. Si no, prórroga.' },
  { title: 'Vota la dificultad', text: 'Cada ronda se elige el próximo. El que va perdiendo desempata.' },
  { title: 'Remontada', text: 'Quien va atrás gana más, en proporción a la distancia.' },
  { title: 'Tiempo extra', text: '¿Trabados? Si todos lo piden, el reloj suma segundos.' },
  { title: 'Marcador oculto', text: 'Nadie sabe quién gana hasta el final.' },
];

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
        <div className="mx-auto grid max-w-6xl gap-px bg-line sm:grid-cols-2 md:grid-cols-4">
          {GAME_MODES.map((mode) => (
            <div key={mode} className="bg-paper p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{GAME_LABELS[mode].tagline}</p>
              <h2 className="mt-1 font-display text-3xl">{GAME_LABELS[mode].title}</h2>
              <p className="mt-2 text-muted">{GAME_LABELS[mode].description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-4xl font-semibold">Reglas a tu medida</h2>
        <p className="mt-2 text-muted">Combínalas antes de empezar: cada partida puede ser distinta.</p>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {RULES.map((rule, index) => (
            <article key={rule.title} className="border-t-2 border-ink pt-3">
              <p className="font-mono text-xs text-muted">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="mt-1 font-display text-xl">{rule.title}</h3>
              <p className="mt-1 text-sm text-muted">{rule.text}</p>
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
