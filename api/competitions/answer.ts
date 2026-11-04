// POST /api/competitions/answer — valida una respuesta y actualiza el puntaje.
import { FieldValue } from 'firebase-admin/firestore';
import { isCorrectAnswer } from '../../shared/answer.js';
import { computeSolvePoints, evaluateEnd, LIMITS } from '../../shared/scoring.js';
import type { CrypticPublic, CrypticSecret, Participant } from '../../shared/types.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, postHandler, requireStrings } from '../_lib/http.js';
import { finalizeIfEnded, loadCompetition, readRatings, requireParticipant, writeFinalization } from '../_lib/competition.js';

export default postHandler(requireStrings('competitionId', 'crypticId', 'guess'), async ({ uid, body }) => {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const now = Date.now();
    const loaded = await loadCompetition(db, tx, body.competitionId);
    const { competition, participants } = loaded;

    if (competition.status !== 'live' || competition.startedAt === null) {
      throw new HttpError(409, 'not_live', 'La competencia no está en curso.');
    }
    if (now < competition.startedAt) throw new HttpError(409, 'not_started', 'Aún no empieza.');

    // Si el tiempo terminó, se cierra y se rechaza la respuesta.
    if (competition.endsAt !== null && now >= competition.endsAt) {
      await finalizeIfEnded(db, tx, loaded, now);
      return { correct: false, points: 0, finished: true };
    }

    const participant = requireParticipant(participants, uid);
    if (!competition.crypticIds.includes(body.crypticId)) {
      throw new HttpError(400, 'unknown_cryptic', 'Criptico fuera de la competencia.');
    }
    if (participant.solvedIds.includes(body.crypticId)) {
      throw new HttpError(409, 'already_solved', 'Ya resolviste este criptico.');
    }
    if (participant.lastAttemptAt !== null && now - participant.lastAttemptAt < LIMITS.minAttemptIntervalMs) {
      throw new HttpError(429, 'too_fast', 'Espera un momento antes de volver a intentar.');
    }

    const [secretSnap, publicSnap] = await tx.getAll(
      db.collection('crypticSecrets').doc(body.crypticId),
      db.collection('cryptics').doc(body.crypticId),
    );
    if (!secretSnap?.exists || !publicSnap?.exists) throw new HttpError(404, 'missing_cryptic', 'Criptico no encontrado.');
    const secret = secretSnap.data() as CrypticSecret;
    const cryptic = publicSnap.data() as CrypticPublic;

    const participantRef = db
      .collection('competitions').doc(competition.id)
      .collection('participants').doc(uid);

    if (!isCorrectAnswer(body.guess, secret.answer)) {
      tx.update(participantRef, { attempts: FieldValue.increment(1), lastAttemptAt: now });
      return { correct: false, points: 0, finished: false };
    }

    const points = computeSolvePoints({
      rule: competition.scoring,
      difficulty: cryptic.difficulty,
      hintsUsed: participant.hintsByClue[body.crypticId] ?? 0,
      elapsedMs: now - competition.startedAt,
      durationMs: competition.durationSec * 1000,
    });

    // Estado proyectado en memoria para evaluar el fin antes de escribir.
    const updated: Participant = {
      ...participant,
      score: participant.score + points,
      solvedIds: [...participant.solvedIds, body.crypticId],
      attempts: participant.attempts + 1,
      lastSolvedAt: now,
      lastAttemptAt: now,
    };
    const projected = { competition, participants: participants.map((p) => (p.uid === uid ? updated : p)) };
    const evaluation = evaluateEnd(competition, projected.participants, now);
    const ratings = evaluation.finished ? await readRatings(db, tx, projected.participants) : {};

    // --- Escrituras ---
    tx.update(participantRef, {
      score: updated.score,
      solvedIds: FieldValue.arrayUnion(body.crypticId),
      attempts: FieldValue.increment(1),
      lastSolvedAt: now,
      lastAttemptAt: now,
    });
    if (evaluation.finished) writeFinalization(db, tx, projected, evaluation, ratings, now);

    return {
      correct: true,
      points,
      finished: evaluation.finished,
      explanation: secret.explanation ?? null,
      answer: secret.answer,
    };
  });
});
