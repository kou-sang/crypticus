import { describe, expect, it } from 'vitest';
import { availableKinds, displayLetters, hintKindsFor, hintText, revealHints } from './hints';

const anagrama = { definicion: ['para la guerra'], indicador: ['rota'], relleno: ['Rama'] };

describe('pistas elegibles (v1.9)', () => {
  it('tipos disponibles según las partes', () => {
    expect(hintKindsFor(anagrama, 'arma')).toEqual({ definicion: 1, indicador: 1, relleno: 1, letra: 3 });
    // Doble definición: solo definiciones (las dos).
    expect(hintKindsFor({ definicion: ['Asno', 'ignorante'], indicador: [], relleno: [] }, 'burro')).toEqual({ definicion: 2 });
    // Charada: sin indicador.
    expect(hintKindsFor({ definicion: ['Ave'], indicador: [], relleno: ['papá corto', 'colina'] }, 'paloma')).toEqual({ definicion: 1, relleno: 1, letra: 5 });
  });

  it('letras para mostrar: sin tildes, con eñe, sin espacios', () => {
    expect(displayLetters('Año luz')).toEqual(['A', 'Ñ', 'O', 'L', 'U', 'Z']);
  });

  it('el registro se convierte en pistas y descuenta lo ya usado', () => {
    const doble = { definicion: ['Asno', 'ignorante'], indicador: [], relleno: [] };
    const shown = revealHints(['definicion', 'definicion'], doble, 'burro');
    expect(shown.map(hintText)).toEqual(['Definición: «Asno»', 'Definición: «ignorante»']);
    expect(revealHints(['letra:2', 'indicador'], anagrama, 'arma')).toEqual([
      { kind: 'letra', index: 2, letter: 'M' },
      { kind: 'indicador', parts: ['rota'] },
    ]);
    expect(availableKinds(hintKindsFor(anagrama, 'arma'), ['indicador', 'letra:0'])).toEqual(['definicion', 'relleno', 'letra']);
  });
});
