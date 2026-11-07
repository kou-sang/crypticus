// Migración v1.2 (una vez): reparte el Royale anterior en sus categorías de tiempo (Hyperbullet, Bullet, Rapid).
// 1) A cada partida de Royale del historial sin `ratingPool` le agrega el pool y el control de tiempo,
//    leídos de `competitions/{id}.royale`.
// 2) Rehace los contadores de `modeStats.royale_*` con el historial. El Elo de cada categoría queda en el
//    último Elo de Royale registrado en esa categoría, salvo que la categoría ya tenga Elo propio (partidas v1.2).
// Uso: npx tsx --env-file=.env.local scripts/backfill-royale-pools.ts [--dry-run]
// Lecturas: 1 por usuario + sus partidas de Royale + 1 por sala de Royale. Seguro de repetir.
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type Firestore, type WriteBatch } from 'firebase-admin/firestore';
import { ROYALE_CATEGORIES, ratingPoolOf, type RatingPool } from '../shared/ratingPools.js';
import type { HistoryEntry, ModeStats, RoyaleConfig } from '../shared/types.js';

const BATCH_SIZE = 400; // < límite de 500 escrituras por batch.

function openFirestore(): Firestore {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT.');
  const json = serviceAccount.trim().startsWith('{') ? serviceAccount : Buffer.from(serviceAccount, 'base64').toString('utf8');
  return getFirestore(initializeApp({ credential: cert(JSON.parse(json)) }));
}

/** Escrituras acumuladas en batches de hasta BATCH_SIZE. */
class Writer {
  private batch: WriteBatch;
  private pending = 0;
  total = 0;
  constructor(
    private readonly db: Firestore,
    private readonly dryRun: boolean,
  ) {
    this.batch = db.batch();
  }
  async update(ref: DocumentReference, data: Record<string, unknown>): Promise<void> {
    this.total += 1;
    if (this.dryRun) return;
    this.batch.update(ref, data);
    this.pending += 1;
    if (this.pending >= BATCH_SIZE) await this.flush();
  }
  async flush(): Promise<void> {
    if (this.dryRun || this.pending === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.pending = 0;
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const db = openFirestore();
  const writer = new Writer(db, dryRun);
  const royaleByRoom = new Map<string, RoyaleConfig | null>();

  const roomRoyale = async (competitionId: string): Promise<RoyaleConfig | null> => {
    if (!royaleByRoom.has(competitionId)) {
      const snap = await db.collection('competitions').doc(competitionId).get();
      const royale = snap.get('royale') as RoyaleConfig | undefined;
      royaleByRoom.set(competitionId, royale && typeof royale.baseSec === 'number' ? royale : null);
    }
    return royaleByRoom.get(competitionId) ?? null;
  };

  const users = await db.collection('users').select('modeStats').get();
  let tagged = 0;
  let missing = 0;
  let touchedUsers = 0;

  for (const user of users.docs) {
    const history = await user.ref.collection('history').where('game', '==', 'royale').get();
    if (history.empty) continue;
    const byPool = new Map<RatingPool, HistoryEntry[]>();

    for (const doc of history.docs) {
      const entry = doc.data() as HistoryEntry;
      let pool: RatingPool | null = entry.ratingPool ?? null;
      if (!pool) {
        const royale = entry.royale ?? (await roomRoyale(entry.competitionId || doc.id));
        pool = ratingPoolOf('royale', royale);
        if (!pool || !royale) {
          missing += 1;
          continue;
        }
        await writer.update(doc.ref, { ratingPool: pool, royale: { baseSec: royale.baseSec, incrementSec: royale.incrementSec } });
        tagged += 1;
      }
      if (pool && entry.players >= 2) byPool.set(pool, [...(byPool.get(pool) ?? []), entry]);
    }

    const current = (user.get('modeStats') ?? {}) as Partial<Record<string, ModeStats>>;
    const fields: Record<string, unknown> = {};
    for (const category of ROYALE_CATEGORIES) {
      const pool: RatingPool = `royale_${category}`;
      const entries = (byPool.get(pool) ?? []).sort((a, b) => a.finishedAt - b.finishedAt);
      if (entries.length === 0) continue;
      const outcome = (e: HistoryEntry) => e.outcome ?? (e.won ? 'win' : 'loss');
      const lastRated = entries.filter((e) => typeof e.modeRatingAfter === 'number').at(-1)?.modeRatingAfter;
      const stats: ModeStats = {
        rating: current[pool]?.rating ?? lastRated ?? current.royale?.rating ?? 1200,
        played: entries.length,
        wins: entries.filter((e) => outcome(e) === 'win').length,
        losses: entries.filter((e) => outcome(e) === 'loss').length,
        draws: entries.filter((e) => outcome(e) === 'draw').length,
      };
      fields[`modeStats.${pool}`] = stats;
    }
    if (Object.keys(fields).length > 0) {
      await writer.update(user.ref, fields);
      touchedUsers += 1;
      console.log(`  ${user.id}: ${Object.entries(fields).map(([k, v]) => `${k.slice(10)}=${(v as ModeStats).rating} (${(v as ModeStats).played})`).join(', ')}`);
    }
  }

  await writer.flush();
  console.log(
    `${dryRun ? '[dry-run] ' : ''}✓ ${tagged} partidas clasificadas, ${touchedUsers} usuarios actualizados, ${missing} sin sala o sin tiempo (quedan sin categoría). Escrituras: ${writer.total}.`,
  );
}

main().catch((error: unknown) => {
  console.error('Migración fallida:', error instanceof Error ? error.message : error);
  process.exit(1);
});
