import { and, desc, eq, inArray } from "drizzle-orm";
import {
  commercialAccountMembers,
  commercialAccounts,
  commercialInvoices,
  commercialProducts,
  commercialSubscriptions,
  commercialUsageEvents,
  registryOperationCases,
  registryOperationEvents,
  registryOperationQueues,
} from "../drizzle/schema";
import { requireDb } from "./db";

const PRODUCT_KEY = "registry-operations-cloud";
const ACTIVE_SUBSCRIPTION_STATES = ["trialing", "active", "past_due"] as const;
const CASE_TRANSITIONS: Record<string, string[]> = {
  submitted: ["triaged", "withdrawn"],
  triaged: ["in_review", "returned", "withdrawn"],
  in_review: ["returned", "completed", "withdrawn"],
  returned: ["triaged", "withdrawn"],
  completed: [],
  withdrawn: [],
};

type RegistryRole = "owner" | "registry_admin" | "registry_supervisor" | "registry_officer" | "billing_admin";

function key(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

async function requireMembership(actorId: number, accountKey: string, roles: RegistryRole[]) {
  const db = await requireDb();
  const [row] = await db
    .select({ account: commercialAccounts, membership: commercialAccountMembers })
    .from(commercialAccounts)
    .innerJoin(commercialAccountMembers, eq(commercialAccountMembers.accountId, commercialAccounts.id))
    .where(and(eq(commercialAccounts.accountKey, accountKey), eq(commercialAccountMembers.userId, actorId)))
    .limit(1);
  if (!row || !roles.includes(row.membership.role as RegistryRole)) throw new Error("You do not have the required Registry Operations role in this account");
  return { account: row.account, membership: row.membership };
}

async function requireEntitlement(accountId: number) {
  const db = await requireDb();
  const [subscription] = await db
    .select({ subscription: commercialSubscriptions, product: commercialProducts })
    .from(commercialSubscriptions)
    .innerJoin(commercialProducts, eq(commercialProducts.id, commercialSubscriptions.productId))
    .where(and(eq(commercialSubscriptions.accountId, accountId), eq(commercialProducts.productKey, PRODUCT_KEY), inArray(commercialSubscriptions.status, [...ACTIVE_SUBSCRIPTION_STATES])))
    .orderBy(desc(commercialSubscriptions.currentPeriodEnd))
    .limit(1);
  if (!subscription) throw new Error("Registry Operations Cloud requires an active commercial entitlement");
  return subscription;
}

async function recordUsage(accountId: number, metricKey: string, sourceType: string, sourceKey: string, metadata: Record<string, unknown>) {
  const db = await requireDb();
  await db.insert(commercialUsageEvents).values({ accountId, metricKey, quantity: 1, idempotencyKey: `registry:${metricKey}:${sourceKey}`, sourceType, sourceKey, metadata });
}

export async function createRegistryOperationsAccount(input: { actorId: number; legalName: string; billingEmail: string }) {
  const legalName = input.legalName.trim();
  const billingEmail = input.billingEmail.trim().toLowerCase();
  if (legalName.length < 2 || legalName.length > 255) throw new Error("A bounded legal institution name is required");
  if (!/^\S+@\S+\.\S+$/.test(billingEmail)) throw new Error("A valid billing email is required");
  const db = await requireDb();
  const [product] = await db.select().from(commercialProducts).where(eq(commercialProducts.productKey, PRODUCT_KEY)).limit(1);
  if (!product || !product.active) throw new Error("Registry Operations Cloud is not currently available");
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const [account] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(commercialAccounts).values({ accountKey: key("REG"), legalName, billingEmail, status: "trial", createdBy: input.actorId, createdAt: now, updatedAt: now }).returning();
    await tx.insert(commercialAccountMembers).values({ accountId: created.id, userId: input.actorId, role: "owner", createdAt: now });
    await tx.insert(commercialSubscriptions).values({ subscriptionKey: key("SUB"), accountId: created.id, productId: product.id, status: "trialing", startedAt: now, currentPeriodStart: now, currentPeriodEnd: trialEnd, createdAt: now, updatedAt: now });
    await tx.insert(registryOperationQueues).values({ accountId: created.id, queueKey: key("RQU"), name: "General registry service", serviceType: "general_request", slaHours: 72, enabled: true, createdBy: input.actorId, createdAt: now, updatedAt: now });
    return [created];
  });
  return account;
}

export async function createRegistryQueue(input: { actorId: number; accountKey: string; name: string; serviceType: string; slaHours: number }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "registry_admin", "registry_supervisor"]);
  await requireEntitlement(membership.account.id);
  const name = input.name.trim(); const serviceType = input.serviceType.trim().toLowerCase();
  if (name.length < 2 || name.length > 160 || !/^[a-z][a-z0-9_-]{1,63}$/.test(serviceType)) throw new Error("A valid queue name and normalized service type are required");
  if (!Number.isInteger(input.slaHours) || input.slaHours < 1 || input.slaHours > 8760) throw new Error("SLA hours must be between 1 and 8760");
  const db = await requireDb();
  return (await db.insert(registryOperationQueues).values({ accountId: membership.account.id, queueKey: key("RQU"), name, serviceType, slaHours: input.slaHours, enabled: true, createdBy: input.actorId, createdAt: new Date(), updatedAt: new Date() }).returning())[0];
}

export async function openRegistryOperationCase(input: { actorId: number; accountKey: string; queueKey: string; requestReference: string; parcelId?: number; requesterName?: string; requesterContactReference?: string; sourceReference?: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "registry_admin", "registry_supervisor", "registry_officer"]);
  await requireEntitlement(membership.account.id);
  const requestReference = input.requestReference.trim();
  if (!requestReference || requestReference.length > 160) throw new Error("A bounded request reference is required");
  const db = await requireDb();
  const [queue] = await db.select().from(registryOperationQueues).where(and(eq(registryOperationQueues.accountId, membership.account.id), eq(registryOperationQueues.queueKey, input.queueKey), eq(registryOperationQueues.enabled, true))).limit(1);
  if (!queue) throw new Error("Registry service queue was not found or is disabled");
  const now = new Date(); const dueAt = new Date(now.getTime() + queue.slaHours * 3_600_000);
  const [caseRow] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(registryOperationCases).values({ caseKey: key("ROC"), accountId: membership.account.id, queueId: queue.id, parcelId: input.parcelId ?? null, requestReference, requesterName: input.requesterName?.trim() || null, requesterContactReference: input.requesterContactReference?.trim() || null, status: "submitted", submittedAt: now, dueAt, sourceReference: input.sourceReference?.trim() || null, createdBy: input.actorId, createdAt: now, updatedAt: now }).returning();
    await tx.insert(registryOperationEvents).values({ caseId: created.id, eventType: "case_opened", nextStatus: "submitted", actorId: input.actorId, description: "Registry service case opened. This workflow does not create or amend an authoritative record.", metadata: { queueKey: queue.queueKey, requestReference } });
    return [created];
  });
  await recordUsage(membership.account.id, "monthly_operation_cases", "registry_operation_case", caseRow.caseKey, { queueKey: queue.queueKey });
  return caseRow;
}

export async function transitionRegistryOperationCase(input: { actorId: number; accountKey: string; caseKey: string; nextStatus: string; assignedTo?: number; outcomeNote?: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "registry_admin", "registry_supervisor", "registry_officer"]);
  await requireEntitlement(membership.account.id);
  const db = await requireDb();
  const [caseRow] = await db.select().from(registryOperationCases).where(and(eq(registryOperationCases.accountId, membership.account.id), eq(registryOperationCases.caseKey, input.caseKey))).limit(1);
  if (!caseRow) throw new Error("Registry operation case was not found");
  if (!CASE_TRANSITIONS[caseRow.status].includes(input.nextStatus)) throw new Error("The requested registry case transition is not allowed");
  const outcomeNote = input.outcomeNote?.trim() || null;
  if (input.nextStatus === "completed" && (!outcomeNote || outcomeNote.length < 8)) throw new Error("A factual outcome note is required before completion");
  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    const [changed] = await tx.update(registryOperationCases).set({ status: input.nextStatus as any, assignedTo: input.assignedTo ?? caseRow.assignedTo, outcomeNote: outcomeNote ?? caseRow.outcomeNote, completedAt: input.nextStatus === "completed" ? now : caseRow.completedAt, updatedAt: now }).where(eq(registryOperationCases.id, caseRow.id)).returning();
    await tx.insert(registryOperationEvents).values({ caseId: caseRow.id, eventType: "status_changed", previousStatus: caseRow.status, nextStatus: input.nextStatus as any, actorId: input.actorId, description: `Registry case moved from ${caseRow.status} to ${input.nextStatus}.`, metadata: { assignedTo: input.assignedTo ?? null, outcomeNote } });
    return [changed];
  });
  return updated;
}

export async function getRegistryOperationsDashboard(input: { actorId: number; accountKey: string; caseKey?: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "registry_admin", "registry_supervisor", "registry_officer", "billing_admin"]);
  const subscription = await requireEntitlement(membership.account.id);
  const db = await requireDb();
  const queues = await db.select().from(registryOperationQueues).where(eq(registryOperationQueues.accountId, membership.account.id)).orderBy(registryOperationQueues.name);
  const cases = await db.select().from(registryOperationCases).where(eq(registryOperationCases.accountId, membership.account.id)).orderBy(desc(registryOperationCases.updatedAt)).limit(200);
  const selected = input.caseKey ? cases.find((item) => item.caseKey === input.caseKey) : cases[0];
  const events = selected ? await db.select().from(registryOperationEvents).where(eq(registryOperationEvents.caseId, selected.id)).orderBy(registryOperationEvents.createdAt) : [];
  const invoices = await db.select().from(commercialInvoices).where(eq(commercialInvoices.accountId, membership.account.id)).orderBy(desc(commercialInvoices.createdAt));
  const now = Date.now();
  return { account: membership.account, subscription, role: membership.membership.role, queues, cases, invoices, selectedCase: selected ? { case: selected, events } : null, metrics: { openCases: cases.filter((item) => !["completed", "withdrawn"].includes(item.status)).length, overdueCases: cases.filter((item) => !["completed", "withdrawn"].includes(item.status) && item.dueAt.getTime() < now).length, completedCases: cases.filter((item) => item.status === "completed").length } };
}
