// Celdas de respuesta editables, estilo crucigrama.
// Un único <input> invisible recibe el teclado (físico o móvil); las celdas solo pintan y mueven el cursor.
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { cx } from '../../lib/utils';
import { enumerationGroups, toCellLetter } from './playUtils';

// Centinela: permite detectar el borrado en teclados móviles que no emiten `keydown` de Backspace.
const SENTINEL = ' ';

export function AnswerGrid({
  enumeration,
  letters,
  onLetters,
  onSubmit,
  locked,
  celebrate,
  wrong,
}: {
  enumeration: string;
  letters: string[];
  onLetters: (next: string[]) => void;
  onSubmit: () => void;
  locked: boolean; // Resuelto: no se edita.
  celebrate: boolean;
  wrong: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(() => Math.max(0, letters.findIndex((l) => !l)));
  const [focused, setFocused] = useState(false);
  const total = letters.length;

  const focusAt = (index: number) => {
    if (locked) return;
    setCursor(Math.min(Math.max(index, 0), total - 1));
    inputRef.current?.focus({ preventScroll: true });
  };

  const write = (chars: string) => {
    const next = [...letters];
    let position = cursor;
    for (const char of chars) {
      const letter = toCellLetter(char);
      if (!letter) continue;
      next[position] = letter;
      if (position < total - 1) position += 1;
    }
    onLetters(next);
    setCursor(position);
  };

  const erase = () => {
    const next = [...letters];
    // Si la celda actual está vacía, borra la anterior (comportamiento de crucigrama).
    const position = next[cursor] ? cursor : Math.max(0, cursor - 1);
    next[position] = '';
    onLetters(next);
    setCursor(position);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, number> = { ArrowLeft: cursor - 1, ArrowRight: cursor + 1, Home: 0, End: total - 1 };
    if (event.key in moves) {
      event.preventDefault();
      setCursor(Math.min(Math.max(moves[event.key] ?? 0, 0), total - 1));
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      erase();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      const next = [...letters];
      next[cursor] = '';
      onLetters(next);
    }
  };

  const handleChange = (value: string) => {
    if (locked) return;
    if (value.length < SENTINEL.length) return erase();
    write(value.startsWith(SENTINEL) ? value.slice(SENTINEL.length) : value);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  let position = 0;
  return (
    <form onSubmit={handleSubmit} data-wrong={wrong || undefined} className={cx('answer-grid relative', wrong && 'answer-wrong')}>
      {/* Las casillas son botones: sin sonido de clic (el tipeo ya suena). */}
      <div data-sound="off" className="flex flex-wrap gap-3" onClick={() => !locked && inputRef.current?.focus({ preventScroll: true })}>
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
      <input
        ref={inputRef}
        value={SENTINEL}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          setFocused(true);
          event.currentTarget.setSelectionRange(SENTINEL.length, SENTINEL.length);
        }}
        onBlur={() => setFocused(false)}
        readOnly={locked}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="send"
        aria-label={`Tu respuesta: ${total} letras ${enumeration}`}
        className="absolute left-0 top-0 size-px text-base opacity-0"
      />
    </form>
  );
}
