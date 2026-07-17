/**
 * GDPR Compliance Implementation
 * Implements practical privacy operations for the current platform.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { users } from '../drizzle/schema';
import { getDb } from './db';

const GDPR_STORE_DIR = path.join(process.cwd(), 'server', 'data', 'gdpr');
const CONSENT_LOG_PATH = path.join(GDPR_STORE_DIR, 'consent-log.json');
const BREACH_LOG_PATH = path.join(GDPR_STORE_DIR, 'breach-log.json');
const GDPR_ACTIVITY_LOG_PATH = path.join(GDPR_STORE_DIR, 'activity-log.json');

interface ConsentRecord {
  userId: number;
  purpose: string;
  granted: boolean;
  recordedAt: string;
}

interface BreachRecord {
  description: string;
  affectedUsers: number[];
  dataCategories: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  notifiedAt: string;
}

interface GDPRActivityRecord {
  userId: number;
  activity: string;
  details: Record<string, any>;
  createdAt: string;
}

async function ensureGdprStore() {
  await fs.mkdir(GDPR_STORE_DIR, { recursive: true });

  for (const filePath of [CONSENT_LOG_PATH, BREACH_LOG_PATH, GDPR_ACTIVITY_LOG_PATH]) {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, '[]\n', 'utf8');
    }
  }
}

async function readJsonArray<T>(filePath: string): Promise<T[]> {
  await ensureGdprStore();
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T[];
}

async function writeJsonArray<T>(filePath: string, value: T[]): Promise<void> {
  await ensureGdprStore();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function getUserRecord(userId: number) {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  return { db, user };
}

async function writeUserExport(userId: number, payload: Record<string, any>, format: 'json' | 'csv' = 'json'): Promise<string> {
  await ensureGdprStore();

  if (format === 'csv') {
    const csv = Object.entries(payload)
      .map(([key, value]) => `${JSON.stringify(key)},${JSON.stringify(typeof value === 'string' ? value : JSON.stringify(value))}`)
      .join('\n');
    const filePath = path.join(GDPR_STORE_DIR, `user-${userId}-export.csv`);
    await fs.writeFile(filePath, csv + '\n', 'utf8');
    return filePath;
  }

  const filePath = path.join(GDPR_STORE_DIR, `user-${userId}-export.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return filePath;
}

/**
 * Right to Access (Article 15)
 * Export all personal data for a user
 */
export async function exportUserData(userId: number): Promise<{ url: string }> {
  const { user } = await getUserRecord(userId);
  const filePath = await writeUserExport(userId, { exportedAt: new Date().toISOString(), user }, 'json');
  await logGDPRActivity(userId, 'export_user_data', { filePath });

  return {
    url: filePath,
  };
}

/**
 * Right to Rectification (Article 16)
 * Update incorrect personal data
 */
export async function rectifyUserData(userId: number, updates: Record<string, any>): Promise<void> {
  const { db } = await getUserRecord(userId);
  const allowedUpdates = {
    name: typeof updates.name === 'string' ? updates.name : undefined,
    email: typeof updates.email === 'string' ? updates.email : undefined,
    updatedAt: new Date(),
  };

  await db.update(users).set(allowedUpdates).where(eq(users.id, userId));
  await logGDPRActivity(userId, 'rectify_user_data', { fields: Object.keys(updates) });
}

/**
 * Right to Erasure (Article 17) - "Right to be Forgotten"
 * Delete or anonymize personal data
 */
export async function eraseUserData(userId: number, anonymize: boolean = true): Promise<void> {
  const { db } = await getUserRecord(userId);

  if (anonymize) {
    await db
      .update(users)
      .set({
        name: `Anonymized User ${userId}`,
        email: `anonymized+${userId}@example.invalid`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  } else {
    await db.delete(users).where(eq(users.id, userId));
  }

  await logGDPRActivity(userId, anonymize ? 'anonymize_user_data' : 'delete_user_data', { anonymize });
}

/**
 * Right to Data Portability (Article 20)
 * Export data in machine-readable format
 */
export async function portUserData(userId: number, format: 'json' | 'csv' | 'xml' = 'json'): Promise<{ url: string }> {
  const { user } = await getUserRecord(userId);
  const normalizedFormat = format === 'xml' ? 'json' : format;
  const filePath = await writeUserExport(userId, { portableAt: new Date().toISOString(), user }, normalizedFormat);
  await logGDPRActivity(userId, 'port_user_data', { filePath, format });

  return {
    url: filePath,
  };
}

/**
 * Consent Management
 */
export async function recordConsent(userId: number, purpose: string, granted: boolean): Promise<void> {
  const records = await readJsonArray<ConsentRecord>(CONSENT_LOG_PATH);
  records.unshift({ userId, purpose, granted, recordedAt: new Date().toISOString() });
  await writeJsonArray(CONSENT_LOG_PATH, records.slice(0, 5000));
  await logGDPRActivity(userId, 'record_consent', { purpose, granted });
}

export async function withdrawConsent(userId: number, purpose: string): Promise<void> {
  await recordConsent(userId, purpose, false);
  await logGDPRActivity(userId, 'withdraw_consent', { purpose });
}

/**
 * Data Breach Notification (Article 33-34)
 */
export async function notifyDataBreach(
  breachDetails: {
    description: string;
    affectedUsers: number[];
    dataCategories: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
  }
): Promise<void> {
  const records = await readJsonArray<BreachRecord>(BREACH_LOG_PATH);
  records.unshift({ ...breachDetails, notifiedAt: new Date().toISOString() });
  await writeJsonArray(BREACH_LOG_PATH, records.slice(0, 1000));

  for (const userId of breachDetails.affectedUsers) {
    await logGDPRActivity(userId, 'data_breach_notification', breachDetails);
  }
}

/**
 * Data Retention Policy
 */
export async function applyRetentionPolicy(): Promise<void> {
  const activities = await readJsonArray<GDPRActivityRecord>(GDPR_ACTIVITY_LOG_PATH);
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const retained = activities.filter((record) => new Date(record.createdAt).getTime() >= cutoff);
  await writeJsonArray(GDPR_ACTIVITY_LOG_PATH, retained);
}

/**
 * Audit Log
 */
export async function logGDPRActivity(
  userId: number,
  activity: string,
  details: Record<string, any>
): Promise<void> {
  const activities = await readJsonArray<GDPRActivityRecord>(GDPR_ACTIVITY_LOG_PATH);
  activities.unshift({
    userId,
    activity,
    details,
    createdAt: new Date().toISOString(),
  });
  await writeJsonArray(GDPR_ACTIVITY_LOG_PATH, activities.slice(0, 5000));
}
