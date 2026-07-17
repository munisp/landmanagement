import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ApiKey, UsageStats } from './apiKeyService';

interface ApiKeyStore {
  keys: ApiKey[];
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'api-key-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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

function loadStore(): ApiKeyStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const seeded = seededStore();
    fs.writeFileSync(storePath, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as ApiKeyStore;
  parsed.keys = parsed.keys.map(reviveKey);
  return parsed;
}

function saveStore(store: ApiKeyStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function listOfflineApiKeys(userId: string): ApiKey[] {
  const store = loadStore();
  return store.keys
    .filter((key) => key.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function createOfflineApiKey(userId: string, name: string): ApiKey {
  const store = loadStore();
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
  saveStore(store);
  return key;
}

export function revokeOfflineApiKey(userId: string, keyId: string): void {
  const store = loadStore();
  const key = store.keys.find((item) => item.userId === userId && item.id === keyId);
  if (key) {
    key.isActive = false;
  }
  saveStore(store);
}

export function rotateOfflineApiKey(userId: string, keyId: string): ApiKey {
  const store = loadStore();
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
  saveStore(store);
  return newKey;
}

export function validateOfflineApiKey(keyValue: string): ApiKey | null {
  const store = loadStore();
  const apiKey = store.keys.find((item) => item.key === keyValue && item.isActive);
  if (!apiKey) return null;
  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) return null;
  apiKey.lastUsedAt = new Date();
  apiKey.requestCount += 1;
  saveStore(store);
  return apiKey;
}

export function getOfflineApiKeyUsageStats(userId: string): UsageStats {
  const userKeys = listOfflineApiKeys(userId);
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
