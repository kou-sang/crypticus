// POST /api/competitions/start — el anfitrión inicia la competencia.
import { adminDb } from '../_lib/firebaseAdmin.js';
import { HttpError, postHandler, requireStrings } from '../_lib/http.js';
import { loadCompetition } from '../_lib/competition.js';

export default postHandler(requireStrings('competitionId'), async ({ uid, body }) => {
  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const { competition, participants } = await loadCompetition(db, tx, body.competitionId);

    if (competition.hostId !== uid) throw new HttpError(403, 'not_host', 'Solo el anfitrión puede iniciar.');
    if (competition.status !== 'lobby') throw new HttpError(409, 'already_started', 'La competencia ya inició.');

    const minPlayers = competition.scoring === 'winByTwo' ? 2 : 1;
    if (participants.length < minPlayers) {
      throw new HttpError(409, 'not_enough_players', `Se necesitan al menos ${minPlayers} jugadores.`);
    }

    const now = Date.now();
    const startedAt = now + 3_000; // Cuenta regresiva de 3 s para sincronizar a todos.
    const endsAt = startedAt + competition.durationSec * 1000;
    tx.update(db.collection('competitions').doc(competition.id), { status: 'live', startedAt, endsAt });
    return { startedAt, endsAt };
  });
});
