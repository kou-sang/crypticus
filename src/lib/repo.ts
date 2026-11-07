// Capa de acceso a datos del cliente. Toda escritura directa a Firestore pasa por aquí.
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { chunk, detectDevice, pairId } from './utils';
import {
  type Competition,
  type CompetitionConfig,
  type CompetitionVisibility,
  type CrypticPublic,
  type HistoryEntry,
  type RankedMode,
  type Participant,
  type UserProfile,
} from '../../shared/types';
import { validateConfig } from '../../shared/scoring';

// ---------- Perfil ----------

export async function createProfile(uid: string, displayName: string, handle: string): Promise<void> {
  const handleRef = doc(db, 'handles', handle);
  const existing = await getDoc(handleRef);
  if (existing.exists()) throw new Error(`@${handle} ya está en uso.`);

  const batch = writeBatch(db);
  batch.set(handleRef, { uid });
  batch.set(doc(db, 'users', uid), {
    uid,
    displayName: displayName.trim(),
    handle,
    rating: 1200,
    stats: { played: 0, wins: 0, solved: 0, hintsUsed: 0 },
    createdAt: Date.now(),
  } satisfies UserProfile);
  await batch.commit();
}

export async function findUserByHandle(handle: string): Promise<UserProfile | null> {
  const handleSnap = await getDoc(doc(db, 'handles', handle.replace(/^@/, '').toLowerCase()));
  if (!handleSnap.exists()) return null;
  const userSnap = await getDoc(doc(db, 'users', handleSnap.get('uid') as string));
  return userSnap.exists() ? (userSnap.data() as UserProfile) : null;
}

export async function getUsers(uids: string[]): Promise<UserProfile[]> {
  const results = await Promise.all(
    chunk(uids, 30).map((ids) => getDocs(query(collection(db, 'users'), where(documentId(), 'in', ids)))),
  );
  return results.flatMap((snap) => snap.docs.map((d) => d.data() as UserProfile));
}

// ---------- Historial y ranking ----------

export async function getHistory(uid: string, max = 50): Promise<HistoryEntry[]> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'history'), orderBy('finishedAt', 'desc'), limit(max)));
  return snap.docs.map((d) => d.data() as HistoryEntry);
}

const TOP_LIMIT = 50;
const TOP_TTL_MS = 60_000;
let topCache: { at: number; promise: Promise<UserProfile[]> } | null = null;

/**
 * Top global compartido por Inicio (top 5) y Ranking (top 50): una sola consulta por minuto.
 * Si falla, se descarta la caché para reintentar en la próxima llamada.
 */
export function getTopPlayers(max = TOP_LIMIT): Promise<UserProfile[]> {
  if (!topCache || Date.now() - topCache.at > TOP_TTL_MS) {
    const promise = getDocs(query(collection(db, 'users'), orderBy('rating', 'desc'), limit(TOP_LIMIT))).then((snap) =>
      snap.docs.map((d) => d.data() as UserProfile),
    );
    promise.catch(() => {
      topCache = null;
    });
    topCache = { at: Date.now(), promise };
  }
  return topCache.promise.then((rows) => rows.slice(0, max));
}

const modeTopCache = new Map<RankedMode, { at: number; promise: Promise<UserProfile[]> }>();

/** Top 50 de un modo por Elo (solo aparecen quienes jugaron ese modo). Caché de 60 s por modo. */
export function getTopByMode(mode: RankedMode): Promise<UserProfile[]> {
  const cached = modeTopCache.get(mode);
  if (cached && Date.now() - cached.at <= TOP_TTL_MS) return cached.promise;
  const promise = getDocs(
    query(collection(db, 'users'), orderBy(`modeStats.${mode}.rating`, 'desc'), limit(TOP_LIMIT)),
  ).then((snap) => snap.docs.map((d) => d.data() as UserProfile));
  promise.catch(() => modeTopCache.delete(mode));
  modeTopCache.set(mode, { at: Date.now(), promise });
  return promise;
}

/** Posición en el ranking de un modo (1 lectura de agregación). */
export async function getModePosition(mode: RankedMode, rating: number): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, 'users'), where(`modeStats.${mode}.rating`, '>', rating)));
  return snap.data().count + 1;
}

/** Posición global: 1 lectura de agregación (cuenta cuántos tienen más rating). */
export async function getGlobalPosition(rating: number): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, 'users'), where('rating', '>', rating)));
  return snap.data().count + 1;
}

export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  const trimmed = displayName.trim();
  if (trimmed.length < 2 || trimmed.length > 32) throw new Error('El nombre debe tener entre 2 y 32 caracteres.');
  await updateDoc(doc(db, 'users', uid), { displayName: trimmed });
}

// ---------- Cripticos ----------

export async function getCryptics(ids: string[]): Promise<Map<string, CrypticPublic>> {
  const results = await Promise.all(
    chunk(ids, 30).map((part) => getDocs(query(collection(db, 'cryptics'), where(documentId(), 'in', part)))),
  );
  const map = new Map<string, CrypticPublic>();
  results.forEach((snap) => snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() } as CrypticPublic)));
  return map;
}

// ---------- Competencias ----------

export interface CreateCompetitionInput extends CompetitionConfig {
  title: string;
  visibility: CompetitionVisibility;
  maxPlayers: number;
  clueCount: number;
  invitedIds?: string[]; // Desafío directo a amigos.
  rematchOf?: string; // Revancha: partida de origen.
  invitedNames?: Record<string, string>;
}

export async function createCompetition(host: UserProfile, input: CreateCompetitionInput): Promise<string> {
  const errors = validateConfig(input, input.maxPlayers);
  if (errors.length > 0) throw new Error(errors.join(' '));

  // El servidor elige los cripticos al iniciar (sin repetir y en secreto); aquí solo se guarda cuántos.
  // Las reglas de Firestore exigen una lista no vacía: se guarda un marcador que el Worker reemplaza.
  const crypticIds = ['pending'];
  const pool = { easy: [], medium: [], hard: [] };

  const config: CompetitionConfig = {
    mode: input.mode,
    scoring: input.scoring,
    flow: input.flow,
    durationSec: input.durationSec,
    targetCount: input.targetCount,
    winByTwo: input.winByTwo,
    difficultyVote: input.difficultyVote,
    rivalCountdownSec: input.rivalCountdownSec,
    comeback: input.comeback,
    extraTime: input.extraTime,
    bossLevel: input.bossLevel,
    maxHintsPerClue: input.maxHintsPerClue,
    ...(input.hintsPerGame !== undefined ? { hintsPerGame: input.hintsPerGame } : {}),
    wrongPenalty: input.wrongPenalty,
    tierMix: input.tierMix,
    hideScoreboard: input.hideScoreboard,
    // Firestore no acepta `undefined`: los campos de modo solo se escriben si existen.
    ...(input.game ? { game: input.game } : {}),
    ...(input.intervalSec !== undefined ? { intervalSec: input.intervalSec } : {}),
    ...(input.duel ? { duel: input.duel } : {}),
    ...(input.royale ? { royale: input.royale } : {}),
    ...(input.cooldownSec !== undefined ? { cooldownSec: input.cooldownSec } : {}),
    ...(input.surrender ? { surrender: input.surrender } : {}),
  };
  const competitionRef = doc(collection(db, 'competitions'));
  const batch = writeBatch(db);
  batch.set(competitionRef, {
    ...config,
    title: input.title.trim(),
    visibility: input.visibility,
    maxPlayers: input.maxPlayers,
    hostId: host.uid,
    hostName: host.displayName,
    status: 'lobby',
    crypticIds,
    pool,
    participantIds: [host.uid],
    createdAt: Date.now(),
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    winnerId: null,
    clueCount: input.clueCount,
    ...(input.invitedIds?.length ? { invitedIds: input.invitedIds.slice(0, 7) } : {}),
    ...(input.rematchOf ? { rematchOf: input.rematchOf, declinedIds: [] } : {}),
    ...(input.invitedNames ? { invitedNames: input.invitedNames } : {}),
  } satisfies Omit<Competition, 'id'>);
  batch.set(doc(competitionRef, 'participants', host.uid), newParticipant(host));
  await batch.commit();
  return competitionRef.id;
}

const REMATCH_PREFIX = 'Revancha · ';

export function rematchTitle(title: string): string {
  const base = title.startsWith(REMATCH_PREFIX) ? title.slice(REMATCH_PREFIX.length) : title;
  return `${REMATCH_PREFIX}${base}`.slice(0, 60);
}

/** Reglas de juego guardadas en la partida (sin estado de sala). */
export function configOf(comp: Competition): CompetitionConfig {
  return {
    mode: comp.mode,
    scoring: comp.scoring,
    flow: comp.flow,
    durationSec: comp.durationSec,
    targetCount: comp.targetCount,
    winByTwo: comp.winByTwo === true,
    difficultyVote: comp.difficultyVote === true,
    rivalCountdownSec: Number(comp.rivalCountdownSec ?? 0),
    comeback: comp.comeback,
    extraTime: comp.extraTime,
    bossLevel: comp.bossLevel,
    maxHintsPerClue: comp.maxHintsPerClue,
    ...(comp.hintsPerGame !== undefined ? { hintsPerGame: comp.hintsPerGame } : {}),
    wrongPenalty: comp.wrongPenalty,
    tierMix: comp.tierMix,
    hideScoreboard: comp.hideScoreboard === true,
    ...(comp.game ? { game: comp.game } : {}),
    ...(comp.intervalSec !== undefined ? { intervalSec: comp.intervalSec } : {}),
    ...(comp.duel ? { duel: { ...comp.duel } } : {}),
    ...(comp.royale ? { royale: { ...comp.royale } } : {}),
    ...(comp.cooldownSec !== undefined ? { cooldownSec: comp.cooldownSec } : {}),
    ...(comp.surrender ? { surrender: { ...comp.surrender } } : {}),
  };
}

export interface RematchTarget {
  competition: Competition;
  names: Record<string, string>; // uid -> nombre de los jugadores de la partida.
}

/** Invitados de una revancha: todos los jugadores de la partida menos quien la propone. */
function rematchInvites({ competition, names }: RematchTarget, hostUid: string) {
  const invitedIds = competition.participantIds.filter((id) => id !== hostUid).slice(0, 7);
  return {
    invitedIds,
    invitedNames: Object.fromEntries(invitedIds.map((id) => [id, names[id] ?? 'Jugador'])),
    rematchOf: competition.id,
  };
}

/** Misma configuración que la partida terminada (modo, reglas y sala) e invitación a los demás jugadores. */
export function rematchInput(target: RematchTarget, hostUid: string): CreateCompetitionInput {
  const comp = target.competition;
  return {
    ...configOf(comp),
    title: rematchTitle(comp.title),
    visibility: comp.visibility,
    maxPlayers: comp.maxPlayers,
    clueCount: typeof comp.clueCount === 'number' ? comp.clueCount : 30,
    ...rematchInvites(target, hostUid),
  };
}

/** Enlaza la propuesta desde la partida terminada para que los demás jugadores la vean. */
async function linkRematch(fromId: string, rematchId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'competitions', fromId), { rematchId });
  } catch (error) {
    // Sin el enlace la sala igual existe; solo no aparece como propuesta en la partida anterior.
    console.warn('[revancha] no se pudo enlazar', error);
  }
}

/** Propone la revancha con las mismas reglas: crea la sala, invita a todos y la enlaza. */
export async function proposeRematch(host: UserProfile, target: RematchTarget): Promise<string> {
  const id = await createCompetition(host, rematchInput(target, host.uid));
  await linkRematch(target.competition.id, id);
  return id;
}

/** Revancha con otros parámetros: la sala se crea desde el formulario y luego se enlaza igual. */
export async function proposeCustomRematch(host: UserProfile, fromId: string, input: CreateCompetitionInput): Promise<string> {
  const id = await createCompetition(host, input);
  await linkRematch(fromId, id);
  return id;
}

export function rematchInvitesFor(target: RematchTarget, hostUid: string) {
  return rematchInvites(target, hostUid);
}

/** Rechaza una revancha: queda registrado para que quien la propuso lo vea. */
export async function declineRematch(competitionId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'competitions', competitionId), { declinedIds: arrayUnion(uid) });
}

function newParticipant(profile: UserProfile): Participant {
  return {
    uid: profile.uid,
    displayName: profile.displayName,
    score: 0,
    solvedIds: [],
    hintsByClue: {},
    hintsUsed: 0,
    attempts: 0,
    wrongAttempts: 0,
    lastSolvedAt: null,
    lastAttemptAt: null,
    joinedAt: Date.now(),
    device: detectDevice(),
  };
}

export async function joinCompetition(competitionId: string, profile: UserProfile): Promise<void> {
  const ref = doc(db, 'competitions', competitionId);
  const batch = writeBatch(db);
  batch.update(ref, { participantIds: arrayUnion(profile.uid) });
  batch.set(doc(ref, 'participants', profile.uid), newParticipant(profile));
  await batch.commit();
}

export async function leaveCompetition(competitionId: string, uid: string): Promise<void> {
  const ref = doc(db, 'competitions', competitionId);
  const batch = writeBatch(db);
  batch.update(ref, { participantIds: arrayRemove(uid) });
  batch.delete(doc(ref, 'participants', uid));
  await batch.commit();
}

export async function deleteCompetition(competitionId: string, uid: string): Promise<void> {
  // Borrado atómico del doc del anfitrión y la competencia (solo en lobby, ver reglas).
  const ref = doc(db, 'competitions', competitionId);
  const batch = writeBatch(db);
  batch.delete(doc(ref, 'participants', uid));
  batch.delete(ref);
  await batch.commit();
}

// ---------- Amistades ----------

export async function sendFriendRequest(from: string, to: string): Promise<void> {
  if (from === to) throw new Error('No puedes agregarte a ti mismo.');
  await setDoc(doc(db, 'friendRequests', pairId(from, to)), {
    from,
    to,
    members: [from, to],
    status: 'pending',
    createdAt: Date.now(),
  });
}

export async function acceptFriendRequest(id: string): Promise<void> {
  await updateDoc(doc(db, 'friendRequests', id), { status: 'accepted', acceptedAt: Date.now() });
}

export async function removeFriendRequest(id: string): Promise<void> {
  await deleteDoc(doc(db, 'friendRequests', id));
}

// ---------- Chat ----------

export async function sendMessage(
  path: { kind: 'chat'; chatId: string } | { kind: 'competition'; competitionId: string },
  author: UserProfile,
  text: string,
): Promise<void> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;
  const target =
    path.kind === 'chat'
      ? collection(db, 'chats', path.chatId, 'messages')
      : collection(db, 'competitions', path.competitionId, 'messages');
  await addDoc(target, {
    authorId: author.uid,
    authorName: author.displayName,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
}
