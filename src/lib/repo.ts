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
import { chunk, pairId } from './utils';
import type {
  Competition,
  CompetitionConfig,
  CompetitionVisibility,
  CrypticPublic,
  Participant,
  UserProfile,
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

// ---------- Cripticos ----------

/** Muestreo aleatorio O(n) en lecturas usando el campo `rand`. */
export async function pickRandomCryptics(count: number): Promise<string[]> {
  const pivot = Math.random();
  const cryptics = collection(db, 'cryptics');
  const first = await getDocs(query(cryptics, where('rand', '>=', pivot), orderBy('rand'), limit(count)));
  const ids = first.docs.map((d) => d.id);
  if (ids.length < count) {
    const wrap = await getDocs(query(cryptics, where('rand', '<', pivot), orderBy('rand'), limit(count - ids.length)));
    ids.push(...wrap.docs.map((d) => d.id));
  }
  return ids;
}

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
}

export async function createCompetition(host: UserProfile, input: CreateCompetitionInput): Promise<string> {
  const errors = validateConfig(input, input.maxPlayers);
  if (errors.length > 0) throw new Error(errors.join(' '));

  const crypticIds = await pickRandomCryptics(input.clueCount);
  if (crypticIds.length === 0) throw new Error('No hay cripticos cargados todavía.');

  const config: CompetitionConfig = {
    mode: input.mode,
    scoring: input.scoring,
    durationSec: input.durationSec,
    targetCount: input.targetCount,
    winByTwoMinScore: input.winByTwoMinScore,
    maxHintsPerClue: input.maxHintsPerClue,
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
    participantIds: [host.uid],
    createdAt: Date.now(),
    startedAt: null,
    endsAt: null,
    finishedAt: null,
    winnerId: null,
  } satisfies Omit<Competition, 'id'>);
  batch.set(doc(competitionRef, 'participants', host.uid), newParticipant(host));
  await batch.commit();
  return competitionRef.id;
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
    lastSolvedAt: null,
    lastAttemptAt: null,
    joinedAt: Date.now(),
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
