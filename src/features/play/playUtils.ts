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
