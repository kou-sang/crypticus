// POST /api/competitions/hint — revela la siguiente pista (reveal=true) o devuelve las ya reveladas.
import { FieldValue } from 'firebase-admin/firestore';
import type { CrypticSecret } from '../../shared/types.js';
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, postHandler, requireStrings } from '../_lib/http.js';
import { loadCompetition, requireParticipant } from '../_lib/competition.js';

interface HintBody {
  competitionId: string;
  crypticId: string;
  reveal: boolean;
}

const validate = (raw: unknown): HintBody => {
  const base = requireStrings('competitionId', 'crypticId')(raw);
  const reveal = (raw as Record<string, unknown>).reveal === true;
  return { ...base, reveal };
};

export default postHandler(validate, async ({ uid, body }) => {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const { competition, participants } = await loadCompetition(db, tx, body.competitionId);
    const participant = requireParticipant(participants, uid);

    if (!competition.crypticIds.includes(body.crypticId)) {
      throw new HttpError(400, 'unknown_cryptic', 'Criptico fuera de la competencia.');
    }

    const secretSnap = await tx.get(db.collection('crypticSecrets').doc(body.crypticId));
    if (!secretSnap.exists) throw new HttpError(404, 'missing_cryptic', 'Criptico no encontrado.');
    const hints = (secretSnap.data() as CrypticSecret).hints ?? [];

    const used = participant.hintsByClue[body.crypticId] ?? 0;
    const maxAllowed = Math.min(competition.maxHintsPerClue, hints.length);

    if (!body.reveal) return { hints: hints.slice(0, used), remaining: maxAllowed - used };

    if (competition.status !== 'live') throw new HttpError(409, 'not_live', 'La competencia no está en curso.');
    if (participant.solvedIds.includes(body.crypticId)) {
      throw new HttpError(409, 'already_solved', 'Ya resolviste este criptico.');
    }
    if (used >= maxAllowed) throw new HttpError(409, 'no_more_hints', 'No quedan pistas.');

    tx.update(db.collection('competitions').doc(competition.id).collection('participants').doc(uid), {
      [`hintsByClue.${body.crypticId}`]: FieldValue.increment(1),
      hintsUsed: FieldValue.increment(1),
    });
    return { hints: hints.slice(0, used + 1), remaining: maxAllowed - used - 1 };
  });
});
