import { createHash, createHmac, timingSafeEqual } from "crypto";
import { desc, eq } from "drizzle-orm";
import { eventOutbox, onboardingVerificationEvidence, stakeholderOnboarding, verificationProviderEvents } from "../drizzle/schema";
import { requireDb } from "./db";

export type VerificationWebhookInput = {
  eventId: string;
  eventType: "identity.nin.verified" | "identity.bvn.verified" | "identity.rejected" | "document.analyzed";
  userId: number;
  provider: string;
  externalReference: string;
  outcome: "verified" | "rejected" | "requires_review";
  occurredAt: string;
  evidence: Record<string, unknown>;
};

function config(): { secret: Buffer } {
  const secret = process.env.VERIFICATION_WEBHOOK_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("VERIFICATION_WEBHOOK_SECRET must contain at least 32 characters");
  return { secret: Buffer.from(secret, "utf8") };
}

function parseSignature(value: string | undefined): Buffer {
  if (!value) throw new Error("Verification signature is required");
  const token = value.startsWith("sha256=") ? value.slice("sha256=".length) : value;
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Verification signature must be a SHA-256 hexadecimal digest");
  return Buffer.from(token, "hex");
}

function verifySignature(rawBody: Buffer, signature: string | undefined): void {
  const expected = createHmac("sha256", config().secret).update(rawBody).digest();
  const received = parseSignature(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Verification signature is invalid");
}

function parsePayload(rawBody: Buffer): VerificationWebhookInput {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody.toString("utf8")); } catch { throw new Error("Verification callback body must contain JSON"); }
  if (!parsed || typeof parsed !== "object") throw new Error("Verification callback body is invalid");
  const value = parsed as Record<string, unknown>;
  const eventId = typeof value.eventId === "string" ? value.eventId.trim() : "";
  const provider = typeof value.provider === "string" ? value.provider.trim() : "";
  const externalReference = typeof value.externalReference === "string" ? value.externalReference.trim() : "";
  const eventType = value.eventType;
  const outcome = value.outcome;
  const userId = Number(value.userId);
  const occurredAt = typeof value.occurredAt === "string" ? value.occurredAt : "";
  if (!eventId || eventId.length > 255 || !provider || provider.length > 120 || !externalReference || externalReference.length > 255) throw new Error("Verification callback identifiers are invalid");
  if (!Number.isInteger(userId) || userId < 1) throw new Error("Verification callback userId is invalid");
  if (!["identity.nin.verified", "identity.bvn.verified", "identity.rejected", "document.analyzed"].includes(String(eventType))) throw new Error("Verification callback eventType is not allowed");
  if (!["verified", "rejected", "requires_review"].includes(String(outcome))) throw new Error("Verification callback outcome is not allowed");
  const occurred = new Date(occurredAt);
  if (Number.isNaN(occurred.getTime()) || occurred.getTime() > Date.now() + 5 * 60_000 || occurred.getTime() < Date.now() - 366 * 24 * 60 * 60_000) throw new Error("Verification callback occurredAt is invalid");
  if (!value.evidence || typeof value.evidence !== "object" || Array.isArray(value.evidence)) throw new Error("Verification callback evidence is required");
  return { eventId, eventType: eventType as VerificationWebhookInput["eventType"], userId, provider, externalReference, outcome: outcome as VerificationWebhookInput["outcome"], occurredAt: occurred.toISOString(), evidence: value.evidence as Record<string, unknown> };
}

export async function processVerificationWebhook(rawBody: Buffer, signature: string | undefined) {
  verifySignature(rawBody, signature);
  const payload = parsePayload(rawBody);
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const evidenceSha256 = createHash("sha256").update(JSON.stringify(payload.evidence)).digest("hex");
  const kind = payload.eventType.startsWith("identity.") ? "identity" : "document";
  // A provider can reject a document, but only a designated reviewer can approve it for onboarding activation.
  const normalizedOutcome = kind === "document" && payload.outcome === "verified" ? "requires_review" : payload.outcome;
  const db = await requireDb();

  return db.transaction(async (tx) => {
    const delivered = await tx.insert(verificationProviderEvents).values({
      providerEventId: payload.eventId,
      provider: payload.provider,
      eventType: payload.eventType,
      payloadSha256,
    }).onConflictDoNothing({ target: verificationProviderEvents.providerEventId }).returning();
    if (!delivered[0]) return { accepted: true, duplicate: true, state: "already_processed" as const };

    const [onboarding] = await tx.select().from(stakeholderOnboarding).where(eq(stakeholderOnboarding.userId, payload.userId)).orderBy(desc(stakeholderOnboarding.createdAt)).limit(1);
    if (!onboarding) throw new Error("No onboarding record exists for the verification callback user");

    await tx.insert(onboardingVerificationEvidence).values({
      onboardingId: onboarding.id,
      kind,
      provider: payload.provider,
      externalReference: payload.externalReference,
      providerEventId: payload.eventId,
      outcome: normalizedOutcome,
      evidenceSha256,
      occurredAt: new Date(payload.occurredAt),
    });

    if (kind === "identity" && payload.outcome === "verified") {
      const identityUpdate = payload.eventType === "identity.bvn.verified" ? { bvnVerified: true } : { ninVerified: true };
      await tx.update(stakeholderOnboarding).set({ ...identityUpdate, updatedAt: new Date() }).where(eq(stakeholderOnboarding.id, onboarding.id));
    }

    await tx.update(verificationProviderEvents).set({ processedAt: new Date() }).where(eq(verificationProviderEvents.providerEventId, payload.eventId));
    await tx.insert(eventOutbox).values({
      backend: "dapr_pubsub",
      topic: "verification-received",
      eventType: "verification.received.v1",
      aggregateType: "stakeholder_onboarding",
      aggregateId: String(onboarding.id),
      partitionKey: String(onboarding.userId),
      payload: { onboardingId: onboarding.id, userId: onboarding.userId, kind, outcome: normalizedOutcome, provider: payload.provider, externalReference: payload.externalReference },
      headers: { "ce-type": "verification.received.v1", "content-type": "application/json" },
      deliveryStatus: "pending",
      availableAt: new Date(),
    });
    return { accepted: true, duplicate: false, state: normalizedOutcome };
  });
}

export async function reviewOnboardingDocumentEvidence(params: { evidenceId: number; reviewerId: number; outcome: "verified" | "rejected"; notes: string }) {
  if (!params.notes.trim()) throw new Error("Reviewer notes are required");
  const db = await requireDb();
  return db.transaction(async (tx) => {
    const [evidence] = await tx.select().from(onboardingVerificationEvidence).where(eq(onboardingVerificationEvidence.id, params.evidenceId)).limit(1);
    if (!evidence || evidence.kind !== "document") throw new Error("Document verification evidence was not found");
    if (evidence.outcome !== "requires_review") throw new Error("Only document evidence awaiting review can be decided");
    await tx.update(onboardingVerificationEvidence).set({ outcome: params.outcome, reviewedBy: params.reviewerId, reviewNotes: params.notes.trim(), updatedAt: new Date() }).where(eq(onboardingVerificationEvidence.id, evidence.id));
    if (params.outcome === "verified") await tx.update(stakeholderOnboarding).set({ documentsVerified: true, updatedAt: new Date() }).where(eq(stakeholderOnboarding.id, evidence.onboardingId));
    await tx.insert(eventOutbox).values({
      backend: "dapr_pubsub",
      topic: "verification-reviewed",
      eventType: "verification.reviewed.v1",
      aggregateType: "stakeholder_onboarding",
      aggregateId: String(evidence.onboardingId),
      partitionKey: String(evidence.onboardingId),
      payload: { onboardingId: evidence.onboardingId, evidenceId: evidence.id, outcome: params.outcome, reviewerId: params.reviewerId },
      headers: { "ce-type": "verification.reviewed.v1", "content-type": "application/json" },
      deliveryStatus: "pending",
      availableAt: new Date(),
    });
    return { success: true, onboardingId: evidence.onboardingId, outcome: params.outcome };
  });
}

export async function listOnboardingVerificationEvidence(onboardingId: number) {
  const db = await requireDb();
  return db.select().from(onboardingVerificationEvidence).where(eq(onboardingVerificationEvidence.onboardingId, onboardingId)).orderBy(desc(onboardingVerificationEvidence.createdAt));
}
