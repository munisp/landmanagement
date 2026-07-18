/**
 * Title repository — PostgreSQL-backed.
 *
 * Persists to the `titles` table (migration 0012). No in-memory or file-store
 * fallback: a working database connection is required for every operation.
 */

import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { titles, type Title } from '../drizzle/schema';
import { requireDb } from './db';

export type TitleStatus = 'draft' | 'pending_verification' | 'verified' | 'registered' | 'encumbered';

export interface TitleRecord {
  id: number;
  titleNumber: string;
  parcelId: number;
  ownerId: number;
  ownerName: string;
  ownershipType: string;
  ownershipPercentage: number;
  titleType: string;
  status: TitleStatus;
  issuedAt?: string;
  verifiedAt?: string;
  encumbranceNotes?: string;
  createdAt: string;
  updatedAt: string;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function toRecord(row: Title): TitleRecord {
  return {
    id: row.id,
    titleNumber: row.titleNumber,
    parcelId: row.parcelId,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    ownershipType: row.ownershipType,
    ownershipPercentage: row.ownershipPercentage,
    titleType: row.titleType,
    status: row.status as TitleStatus,
    issuedAt: toIso(row.issuedAt),
    verifiedAt: toIso(row.verifiedAt),
    encumbranceNotes: row.encumbranceNotes ?? undefined,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(row.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function searchTitles(input: {
  query?: string;
  ownerId?: number;
  parcelId?: number;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const db = await requireDb();
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;

  const conditions: SQL[] = [];
  if (input.ownerId !== undefined) conditions.push(eq(titles.ownerId, input.ownerId));
  if (input.parcelId !== undefined) conditions.push(eq(titles.parcelId, input.parcelId));
  if (input.status) conditions.push(eq(titles.status, input.status));
  if (input.query) {
    const pattern = `%${input.query}%`;
    const queryCondition = or(
      ilike(titles.titleNumber, pattern),
      ilike(titles.ownerName, pattern),
      ilike(titles.titleType, pattern),
    );
    if (queryCondition) conditions.push(queryCondition);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(titles)
    .where(where);

  const rows = await db
    .select()
    .from(titles)
    .where(where)
    .orderBy(desc(titles.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    titles: rows.map(toRecord),
    total: count,
    page,
    limit,
  };
}

export async function getTitleById(id: number): Promise<TitleRecord | null> {
  const db = await requireDb();
  const rows = await db.select().from(titles).where(eq(titles.id, id)).limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function getTitleByNumber(titleNumber: string): Promise<TitleRecord | null> {
  const db = await requireDb();
  const rows = await db.select().from(titles).where(eq(titles.titleNumber, titleNumber)).limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function getTitlesByOwner(ownerId: number): Promise<TitleRecord[]> {
  const db = await requireDb();
  const rows = await db.select().from(titles).where(eq(titles.ownerId, ownerId)).orderBy(desc(titles.createdAt));
  return rows.map(toRecord);
}

export async function createTitle(input: {
  parcelId: number;
  ownerId: number;
  ownershipType: string;
  ownershipPercentage: number;
  titleType: string;
}): Promise<TitleRecord> {
  const db = await requireDb();

  return db.transaction(async (tx) => {
    const tempNumber = `PENDING-${crypto.randomUUID()}`;
    const inserted = await tx
      .insert(titles)
      .values({
        titleNumber: tempNumber,
        parcelId: input.parcelId,
        ownerId: input.ownerId,
        ownerName: `Owner ${input.ownerId}`,
        ownershipType: input.ownershipType,
        ownershipPercentage: input.ownershipPercentage,
        titleType: input.titleType,
        status: 'pending_verification',
      })
      .returning();

    const row = inserted[0];
    const titleNumber = `${input.titleType.slice(0, 4).toUpperCase()}-${new Date().getFullYear()}-${String(row.id).padStart(4, '0')}`;
    const updated = await tx
      .update(titles)
      .set({ titleNumber, updatedAt: new Date() })
      .where(eq(titles.id, row.id))
      .returning();

    return toRecord(updated[0]);
  });
}

export async function verifyTitle(id: number): Promise<TitleRecord> {
  const db = await requireDb();

  const existing = await db.select().from(titles).where(eq(titles.id, id)).limit(1);
  if (!existing[0]) {
    throw new Error('Title not found');
  }
  if (
    existing[0].status === 'verified' ||
    existing[0].status === 'registered' ||
    existing[0].status === 'encumbered'
  ) {
    return toRecord(existing[0]);
  }

  const now = new Date();
  const updated = await db
    .update(titles)
    .set({ status: 'verified', verifiedAt: now, updatedAt: now })
    .where(eq(titles.id, id))
    .returning();
  return toRecord(updated[0]);
}
