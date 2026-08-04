import { eq } from "drizzle-orm";
import { adminNotifications, notificationPreferences } from "../drizzle/schema";
import { requireDb } from "./db";
import { queueEvent } from "./eventBus";

type GeoAiMobileRun = {
  id: number;
  runKey: string;
  title: string;
  status: string;
  evidenceStatus: string;
  requestedBy: number | null;
  failureReason?: string | null;
};

type GeoAiMobileEvent = "created" | "queued" | "running" | "awaiting_review" | "failed" | "reviewed";

type NotificationContent = {
  type: "verification_request" | "verification_approved" | "verification_rejected" | "system_error";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
};

function contentFor(run: GeoAiMobileRun, event: GeoAiMobileEvent): NotificationContent {
  switch (event) {
    case "created":
      return { type: "verification_request", priority: "low", title: "GeoAI evidence run created", message: `${run.title} has been created with its required evidence gates.` };
    case "queued":
      return { type: "verification_request", priority: "medium", title: "GeoAI analysis queued", message: `${run.title} is queued for durable analysis.` };
    case "running":
      return { type: "verification_request", priority: "medium", title: "GeoAI analysis running", message: `${run.title} is being processed by the configured evidence workflow.` };
    case "awaiting_review":
      return { type: "verification_request", priority: "high", title: "GeoAI evidence review required", message: `${run.title} completed processing and requires an authorized evidence review.` };
    case "reviewed":
      return run.evidenceStatus === "verified"
        ? { type: "verification_approved", priority: "high", title: "GeoAI evidence verified", message: `${run.title} passed the required evidence review.` }
        : { type: "verification_rejected", priority: "high", title: "GeoAI evidence rejected", message: `${run.title} was rejected during evidence review.` };
    case "failed":
      return { type: "system_error", priority: "high", title: "GeoAI analysis failed", message: run.failureReason ? `${run.title}: ${run.failureReason}` : `${run.title} failed before evidence review.` };
  }
}

function isExpoPushToken(value: string): boolean {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value);
}

async function deliverExpoPush(input: {
  token: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: "default" | "high";
}) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.token,
      sound: "default",
      title: input.title,
      body: input.body,
      priority: input.priority,
      data: input.data,
    }),
  });
  if (!response.ok) {
    throw new Error(`Expo push delivery failed with ${response.status}: ${await response.text()}`);
  }
}

/**
 * Writes the authoritative in-app alert first. Expo delivery is an additional
 * device channel; a transient mobile push failure never invalidates a completed
 * GeoAI state transition or removes the durable inbox notification.
 */
export async function publishGeoAiMobileNotification(run: GeoAiMobileRun, event: GeoAiMobileEvent): Promise<void> {
  // Older records can predate accountable-requester enforcement. Never invent a
  // recipient; current protected mobile flows always bind the initiating user.
  if (run.requestedBy === null) return;
  const content = contentFor(run, event);
  const db = await requireDb();
  const metadata = {
    domain: "geoai",
    event,
    runId: run.id,
    runKey: run.runKey,
    evidenceStatus: run.evidenceStatus,
    route: `/geoai/${run.id}`,
  };

  await db.insert(adminNotifications).values({
    recipientId: run.requestedBy,
    type: content.type,
    priority: content.priority,
    title: content.title,
    message: content.message,
    metadata,
  });

  const [preferences] = await db
    .select({ pushEnabled: notificationPreferences.pushEnabled, pushToken: notificationPreferences.pushToken })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, run.requestedBy))
    .limit(1);

  if (!preferences?.pushEnabled || !preferences.pushToken || !isExpoPushToken(preferences.pushToken)) return;

  try {
    await deliverExpoPush({
      token: preferences.pushToken,
      title: content.title,
      body: content.message,
      data: metadata,
      priority: content.priority === "high" || content.priority === "critical" ? "high" : "default",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Expo push delivery failure";
    await queueEvent({
      backend: "dapr_pubsub",
      topic: "geoai-mobile-notification-failed",
      eventType: "geoai.mobile_notification.failed.v1",
      aggregateType: "geo_analysis",
      aggregateId: String(run.id),
      partitionKey: String(run.requestedBy),
      payload: { ...metadata, error: message },
      deliveryStatus: "pending",
      availableAt: new Date(),
    }).catch(() => undefined);
  }
}
