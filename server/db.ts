import { eq, sql } from 'drizzle-orm';
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

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

// TODO: add feature queries here as your schema grows.

// API client for microservices
export class MicroserviceClient {
  private baseURL: string;

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

  async get(path: string, params?: Record<string, any>) {
    const url = new URL(path, this.baseURL);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Microservice request failed: ${response.statusText}`);
    }
    return response.json();
  }

  async post(path: string, data: any) {
    const url = new URL(path, this.baseURL);
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Microservice request failed: ${response.statusText}`);
    }
    return response.json();
  }

  async put(path: string, data: any) {
    const url = new URL(path, this.baseURL);
    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Microservice request failed: ${response.statusText}`);
    }
    return response.json();
  }

  async delete(path: string) {
    const url = new URL(path, this.baseURL);
    const response = await fetch(url.toString(), {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Microservice request failed: ${response.statusText}`);
    }
    return response.json();
  }
}

// Helper functions to call microservices
export const parcelService = new MicroserviceClient('parcel');
export const titleService = new MicroserviceClient('title');
export const transactionService = new MicroserviceClient('transaction');
export const paymentService = new MicroserviceClient('payment');
export const documentService = new MicroserviceClient('document');
export const blockchainService = new MicroserviceClient('blockchain');
