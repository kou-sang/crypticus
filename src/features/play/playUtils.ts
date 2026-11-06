// Utilidades puras de la vista de juego.

/** Siguiente criptico no resuelto después de `afterId` (circular). Null si no queda ninguno. */
export function nextPendingFree(crypticIds: string[], solvedIds: string[], afterId: string | null): string | null {
  const solved = new Set(solvedIds);
  const start = afterId ? crypticIds.indexOf(afterId) + 1 : 0;
  for (let offset = 0; offset < crypticIds.length; offset++) {
    const id = crypticIds[(start + offset) % crypticIds.length]!;
    if (!solved.has(id) && id !== afterId) return id;
  }
  // Solo queda `afterId` sin resolver (saltar sobre sí mismo).
  return afterId && !solved.has(afterId) ? afterId : null;
}

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
