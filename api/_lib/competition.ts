// Lógica transaccional compartida por los endpoints de competencia.
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { computeRatingDeltas, evaluateEnd, rankParticipants, type EndEvaluation } from '../../shared/scoring.js';
import type { Competition, Participant } from '../../shared/types.js';
import { HttpError } from './http.js';

export interface LoadedCompetition {
  competition: Competition;
  participants: Participant[];
}

/** Lee competencia + participantes dentro de la transacción (todas las lecturas antes de escribir). */
export async function loadCompetition(
  db: Firestore,
  tx: Transaction,
  competitionId: string,
): Promise<LoadedCompetition> {
  const compRef = db.collection('competitions').doc(competitionId);
  const compSnap = await tx.get(compRef);
  if (!compSnap.exists) throw new HttpError(404, 'not_found', 'La competencia no existe.');
  const competition = { id: compSnap.id, ...compSnap.data() } as Competition;

  const participantsSnap = await tx.get(compRef.collection('participants'));
  const participants = participantsSnap.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as Participant);
  return { competition, participants };
}

export function requireParticipant(participants: Participant[], uid: string): Participant {
  const participant = participants.find((p) => p.uid === uid);
  if (!participant) throw new HttpError(403, 'not_participant', 'No participas en esta competencia.');
  return participant;
}

/** Lee el rating actual de cada participante (lectura: llamar antes de cualquier escritura). */
export async function readRatings(
  db: Firestore,
  tx: Transaction,
  participants: Participant[],
): Promise<Record<string, number>> {
  const userRefs = participants.map((p) => db.collection('users').doc(p.uid));
  const userSnaps = userRefs.length > 0 ? await tx.getAll(...userRefs) : [];
  const ratings: Record<string, number> = {};
  userSnaps.forEach((snap) => {
    if (snap.exists) ratings[snap.id] = (snap.get('rating') as number | undefined) ?? 1200;
  });
  return ratings;
}

/** Escribe el cierre: estado, ganador, standings, rating y estadísticas. Solo escrituras. */
export function writeFinalization(
  db: Firestore,
  tx: Transaction,
  loaded: LoadedCompetition,
  evaluation: EndEvaluation,
  ratings: Record<string, number>,
  now: number,
): void {
  const { competition, participants } = loaded;
  const ranked = rankParticipants(participants);
  const deltas = computeRatingDeltas(ranked, ratings);

  tx.update(db.collection('competitions').doc(competition.id), {
    status: 'finished',
    finishedAt: now,
    winnerId: evaluation.winnerId,
    endReason: evaluation.reason,
    finalStandings: ranked.map((p) => ({
      uid: p.uid,
      displayName: p.displayName,
      rank: p.rank,
      score: p.score,
      solved: p.solvedIds.length,
      hintsUsed: p.hintsUsed,
      ratingDelta: deltas[p.uid] ?? 0,
    })),
  });

  for (const participant of ranked) {
    // Usuarios borrados no tienen rating leído: se omiten.
    if (!(participant.uid in ratings)) continue;
    tx.update(db.collection('users').doc(participant.uid), {
      rating: FieldValue.increment(deltas[participant.uid] ?? 0),
      'stats.played': FieldValue.increment(1),
      'stats.wins': FieldValue.increment(participant.uid === evaluation.winnerId ? 1 : 0),
      'stats.solved': FieldValue.increment(participant.solvedIds.length),
      'stats.hintsUsed': FieldValue.increment(participant.hintsUsed),
    });
  }
}

/** Evalúa y, si corresponde, finaliza. Debe llamarse antes de cualquier otra escritura. */
export async function finalizeIfEnded(
  db: Firestore,
  tx: Transaction,
  loaded: LoadedCompetition,
  now: number,
): Promise<EndEvaluation> {
  if (loaded.competition.status !== 'live') {
    return { finished: loaded.competition.status === 'finished', reason: null, winnerId: loaded.competition.winnerId };
  }
  const evaluation = evaluateEnd(loaded.competition, loaded.participants, now);
  if (evaluation.finished) {
    const ratings = await readRatings(db, tx, loaded.participants);
    writeFinalization(db, tx, loaded, evaluation, ratings, now);
  }
  return evaluation;
}
