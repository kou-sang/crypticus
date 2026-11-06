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
import { TIER_SHARES } from '../../shared/selection';
import {
  DIFFICULTIES,
  type Competition,
  type CompetitionConfig,
  type CompetitionVisibility,
  type CrypticPublic,
  type Difficulty,
  type GameFlow,
  type HistoryEntry,
  type RankedMode,
  type Participant,
  type TierMix,
  type UserProfile,
} from '../../shared/types';
import { LIMITS, validateConfig } from '../../shared/scoring';

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

/** Muestreo aleatorio por dificultad usando el campo `rand` (índice tier + rand). */
export async function pickRandomCryptics(tier: Difficulty, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const pivot = Math.random();
  const cryptics = collection(db, 'cryptics');
  const first = await getDocs(
    query(cryptics, where('tier', '==', tier), where('rand', '>=', pivot), orderBy('rand'), limit(count)),
  );
  const ids = first.docs.map((d) => d.id);
  if (ids.length < count) {
    const wrap = await getDocs(
      query(cryptics, where('tier', '==', tier), where('rand', '<', pivot), orderBy('rand'), limit(count - ids.length)),
    );
    ids.push(...wrap.docs.map((d) => d.id));
  }
  return ids;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Selección al crear la sala.
 * - 'free': `clueCount` cripticos repartidos según `tierMix` (orden aleatorio o progresivo).
 * - 'rounds': hasta `clueCount` por dificultad, para que la votación siempre tenga opciones.
 */
export async function selectCryptics(
  flow: GameFlow,
  tierMix: TierMix,
  clueCount: number,
): Promise<{ crypticIds: string[]; pool: Record<Difficulty, string[]> }> {
  if (flow === 'rounds') {
    const perTier = Math.min(clueCount, LIMITS.maxCluesPerTier);
    const [easy, medium, hard] = await Promise.all(DIFFICULTIES.map((tier) => pickRandomCryptics(tier, perTier)));
    const pool = { easy: easy ?? [], medium: medium ?? [], hard: hard ?? [] };
    return { crypticIds: [...pool.easy, ...pool.medium, ...pool.hard], pool };
  }

  const shares = TIER_SHARES[tierMix];
  const wanted = DIFFICULTIES.map((tier) => Math.round(clueCount * shares[tier]));
  const [easy = [], medium = [], hard = []] = await Promise.all(DIFFICULTIES.map((tier, i) => pickRandomCryptics(tier, wanted[i] ?? 0)));
  // Si una dificultad no alcanza, se completa con las otras.
  let deficit = clueCount - easy.length - medium.length - hard.length;
  if (deficit > 0) {
    for (const tier of DIFFICULTIES) {
      if (deficit <= 0) break;
      const extra = await pickRandomCryptics(tier, deficit + (wanted[DIFFICULTIES.indexOf(tier)] ?? 0));
      const bucket = tier === 'easy' ? easy : tier === 'medium' ? medium : hard;
      for (const id of extra) {
        if (deficit <= 0) break;
        if (!bucket.includes(id)) {
          bucket.push(id);
          deficit -= 1;
        }
      }
    }
  }
  const pool = { easy, medium, hard };
  const crypticIds = tierMix === 'progressive' ? [...shuffle(easy), ...shuffle(medium), ...shuffle(hard)] : shuffle([...easy, ...medium, ...hard]);
  return { crypticIds: crypticIds.slice(0, clueCount), pool };
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
  invitedIds?: string[]; // Desafío directo a amigos.
}

export async function createCompetition(host: UserProfile, input: CreateCompetitionInput): Promise<string> {
  const errors = validateConfig(input, input.maxPlayers);
  if (errors.length > 0) throw new Error(errors.join(' '));

  const { crypticIds, pool } = await selectCryptics(input.flow, input.tierMix, input.clueCount);
  if (crypticIds.length === 0) throw new Error('No hay cripticos cargados todavía.');

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
    wrongPenalty: input.wrongPenalty,
    tierMix: input.tierMix,
    hideScoreboard: input.hideScoreboard,
    // Firestore no acepta `undefined`: los campos de modo solo se escriben si existen.
    ...(input.game ? { game: input.game } : {}),
    ...(input.intervalSec !== undefined ? { intervalSec: input.intervalSec } : {}),
    ...(input.duel ? { duel: input.duel } : {}),
    ...(input.royale ? { royale: input.royale } : {}),
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
    ...(input.invitedIds?.length ? { invitedIds: input.invitedIds.slice(0, 7) } : {}),
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
