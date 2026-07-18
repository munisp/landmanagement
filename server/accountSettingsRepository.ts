interface ProfileRecord {
  userId: number;
  name: string;
  email: string;
  phone: string;
  role: string;
  updatedAt: string;
}

interface SessionRecord {
  id: string;
  userId: number;
  device: string;
  location: string;
  isCurrent: boolean;
  lastActiveAt: string;
  createdAt: string;
  status: 'active' | 'revoked';
}

interface SecurityRecord {
  userId: number;
  twoFactorEnabled: boolean;
  passwordUpdatedAt: string;
}

interface AccountSettingsState {
  profiles: ProfileRecord[];
  security: SecurityRecord[];
  sessions: SessionRecord[];
}

import { readJsonStore, writeJsonStore } from './jsonStore';

function createDefaultState(): AccountSettingsState {
  const now = new Date().toISOString();
  return {
    profiles: [],
    security: [],
    sessions: [],
  };
}

async function getState(): Promise<AccountSettingsState> {
  return readJsonStore<AccountSettingsState>('account-settings-store', createDefaultState);
}

async function ensureProfile(userId: number, defaults?: Partial<ProfileRecord>): Promise<ProfileRecord> {
  const state = await getState();
  let profile = state.profiles.find((item) => item.userId === userId);
  if (!profile) {
    profile = {
      userId,
      name: defaults?.name || `User ${userId}`,
      email: defaults?.email || `user${userId}@idlr.local`,
      phone: defaults?.phone || '+234 000 000 0000',
      role: defaults?.role || 'user',
      updatedAt: new Date().toISOString(),
    };
    state.profiles.push(profile);
    await writeJsonStore('account-settings-store', state);
  }
  return profile;
}

async function ensureSecurity(userId: number): Promise<SecurityRecord> {
  const state = await getState();
  let security = state.security.find((item) => item.userId === userId);
  if (!security) {
    security = {
      userId,
      twoFactorEnabled: false,
      passwordUpdatedAt: new Date().toISOString(),
    };
    state.security.push(security);
    await writeJsonStore('account-settings-store', state);
  }
  return security;
}

async function ensureSessions(userId: number): Promise<SessionRecord[]> {
  const state = await getState();
  const existing = state.sessions.filter((item) => item.userId === userId);
  if (existing.length > 0) {
    return existing;
  }

  const now = new Date().toISOString();
  const seeded: SessionRecord[] = [
    {
      id: `session-${userId}-current`,
      userId,
      device: 'Current Browser Session',
      location: 'Lagos, Nigeria',
      isCurrent: true,
      lastActiveAt: now,
      createdAt: now,
      status: 'active',
    },
    {
      id: `session-${userId}-mobile`,
      userId,
      device: 'Mobile App',
      location: 'Abuja, Nigeria',
      isCurrent: false,
      lastActiveAt: now,
      createdAt: now,
      status: 'active',
    },
  ];
  state.sessions.push(...seeded);
  await writeJsonStore('account-settings-store', state);
  return seeded;
}

export async function getAccountSettings(userId: number, defaults?: Partial<ProfileRecord>) {
  const profile = await ensureProfile(userId, defaults);
  const security = await ensureSecurity(userId);
  const sessions = (await ensureSessions(userId)).filter((session) => session.status === 'active');
  return { profile, security, sessions };
}

export async function updateAccountProfile(userId: number, input: { name: string; email: string; phone: string; role?: string }) {
  await ensureProfile(userId);
  const state = await getState();
  const profile = state.profiles.find((item) => item.userId === userId)!;
  profile.name = input.name;
  profile.email = input.email;
  profile.phone = input.phone;
  if (input.role) {
    profile.role = input.role;
  }
  profile.updatedAt = new Date().toISOString();
  await writeJsonStore('account-settings-store', state);
  return profile;
}

export async function changeAccountPassword(userId: number, input: { currentPassword: string; newPassword: string }) {
  if (!input.currentPassword || !input.newPassword) {
    throw new Error('Current and new passwords are required');
  }
  await ensureSecurity(userId);
  const state = await getState();
  const security = state.security.find((item) => item.userId === userId)!;
  security.passwordUpdatedAt = new Date().toISOString();
  await writeJsonStore('account-settings-store', state);
  return { success: true, passwordUpdatedAt: security.passwordUpdatedAt };
}

export async function setTwoFactorEnabled(userId: number, enabled: boolean) {
  await ensureSecurity(userId);
  const state = await getState();
  const security = state.security.find((item) => item.userId === userId)!;
  security.twoFactorEnabled = enabled;
  await writeJsonStore('account-settings-store', state);
  return security;
}

export async function revokeAccountSession(userId: number, sessionId: string) {
  const state = await getState();
  const session = state.sessions.find((item) => item.userId === userId && item.id === sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  session.status = 'revoked';
  session.isCurrent = false;
  await writeJsonStore('account-settings-store', state);
  return { success: true, sessionId };
}
