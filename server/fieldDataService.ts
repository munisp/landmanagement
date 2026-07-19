import { sql } from 'drizzle-orm';
import { requireDb } from './db';

export interface FieldDataRecord {
  parcelNumber: string;
  location: { lat: number; lng: number } | null;
  area: string;
  boundaries: string;
  notes: string;
  photos: string[];
  timestamp: string;
}

export interface SyncedFieldData {
  id: number;
  userId: number;
  parcelNumber: string;
  locationLat: number | null;
  locationLng: number | null;
  area: string | null;
  boundaries: string | null;
  notes: string | null;
  photos: string[];
  timestamp: Date;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const FieldDataService = {
  async syncFieldData(userId: number, data: FieldDataRecord): Promise<SyncedFieldData> {
    const db = await requireDb();



    const result = await db.execute(sql`
      INSERT INTO field_data (
        user_id,
        parcel_number,
        location_lat,
        location_lng,
        area,
        boundaries,
        notes,
        photos,
        timestamp,
        synced_at
      ) VALUES (
        ${userId},
        ${data.parcelNumber},
        ${data.location?.lat || null},
        ${data.location?.lng || null},
        ${data.area || null},
        ${data.boundaries || null},
        ${data.notes || null},
        ${data.photos}::text[],
        ${data.timestamp}::timestamp,
        NOW()
      )
      RETURNING *
    `);

    return result[0] as unknown as SyncedFieldData;
  },

  async getUserFieldData(userId: number, limit: number = 50): Promise<SyncedFieldData[]> {
    const db = await requireDb();



    const result = await db.execute(sql`
      SELECT * FROM field_data
      WHERE user_id = ${userId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `);

    return result as unknown as SyncedFieldData[];
  },

  async getFieldDataByParcel(parcelNumber: string): Promise<SyncedFieldData[]> {
    const db = await requireDb();



    const result = await db.execute(sql`
      SELECT * FROM field_data
      WHERE parcel_number = ${parcelNumber}
      ORDER BY timestamp DESC
    `);

    return result as unknown as SyncedFieldData[];
  },

  async getUserStats(userId: number): Promise<{
    totalRecords: number;
    totalParcels: number;
    lastSync: Date | null;
  }> {
    const db = await requireDb();



    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total_records,
        COUNT(DISTINCT parcel_number) as total_parcels,
        MAX(synced_at) as last_sync
      FROM field_data
      WHERE user_id = ${userId}
    `);

    const row = result[0] as {
      total_records?: string | number;
      total_parcels?: string | number;
      last_sync?: string | Date | null;
    };

    return {
      totalRecords: Number(row.total_records || 0),
      totalParcels: Number(row.total_parcels || 0),
      lastSync: row.last_sync ? new Date(row.last_sync) : null,
    };
  },

  async deleteFieldData(id: number, userId: number): Promise<boolean> {
    const db = await requireDb();



    const result = await db.execute(sql`
      DELETE FROM field_data
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id
    `);

    return result.length > 0;
  },
};
