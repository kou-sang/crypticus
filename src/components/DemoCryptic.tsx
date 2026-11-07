// Criptico de ejemplo que se resuelve a sí mismo: muestra en segundos cómo se lee una pista.
import { useEffect, useState } from 'react';

const DEMO = { clue: '¡Estás resolviendo uno en latín!', enumeration: '(9)', answer: 'CRYPTICUS' };

function DemoGrid() {
  const [revealed, setRevealed] = useState(0);
  const letters = DEMO.answer.split('');

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(letters.length);
      return;
    }
    // Se escribe letra a letra, se sostiene un momento y vuelve a empezar.
    const id = window.setInterval(() => setRevealed((n) => (n >= letters.length + 8 ? 0 : n + 1)), 240);
    return () => window.clearInterval(id);
  }, [letters.length]);

  return (
    <div aria-hidden className="flex w-fit gap-px bg-ink p-px">
      {letters.map((letter, index) => (
        <span
          key={index}
          className={`grid size-8 place-items-center font-mono text-base font-semibold transition-colors duration-150 sm:size-9 ${
            index < revealed ? 'bg-ink text-paper' : 'bg-paper text-transparent'
          }`}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

export function DemoCryptic() {
  return (
    <figure className="border-2 border-ink p-5">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Ejemplo</p>
      <blockquote className="mt-2 font-display text-xl leading-snug sm:text-2xl">
        {DEMO.clue} <span className="text-muted">{DEMO.enumeration}</span>
      </blockquote>
      <div className="mt-4">
        <DemoGrid />
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        La definición va en un extremo; el resto es el juego de palabras. Entre paréntesis, las letras.
      </figcaption>
    </figure>
  );
}
