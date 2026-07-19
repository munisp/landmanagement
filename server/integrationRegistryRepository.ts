import { desc, eq } from 'drizzle-orm';
import {
  integrationRegistry,
  integrationSyncRuns,
  type InsertIntegrationRegistryRecord,
  type InsertIntegrationSyncRun,
  type IntegrationRegistryRecord,
  type IntegrationSyncRun,
} from '../drizzle/schema';
import { requireDb } from './db';

const DEFAULT_INTEGRATIONS: Array<Pick<InsertIntegrationRegistryRecord, 'integrationKey' | 'displayName' | 'status' | 'notes'>> = [
  { integrationKey: 'postgres', displayName: 'PostgreSQL', status: 'configured', notes: 'Primary OLTP datastore' },
  { integrationKey: 'redis', displayName: 'Redis', status: 'configured', notes: 'Caching and short-lived coordination' },
  { integrationKey: 'temporal', displayName: 'Temporal', status: 'configured', notes: 'Workflow orchestration runtime' },
  { integrationKey: 'tigerbeetle', displayName: 'TigerBeetle', status: 'configured', notes: 'Ledger and settlement service' },
  { integrationKey: 'lakehouse', displayName: 'Lakehouse', status: 'draft', notes: 'Analytics and historical data platform' },
  { integrationKey: 'keycloak', displayName: 'Keycloak', status: 'draft', notes: 'Federated identity provider' },
  { integrationKey: 'permify', displayName: 'Permify', status: 'draft', notes: 'Relationship-based authorization engine' },
  { integrationKey: 'apisix', displayName: 'APISIX', status: 'draft', notes: 'API gateway and traffic policy layer' },
  { integrationKey: 'dapr', displayName: 'Dapr', status: 'draft', notes: 'Sidecar-based service invocation and pubsub layer' },
  { integrationKey: 'fluvio', displayName: 'Fluvio', status: 'draft', notes: 'Streaming and event transport layer' },
  { integrationKey: 'openappsec', displayName: 'OpenAppSec', status: 'draft', notes: 'WAF and API protection layer' },
];

export async function seedIntegrationRegistry(): Promise<IntegrationRegistryRecord[]> {
  const db = await requireDb();


  for (const item of DEFAULT_INTEGRATIONS) {
    const existing = await db
      .select()
      .from(integrationRegistry)
      .where(eq(integrationRegistry.integrationKey, item.integrationKey))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(integrationRegistry).values(item);
    }
  }

  return db.select().from(integrationRegistry).orderBy(integrationRegistry.displayName);
}

export async function listIntegrationRegistry(): Promise<IntegrationRegistryRecord[]> {
  const db = await requireDb();


  const records = await db.select().from(integrationRegistry).orderBy(integrationRegistry.displayName);
  if (records.length === 0) {
    return seedIntegrationRegistry();
  }
  return records;
}

export async function updateIntegrationRegistryStatus(
  integrationKey: IntegrationRegistryRecord['integrationKey'],
  patch: Partial<Pick<IntegrationRegistryRecord, 'status' | 'endpoint' | 'namespace' | 'version' | 'healthStatus' | 'configuration' | 'capabilities' | 'notes' | 'lastCheckedAt' | 'lastHealthyAt'>>,
): Promise<IntegrationRegistryRecord | null> {
  const db = await requireDb();


  const updated = await db
    .update(integrationRegistry)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(integrationRegistry.integrationKey, integrationKey))
    .returning();

  return updated[0] ?? null;
}

export async function recordIntegrationSyncRun(
  input: InsertIntegrationSyncRun,
): Promise<IntegrationSyncRun | (InsertIntegrationSyncRun & { id: number; createdAt: Date })> {
  const db = await requireDb();


  const inserted = await db.insert(integrationSyncRuns).values(input).returning();
  return inserted[0];
}

export async function listIntegrationSyncRuns(limit = 50): Promise<IntegrationSyncRun[]> {
  const db = await requireDb();


  return db
    .select()
    .from(integrationSyncRuns)
    .orderBy(desc(integrationSyncRuns.createdAt))
    .limit(limit);
}
