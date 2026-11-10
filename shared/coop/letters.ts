// Desfase de letras de SERPENTIS: alfabeto cíclico con Ñ (A…N, Ñ, O…Z).
import { SHIFT_ALPHABET } from './balance';

export function shiftLetter(letter: string, shift: number): string {
  const index = SHIFT_ALPHABET.indexOf(letter);
  if (index < 0 || shift === 0) return letter;
  const size = SHIFT_ALPHABET.length;
  return SHIFT_ALPHABET[(((index + shift) % size) + size) % size]!;
}
