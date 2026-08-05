import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  commercialAccountMembers,
  commercialAccounts,
  commercialInvoices,
  commercialProducts,
  commercialSubscriptions,
  commercialUsageEvents,
  conveyancingMatterEvidence,
  conveyancingMatterEvents,
  conveyancingMatters,
  fieldSurveyAssignments,
  fieldSurveyEvidence,
  fieldSurveyEvents,
  lenderCollateralCases,
  lenderCollateralEvidence,
  lenderCollateralEvents,
  lenderPortfolios,
  mortgageApplications,
} from "../drizzle/schema";
import { requireDb } from "./db";
import { initializeFlutterwavePayment, initializePaystackPayment, verifyFlutterwavePayment, verifyPaystackPayment } from "./financialIntegrationsService";

export const COMMERCIAL_PRODUCTS = [
  "lender-collateral-core",
  "conveyancing-workspace",
  "field-survey-operations",
] as const;

export type CommercialProductKey = (typeof COMMERCIAL_PRODUCTS)[number];
export type CommercialMemberRole = "owner" | "billing_admin" | "lender_admin" | "lender_analyst" | "reviewer" | "matter_manager" | "legal_reviewer" | "field_manager" | "field_inspector" | "field_reviewer";
export type CollateralCaseStatus = "opened" | "evidence_requested" | "ready_for_review" | "under_review" | "conditional_approval" | "approved" | "declined" | "withdrawn";
export type CollateralEvidenceStatus = "pending" | "accepted" | "rejected";
export type ConveyancingMatterStatus = "opened" | "evidence_requested" | "title_review" | "legal_drafting" | "signatures_pending" | "closing_ready" | "completed" | "withdrawn";
export type ConveyancingEvidenceStatus = "pending" | "accepted" | "rejected";
export type FieldAssignmentStatus = "assigned" | "in_progress" | "submitted" | "under_review" | "accepted" | "returned" | "cancelled";
export type FieldEvidenceStatus = "pending" | "accepted" | "rejected";

const ACTIVE_ACCOUNT_STATUSES = new Set(["trial", "active"]);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["trialing", "active"]);
const FIELD_ASSIGNMENT_TRANSITIONS: Record<FieldAssignmentStatus, FieldAssignmentStatus[]> = {
  assigned: ["in_progress", "cancelled"],
  in_progress: ["submitted", "returned", "cancelled"],
  submitted: ["under_review", "returned"],
  under_review: ["accepted", "returned"],
  accepted: [],
  returned: ["in_progress", "submitted", "cancelled"],
  cancelled: [],
};

const MATTER_TRANSITIONS: Record<ConveyancingMatterStatus, ConveyancingMatterStatus[]> = {
  opened: ["evidence_requested", "title_review", "withdrawn"],
  evidence_requested: ["title_review", "withdrawn"],
  title_review: ["legal_drafting", "evidence_requested", "withdrawn"],
  legal_drafting: ["signatures_pending", "title_review", "withdrawn"],
  signatures_pending: ["closing_ready", "legal_drafting", "withdrawn"],
  closing_ready: ["completed", "signatures_pending", "withdrawn"],
  completed: [],
  withdrawn: [],
};

const CASE_TRANSITIONS: Record<CollateralCaseStatus, CollateralCaseStatus[]> = {
  opened: ["evidence_requested", "ready_for_review", "withdrawn"],
  evidence_requested: ["ready_for_review", "withdrawn"],
  ready_for_review: ["under_review", "evidence_requested", "withdrawn"],
  under_review: ["conditional_approval", "approved", "declined", "evidence_requested", "withdrawn"],
  conditional_approval: ["approved", "declined", "evidence_requested", "withdrawn"],
  approved: [],
  declined: [],
  withdrawn: [],
};

function key(prefix: string) {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`;
}

function periodEnd(from: Date) {
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}

function assertEmail(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid billing email is required");
  return normalized;
}

function assertCurrency(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("Currency must be a three-letter ISO code");
  return normalized;
}

function assertChecksum(value?: string) {
  if (value && !/^[a-f0-9]{64}$/i.test(value)) throw new Error("Evidence checksum must be a SHA-256 hex digest");
  return value?.toLowerCase();
}

function isDecisionStatus(status: CollateralCaseStatus) {
  return status === "conditional_approval" || status === "approved" || status === "declined";
}

async function loadMembership(userId: number, accountKey: string) {
  const db = await requireDb();
  const [membership] = await db
    .select({
      accountId: commercialAccounts.id,
      accountKey: commercialAccounts.accountKey,
      legalName: commercialAccounts.legalName,
      accountStatus: commercialAccounts.status,
      billingEmail: commercialAccounts.billingEmail,
      role: commercialAccountMembers.role,
    })
    .from(commercialAccountMembers)
    .innerJoin(commercialAccounts, eq(commercialAccountMembers.accountId, commercialAccounts.id))
    .where(and(eq(commercialAccountMembers.userId, userId), eq(commercialAccounts.accountKey, accountKey)))
    .limit(1);
  if (!membership) throw new Error("You are not a member of this commercial account");
  return membership;
}

async function requireMembership(userId: number, accountKey: string, roles: CommercialMemberRole[]) {
  const membership = await loadMembership(userId, accountKey);
  if (!roles.includes(membership.role as CommercialMemberRole)) throw new Error("Your commercial-account role does not permit this action");
  return membership;
}

async function requireActiveProductEntitlement(accountId: number, productKey: CommercialProductKey, productName: string) {
  const db = await requireDb();
  const [subscription] = await db
    .select({
      status: commercialSubscriptions.status,
      currentPeriodEnd: commercialSubscriptions.currentPeriodEnd,
      productKey: commercialProducts.productKey,
      accountStatus: commercialAccounts.status,
    })
    .from(commercialSubscriptions)
    .innerJoin(commercialProducts, eq(commercialSubscriptions.productId, commercialProducts.id))
    .innerJoin(commercialAccounts, eq(commercialSubscriptions.accountId, commercialAccounts.id))
    .where(and(eq(commercialSubscriptions.accountId, accountId), eq(commercialProducts.productKey, productKey)))
    .orderBy(desc(commercialSubscriptions.currentPeriodEnd))
    .limit(1);

  if (!subscription || !ACTIVE_ACCOUNT_STATUSES.has(subscription.accountStatus) || !ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) || subscription.currentPeriodEnd.getTime() <= Date.now()) {
    throw new Error(`An active ${productName} subscription is required for this workflow`);
  }
  return subscription;
}

async function requireActiveLenderEntitlement(accountId: number) {
  return requireActiveProductEntitlement(accountId, "lender-collateral-core", "Lender Collateral Control");
}

async function requireActiveConveyancingEntitlement(accountId: number) {
  return requireActiveProductEntitlement(accountId, "conveyancing-workspace", "Conveyancing and Title Verification Workspace");
}

async function requireActiveFieldEntitlement(accountId: number) {
  return requireActiveProductEntitlement(accountId, "field-survey-operations", "Field Survey and Parcel Inspection");
}

async function loadPortfolio(accountId: number) {
  const db = await requireDb();
  const [portfolio] = await db.select().from(lenderPortfolios).where(eq(lenderPortfolios.accountId, accountId)).limit(1);
  if (!portfolio) throw new Error("The lender portfolio is not configured for this commercial account");
  return portfolio;
}

async function recordUsage(accountId: number, metricKey: string, sourceType: string, sourceKey: string, metadata: Record<string, unknown>) {
  const db = await requireDb();
  await db
    .insert(commercialUsageEvents)
    .values({
      accountId,
      metricKey,
      quantity: 1,
      idempotencyKey: `${sourceType}:${sourceKey}:${metricKey}`,
      sourceType,
      sourceKey,
      metadata,
    })
    .onConflictDoNothing({ target: commercialUsageEvents.idempotencyKey });
}

export async function createCommercialLenderAccount(input: {
  actorId: number;
  legalName: string;
  billingEmail: string;
  lenderName: string;
  policyVersion: string;
}) {
  const legalName = input.legalName.trim();
  const lenderName = input.lenderName.trim();
  const policyVersion = input.policyVersion.trim();
  if (legalName.length < 2 || lenderName.length < 2 || policyVersion.length < 1) throw new Error("Organization, lender, and policy version are required");
  const billingEmail = assertEmail(input.billingEmail);
  const db = await requireDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(commercialProducts)
      .where(and(eq(commercialProducts.productKey, "lender-collateral-core"), eq(commercialProducts.active, true)))
      .limit(1);
    if (!product) throw new Error("The Lender Collateral Control product is unavailable");

    const [account] = await tx
      .insert(commercialAccounts)
      .values({
        accountKey: key("LEND"),
        legalName,
        billingEmail,
        status: "trial",
        createdBy: input.actorId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(commercialAccountMembers).values({
      accountId: account.id,
      userId: input.actorId,
      role: "owner",
      createdAt: now,
    });

    const [subscription] = await tx
      .insert(commercialSubscriptions)
      .values({
        subscriptionKey: key("SUB"),
        accountId: account.id,
        productId: product.id,
        status: "trialing",
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd(now),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [portfolio] = await tx
      .insert(lenderPortfolios)
      .values({
        portfolioKey: key("PORT"),
        accountId: account.id,
        lenderName,
        policyVersion,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return {
      accountKey: account.accountKey,
      subscriptionKey: subscription.subscriptionKey,
      trialEndsAt: subscription.currentPeriodEnd,
      portfolioKey: portfolio.portfolioKey,
      status: account.status,
    };
  });
}

export async function createCommercialConveyancingAccount(input: {
  actorId: number;
  legalName: string;
  billingEmail: string;
}) {
  const legalName = input.legalName.trim();
  if (legalName.length < 2) throw new Error("Organization name is required");
  const billingEmail = assertEmail(input.billingEmail);
  const db = await requireDb();
  const now = new Date();
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(commercialProducts)
      .where(and(eq(commercialProducts.productKey, "conveyancing-workspace"), eq(commercialProducts.active, true)))
      .limit(1);
    if (!product) throw new Error("The Conveyancing and Title Verification Workspace product is unavailable");
    const [account] = await tx
      .insert(commercialAccounts)
      .values({ accountKey: key("CONV"), legalName, billingEmail, status: "trial", createdBy: input.actorId, createdAt: now, updatedAt: now })
      .returning();
    await tx.insert(commercialAccountMembers).values({ accountId: account.id, userId: input.actorId, role: "owner", createdAt: now });
    const [subscription] = await tx
      .insert(commercialSubscriptions)
      .values({ subscriptionKey: key("SUB"), accountId: account.id, productId: product.id, status: "trialing", startedAt: now, currentPeriodStart: now, currentPeriodEnd: periodEnd(now), createdAt: now, updatedAt: now })
      .returning();
    return { accountKey: account.accountKey, subscriptionKey: subscription.subscriptionKey, trialEndsAt: subscription.currentPeriodEnd, status: account.status };
  });
}

export async function listCommercialAccountsForUser(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      accountKey: commercialAccounts.accountKey,
      legalName: commercialAccounts.legalName,
      status: commercialAccounts.status,
      billingEmail: commercialAccounts.billingEmail,
      role: commercialAccountMembers.role,
      createdAt: commercialAccounts.createdAt,
    })
    .from(commercialAccountMembers)
    .innerJoin(commercialAccounts, eq(commercialAccountMembers.accountId, commercialAccounts.id))
    .where(eq(commercialAccountMembers.userId, userId))
    .orderBy(desc(commercialAccounts.createdAt));
  return rows;
}

export async function addCommercialMember(input: { actorId: number; accountKey: string; userId: number; role: CommercialMemberRole }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "lender_admin"]);
  const db = await requireDb();
  const [member] = await db
    .insert(commercialAccountMembers)
    .values({ accountId: membership.accountId, userId: input.userId, role: input.role })
    .onConflictDoUpdate({
      target: [commercialAccountMembers.accountId, commercialAccountMembers.userId],
      set: { role: input.role },
    })
    .returning();
  return member;
}

export async function createCollateralCase(input: {
  actorId: number;
  accountKey: string;
  parcelId: number;
  requestedAmountMinor: number;
  declaredCollateralValueMinor?: number;
  currency?: string;
  mortgageApplicationId?: number;
  borrowerId?: number;
}) {
  if (!Number.isInteger(input.parcelId) || input.parcelId <= 0) throw new Error("A valid parcel is required");
  if (!Number.isInteger(input.requestedAmountMinor) || input.requestedAmountMinor <= 0) throw new Error("Requested amount must be a positive minor-unit integer");
  if (input.declaredCollateralValueMinor !== undefined && (!Number.isInteger(input.declaredCollateralValueMinor) || input.declaredCollateralValueMinor < 0)) {
    throw new Error("Declared collateral value must be a non-negative minor-unit integer");
  }

  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "lender_admin", "lender_analyst"]);
  await requireActiveLenderEntitlement(membership.accountId);
  const db = await requireDb();
  const portfolio = await loadPortfolio(membership.accountId);
  const currency = assertCurrency(input.currency ?? "USD");

  if (input.mortgageApplicationId) {
    const [application] = await db.select().from(mortgageApplications).where(eq(mortgageApplications.id, input.mortgageApplicationId)).limit(1);
    if (!application) throw new Error("Mortgage application was not found");
    if (application.parcelId !== input.parcelId) throw new Error("Mortgage application parcel does not match the collateral parcel");
    if (input.borrowerId && application.applicantId !== input.borrowerId) throw new Error("Mortgage application borrower does not match the collateral borrower");
  }

  const now = new Date();
  const caseKey = key("COL");
  const [caseRow] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(lenderCollateralCases)
      .values({
        caseKey,
        accountId: membership.accountId,
        portfolioId: portfolio.id,
        mortgageApplicationId: input.mortgageApplicationId,
        parcelId: input.parcelId,
        borrowerId: input.borrowerId,
        status: "opened",
        requestedAmountMinor: input.requestedAmountMinor,
        declaredCollateralValueMinor: input.declaredCollateralValueMinor,
        currency,
        createdBy: input.actorId,
        openedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(lenderCollateralEvents).values({
      caseId: created.id,
      eventType: "case_opened",
      nextStatus: "opened",
      actorId: input.actorId,
      description: "Collateral case opened. A human lender reviewer remains responsible for all credit and collateral decisions.",
      metadata: { requestedAmountMinor: input.requestedAmountMinor, currency },
      createdAt: now,
    });
    return [created];
  });

  await recordUsage(membership.accountId, "active_collateral_cases", "collateral_case", caseKey, { parcelId: input.parcelId });
  return caseRow;
}

async function loadCaseForAccount(accountId: number, caseKey: string) {
  const db = await requireDb();
  const [caseRow] = await db
    .select()
    .from(lenderCollateralCases)
    .where(and(eq(lenderCollateralCases.accountId, accountId), eq(lenderCollateralCases.caseKey, caseKey)))
    .limit(1);
  if (!caseRow) throw new Error("Collateral case was not found in this commercial account");
  return caseRow;
}

export async function submitCollateralEvidence(input: {
  actorId: number;
  accountKey: string;
  caseKey: string;
  evidenceType: string;
  sourceReference: string;
  sourceChecksumSha256?: string;
  metadata?: Record<string, unknown>;
}) {
  const evidenceType = input.evidenceType.trim().toLowerCase();
  const sourceReference = input.sourceReference.trim();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(evidenceType)) throw new Error("Evidence type must be a normalized identifier");
  if (!sourceReference || sourceReference.length > 160) throw new Error("A bounded evidence source reference is required");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "lender_admin", "lender_analyst", "reviewer"]);
  await requireActiveLenderEntitlement(membership.accountId);
  const caseRow = await loadCaseForAccount(membership.accountId, input.caseKey);
  if (["approved", "declined", "withdrawn"].includes(caseRow.status)) throw new Error("Evidence cannot be added to a closed collateral case");
  const db = await requireDb();
  const [evidence] = await db
    .insert(lenderCollateralEvidence)
    .values({
      evidenceKey: key("EVD"),
      caseId: caseRow.id,
      evidenceType,
      sourceReference,
      sourceChecksumSha256: assertChecksum(input.sourceChecksumSha256),
      status: "pending",
      submittedBy: input.actorId,
      metadata: input.metadata ?? {},
    })
    .returning();
  await db.insert(lenderCollateralEvents).values({
    caseId: caseRow.id,
    eventType: "evidence_submitted",
    actorId: input.actorId,
    description: `Evidence ${evidence.evidenceKey} was submitted for reviewer verification.`,
    metadata: { evidenceType, sourceReference },
  });
  await recordUsage(membership.accountId, "monthly_evidence_reviews", "collateral_evidence", evidence.evidenceKey, { caseKey: input.caseKey, evidenceType });
  return evidence;
}

export async function reviewCollateralEvidence(input: {
  actorId: number;
  accountKey: string;
  evidenceKey: string;
  status: CollateralEvidenceStatus;
  reviewNotes: string;
}) {
  if (!["accepted", "rejected"].includes(input.status)) throw new Error("Evidence review must be accepted or rejected");
  const reviewNotes = input.reviewNotes.trim();
  if (reviewNotes.length < 8) throw new Error("Evidence review notes must explain the verification decision");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "lender_admin", "reviewer"]);
  const db = await requireDb();
  const [evidence] = await db
    .select({ evidence: lenderCollateralEvidence, caseRow: lenderCollateralCases })
    .from(lenderCollateralEvidence)
    .innerJoin(lenderCollateralCases, eq(lenderCollateralEvidence.caseId, lenderCollateralCases.id))
    .where(and(eq(lenderCollateralEvidence.evidenceKey, input.evidenceKey), eq(lenderCollateralCases.accountId, membership.accountId)))
    .limit(1);
  if (!evidence) throw new Error("Collateral evidence was not found in this commercial account");
  if (evidence.evidence.status !== "pending") throw new Error("Collateral evidence has already been reviewed");
  const now = new Date();
  const [updated] = await db
    .update(lenderCollateralEvidence)
    .set({ status: input.status, reviewNotes, reviewedBy: input.actorId, reviewedAt: now })
    .where(eq(lenderCollateralEvidence.id, evidence.evidence.id))
    .returning();
  await db.insert(lenderCollateralEvents).values({
    caseId: evidence.caseRow.id,
    eventType: "evidence_reviewed",
    actorId: input.actorId,
    description: `Evidence ${updated.evidenceKey} was ${input.status}.`,
    metadata: { evidenceKey: updated.evidenceKey, status: input.status },
  });
  return updated;
}

export async function transitionCollateralCase(input: {
  actorId: number;
  accountKey: string;
  caseKey: string;
  nextStatus: CollateralCaseStatus;
  decisionNotes?: string;
  assignedReviewerId?: number;
}) {
  const proposedNotes = input.decisionNotes?.trim() ?? "";
  const roles: CommercialMemberRole[] = isDecisionStatus(input.nextStatus)
    ? ["owner", "lender_admin", "reviewer"]
    : ["owner", "lender_admin", "lender_analyst", "reviewer"];
  const membership = await requireMembership(input.actorId, input.accountKey, roles);
  await requireActiveLenderEntitlement(membership.accountId);
  const caseRow = await loadCaseForAccount(membership.accountId, input.caseKey);
  const currentStatus = caseRow.status as CollateralCaseStatus;
  if (!CASE_TRANSITIONS[currentStatus].includes(input.nextStatus)) throw new Error(`Collateral case cannot transition from ${currentStatus} to ${input.nextStatus}`);
  if (isDecisionStatus(input.nextStatus) && proposedNotes.length < 16) throw new Error("A human decision rationale of at least 16 characters is required");

  const db = await requireDb();
  if (input.nextStatus === "ready_for_review") {
    const accepted = await db
      .select({ id: lenderCollateralEvidence.id })
      .from(lenderCollateralEvidence)
      .where(and(eq(lenderCollateralEvidence.caseId, caseRow.id), eq(lenderCollateralEvidence.status, "accepted")))
      .limit(1);
    if (!accepted.length) throw new Error("At least one accepted evidence record is required before a case is ready for review");
  }

  const now = new Date();
  const isClosed = ["approved", "declined", "withdrawn"].includes(input.nextStatus);
  const [updated] = await db.transaction(async (tx) => {
    const [next] = await tx
      .update(lenderCollateralCases)
      .set({
        status: input.nextStatus,
        assignedReviewerId: input.assignedReviewerId ?? caseRow.assignedReviewerId,
        decisionNotes: isDecisionStatus(input.nextStatus) ? proposedNotes : caseRow.decisionNotes,
        reviewedAt: isDecisionStatus(input.nextStatus) ? now : caseRow.reviewedAt,
        closedAt: isClosed ? now : null,
        updatedAt: now,
      })
      .where(eq(lenderCollateralCases.id, caseRow.id))
      .returning();
    await tx.insert(lenderCollateralEvents).values({
      caseId: caseRow.id,
      eventType: "status_changed",
      previousStatus: currentStatus,
      nextStatus: input.nextStatus,
      actorId: input.actorId,
      description: isDecisionStatus(input.nextStatus)
        ? `Human reviewer recorded a ${input.nextStatus} decision with rationale.`
        : `Collateral case transitioned from ${currentStatus} to ${input.nextStatus}.`,
      metadata: { assignedReviewerId: next.assignedReviewerId ?? null },
      createdAt: now,
    });
    return [next];
  });
  return updated;
}

export async function getLenderCollateralDashboard(input: { actorId: number; accountKey: string; caseKey?: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "billing_admin", "lender_admin", "lender_analyst", "reviewer"]);
  const db = await requireDb();
  const [account, portfolio, subscriptions, invoices, cases, usage] = await Promise.all([
    loadMembership(input.actorId, input.accountKey),
    loadPortfolio(membership.accountId),
    db
      .select({ subscription: commercialSubscriptions, product: commercialProducts })
      .from(commercialSubscriptions)
      .innerJoin(commercialProducts, eq(commercialSubscriptions.productId, commercialProducts.id))
      .where(eq(commercialSubscriptions.accountId, membership.accountId))
      .orderBy(desc(commercialSubscriptions.currentPeriodEnd)),
    db.select().from(commercialInvoices).where(eq(commercialInvoices.accountId, membership.accountId)).orderBy(desc(commercialInvoices.createdAt)).limit(20),
    db.select().from(lenderCollateralCases).where(eq(lenderCollateralCases.accountId, membership.accountId)).orderBy(desc(lenderCollateralCases.updatedAt)).limit(100),
    db.select().from(commercialUsageEvents).where(eq(commercialUsageEvents.accountId, membership.accountId)).orderBy(desc(commercialUsageEvents.occurredAt)).limit(500),
  ]);

  const selectedCase = input.caseKey ? await loadCaseForAccount(membership.accountId, input.caseKey) : null;
  const evidence = selectedCase
    ? await db.select().from(lenderCollateralEvidence).where(eq(lenderCollateralEvidence.caseId, selectedCase.id)).orderBy(desc(lenderCollateralEvidence.submittedAt))
    : [];
  const events = selectedCase
    ? await db.select().from(lenderCollateralEvents).where(eq(lenderCollateralEvents.caseId, selectedCase.id)).orderBy(desc(lenderCollateralEvents.createdAt))
    : [];
  const usageByMetric = usage.reduce<Record<string, number>>((result, event) => {
    result[event.metricKey] = (result[event.metricKey] ?? 0) + event.quantity;
    return result;
  }, {});

  return {
    account,
    portfolio,
    subscriptions,
    invoices,
    cases,
    usageByMetric,
    selectedCase: selectedCase ? { case: selectedCase, evidence, events } : null,
  };
}

export async function issueCommercialInvoice(input: { actorId: number; accountKey: string; dueDays?: number }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "billing_admin"]);
  const db = await requireDb();
  const [subscription] = await db
    .select({ subscription: commercialSubscriptions, product: commercialProducts })
    .from(commercialSubscriptions)
    .innerJoin(commercialProducts, eq(commercialSubscriptions.productId, commercialProducts.id))
    .where(and(eq(commercialSubscriptions.accountId, membership.accountId), inArray(commercialSubscriptions.status, ["trialing", "active", "past_due"])))
    .orderBy(desc(commercialSubscriptions.currentPeriodEnd))
    .limit(1);
  if (!subscription) throw new Error("No commercial subscription is available to invoice");
  const now = new Date();
  const [existingInvoice] = await db
    .select({ invoiceKey: commercialInvoices.invoiceKey, status: commercialInvoices.status })
    .from(commercialInvoices)
    .where(and(
      eq(commercialInvoices.subscriptionId, subscription.subscription.id),
      gte(commercialInvoices.createdAt, subscription.subscription.currentPeriodStart),
      inArray(commercialInvoices.status, ["draft", "issued", "paid", "overdue"]),
    ))
    .limit(1);
  if (existingInvoice) throw new Error(`An invoice (${existingInvoice.invoiceKey}) already exists for the current subscription period`);
  const dueDays = Math.min(90, Math.max(1, input.dueDays ?? 30));
  const dueAt = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000);
  const [invoice] = await db
    .insert(commercialInvoices)
    .values({
      invoiceKey: key("INV"),
      accountId: membership.accountId,
      subscriptionId: subscription.subscription.id,
      status: "issued",
      currency: subscription.product.currency,
      subtotalMinor: subscription.product.monthlyPriceMinor,
      taxMinor: 0,
      totalMinor: subscription.product.monthlyPriceMinor,
      issuedAt: now,
      dueAt,
      collectionMethod: "manual_reconciliation",
      createdBy: input.actorId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return invoice;
}

async function loadCommercialInvoiceForBilling(accountId: number, invoiceKey: string) {
  const db = await requireDb();
  const [invoice] = await db
    .select()
    .from(commercialInvoices)
    .where(and(eq(commercialInvoices.accountId, accountId), eq(commercialInvoices.invoiceKey, invoiceKey)))
    .limit(1);
  if (!invoice) throw new Error("Commercial invoice was not found in this account");
  return invoice;
}

type CommercialPaymentProvider = "paystack" | "flutterwave";

function configuredCommercialPaymentProvider(): CommercialPaymentProvider {
  const provider = process.env.COMMERCIAL_PAYMENT_PROVIDER?.trim().toLowerCase();
  if (provider === "paystack" || provider === "flutterwave") return provider;
  throw new Error("Commercial checkout is unavailable until COMMERCIAL_PAYMENT_PROVIDER is set to paystack or flutterwave");
}

export async function initializeCommercialInvoicePayment(input: { actorId: number; accountKey: string; invoiceKey: string; callbackUrl: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "billing_admin"]);
  const invoice = await loadCommercialInvoiceForBilling(membership.accountId, input.invoiceKey);
  if (invoice.status !== "issued" && invoice.status !== "overdue") throw new Error("Only issued or overdue invoices can be presented for payment");
  const callbackUrl = input.callbackUrl.trim();
  if (!/^https:\/\//i.test(callbackUrl) || callbackUrl.length > 1000) throw new Error("A trusted HTTPS payment callback URL is required");
  const provider = configuredCommercialPaymentProvider();
  const providerReference = invoice.providerReference || `COMM-${invoice.invoiceKey}`;
  let authorizationUrl: string;
  let confirmedReference: string;
  if (provider === "paystack") {
    if (invoice.currency !== "NGN") throw new Error("Paystack commercial checkout supports NGN invoices only; configure Flutterwave for this invoice currency");
    if (!process.env.PAYSTACK_SECRET_KEY?.trim()) throw new Error("Commercial checkout is unavailable until PAYSTACK_SECRET_KEY is configured");
    const payment = await initializePaystackPayment({ email: membership.billingEmail, amount: invoice.totalMinor / 100, reference: providerReference, callback_url: callbackUrl, metadata: { commercialInvoiceKey: invoice.invoiceKey, commercialAccountKey: membership.accountKey, amountMinor: invoice.totalMinor, currency: invoice.currency } });
    if (!payment.success || !payment.authorization_url) throw new Error("Payment provider did not create a commercial checkout session");
    authorizationUrl = payment.authorization_url;
    confirmedReference = payment.reference;
  } else {
    if (!process.env.FLUTTERWAVE_SECRET_KEY?.trim()) throw new Error("Commercial checkout is unavailable until FLUTTERWAVE_SECRET_KEY is configured");
    const payment = await initializeFlutterwavePayment({ email: membership.billingEmail, tx_ref: providerReference, amount: invoice.totalMinor / 100, currency: invoice.currency, redirect_url: callbackUrl, customer: { email: membership.billingEmail, name: membership.legalName } });
    if (!payment.success || !payment.payment_link) throw new Error("Payment provider did not create a commercial checkout session");
    authorizationUrl = payment.payment_link;
    confirmedReference = payment.tx_ref;
  }
  const db = await requireDb();
  await db.update(commercialInvoices).set({
    providerReference: confirmedReference,
    paymentEvidence: { provider, checkoutInitializedAt: new Date().toISOString(), expectedAmountMinor: invoice.totalMinor, currency: invoice.currency },
    updatedAt: new Date(),
  }).where(eq(commercialInvoices.id, invoice.id));
  return { invoiceKey: invoice.invoiceKey, provider, providerReference: confirmedReference, authorizationUrl };
}

export async function verifyCommercialInvoicePayment(input: { actorId: number; accountKey: string; invoiceKey: string; providerTransactionId?: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "billing_admin"]);
  const invoice = await loadCommercialInvoiceForBilling(membership.accountId, input.invoiceKey);
  if (invoice.status !== "issued" && invoice.status !== "overdue") throw new Error("Only issued or overdue invoices can be verified as paid");
  if (!invoice.providerReference) throw new Error("Start the provider checkout before verifying this invoice");
  const provider = configuredCommercialPaymentProvider();
  const expectedAmount = invoice.totalMinor;
  let verificationStatus: string;
  let providerPaidAt: string | undefined;
  let verifiedAmountMinor: number;
  if (provider === "paystack") {
    if (invoice.currency !== "NGN") throw new Error("Paystack commercial checkout supports NGN invoices only; configure Flutterwave for this invoice currency");
    if (!process.env.PAYSTACK_SECRET_KEY?.trim()) throw new Error("Commercial payment verification is unavailable until PAYSTACK_SECRET_KEY is configured");
    const verification = await verifyPaystackPayment(invoice.providerReference);
    verifiedAmountMinor = Math.round(verification.amount * 100);
    verificationStatus = verification.status;
    providerPaidAt = verification.paid_at;
    if (!verification.success || verifiedAmountMinor !== expectedAmount) throw new Error("Payment provider verification did not confirm the exact commercial invoice amount");
  } else {
    if (!process.env.FLUTTERWAVE_SECRET_KEY?.trim()) throw new Error("Commercial payment verification is unavailable until FLUTTERWAVE_SECRET_KEY is configured");
    const transactionId = input.providerTransactionId?.trim();
    if (!transactionId || transactionId.length > 160) throw new Error("A Flutterwave transaction identifier from the verified provider callback is required");
    const verification = await verifyFlutterwavePayment(transactionId);
    verifiedAmountMinor = Math.round(verification.amount * 100);
    verificationStatus = verification.status;
    if (!verification.success || verification.currency.toUpperCase() !== invoice.currency || verifiedAmountMinor !== expectedAmount) throw new Error("Payment provider verification did not confirm the exact commercial invoice amount and currency");
  }
  const now = new Date();
  if (!invoice.subscriptionId) throw new Error("Commercial invoice is not linked to a subscription");
  const db = await requireDb();
  const [subscription] = await db.select().from(commercialSubscriptions).where(eq(commercialSubscriptions.id, invoice.subscriptionId)).limit(1);
  if (!subscription) throw new Error("Commercial subscription for this invoice was not found");
  const renewalStart = subscription.currentPeriodEnd.getTime() > now.getTime() ? subscription.currentPeriodEnd : now;
  const renewalEnd = periodEnd(renewalStart);
  const [updated] = await db.transaction(async (tx) => {
    const [paidInvoice] = await tx
      .update(commercialInvoices)
      .set({ status: "paid", paidAt: now, paymentEvidence: { provider, providerStatus: verificationStatus, providerPaidAt: providerPaidAt ?? null, verifiedAmountMinor, verifiedAt: now.toISOString() }, updatedAt: now })
      .where(and(eq(commercialInvoices.id, invoice.id), inArray(commercialInvoices.status, ["issued", "overdue"])))
      .returning();
    if (!paidInvoice) throw new Error("Commercial invoice was reconciled concurrently; reload its latest status");
    await tx.update(commercialSubscriptions).set({ status: "active", currentPeriodStart: renewalStart, currentPeriodEnd: renewalEnd, updatedAt: now }).where(eq(commercialSubscriptions.id, subscription.id));
    await tx.update(commercialAccounts).set({ status: "active", updatedAt: now }).where(eq(commercialAccounts.id, membership.accountId));
    return [paidInvoice];
  });
  return updated;
}


export async function openConveyancingMatter(input: {
  actorId: number;
  accountKey: string;
  parcelId: number;
  transactionReference?: string;
  clientId?: number;
}) {
  if (!Number.isInteger(input.parcelId) || input.parcelId <= 0) throw new Error("A valid parcel is required");
  const transactionReference = input.transactionReference?.trim();
  if (transactionReference && transactionReference.length > 96) throw new Error("Transaction reference is too long");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "matter_manager", "legal_reviewer"]);
  await requireActiveConveyancingEntitlement(membership.accountId);
  const db = await requireDb();
  const now = new Date();
  const matterKey = key("MAT");
  const [matter] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(conveyancingMatters)
      .values({
        matterKey,
        accountId: membership.accountId,
        transactionReference: transactionReference || null,
        parcelId: input.parcelId,
        clientId: input.clientId,
        status: "opened",
        createdBy: input.actorId,
        openedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(conveyancingMatterEvents).values({
      matterId: created.id,
      eventType: "matter_opened",
      nextStatus: "opened",
      actorId: input.actorId,
      description: "Conveyancing matter opened. Qualified legal professionals remain responsible for legal advice and title conclusions.",
      metadata: { parcelId: input.parcelId, transactionReference: transactionReference || null },
      createdAt: now,
    });
    return [created];
  });
  await recordUsage(membership.accountId, "active_matters", "conveyancing_matter", matterKey, { parcelId: input.parcelId });
  return matter;
}

async function loadMatterForAccount(accountId: number, matterKey: string) {
  const db = await requireDb();
  const [matter] = await db
    .select()
    .from(conveyancingMatters)
    .where(and(eq(conveyancingMatters.accountId, accountId), eq(conveyancingMatters.matterKey, matterKey)))
    .limit(1);
  if (!matter) throw new Error("Conveyancing matter was not found in this commercial account");
  return matter;
}

export async function submitConveyancingEvidence(input: {
  actorId: number;
  accountKey: string;
  matterKey: string;
  evidenceType: string;
  sourceReference: string;
  sourceChecksumSha256?: string;
  metadata?: Record<string, unknown>;
}) {
  const evidenceType = input.evidenceType.trim().toLowerCase();
  const sourceReference = input.sourceReference.trim();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(evidenceType)) throw new Error("Evidence type must be a normalized identifier");
  if (!sourceReference || sourceReference.length > 160) throw new Error("A bounded evidence source reference is required");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "matter_manager", "legal_reviewer"]);
  await requireActiveConveyancingEntitlement(membership.accountId);
  const matter = await loadMatterForAccount(membership.accountId, input.matterKey);
  if (["completed", "withdrawn"].includes(matter.status)) throw new Error("Evidence cannot be added to a closed conveyancing matter");
  const db = await requireDb();
  const [evidence] = await db
    .insert(conveyancingMatterEvidence)
    .values({
      evidenceKey: key("MTE"),
      matterId: matter.id,
      evidenceType,
      sourceReference,
      sourceChecksumSha256: assertChecksum(input.sourceChecksumSha256),
      status: "pending",
      submittedBy: input.actorId,
      metadata: input.metadata ?? {},
    })
    .returning();
  await db.insert(conveyancingMatterEvents).values({
    matterId: matter.id,
    eventType: "evidence_submitted",
    actorId: input.actorId,
    description: `Matter evidence ${evidence.evidenceKey} was submitted for professional verification.`,
    metadata: { evidenceType, sourceReference },
  });
  await recordUsage(membership.accountId, "monthly_verification_requests", "conveyancing_evidence", evidence.evidenceKey, { matterKey: input.matterKey, evidenceType });
  return evidence;
}

export async function reviewConveyancingEvidence(input: {
  actorId: number;
  accountKey: string;
  evidenceKey: string;
  status: ConveyancingEvidenceStatus;
  reviewNotes: string;
}) {
  if (!["accepted", "rejected"].includes(input.status)) throw new Error("Evidence review must be accepted or rejected");
  const reviewNotes = input.reviewNotes.trim();
  if (reviewNotes.length < 8) throw new Error("Evidence review notes must explain the verification result");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "legal_reviewer"]);
  const db = await requireDb();
  const [row] = await db
    .select({ evidence: conveyancingMatterEvidence, matter: conveyancingMatters })
    .from(conveyancingMatterEvidence)
    .innerJoin(conveyancingMatters, eq(conveyancingMatterEvidence.matterId, conveyancingMatters.id))
    .where(and(eq(conveyancingMatterEvidence.evidenceKey, input.evidenceKey), eq(conveyancingMatters.accountId, membership.accountId)))
    .limit(1);
  if (!row) throw new Error("Conveyancing evidence was not found in this commercial account");
  if (row.evidence.status !== "pending") throw new Error("Conveyancing evidence has already been reviewed");
  const now = new Date();
  const [updated] = await db
    .update(conveyancingMatterEvidence)
    .set({ status: input.status, reviewNotes, reviewedBy: input.actorId, reviewedAt: now })
    .where(eq(conveyancingMatterEvidence.id, row.evidence.id))
    .returning();
  await db.insert(conveyancingMatterEvents).values({
    matterId: row.matter.id,
    eventType: "evidence_reviewed",
    actorId: input.actorId,
    description: `Matter evidence ${updated.evidenceKey} was ${input.status}.`,
    metadata: { evidenceKey: updated.evidenceKey, status: input.status },
  });
  return updated;
}

export async function transitionConveyancingMatter(input: {
  actorId: number;
  accountKey: string;
  matterKey: string;
  nextStatus: ConveyancingMatterStatus;
  notes?: string;
  assignedReviewerId?: number;
}) {
  const notes = input.notes?.trim() ?? "";
  const finalTransition = input.nextStatus === "completed";
  const roles: CommercialMemberRole[] = finalTransition ? ["owner", "legal_reviewer"] : ["owner", "matter_manager", "legal_reviewer"];
  const membership = await requireMembership(input.actorId, input.accountKey, roles);
  await requireActiveConveyancingEntitlement(membership.accountId);
  const matter = await loadMatterForAccount(membership.accountId, input.matterKey);
  const currentStatus = matter.status as ConveyancingMatterStatus;
  if (!MATTER_TRANSITIONS[currentStatus].includes(input.nextStatus)) throw new Error(`Conveyancing matter cannot transition from ${currentStatus} to ${input.nextStatus}`);
  if (finalTransition && notes.length < 16) throw new Error("Completion requires a professional closing note of at least 16 characters");
  const db = await requireDb();
  if (input.nextStatus === "title_review") {
    const accepted = await db
      .select({ id: conveyancingMatterEvidence.id })
      .from(conveyancingMatterEvidence)
      .where(and(eq(conveyancingMatterEvidence.matterId, matter.id), eq(conveyancingMatterEvidence.status, "accepted")))
      .limit(1);
    if (!accepted.length) throw new Error("At least one accepted evidence record is required before title review");
  }
  const now = new Date();
  const [updated] = await db.transaction(async (tx) => {
    const [next] = await tx
      .update(conveyancingMatters)
      .set({
        status: input.nextStatus,
        assignedReviewerId: input.assignedReviewerId ?? matter.assignedReviewerId,
        titleReviewNotes: input.nextStatus === "title_review" && notes ? notes : matter.titleReviewNotes,
        closingNotes: finalTransition ? notes : matter.closingNotes,
        completedAt: finalTransition ? now : null,
        updatedAt: now,
      })
      .where(eq(conveyancingMatters.id, matter.id))
      .returning();
    await tx.insert(conveyancingMatterEvents).values({
      matterId: matter.id,
      eventType: "status_changed",
      previousStatus: currentStatus,
      nextStatus: input.nextStatus,
      actorId: input.actorId,
      description: finalTransition
        ? "Professional user marked the matter completed with closing notes. This record is not an automated legal determination."
        : `Conveyancing matter transitioned from ${currentStatus} to ${input.nextStatus}.`,
      metadata: { assignedReviewerId: next.assignedReviewerId ?? null },
      createdAt: now,
    });
    return [next];
  });
  return updated;
}

export async function getConveyancingWorkspaceDashboard(input: { actorId: number; accountKey: string; matterKey?: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "billing_admin", "matter_manager", "legal_reviewer"]);
  const db = await requireDb();
  const [account, subscriptions, invoices, matters, usage] = await Promise.all([
    loadMembership(input.actorId, input.accountKey),
    db
      .select({ subscription: commercialSubscriptions, product: commercialProducts })
      .from(commercialSubscriptions)
      .innerJoin(commercialProducts, eq(commercialSubscriptions.productId, commercialProducts.id))
      .where(and(eq(commercialSubscriptions.accountId, membership.accountId), eq(commercialProducts.productKey, "conveyancing-workspace")))
      .orderBy(desc(commercialSubscriptions.currentPeriodEnd)),
    db.select().from(commercialInvoices).where(eq(commercialInvoices.accountId, membership.accountId)).orderBy(desc(commercialInvoices.createdAt)).limit(20),
    db.select().from(conveyancingMatters).where(eq(conveyancingMatters.accountId, membership.accountId)).orderBy(desc(conveyancingMatters.updatedAt)).limit(100),
    db.select().from(commercialUsageEvents).where(eq(commercialUsageEvents.accountId, membership.accountId)).orderBy(desc(commercialUsageEvents.occurredAt)).limit(500),
  ]);
  const selectedMatter = input.matterKey ? await loadMatterForAccount(membership.accountId, input.matterKey) : null;
  const evidence = selectedMatter
    ? await db.select().from(conveyancingMatterEvidence).where(eq(conveyancingMatterEvidence.matterId, selectedMatter.id)).orderBy(desc(conveyancingMatterEvidence.submittedAt))
    : [];
  const events = selectedMatter
    ? await db.select().from(conveyancingMatterEvents).where(eq(conveyancingMatterEvents.matterId, selectedMatter.id)).orderBy(desc(conveyancingMatterEvents.createdAt))
    : [];
  const usageByMetric = usage.reduce<Record<string, number>>((result, event) => {
    result[event.metricKey] = (result[event.metricKey] ?? 0) + event.quantity;
    return result;
  }, {});
  return { account, subscriptions, invoices, matters, usageByMetric, selectedMatter: selectedMatter ? { matter: selectedMatter, evidence, events } : null };
}


export async function runCommercialBillingCycle(input?: { graceDays?: number }) {
  const graceDays = input?.graceDays ?? 7;
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 90) throw new Error("Commercial billing grace period must be an integer between 0 and 90 days");
  const db = await requireDb();
  const now = new Date();
  const suspensionCutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
  return db.transaction(async (tx) => {
    const overdueInvoices = await tx
      .select({ id: commercialInvoices.id, accountId: commercialInvoices.accountId, subscriptionId: commercialInvoices.subscriptionId })
      .from(commercialInvoices)
      .where(and(eq(commercialInvoices.status, "issued"), lt(commercialInvoices.dueAt, now)));
    if (overdueInvoices.length) {
      await tx.update(commercialInvoices).set({ status: "overdue", updatedAt: now }).where(inArray(commercialInvoices.id, overdueInvoices.map((invoice) => invoice.id)));
      const overdueAccountIds = [...new Set(overdueInvoices.map((invoice) => invoice.accountId))];
      await tx.update(commercialAccounts).set({ status: "past_due", updatedAt: now }).where(inArray(commercialAccounts.id, overdueAccountIds));
      const subscriptionIds = overdueInvoices.flatMap((invoice) => invoice.subscriptionId === null ? [] : [invoice.subscriptionId]);
      if (subscriptionIds.length) await tx.update(commercialSubscriptions).set({ status: "past_due", updatedAt: now }).where(inArray(commercialSubscriptions.id, subscriptionIds));
    }
    const overdueForSuspension = await tx
      .select({ accountId: commercialInvoices.accountId })
      .from(commercialInvoices)
      .where(and(eq(commercialInvoices.status, "overdue"), lt(commercialInvoices.dueAt, suspensionCutoff)));
    const suspendedAccountIds = [...new Set(overdueForSuspension.map((invoice) => invoice.accountId))];
    if (suspendedAccountIds.length) {
      await tx.update(commercialAccounts).set({ status: "suspended", updatedAt: now }).where(inArray(commercialAccounts.id, suspendedAccountIds));
      await tx.update(commercialSubscriptions).set({ status: "suspended", updatedAt: now }).where(inArray(commercialSubscriptions.accountId, suspendedAccountIds));
    }
    return { processedAt: now.toISOString(), graceDays, invoicesMarkedOverdue: overdueInvoices.length, accountsMarkedPastDue: new Set(overdueInvoices.map((invoice) => invoice.accountId)).size, accountsSuspended: suspendedAccountIds.length };
  });
}

export async function createCommercialFieldAccount(input: {
  actorId: number;
  legalName: string;
  billingEmail: string;
}) {
  const legalName = input.legalName.trim();
  if (legalName.length < 2) throw new Error("Organization name is required");
  const billingEmail = assertEmail(input.billingEmail);
  const db = await requireDb();
  const now = new Date();
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(commercialProducts)
      .where(and(eq(commercialProducts.productKey, "field-survey-operations"), eq(commercialProducts.active, true)))
      .limit(1);
    if (!product) throw new Error("The Field Survey and Parcel Inspection product is unavailable");
    const [account] = await tx
      .insert(commercialAccounts)
      .values({ accountKey: key("FIELD"), legalName, billingEmail, status: "trial", createdBy: input.actorId, createdAt: now, updatedAt: now })
      .returning();
    await tx.insert(commercialAccountMembers).values({ accountId: account.id, userId: input.actorId, role: "owner", createdAt: now });
    const [subscription] = await tx
      .insert(commercialSubscriptions)
      .values({ subscriptionKey: key("SUB"), accountId: account.id, productId: product.id, status: "trialing", startedAt: now, currentPeriodStart: now, currentPeriodEnd: periodEnd(now), createdAt: now, updatedAt: now })
      .returning();
    return { accountKey: account.accountKey, subscriptionKey: subscription.subscriptionKey, trialEndsAt: subscription.currentPeriodEnd, status: account.status };
  });
}

async function loadFieldAssignmentForAccount(accountId: number, assignmentKey: string) {
  const db = await requireDb();
  const [assignment] = await db
    .select()
    .from(fieldSurveyAssignments)
    .where(and(eq(fieldSurveyAssignments.accountId, accountId), eq(fieldSurveyAssignments.assignmentKey, assignmentKey)))
    .limit(1);
  if (!assignment) throw new Error("Field assignment was not found in this commercial account");
  return assignment;
}

function assertInspectorAssignmentAccess(actorId: number, role: CommercialMemberRole, assignedTo: number) {
  if (role === "field_inspector" && assignedTo !== actorId) throw new Error("Field inspectors may only act on assignments explicitly assigned to them");
}

function parseOptionalInstant(value?: string) {
  if (!value) return undefined;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("A valid ISO timestamp is required");
  return instant;
}

function assertCoordinates(latitude?: number, longitude?: number) {
  if ((latitude === undefined) !== (longitude === undefined)) throw new Error("Latitude and longitude must be supplied together");
  if (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) throw new Error("Latitude must be within WGS84 bounds");
  if (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) throw new Error("Longitude must be within WGS84 bounds");
}

export async function createFieldAssignment(input: {
  actorId: number;
  accountKey: string;
  parcelId: number;
  assignedTo: number;
  instructions: string;
  scheduledFor?: string;
  dueAt?: string;
}) {
  if (!Number.isInteger(input.parcelId) || input.parcelId <= 0 || !Number.isInteger(input.assignedTo) || input.assignedTo <= 0) throw new Error("A valid parcel and assigned user are required");
  const instructions = input.instructions.trim();
  if (instructions.length < 8 || instructions.length > 10000) throw new Error("Field instructions must contain between 8 and 10,000 characters");
  const scheduledFor = parseOptionalInstant(input.scheduledFor);
  const dueAt = parseOptionalInstant(input.dueAt);
  if (scheduledFor && dueAt && dueAt.getTime() < scheduledFor.getTime()) throw new Error("Assignment due time must be after scheduled time");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "field_manager"]);
  await requireActiveFieldEntitlement(membership.accountId);
  const db = await requireDb();
  const [assignee] = await db
    .select({ role: commercialAccountMembers.role })
    .from(commercialAccountMembers)
    .where(and(eq(commercialAccountMembers.accountId, membership.accountId), eq(commercialAccountMembers.userId, input.assignedTo)))
    .limit(1);
  if (!assignee || !["owner", "field_manager", "field_inspector"].includes(assignee.role)) throw new Error("The assigned user must be an active field-inspector member of this commercial account");
  const now = new Date();
  const assignmentKey = key("ASN");
  const [assignment] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(fieldSurveyAssignments)
      .values({ assignmentKey, accountId: membership.accountId, parcelId: input.parcelId, assignedTo: input.assignedTo, assignedBy: input.actorId, status: "assigned", instructions, scheduledFor, dueAt, assignedAt: now, createdAt: now, updatedAt: now })
      .returning();
    await tx.insert(fieldSurveyEvents).values({
      assignmentId: created.id,
      eventType: "assignment_created",
      nextStatus: "assigned",
      actorId: input.actorId,
      description: "Field parcel inspection assignment created for an authorized account member.",
      metadata: { parcelId: input.parcelId, assignedTo: input.assignedTo },
      createdAt: now,
    });
    return [created];
  });
  await recordUsage(membership.accountId, "monthly_field_assignments", "field_assignment", assignmentKey, { parcelId: input.parcelId, assignedTo: input.assignedTo });
  return assignment;
}

export async function submitFieldEvidence(input: {
  actorId: number;
  accountKey: string;
  assignmentKey: string;
  evidenceType: string;
  sourceReference: string;
  sourceChecksumSha256?: string;
  capturedAt: string;
  latitude?: number;
  longitude?: number;
  geometry?: Record<string, unknown>;
  qualityFlags?: string[];
  metadata?: Record<string, unknown>;
}) {
  const evidenceType = input.evidenceType.trim().toLowerCase();
  const sourceReference = input.sourceReference.trim();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(evidenceType)) throw new Error("Evidence type must be a normalized identifier");
  if (!sourceReference || sourceReference.length > 160) throw new Error("A bounded evidence source reference is required");
  const capturedAt = parseOptionalInstant(input.capturedAt);
  if (!capturedAt) throw new Error("Evidence capture time is required");
  if (capturedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new Error("Evidence capture time cannot be in the distant future");
  assertCoordinates(input.latitude, input.longitude);
  if (input.geometry && (Array.isArray(input.geometry) || typeof input.geometry.type !== "string")) throw new Error("Geometry must be a GeoJSON-like object with a type");
  const qualityFlags = [...new Set((input.qualityFlags ?? []).map((flag) => flag.trim().toLowerCase()).filter(Boolean))];
  if (qualityFlags.length > 20 || qualityFlags.some((flag) => !/^[a-z][a-z0-9_-]{0,63}$/.test(flag))) throw new Error("Quality flags must be bounded normalized identifiers");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "field_manager", "field_inspector"]);
  await requireActiveFieldEntitlement(membership.accountId);
  const assignment = await loadFieldAssignmentForAccount(membership.accountId, input.assignmentKey);
  assertInspectorAssignmentAccess(input.actorId, membership.role as CommercialMemberRole, assignment.assignedTo);
  if (["accepted", "cancelled"].includes(assignment.status)) throw new Error("Evidence cannot be added to a closed field assignment");
  const db = await requireDb();
  const [evidence] = await db
    .insert(fieldSurveyEvidence)
    .values({
      evidenceKey: key("FSE"),
      assignmentId: assignment.id,
      evidenceType,
      sourceReference,
      sourceChecksumSha256: assertChecksum(input.sourceChecksumSha256),
      capturedAt,
      latitude: input.latitude !== undefined ? String(input.latitude) : null,
      longitude: input.longitude !== undefined ? String(input.longitude) : null,
      geometry: input.geometry ?? null,
      qualityFlags,
      status: "pending",
      submittedBy: input.actorId,
      metadata: input.metadata ?? {},
    })
    .returning();
  await db.insert(fieldSurveyEvents).values({
    assignmentId: assignment.id,
    eventType: "evidence_submitted",
    actorId: input.actorId,
    description: `Field evidence ${evidence.evidenceKey} was submitted for independent review.`,
    metadata: { evidenceType, sourceReference, qualityFlags },
  });
  return evidence;
}

export async function reviewFieldEvidence(input: {
  actorId: number;
  accountKey: string;
  evidenceKey: string;
  status: FieldEvidenceStatus;
  reviewNotes: string;
}) {
  if (!["accepted", "rejected"].includes(input.status)) throw new Error("Field evidence review must be accepted or rejected");
  const reviewNotes = input.reviewNotes.trim();
  if (reviewNotes.length < 8) throw new Error("Field evidence review notes must explain the result");
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "field_manager", "field_reviewer"]);
  const db = await requireDb();
  const [row] = await db
    .select({ evidence: fieldSurveyEvidence, assignment: fieldSurveyAssignments })
    .from(fieldSurveyEvidence)
    .innerJoin(fieldSurveyAssignments, eq(fieldSurveyEvidence.assignmentId, fieldSurveyAssignments.id))
    .where(and(eq(fieldSurveyEvidence.evidenceKey, input.evidenceKey), eq(fieldSurveyAssignments.accountId, membership.accountId)))
    .limit(1);
  if (!row) throw new Error("Field evidence was not found in this commercial account");
  if (row.evidence.status !== "pending") throw new Error("Field evidence has already been reviewed");
  const now = new Date();
  const [updated] = await db
    .update(fieldSurveyEvidence)
    .set({ status: input.status, reviewNotes, reviewedBy: input.actorId, reviewedAt: now })
    .where(eq(fieldSurveyEvidence.id, row.evidence.id))
    .returning();
  await db.insert(fieldSurveyEvents).values({
    assignmentId: row.assignment.id,
    eventType: "evidence_reviewed",
    actorId: input.actorId,
    description: `Field evidence ${updated.evidenceKey} was ${input.status}.`,
    metadata: { evidenceKey: updated.evidenceKey, status: input.status },
  });
  return updated;
}

export async function transitionFieldAssignment(input: {
  actorId: number;
  accountKey: string;
  assignmentKey: string;
  nextStatus: FieldAssignmentStatus;
  reviewNotes?: string;
}) {
  const reviewNotes = input.reviewNotes?.trim() ?? "";
  const reviewerTransition = ["under_review", "accepted", "returned"].includes(input.nextStatus);
  const roles: CommercialMemberRole[] = reviewerTransition ? ["owner", "field_manager", "field_reviewer"] : ["owner", "field_manager", "field_inspector"];
  const membership = await requireMembership(input.actorId, input.accountKey, roles);
  await requireActiveFieldEntitlement(membership.accountId);
  const assignment = await loadFieldAssignmentForAccount(membership.accountId, input.assignmentKey);
  assertInspectorAssignmentAccess(input.actorId, membership.role as CommercialMemberRole, assignment.assignedTo);
  const currentStatus = assignment.status as FieldAssignmentStatus;
  if (!FIELD_ASSIGNMENT_TRANSITIONS[currentStatus].includes(input.nextStatus)) throw new Error(`Field assignment cannot transition from ${currentStatus} to ${input.nextStatus}`);
  if (reviewerTransition && reviewNotes.length < 8) throw new Error("Reviewer transitions require notes of at least 8 characters");
  const db = await requireDb();
  if (input.nextStatus === "under_review" || input.nextStatus === "accepted") {
    const acceptedEvidence = await db
      .select({ id: fieldSurveyEvidence.id })
      .from(fieldSurveyEvidence)
      .where(and(eq(fieldSurveyEvidence.assignmentId, assignment.id), eq(fieldSurveyEvidence.status, "accepted")))
      .limit(1);
    if (!acceptedEvidence.length) throw new Error("At least one accepted evidence record is required before review or acceptance");
  }
  const now = new Date();
  const closed = ["accepted", "cancelled"].includes(input.nextStatus);
  const [updated] = await db.transaction(async (tx) => {
    const [next] = await tx
      .update(fieldSurveyAssignments)
      .set({
        status: input.nextStatus,
        reviewNotes: reviewerTransition ? reviewNotes : assignment.reviewNotes,
        reviewedBy: reviewerTransition ? input.actorId : assignment.reviewedBy,
        submittedAt: input.nextStatus === "submitted" ? now : assignment.submittedAt,
        reviewedAt: reviewerTransition ? now : assignment.reviewedAt,
        closedAt: closed ? now : null,
        updatedAt: now,
      })
      .where(eq(fieldSurveyAssignments.id, assignment.id))
      .returning();
    await tx.insert(fieldSurveyEvents).values({
      assignmentId: assignment.id,
      eventType: "status_changed",
      previousStatus: currentStatus,
      nextStatus: input.nextStatus,
      actorId: input.actorId,
      description: `Field assignment transitioned from ${currentStatus} to ${input.nextStatus}.`,
      metadata: { qualityReviewRequired: reviewerTransition },
      createdAt: now,
    });
    return [next];
  });
  return updated;
}

export async function getFieldSurveyDashboard(input: { actorId: number; accountKey: string; assignmentKey?: string }) {
  const membership = await requireMembership(input.actorId, input.accountKey, ["owner", "billing_admin", "field_manager", "field_inspector", "field_reviewer"]);
  const db = await requireDb();
  const [account, subscriptions, invoices, assignments, usage] = await Promise.all([
    loadMembership(input.actorId, input.accountKey),
    db
      .select({ subscription: commercialSubscriptions, product: commercialProducts })
      .from(commercialSubscriptions)
      .innerJoin(commercialProducts, eq(commercialSubscriptions.productId, commercialProducts.id))
      .where(and(eq(commercialSubscriptions.accountId, membership.accountId), eq(commercialProducts.productKey, "field-survey-operations")))
      .orderBy(desc(commercialSubscriptions.currentPeriodEnd)),
    db.select().from(commercialInvoices).where(eq(commercialInvoices.accountId, membership.accountId)).orderBy(desc(commercialInvoices.createdAt)).limit(20),
    db.select().from(fieldSurveyAssignments).where(eq(fieldSurveyAssignments.accountId, membership.accountId)).orderBy(desc(fieldSurveyAssignments.updatedAt)).limit(100),
    db.select().from(commercialUsageEvents).where(eq(commercialUsageEvents.accountId, membership.accountId)).orderBy(desc(commercialUsageEvents.occurredAt)).limit(500),
  ]);
  const selectedAssignment = input.assignmentKey ? await loadFieldAssignmentForAccount(membership.accountId, input.assignmentKey) : null;
  const evidence = selectedAssignment
    ? await db.select().from(fieldSurveyEvidence).where(eq(fieldSurveyEvidence.assignmentId, selectedAssignment.id)).orderBy(desc(fieldSurveyEvidence.capturedAt))
    : [];
  const events = selectedAssignment
    ? await db.select().from(fieldSurveyEvents).where(eq(fieldSurveyEvents.assignmentId, selectedAssignment.id)).orderBy(desc(fieldSurveyEvents.createdAt))
    : [];
  const usageByMetric = usage.reduce<Record<string, number>>((result, event) => {
    result[event.metricKey] = (result[event.metricKey] ?? 0) + event.quantity;
    return result;
  }, {});
  return { account, subscriptions, invoices, assignments, usageByMetric, selectedAssignment: selectedAssignment ? { assignment: selectedAssignment, evidence, events } : null };
}
