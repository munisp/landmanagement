import crypto from 'crypto';
import type { ApiKey, UsageStats } from './apiKeyService';
import { readJsonStore, writeJsonStore } from './jsonStore';

interface ApiKeyStore {
  keys: ApiKey[];
}


function seededStore(): ApiKeyStore {
  return {
    keys: [
      {
        id: crypto.randomUUID(),
        userId: '901',
        name: 'Offline Seed Key',
        key: `idlr_${crypto.randomBytes(32).toString('hex')}`,
        isActive: true,
        createdAt: new Date('2024-01-01T09:00:00.000Z'),
        lastUsedAt: new Date('2024-03-15T09:00:00.000Z'),
        expiresAt: null,
        requestCount: 12,
        rateLimit: 1000,
      },
    ],
  };
}

function reviveKey(key: ApiKey): ApiKey {
  return {
    ...key,
    createdAt: new Date(key.createdAt),
    lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt) : null,
    expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
  };
}

async function loadStore(): Promise<ApiKeyStore> {
  return readJsonStore<ApiKeyStore>('api-key-store', seededStore);
}

async function saveStore(store: ApiKeyStore) {
  await writeJsonStore('api-key-store', store);
}

export async function listOfflineApiKeys(userId: string): Promise<ApiKey[]> {
  const store = await loadStore();
  return store.keys
    .filter((key) => key.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function createOfflineApiKey(userId: string, name: string): Promise<ApiKey> {
  const store = await loadStore();
  const key: ApiKey = {
    id: crypto.randomUUID(),
    userId,
    name,
    key: `idlr_${crypto.randomBytes(32).toString('hex')}`,
    isActive: true,
    createdAt: new Date(),
    lastUsedAt: null,
    expiresAt: null,
    requestCount: 0,
    rateLimit: 1000,
  };
  store.keys.unshift(key);
  await saveStore(store);
  return key;
}

export async function revokeOfflineApiKey(userId: string, keyId: string): Promise<void> {
  const store = await loadStore();
  const key = store.keys.find((item) => item.userId === userId && item.id === keyId);
  if (key) {
    key.isActive = false;
  }
  await saveStore(store);
}

export async function rotateOfflineApiKey(userId: string, keyId: string): Promise<ApiKey> {
  const store = await loadStore();
  const oldKey = store.keys.find((item) => item.userId === userId && item.id === keyId);
  if (!oldKey) throw new Error('API key not found');
  oldKey.isActive = false;
  const newKey: ApiKey = {
    id: crypto.randomUUID(),
    userId,
    name: oldKey.name,
    key: `idlr_${crypto.randomBytes(32).toString('hex')}`,
    isActive: true,
    createdAt: new Date(),
    lastUsedAt: null,
    expiresAt: oldKey.expiresAt,
    requestCount: 0,
    rateLimit: oldKey.rateLimit,
  };
  store.keys.unshift(newKey);
  await saveStore(store);
  return newKey;
}

export async function validateOfflineApiKey(keyValue: string): Promise<ApiKey | null> {
  const store = await loadStore();
  const apiKey = store.keys.find((item) => item.key === keyValue && item.isActive);
  if (!apiKey) return null;
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) return null;
  apiKey.lastUsedAt = new Date();
  apiKey.requestCount += 1;
  await saveStore(store);
  return apiKey;
}

export async function getOfflineApiKeyUsageStats(userId: string): Promise<UsageStats> {
  const userKeys = await listOfflineApiKeys(userId);
  const totalKeys = userKeys.length;
  const activeKeys = userKeys.filter((key) => key.isActive).length;
  const totalRequests = userKeys.reduce((sum, key) => sum + key.requestCount, 0);
  return {
    totalKeys,
    activeKeys,
    requestsToday: Math.floor(totalRequests * 0.1),
    requestsThisMonth: Math.floor(totalRequests * 0.5),
    rateLimitHits: Math.floor(totalRequests * 0.02),
    errorRate: 0.5,
  };
}
