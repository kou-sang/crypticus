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
  getDocFromServer,
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
import { chunk, detectDevice, pairId, withTimeout } from './utils';
import {
  type Competition,
  type CompetitionConfig,
  type CompetitionVisibility,
  type CrypticPublic,
  type HistoryEntry,
  type Participant,
  type UserProfile,
} from '../../shared/types';
import { validateConfig } from '../../shared/scoring';
import type { RatingPool } from '../../shared/ratingPools';
import { normalizeConfig } from '../../shared/config';
import { api } from './api';

// ---------- Perfil ----------

const PROFILE_TIMEOUT_MS = 15_000;

const NO_SERVER =
  'No hubo respuesta del servidor. Revisa la conexión; en iPhone, desactiva los bloqueadores de contenido y el Relay privado para este sitio e intenta de nuevo.';

/**
 * Alta del perfil. Devuelve el perfil para usarlo al instante (`adoptProfile`), sin esperar al listener.
 * Idempotente: si el perfil ya existe (alta anterior que el listener no llegó a mostrar), lo devuelve tal cual;
 * antes se reescribía y las reglas lo rechazaban (solo permiten cambiar el nombre).
 */
export async function createProfile(uid: string, displayName: string, handle: string): Promise<UserProfile> {
  const userRef = doc(db, 'users', uid);
  const handleRef = doc(db, 'handles', handle);
  // Desde el servidor: la caché local podría decir "libre" con un @usuario ya tomado (o tomado por uno mismo).
  const [current, existing] = await withTimeout(
    Promise.all([getDocFromServer(userRef), getDocFromServer(handleRef)]),
    PROFILE_TIMEOUT_MS,
    NO_SERVER,
  );
  if (current.exists()) return current.data() as UserProfile;
  // Reintento de un alta a medias: el @usuario ya es mío, solo falta el perfil.
  if (existing.exists() && existing.get('uid') !== uid) throw new Error(`@${handle} ya está en uso.`);

  const profile = {
    uid,
    displayName: displayName.trim(),
    handle,
    stats: { played: 0, wins: 0, solved: 0, hintsUsed: 0 },
    createdAt: Date.now(),
  } satisfies UserProfile;
  const batch = writeBatch(db);
  if (!existing.exists()) batch.set(handleRef, { uid });
  batch.set(userRef, profile);
  await withTimeout(batch.commit(), PROFILE_TIMEOUT_MS, NO_SERVER);
  return profile;
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

const modeTopCache = new Map<RatingPool, { at: number; promise: Promise<UserProfile[]> }>();

/** Top 50 de un pool por Elo (solo aparecen quienes lo jugaron). Caché de 60 s por pool. */
export function getTopByMode(mode: RatingPool): Promise<UserProfile[]> {
  const cached = modeTopCache.get(mode);
  if (cached && Date.now() - cached.at <= TOP_TTL_MS) return cached.promise;
  const promise = getDocs(
    query(collection(db, 'users'), orderBy(`modeStats.${mode}.rating`, 'desc'), limit(TOP_LIMIT)),
  ).then((snap) => snap.docs.map((d) => d.data() as UserProfile));
  promise.catch(() => modeTopCache.delete(mode));
  modeTopCache.set(mode, { at: Date.now(), promise });
  return promise;
}

/** Posición en el ranking de un pool (1 lectura de agregación). */
export async function getModePosition(mode: RatingPool, rating: number): Promise<number> {
  const snap = await getCountFromServer(query(collection(db, 'users'), where(`modeStats.${mode}.rating`, '>', rating)));
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
  title?: string; // Ignorado desde v1.0: el servidor nombra la sala «CÓDIGO · anfitrión».
  visibility: CompetitionVisibility;
  maxPlayers: number;
  clueCount: number;
  invitedIds?: string[]; // Desafío directo a amigos.
  rematchOf?: string; // Revancha: partida de origen.
  invitedNames?: Record<string, string>;
}

/**
 * Crea la sala en el servidor: valida reglas, toma el nombre del perfil y, si es revancha, la enlaza.
 * (Firestore no deja crear salas desde el cliente.)
 */
export async function createCompetition(input: CreateCompetitionInput): Promise<string> {
  const errors = validateConfig(input, input.maxPlayers);
  if (errors.length > 0) throw new Error(errors.join(' '));
  const { id } = await api.create({ ...input, device: detectDevice() });
  return id;
}

/** El anfitrión cambia reglas y datos de la sala mientras está en espera. */
export async function updateCompetition(competitionId: string, input: CreateCompetitionInput): Promise<void> {
  const errors = validateConfig(input, input.maxPlayers);
  if (errors.length > 0) throw new Error(errors.join(' '));
  await api.update(competitionId, input);
}

/** Sala abierta (en espera o en vivo) con ese código de 4 letras, o null. */
export async function findOpenRoomByCode(code: string): Promise<Competition | null> {
  const snap = await getDocs(
    query(collection(db, 'competitions'), where('code', '==', code), where('status', 'in', ['lobby', 'live']), limit(2)),
  );
  // En el caso (muy raro) de dos salas con el mismo código, gana la más reciente.
  const rooms = snap.docs.map((d) => ({ ...(d.data() as Competition), id: d.id }));
  rooms.sort((a, b) => b.createdAt - a.createdAt);
  return rooms[0] ?? null;
}

const REMATCH_PREFIX = 'Revancha · ';

export function rematchTitle(title: string): string {
  const base = title.startsWith(REMATCH_PREFIX) ? title.slice(REMATCH_PREFIX.length) : title;
  return `${REMATCH_PREFIX}${base}`.slice(0, 60);
}

/** Reglas de juego guardadas en la partida (sin estado de sala). */
export function configOf(comp: Competition): CompetitionConfig {
  return normalizeConfig(comp as unknown as Record<string, unknown>);
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

/** Propone la revancha con las mismas reglas: el servidor crea la sala, invita a todos y la enlaza. */
export async function proposeRematch(target: RematchTarget, hostUid: string): Promise<string> {
  return createCompetition(rematchInput(target, hostUid));
}

export function rematchInvitesFor(target: RematchTarget, hostUid: string) {
  return rematchInvites(target, hostUid);
}

/** Duel 2 vs 2: el jugador elige su equipo en la sala. */
export async function chooseTeam(competitionId: string, uid: string, team: 0 | 1): Promise<void> {
  await updateDoc(doc(db, 'competitions', competitionId), { [`teams.${uid}`]: team });
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
