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

const globalState = globalThis as typeof globalThis & {
  __accountSettingsState?: AccountSettingsState;
};

function createDefaultState(): AccountSettingsState {
  const now = new Date().toISOString();
  return {
    profiles: [],
    security: [],
    sessions: [],
  };
}

function getState(): AccountSettingsState {
  if (!globalState.__accountSettingsState) {
    globalState.__accountSettingsState = createDefaultState();
  }
  return globalState.__accountSettingsState;
}

function ensureProfile(userId: number, defaults?: Partial<ProfileRecord>): ProfileRecord {
  const state = getState();
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
  }
  return profile;
}

function ensureSecurity(userId: number): SecurityRecord {
  const state = getState();
  let security = state.security.find((item) => item.userId === userId);
  if (!security) {
    security = {
      userId,
      twoFactorEnabled: false,
      passwordUpdatedAt: new Date().toISOString(),
    };
    state.security.push(security);
  }
  return security;
}

function ensureSessions(userId: number): SessionRecord[] {
  const state = getState();
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
  return seeded;
}

export function getAccountSettings(userId: number, defaults?: Partial<ProfileRecord>) {
  const profile = ensureProfile(userId, defaults);
  const security = ensureSecurity(userId);
  const sessions = ensureSessions(userId).filter((session) => session.status === 'active');
  return { profile, security, sessions };
}

export function updateAccountProfile(userId: number, input: { name: string; email: string; phone: string; role?: string }) {
  const profile = ensureProfile(userId);
  profile.name = input.name;
  profile.email = input.email;
  profile.phone = input.phone;
  if (input.role) {
    profile.role = input.role;
  }
  profile.updatedAt = new Date().toISOString();
  return profile;
}

export function changeAccountPassword(userId: number, input: { currentPassword: string; newPassword: string }) {
  if (!input.currentPassword || !input.newPassword) {
    throw new Error('Current and new passwords are required');
  }
  const security = ensureSecurity(userId);
  security.passwordUpdatedAt = new Date().toISOString();
  return { success: true, passwordUpdatedAt: security.passwordUpdatedAt };
}

export function setTwoFactorEnabled(userId: number, enabled: boolean) {
  const security = ensureSecurity(userId);
  security.twoFactorEnabled = enabled;
  return security;
}

export function revokeAccountSession(userId: number, sessionId: string) {
  const state = getState();
  const session = state.sessions.find((item) => item.userId === userId && item.id === sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  session.status = 'revoked';
  session.isCurrent = false;
  return { success: true, sessionId };
}
