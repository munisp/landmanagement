/**
 * Integration-test database fixture.
 *
 * Boots an embedded PGlite instance (real PostgreSQL compiled to WASM),
 * applies the production migration set (drizzle/0000-0013) through drizzle's
 * migrator, and injects the connection into server/db.ts so repositories run
 * against a genuine database in tests - no mocks, no stubs.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'path';
import { setDbForTests } from '../db';

let bootPromise: Promise<void> | null = null;

export function ensureTestDb(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      const client = new PGlite();
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
      setDbForTests(db as unknown as Parameters<typeof setDbForTests>[0]);
    })();
  }
  return bootPromise;
}
