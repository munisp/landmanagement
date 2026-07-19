import { eq, sql } from 'drizzle-orm';
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Inject a database handle for integration tests (e.g. an embedded PGlite
 * instance). Pass null to restore the default lazy connection behaviour.
 * Test-only entry point — never called from production code paths.
 */
export function setDbForTests(db: ReturnType<typeof drizzle> | null) {
  _db = db;
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db) {
    try {
      const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://idlr_user:idlr_password@localhost:5432/idlr_pts';
      const client = postgres(connectionString, {
        connect_timeout: 3,
        max: 1,
        idle_timeout: 5,
      });
      const candidate = drizzle(client);
      await candidate.execute(sql`select 1`);
      _db = candidate;
      console.log('[Database] Connected to PostgreSQL');
    } catch (error) {
      console.warn('[Database] PostgreSQL unavailable, using offline-capable fallbacks');
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    // PostgreSQL upsert syntax
    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function isDatabaseAvailable(): Promise<boolean> {
  return (await getDb()) !== null;
}

export async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new Error('Database connection failed');
  }
  return db;
}

export async function getDatabaseFeatureStatus() {
  const databaseAvailable = await isDatabaseAvailable();
  return {
    databaseAvailable,
    services: {
      parcel: process.env.PARCEL_SERVICE_URL || 'http://localhost:8081',
      title: process.env.TITLE_SERVICE_URL || 'http://localhost:8082',
      transaction: process.env.TRANSACTION_SERVICE_URL || 'http://localhost:8083',
      payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:8084',
      document: process.env.DOCUMENT_SERVICE_URL || 'http://localhost:8085',
      blockchain: process.env.BLOCKCHAIN_SERVICE_URL || 'http://localhost:8086',
    },
  };
}

// Microservice calls are best-effort enrichments: when a sidecar service is
// down, callers fall back to the database. Without a breaker, every such call
// still pays a full network timeout before falling back, so a dead service
// makes the whole API sluggish. Three consecutive failures open the circuit
// for 30 seconds; MICROSERVICES_ENABLED=false disables calls outright.
const MICROSERVICES_ENABLED = process.env.MICROSERVICES_ENABLED !== 'false';
const MICROSERVICE_TIMEOUT_MS = parseInt(process.env.MICROSERVICE_TIMEOUT_MS || '3000', 10);

class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  private static readonly THRESHOLD = 3;
  private static readonly COOLDOWN_MS = 30_000;

  isOpen(): boolean {
    return Date.now() < this.openUntil;
  }

  onSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  onFailure(): void {
    this.failures++;
    if (this.failures >= CircuitBreaker.THRESHOLD) {
      this.openUntil = Date.now() + CircuitBreaker.COOLDOWN_MS;
      this.failures = 0;
    }
  }
}

// API client for microservices
export class MicroserviceClient {
  private baseURL: string;
  private breaker = new CircuitBreaker();

  constructor(serviceName: string) {
    // In production, use service discovery or API gateway
    const serviceURLs: Record<string, string> = {
      'parcel': process.env.PARCEL_SERVICE_URL || 'http://localhost:8081',
      'title': process.env.TITLE_SERVICE_URL || 'http://localhost:8082',
      'transaction': process.env.TRANSACTION_SERVICE_URL || 'http://localhost:8083',
      'payment': process.env.PAYMENT_SERVICE_URL || 'http://localhost:8084',
      'document': process.env.DOCUMENT_SERVICE_URL || 'http://localhost:8085',
      'blockchain': process.env.BLOCKCHAIN_SERVICE_URL || 'http://localhost:8086',
    };
    this.baseURL = serviceURLs[serviceName] || 'http://localhost:8080';
  }

  private assertAvailable() {
    if (!MICROSERVICES_ENABLED) {
      throw new Error('Microservices disabled via MICROSERVICES_ENABLED=false');
    }
    if (this.breaker.isOpen()) {
      throw new Error(`Circuit open for ${this.baseURL} — failing fast`);
    }
  }

  private async request(input: string, init?: RequestInit) {
    this.assertAvailable();
    try {
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(MICROSERVICE_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Microservice request failed: ${response.statusText}`);
      }
      this.breaker.onSuccess();
      return response.json();
    } catch (error) {
      this.breaker.onFailure();
      throw error;
    }
  }

  async get(path: string, params?: Record<string, any>) {
    const url = new URL(path, this.baseURL);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    return this.request(url.toString());
  }

  async post(path: string, data: any) {
    const url = new URL(path, this.baseURL);
    return this.request(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }

  async put(path: string, data: any) {
    const url = new URL(path, this.baseURL);
    return this.request(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  }

  async delete(path: string) {
    const url = new URL(path, this.baseURL);
    return this.request(url.toString(), {
      method: 'DELETE',
    });
  }
}

// Helper functions to call microservices
export const parcelService = new MicroserviceClient('parcel');
export const titleService = new MicroserviceClient('title');
export const transactionService = new MicroserviceClient('transaction');
export const paymentService = new MicroserviceClient('payment');
export const documentService = new MicroserviceClient('document');
export const blockchainService = new MicroserviceClient('blockchain');
