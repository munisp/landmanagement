/**
 * Vitest setup: give every test worker a real (embedded) PostgreSQL database
 * with the full production migration set applied.
 */
import { beforeAll } from 'vitest';
import { ensureTestDb } from './testDb';

beforeAll(async () => {
  await ensureTestDb();
}, 120_000);
