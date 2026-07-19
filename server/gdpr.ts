/**
 * GDPR Compliance Implementation
 * Implements practical privacy operations for the current platform.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { users } from '../drizzle/schema';
import { requireDb } from './db';
import { getAccountSettings, updateAccountProfile } from './accountSettingsRepository';

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

interface PrivacyProfileFallback {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
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

async function getUserRecord(userId: number, fallbackProfile?: PrivacyProfileFallback) {
  const db = await requireDb();


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
export async function exportUserData(userId: number, fallbackProfile?: PrivacyProfileFallback): Promise<{ url: string }> {
  const { user } = await getUserRecord(userId, fallbackProfile);
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
export async function rectifyUserData(userId: number, updates: Record<string, any>, fallbackProfile?: PrivacyProfileFallback): Promise<void> {
  const { db, user } = await getUserRecord(userId, fallbackProfile);
  const allowedUpdates = {
    name: typeof updates.name === 'string' ? updates.name : user.name,
    email: typeof updates.email === 'string' ? updates.email : user.email,
    phone: typeof updates.phone === 'string' ? updates.phone : (user as any).phone,
    updatedAt: new Date(),
  };

  await updateAccountProfile(userId, {
    name: allowedUpdates.name,
    email: allowedUpdates.email,
    phone: allowedUpdates.phone || '+234 000 000 0000',
    role: fallbackProfile?.role || (user as any).role || 'user',
  });

  if (db) {
    await db.update(users).set({
      name: allowedUpdates.name,
      email: allowedUpdates.email,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
  }

  await logGDPRActivity(userId, 'rectify_user_data', { fields: Object.keys(updates) });
}

/**
 * Right to Erasure (Article 17) - "Right to be Forgotten"
 * Delete or anonymize personal data
 */
export async function eraseUserData(userId: number, anonymize: boolean = true, fallbackProfile?: PrivacyProfileFallback): Promise<void> {
  const { db, user } = await getUserRecord(userId, fallbackProfile);

  if (anonymize) {
    await updateAccountProfile(userId, {
      name: `Anonymized User ${userId}`,
      email: `anonymized+${userId}@example.invalid`,
      phone: 'REDACTED',
      role: fallbackProfile?.role || (user as any).role || 'user',
    });

    if (db) {
      await db
        .update(users)
        .set({
          name: `Anonymized User ${userId}`,
          email: `anonymized+${userId}@example.invalid`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }
  } else if (db) {
    await db.delete(users).where(eq(users.id, userId));
  } else {
    await updateAccountProfile(userId, {
      name: `Deleted User ${userId}`,
      email: `deleted+${userId}@example.invalid`,
      phone: 'REDACTED',
      role: fallbackProfile?.role || (user as any).role || 'user',
    });
  }

  await logGDPRActivity(userId, anonymize ? 'anonymize_user_data' : 'delete_user_data', { anonymize });
}

/**
 * Right to Data Portability (Article 20)
 * Export data in machine-readable format
 */
export async function portUserData(userId: number, format: 'json' | 'csv' | 'xml' = 'json', fallbackProfile?: PrivacyProfileFallback): Promise<{ url: string }> {
  const { user } = await getUserRecord(userId, fallbackProfile);
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

export async function getConsentHistory(userId: number): Promise<ConsentRecord[]> {
  const records = await readJsonArray<ConsentRecord>(CONSENT_LOG_PATH);
  return records.filter((record) => record.userId === userId);
}

export async function getBreachNotifications(userId: number): Promise<BreachRecord[]> {
  const records = await readJsonArray<BreachRecord>(BREACH_LOG_PATH);
  return records.filter((record) => record.affectedUsers.includes(userId));
}

export async function getGDPRActivity(userId: number): Promise<GDPRActivityRecord[]> {
  const activities = await readJsonArray<GDPRActivityRecord>(GDPR_ACTIVITY_LOG_PATH);
  return activities.filter((record) => record.userId === userId);
}

export async function getPrivacyOverview(userId: number, fallbackProfile?: PrivacyProfileFallback) {
  const { user } = await getUserRecord(userId, fallbackProfile);
  const [consents, breaches, activities] = await Promise.all([
    getConsentHistory(userId),
    getBreachNotifications(userId),
    getGDPRActivity(userId),
  ]);

  const latestConsentByPurpose = new Map<string, ConsentRecord>();
  for (const item of consents) {
    if (!latestConsentByPurpose.has(item.purpose)) {
      latestConsentByPurpose.set(item.purpose, item);
    }
  }

  return {
    profile: user,
    consentHistory: consents.slice(0, 20),
    activeConsents: Array.from(latestConsentByPurpose.values()),
    breachNotifications: breaches.slice(0, 10),
    recentActivity: activities.slice(0, 20),
  };
}
