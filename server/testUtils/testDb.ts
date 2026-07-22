/**
 * Integration-test database fixture.
 *
 * The default mode boots PGlite for portable local tests. Set TEST_DATABASE_URL
 * to run the identical migration set against an isolated real PostgreSQL
 * database; this is required for full foreign-key and production-SQL validation.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import path from "path";

let bootPromise: Promise<void> | null = null;
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

async function bootRealPostgres(connectionString: string): Promise<void> {
  const client = postgres(connectionString, { max: 1, connect_timeout: 5 });
  const db = drizzlePostgres(client);
  await db.execute(sql`select 1`);

  // Real-PostgreSQL validation databases are prepared before the suite starts.
  // When explicitly requested, serialize migration setup with an advisory lock
  // rather than letting independently loaded test files mutate shared schemas.
  if (process.env.TEST_DATABASE_MIGRATE === "true") {
    await db.execute(sql`select pg_advisory_lock(hashtext('idlr_test_database_migration'))`);
    try {
      await migratePostgres(db, { migrationsFolder });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(hashtext('idlr_test_database_migration'))`);
    }
  }
  const { setDbForTests } = await import("../db");
  setDbForTests(db as unknown as Parameters<typeof setDbForTests>[0]);
}

async function bootPglite(): Promise<void> {
  const client = new PGlite();
  const db = drizzlePglite(client);
  await migratePglite(db, { migrationsFolder });
  const { setDbForTests } = await import("../db");
  setDbForTests(db as unknown as Parameters<typeof setDbForTests>[0]);
}

export function ensureTestDb(): Promise<void> {
  if (!bootPromise) {
    const realPostgresUrl = process.env.TEST_DATABASE_URL?.trim();
    bootPromise = realPostgresUrl ? bootRealPostgres(realPostgresUrl) : bootPglite();
  }
  return bootPromise;
}
