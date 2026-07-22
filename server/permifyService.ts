import { createHash } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { desc, eq } from "drizzle-orm";
import type { User } from "../drizzle/schema";
import { authorizationSchemaVersions } from "../drizzle/schema";
import { requireDb } from "./db";

export type PermifyResourceType =
  | "parcel"
  | "transaction"
  | "title"
  | "document"
  | "workflow"
  | "report"
  | "marketplace_listing"
  | "admin_surface"
  | "system";

export type PermifyAction = "view" | "create" | "update" | "delete" | "approve" | "manage";

type PermifyResponse = Record<string, unknown>;

const ROLE_RELATIONS = ["admin", "registrar", "surveyor", "broker", "investor"] as const;
type RoleRelation = (typeof ROLE_RELATIONS)[number];

function getConfig() {
  const baseUrl = process.env.PERMIFY_URL?.replace(/\/$/, "");
  const tenantId = process.env.PERMIFY_TENANT_ID?.trim();
  if (!baseUrl) {
    throw new Error("PERMIFY_URL must be configured for authorization enforcement");
  }
  if (!tenantId) {
    throw new Error("PERMIFY_TENANT_ID must be configured for authorization enforcement");
  }
  return { baseUrl, tenantId };
}

function getHeaders(): Record<string, string> {
  const token = process.env.PERMIFY_AUTH_TOKEN?.trim();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function permifyRequest<T extends PermifyResponse>(pathName: string, body: Record<string, unknown>): Promise<T> {
  const { baseUrl } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.PERMIFY_TIMEOUT_MS || 5000));

  try {
    const response = await fetch(`${baseUrl}${pathName}`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload: T | undefined;
    if (responseText) {
      try {
        payload = JSON.parse(responseText) as T;
      } catch {
        payload = undefined;
      }
    }

    if (!response.ok) {
      const detail = typeof payload?.message === "string" ? payload.message : responseText;
      throw new Error(`Permify ${pathName} failed (${response.status}): ${detail || "unknown error"}`);
    }
    return (payload ?? {}) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function readAuthorizationSchema(): Promise<{ schema: string; schemaHash: string }> {
  const filename = path.resolve(process.cwd(), "permify", "landmanagement.perm");
  const schema = await readFile(filename, "utf8");
  const schemaHash = createHash("sha256").update(schema).digest("hex");
  return { schema, schemaHash };
}

export async function publishAuthorizationSchema(publishedBy?: number): Promise<string> {
  const { tenantId } = getConfig();
  const { schema, schemaHash } = await readAuthorizationSchema();
  const db = await requireDb();
  const existing = await db
    .select()
    .from(authorizationSchemaVersions)
    .where(eq(authorizationSchemaVersions.tenantId, tenantId))
    .orderBy(desc(authorizationSchemaVersions.publishedAt))
    .limit(1);

  if (existing[0]?.schemaHash === schemaHash) {
    return existing[0].schemaVersion;
  }

  const payload = await permifyRequest<{ schema_version?: string; schemaVersion?: string }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/schemas/write`,
    { schema },
  );
  const schemaVersion = payload.schema_version ?? payload.schemaVersion;
  if (!schemaVersion || typeof schemaVersion !== "string") {
    throw new Error("Permify did not return a schema version after publishing the authorization model");
  }

  await db
    .insert(authorizationSchemaVersions)
    .values({ tenantId, schemaVersion, schemaHash, publishedBy: publishedBy ?? null })
    .onConflictDoNothing();

  return schemaVersion;
}

function roleRelation(role: string | null | undefined): RoleRelation | null {
  return ROLE_RELATIONS.includes(role as RoleRelation) ? (role as RoleRelation) : null;
}

function platformTuple(userId: number, relation: string) {
  return {
    entity: { type: "platform", id: "global" },
    relation,
    subject: { type: "user", id: String(userId), relation: "" },
  };
}

async function deletePlatformRole(userId: number, relation: RoleRelation): Promise<void> {
  const { tenantId } = getConfig();
  await permifyRequest(`/v1/tenants/${encodeURIComponent(tenantId)}/data/delete`, {
    metadata: { snap_token: "" },
    tuple_filter: {
      entity: { type: "platform", ids: ["global"] },
      relation,
      subject: { type: "user", ids: [String(userId)], relation: "" },
    },
  });
}

/**
 * Synchronize an application's current role to the global platform policy.
 * Every invocation clears the mutable role tuples first, ensuring a demotion
 * cannot leave an obsolete authorization grant in Permify.
 */
export async function synchronizePlatformRole(user: User): Promise<string> {
  const { tenantId } = getConfig();
  const schemaVersion = await publishAuthorizationSchema(user.id);
  await Promise.all(ROLE_RELATIONS.map((relation) => deletePlatformRole(user.id, relation)));

  const tuples = [platformTuple(user.id, "member")];
  const currentRole = roleRelation(user.role);
  if (currentRole) {
    tuples.push(platformTuple(user.id, currentRole));
  }

  await permifyRequest(`/v1/tenants/${encodeURIComponent(tenantId)}/data/write`, {
    metadata: { schema_version: schemaVersion },
    tuples,
  });
  return schemaVersion;
}

export async function grantResourceRelation(params: {
  resourceType: Exclude<PermifyResourceType, "admin_surface" | "system">;
  resourceId: string;
  relation: string;
  userId: number;
  schemaVersion?: string;
}): Promise<void> {
  const { tenantId } = getConfig();
  const schemaVersion = params.schemaVersion ?? (await publishAuthorizationSchema());
  await permifyRequest(`/v1/tenants/${encodeURIComponent(tenantId)}/data/write`, {
    metadata: { schema_version: schemaVersion },
    tuples: [{
      entity: { type: params.resourceType, id: params.resourceId },
      relation: params.relation,
      subject: { type: "user", id: String(params.userId), relation: "" },
    }],
  });
}

export async function checkPermifyPermission(params: {
  user: User;
  resource: PermifyResourceType;
  resourceId: string;
  action: PermifyAction;
}): Promise<boolean> {
  const { tenantId } = getConfig();
  const schemaVersion = await synchronizePlatformRole(params.user);
  const payload = await permifyRequest<{ can?: string | boolean; allowed?: boolean }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/permissions/check`,
    {
      metadata: { schema_version: schemaVersion, snap_token: "", depth: 20 },
      entity: { type: params.resource, id: params.resourceId },
      permission: params.action,
      subject: { type: "user", id: String(params.user.id), relation: "" },
    },
  );

  if (typeof payload.allowed === "boolean") return payload.allowed;
  if (typeof payload.can === "boolean") return payload.can;
  if (typeof payload.can === "string") {
    return payload.can === "RESULT_ALLOWED" || payload.can.toLowerCase() === "allow";
  }
  throw new Error("Permify permission check returned no authorization decision");
}
