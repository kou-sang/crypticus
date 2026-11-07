// Utilidades puras de la vista de juego.

/** Convierte una tecla en letra de celda: mayúscula, sin tildes; conserva la Ñ. */
export function toCellLetter(char: string): string | null {
  const upper = char.toUpperCase();
  if (upper === 'Ñ') return 'Ñ';
  const base = upper.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /^[A-Z]$/.test(base) ? base : null;
}

/** Tamaños de grupo según la enumeración: "(4,3-2)" -> [4, 3, 2]. */
export function enumerationGroups(enumeration: string): number[] {
  return (enumeration.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
}
