// Landing pública: qué es un criptico, los modos y por qué el desafío es justo. Breve y sin adornos.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '../../components/Logo';
import { useAuth } from '../../hooks/useAuth';
import { GAME_LABELS } from '../../../shared/scoring';
import { GAME_MODES } from '../../../shared/types';

// Criptico de portada: definición críptica que se resuelve a sí misma.
const DEMO = { clue: '¡Estás resolviendo uno en latín!', enumeration: '(9)', answer: 'CRYPTICUS' };

const ANATOMY = [
  {
    label: 'Definición',
    text: 'Siempre al principio o al final. Es la respuesta dicha de forma directa.',
    sample: 'Reptil cambiante: lecho con felino',
  },
  {
    label: 'Juego de palabras',
    text: 'El resto de la pista lleva a la misma respuesta por otro camino.',
    sample: 'lecho (CAMA) + felino (LEÓN)',
  },
  { label: 'Enumeración', text: 'Cuántas letras tiene, y en cuántas palabras.', sample: '(8) → CAMALEÓN' },
];

const REASONS = [
  { title: 'Cada pista se puede explicar', text: 'Al cerrar un criptico ves la respuesta y por qué funciona. Si no se puede justificar, no entra.' },
  { title: 'Nunca el mismo criptico', text: 'Lo que ya jugaste no vuelve a tus salas mientras queden cripticos nuevos.' },
  { title: 'Sin atajos', text: 'Las respuestas se verifican en el servidor y el siguiente criptico no se envía hasta que abre.' },
  { title: 'Un Elo por modo', text: 'Race, Royale y Duel miden cosas distintas. Cada uno tiene su propio ranking.' },
];

function DemoGrid() {
  const [revealed, setRevealed] = useState(0);
  const letters = DEMO.answer.split('');

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(letters.length);
      return;
    }
    const id = window.setInterval(() => setRevealed((n) => (n >= letters.length + 8 ? 0 : n + 1)), 240);
    return () => window.clearInterval(id);
  }, [letters.length]);

  return (
    <div aria-hidden className="flex gap-px bg-ink p-px">
      {letters.map((letter, index) => (
        <span
          key={index}
          className={`grid size-9 place-items-center font-mono text-lg font-semibold transition-colors duration-150 sm:size-10 ${
            index < revealed ? 'bg-ink text-paper' : 'bg-paper text-transparent'
          }`}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

export function LandingPage() {
  const { user, profile } = useAuth();
  const signedIn = Boolean(user && profile);
  const ctaTarget = signedIn ? '/jugar' : '/entrar';

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <Link to={signedIn ? '/inicio' : '/entrar'} className="text-sm font-semibold underline decoration-accent decoration-2 underline-offset-4">
          {signedIn ? 'Mi cuenta' : 'Entrar'}
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 md:pt-14">
        <div className="grid items-center gap-12 md:grid-cols-[1.2fr_1fr]">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[0.95] tracking-tight sm:text-6xl">
              Cada pista dice dos cosas.
              <br />
              <span className="text-accent">Gana quien ve las dos primero.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">
              Crypticus es una arena de cripticos en español, en tiempo real. Una definición, un juego de palabras y un rival que también lo
              está pensando.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={ctaTarget} className="inline-flex h-12 items-center bg-ink px-6 font-semibold text-paper transition-colors hover:bg-accent">
                Jugar ahora
              </Link>
              <a href="#como" className="inline-flex h-12 items-center border border-ink px-6 font-semibold hover:bg-paper-2">
                Cómo se lee un criptico
              </a>
            </div>
          </div>

          <figure className="border-2 border-ink p-6">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Ejemplo</p>
            <blockquote className="mt-2 font-display text-2xl leading-snug">
              {DEMO.clue} <span className="text-muted">{DEMO.enumeration}</span>
            </blockquote>
            <div className="mt-5">
              <DemoGrid />
            </div>
            <figcaption className="mt-4 text-sm text-muted">Lo que estás resolviendo es un criptico. En latín: CRYPTICUS.</figcaption>
          </figure>
        </div>
      </section>

      <section id="como" className="border-y-2 border-ink">
        <div className="mx-auto grid max-w-6xl md:grid-cols-3">
          {ANATOMY.map((part, index) => (
            <article key={part.label} className="border-b border-line p-6 last:border-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="font-mono text-xs text-muted">{String(index + 1).padStart(2, '0')}</p>
              <h2 className="mt-1 font-display text-2xl">{part.label}</h2>
              <p className="mt-2 text-sm text-muted">{part.text}</p>
              <p className="mt-3 font-mono text-sm">{part.sample}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-4xl font-semibold">Tres formas de competir</h2>
        <div className="mt-8 grid gap-px border border-ink bg-ink sm:grid-cols-2 lg:grid-cols-4">
          {GAME_MODES.map((mode) => {
            const soon = mode === 'boss';
            return (
              <article key={mode} className={`bg-paper p-6 ${soon ? 'opacity-60' : ''}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">{GAME_LABELS[mode].tagline}</p>
                <h3 className="mt-1 font-display text-3xl uppercase">{GAME_LABELS[mode].title}</h3>
                <p className="mt-3 text-sm text-muted">{GAME_LABELS[mode].description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-4xl font-semibold">Difícil, pero justo</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map((reason) => (
              <div key={reason.title} className="border-t border-paper/30 pt-3">
                <h3 className="font-display text-xl">{reason.title}</h3>
                <p className="mt-2 text-sm opacity-70">{reason.text}</p>
              </div>
            ))}
          </div>
          <Link
            to={ctaTarget}
            className="mt-12 inline-flex h-12 items-center bg-paper px-6 font-semibold text-ink transition-colors hover:bg-accent hover:text-paper"
          >
            Crear una sala
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted">
        <Logo />
        <span>Para quienes leen cada pista dos veces.</span>
      </footer>
    </div>
  );
}
