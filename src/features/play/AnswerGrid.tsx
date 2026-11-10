// Celdas de respuesta editables, estilo crucigrama.
// El teclado (físico o móvil) llega por un único <input> invisible compartido por toda la partida
// (keyboardInput.ts): así el teclado del celular no se cierra al cambiar de criptico.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cx } from '../../lib/utils';
import { enumerationGroups, toCellLetter } from './playUtils';
import { attachKeyboard, centerInView, focusKeyboard, isKeyboardFocused, isTypingElsewhere } from './keyboardInput';

export function AnswerGrid({
  enumeration,
  letters,
  onLetters,
  onSubmit,
  locked,
  celebrate,
  wrong,
  transform,
}: {
  enumeration: string;
  letters: string[];
  onLetters: (next: string[]) => void;
  onSubmit: () => void;
  locked: boolean; // Resuelto: no se edita.
  celebrate: boolean;
  wrong: boolean;
  /** COOP (SERPENTIS): convierte cada letra tipeada antes de escribirla (desfase). */
  transform?: (letter: string) => string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [cursor, setCursor] = useState(() => Math.max(0, letters.findIndex((l) => !l)));
  const [focused, setFocused] = useState(false);
  const total = letters.length;

  // Los manejadores del input compartido leen siempre el último estado.
  const latest = useRef({ letters, cursor, locked, total, onLetters, onSubmit, transform });
  latest.current = { letters, cursor, locked, total, onLetters, onSubmit, transform };

  /** Lleva el criptico al centro de lo que se ve (con el teclado abierto, arriba del teclado). */
  const center = () => {
    const panel = formRef.current?.closest<HTMLElement>('[data-clue-panel]') ?? formRef.current;
    if (panel) centerInView(panel);
  };

  useEffect(() => {
    const write = (chars: string) => {
      const { letters: current, cursor: start, locked: isLocked, total: size, onLetters: emit } = latest.current;
      if (isLocked) return;
      const next = [...current];
      let position = start;
      for (const char of chars) {
        const letter = toCellLetter(char);
        if (!letter) continue;
        next[position] = latest.current.transform ? latest.current.transform(letter) : letter;
        if (position < size - 1) position += 1;
      }
      emit(next);
      setCursor(position);
    };
    const erase = () => {
      const { letters: current, cursor: start, locked: isLocked, onLetters: emit } = latest.current;
      if (isLocked) return;
      const next = [...current];
      // Si la celda actual está vacía, borra la anterior (comportamiento de crucigrama).
      const position = next[start] ? start : Math.max(0, start - 1);
      next[position] = '';
      emit(next);
      setCursor(position);
    };
    const onKey = (event: KeyboardEvent) => {
      const { cursor: at, total: size, letters: current, locked: isLocked, onLetters: emit, onSubmit: submit } = latest.current;
      const moves: Record<string, number> = { ArrowLeft: at - 1, ArrowRight: at + 1, Home: 0, End: size - 1 };
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      } else if (event.key in moves) {
        event.preventDefault();
        setCursor(Math.min(Math.max(moves[event.key] ?? 0, 0), size - 1));
      } else if (event.key === 'Delete' && !isLocked) {
        event.preventDefault();
        const next = [...current];
        next[at] = '';
        emit(next);
      }
    };
    const detach = attachKeyboard({ onText: write, onErase: erase, onKey, onFocusChange: setFocused });
    // Escritorio: el foco va solo a la grilla nueva. Celular: si el teclado ya estaba abierto, sigue abierto.
    // Si escribe en el chat u otro campo, no se le quita el foco.
    if (!isKeyboardFocused() && !isTypingElsewhere() && window.matchMedia('(pointer: fine)').matches) focusKeyboard();
    if (isKeyboardFocused()) window.requestAnimationFrame(center);
    return detach;
  }, []);

  // Con el teclado del celular abriéndose o cerrándose, el criptico vuelve al centro.
  useEffect(() => {
    if (!focused) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(center, 120);
    };
    viewport.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      viewport.removeEventListener('resize', onResize);
    };
  }, [focused]);

  const focusAt = (index: number) => {
    if (locked) return;
    setCursor(Math.min(Math.max(index, 0), total - 1));
    focusKeyboard();
    window.setTimeout(center, 250);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  let position = 0;
  return (
    <form ref={formRef} onSubmit={handleSubmit} data-wrong={wrong || undefined} className={cx('answer-grid relative', wrong && 'answer-wrong')}>
      {/* Las casillas son botones: sin sonido de clic (el tipeo ya suena). */}
      <div data-sound="off" className="flex flex-wrap gap-3" onClick={() => focusAt(cursor)}>
        {enumerationGroups(enumeration).map((size, groupIndex) => (
          <div key={groupIndex} className="flex gap-px bg-ink p-px">
            {Array.from({ length: size }, () => {
              const index = position++;
              const active = focused && !locked && index === cursor;
              return (
                <button
                  key={index}
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={(event) => {
                    event.stopPropagation();
                    focusAt(index);
                  }}
                  style={celebrate ? { animationDelay: `${index * 45}ms` } : undefined}
                  className={cx(
                    'inline-flex size-[clamp(2rem,8.5vw,2.75rem)] items-center justify-center font-mono text-lg font-semibold uppercase transition-colors duration-150',
                    locked && letters[index] ? 'bg-ink text-paper' : active ? 'bg-accent/20' : 'bg-paper',
                    wrong && !locked && 'text-accent',
                    celebrate && 'cell-pop',
                    !locked && 'cursor-text',
                  )}
                >
                  {letters[index] ?? ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </form>
  );
}
