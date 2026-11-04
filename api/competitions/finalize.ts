// POST /api/competitions/finalize — idempotente. Cualquier participante la llama al expirar el tiempo.
import { adminDb } from '../_lib/firebaseAdmin.js';
import { postHandler, requireStrings } from '../_lib/http.js';
import { finalizeIfEnded, loadCompetition, requireParticipant } from '../_lib/competition.js';

export default postHandler(requireStrings('competitionId'), async ({ uid, body }) => {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const loaded = await loadCompetition(db, tx, body.competitionId);
    requireParticipant(loaded.participants, uid);
    const evaluation = await finalizeIfEnded(db, tx, loaded, Date.now());
    return { finished: evaluation.finished, winnerId: evaluation.winnerId };
  });
});
