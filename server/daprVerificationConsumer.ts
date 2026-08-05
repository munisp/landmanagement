import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { daprInboxDeliveries } from "../drizzle/schema";
import { requireDb } from "./db";
import { startOnboardingActivationWorkflow } from "./temporalClient";

type VerificationCloudEvent = { id: string; type: "verification.received.v1" | "verification.reviewed.v1"; topic?: string; data: { onboardingId: number } };

function parseCloudEvent(value: unknown): VerificationCloudEvent {
  if (!value || typeof value !== "object") throw new Error("Dapr event is invalid");
  const event = value as Record<string, unknown>;
  const id = typeof event.id === "string" ? event.id.trim() : "";
  const type = event.type;
  const data = event.data;
  if (!id || id.length > 255) throw new Error("Dapr event id is invalid");
  if (type !== "verification.received.v1" && type !== "verification.reviewed.v1") throw new Error("Dapr event type is not subscribed");
  if (!data || typeof data !== "object" || !Number.isInteger(Number((data as Record<string, unknown>).onboardingId)) || Number((data as Record<string, unknown>).onboardingId) < 1) {
    throw new Error("Dapr event onboardingId is invalid");
  }
  return { id, type, topic: typeof event.topic === "string" ? event.topic : undefined, data: { onboardingId: Number((data as Record<string, unknown>).onboardingId) } };
}

export async function consumeVerificationCloudEvent(eventBody: unknown, topic: string) {
  const event = parseCloudEvent(eventBody);
  const db = await requireDb();
  const payloadSha256 = createHash("sha256").update(JSON.stringify(eventBody)).digest("hex");
  const [existing] = await db.select().from(daprInboxDeliveries).where(eq(daprInboxDeliveries.cloudEventId, event.id)).limit(1);
  if (existing?.status === "processed") return { duplicate: true, workflowId: existing.workflowId };
  if (!existing) {
    await db.insert(daprInboxDeliveries).values({ cloudEventId: event.id, topic, eventType: event.type, payloadSha256, status: "received" });
  }
  try {
    const workflow = await startOnboardingActivationWorkflow({ onboardingId: event.data.onboardingId, eventId: event.id });
    await db.update(daprInboxDeliveries).set({ status: "processed", workflowId: workflow.workflowId, processedAt: new Date(), errorMessage: null, updatedAt: new Date() }).where(eq(daprInboxDeliveries.cloudEventId, event.id));
    return { duplicate: false, workflowId: workflow.workflowId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Temporal activation workflow could not start";
    await db.update(daprInboxDeliveries).set({ status: "failed", errorMessage: message.slice(0, 2_000), updatedAt: new Date() }).where(eq(daprInboxDeliveries.cloudEventId, event.id));
    throw error;
  }
}
