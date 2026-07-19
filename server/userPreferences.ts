/**
 * User Preferences Service
 * Handle user preferences storage and retrieval
 */

import { requireDb } from './db';
import { userPreferences } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

export interface NotificationSettings {
  email: boolean;
  sms: boolean;
  push: boolean;
  transactionUpdates: boolean;
  systemAlerts: boolean;
}

export type PartialNotificationSettings = Partial<NotificationSettings>;

export interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UserPreferences {
  userId: number;
  theme: 'light' | 'dark' | 'system';
  dashboardLayout?: DashboardLayoutItem[];
  notificationSettings?: NotificationSettings;
  language: string;
  timezone: string;
  dateFormat: string;
  currency: string;
}

/**
 * Get user preferences
 */
export async function getUserPreferences(userId: number): Promise<UserPreferences | null> {
  const db = await requireDb();


  const result = await db.select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  
  if (result.length === 0) {
    // Create default preferences
    const defaults = {
      userId,
      theme: 'system' as const,
      language: 'en',
      timezone: 'Africa/Lagos',
      dateFormat: 'DD/MM/YYYY',
      currency: 'NGN',
      notificationSettings: {
        email: true,
        sms: true,
        push: true,
        transactionUpdates: true,
        systemAlerts: true,
      },
    };
    
    await db.insert(userPreferences).values({
      ...defaults,
      dashboardLayout: [],
    });
    return {
      ...defaults,
      dashboardLayout: [],
    };
  }
  
  const pref = result[0];
  return {
    userId: pref.userId,
    theme: pref.theme as 'light' | 'dark' | 'system',
    language: pref.language,
    timezone: pref.timezone,
    dateFormat: pref.dateFormat,
    currency: pref.currency,
    notificationSettings: pref.notificationSettings as NotificationSettings,
    dashboardLayout: (pref.dashboardLayout as DashboardLayoutItem[] | null) ?? [],
  };
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  userId: number,
  preferences: Partial<UserPreferences>
): Promise<UserPreferences> {
  const db = await requireDb();


  const current = await getUserPreferences(userId);
  if (!current) {
    throw new Error('User preferences not found');
  }
  
  // Merge notification settings properly
  const notificationSettings = preferences.notificationSettings
    ? {
        email: preferences.notificationSettings.email ?? current.notificationSettings!.email,
        sms: preferences.notificationSettings.sms ?? current.notificationSettings!.sms,
        push: preferences.notificationSettings.push ?? current.notificationSettings!.push,
        transactionUpdates: preferences.notificationSettings.transactionUpdates ?? current.notificationSettings!.transactionUpdates,
        systemAlerts: preferences.notificationSettings.systemAlerts ?? current.notificationSettings!.systemAlerts,
      }
    : current.notificationSettings;
  
  const updated = {
    theme: preferences.theme ?? current.theme,
    language: preferences.language ?? current.language,
    timezone: preferences.timezone ?? current.timezone,
    dateFormat: preferences.dateFormat ?? current.dateFormat,
    currency: preferences.currency ?? current.currency,
    notificationSettings,
    dashboardLayout: preferences.dashboardLayout ?? current.dashboardLayout ?? [],
  };
  
  await db.update(userPreferences)
    .set(updated)
    .where(eq(userPreferences.userId, userId));
  
  return {
    ...updated,
    userId,
  };
}

/**
 * Save dashboard layout
 */
export async function saveDashboardLayout(
  userId: number,
  layout: DashboardLayoutItem[]
): Promise<void> {
  const db = await requireDb();


  // Ensure user preferences exist
  await getUserPreferences(userId);

  await db.update(userPreferences)
    .set({ dashboardLayout: layout, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId));
}

/**
 * Get dashboard layout
 */
export async function getDashboardLayout(userId: number): Promise<DashboardLayoutItem[] | null> {
  const db = await requireDb();


  const result = await db.select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  return (result[0].dashboardLayout as DashboardLayoutItem[] | null) ?? [];
}

/**
 * Update notification settings
 */
export async function updateNotificationSettings(
  userId: number,
  settings: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const db = await requireDb();


  const current = await getUserPreferences(userId);
  const currentSettings = current?.notificationSettings ?? {
    email: true,
    sms: true,
    push: true,
    transactionUpdates: true,
    systemAlerts: true,
  };
  
  const updatedSettings: NotificationSettings = {
    email: settings?.email !== undefined ? settings.email : currentSettings.email,
    sms: settings?.sms !== undefined ? settings.sms : currentSettings.sms,
    push: settings?.push !== undefined ? settings.push : currentSettings.push,
    transactionUpdates: settings?.transactionUpdates !== undefined ? settings.transactionUpdates : currentSettings.transactionUpdates,
    systemAlerts: settings?.systemAlerts !== undefined ? settings.systemAlerts : currentSettings.systemAlerts,
  };
  
  await updateUserPreferences(userId, {
    notificationSettings: updatedSettings,
  });
  
  return updatedSettings;
}
