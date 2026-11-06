// Utilidades de test compartidas.
import type { Participant } from './types';

export const makeParticipant = (overrides: Partial<Participant> & { uid: string }): Participant => ({
  displayName: overrides.uid,
  score: 0,
  solvedIds: [],
  hintsByClue: {},
  hintsUsed: 0,
  attempts: 0,
  wrongAttempts: 0,
  lastSolvedAt: null,
  lastAttemptAt: null,
  joinedAt: 0,
  ...overrides,
});
