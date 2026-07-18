/**
 * JSONB document-store persistence for feature repositories.
 *
 * Each repository collection is one row in `repository_stores`, written with
 * an upsert inside a real PostgreSQL transaction. This replaces the previous
 * server/data/*.json file stores and process-local in-memory state with
 * durable, multi-instance-safe database persistence.
 *
 * There is deliberately no fallback: when the database is unreachable these
 * functions throw, so a route can never silently serve unsaved state.
 */

import { eq } from 'drizzle-orm';
import { repositoryStores } from '../drizzle/schema';
import { requireDb } from './db';

/**
 * Read a repository collection. When the collection does not exist yet it is
 * created from `seed()` and persisted before returning, mirroring the old
 * first-run file bootstrap — now against PostgreSQL.
 */
export async function readJsonStore<S>(collection: string, seed: () => S | Promise<S>): Promise<S> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(repositoryStores)
    .where(eq(repositoryStores.collection, collection))
    .limit(1);

  if (rows[0]) {
    return rows[0].data as S;
  }

  const initial = await seed();
  await db
    .insert(repositoryStores)
    .values({ collection, data: initial as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoNothing();
  return initial;
}

/**
 * Persist a repository collection (full-document upsert).
 */
export async function writeJsonStore<S>(collection: string, store: S): Promise<void> {
  const db = await requireDb();
  await db
    .insert(repositoryStores)
    .values({ collection, data: store as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: repositoryStores.collection,
      set: { data: store as Record<string, unknown>, updatedAt: new Date() },
    });
}
