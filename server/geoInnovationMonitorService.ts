import { and, asc, eq, lte } from "drizzle-orm";
import { requireDb } from "./db";
import { geoMonitorSubscriptions } from "../drizzle/schema";
import { attachGeoAnalysisWorkflow, createGeoAnalysisRun, failGeoAnalysisRun, queueGeoAnalysisRun } from "./geoaiEvidenceService";
import { startGeoAiAnalysisWorkflow } from "./temporalClient";

const ISO_INTERVAL = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/;
const MAX_MONITOR_INTERVAL_MS = 365 * 24 * 60 * 60 * 1000;

type GeoMonitorSettings = {
  manifest?: Record<string, unknown>;
  interval?: string;
};

export function parseGeoMonitorInterval(scheduleHint: string, settings: Record<string, unknown>): number | null {
  const candidate = typeof settings.interval === "string" ? settings.interval.trim() : scheduleHint.trim();
  if (candidate === "manual-authorized-trigger") return null;
  const match = ISO_INTERVAL.exec(candidate);
  if (!match) throw new Error("Geo monitor schedule must be manual-authorized-trigger or an ISO-8601 duration such as PT6H");
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const milliseconds = Math.round((hours * 3_600_000) + (minutes * 60_000) + (seconds * 1_000));
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 60_000 || milliseconds > MAX_MONITOR_INTERVAL_MS) {
    throw new Error("Geo monitor interval must be between one minute and one year");
  }
  return milliseconds;
}

function monitorManifest(subscription: {
  id: number;
  parcelId: number | null;
  innovationType: string;
  settings: unknown;
}): Record<string, unknown> {
  if (!subscription.settings || typeof subscription.settings !== "object" || Array.isArray(subscription.settings)) {
    throw new Error("Geo monitor settings must be an object containing a manifest");
  }
  const settings = subscription.settings as GeoMonitorSettings;
  if (!settings.manifest || typeof settings.manifest !== "object" || Array.isArray(settings.manifest)) {
    throw new Error("Geo monitor requires a complete evidence-bearing manifest in settings.manifest");
  }
  const manifest = { ...settings.manifest } as Record<string, unknown>;
  if (manifest.analysisType !== subscription.innovationType) {
    throw new Error("Geo monitor manifest analysisType must match its innovation type");
  }
  if (!Array.isArray(manifest.sourceAssets) || manifest.sourceAssets.length === 0) {
    throw new Error("Geo monitor manifest requires registered immutable sourceAssets");
  }
  if (subscription.parcelId && manifest.parcelId === undefined) manifest.parcelId = subscription.parcelId;
  if (manifest.parcelId !== undefined && Number(manifest.parcelId) !== subscription.parcelId && subscription.parcelId !== null) {
    throw new Error("Geo monitor manifest parcelId must match the monitor parcel");
  }
  const methodParameters = manifest.methodParameters && typeof manifest.methodParameters === "object" && !Array.isArray(manifest.methodParameters)
    ? { ...(manifest.methodParameters as Record<string, unknown>) }
    : {};
  methodParameters.monitorSubscriptionId = subscription.id;
  manifest.methodParameters = methodParameters;
  return manifest;
}

export async function initializeGeoMonitorSchedule(input: {
  scheduleHint: string;
  settings: Record<string, unknown>;
  requestedNextEvaluationAt?: Date;
}): Promise<Date | undefined> {
  const interval = parseGeoMonitorInterval(input.scheduleHint, input.settings);
  if (!interval) return input.requestedNextEvaluationAt;
  const minimum = new Date(Date.now() + interval);
  if (!input.requestedNextEvaluationAt || input.requestedNextEvaluationAt.getTime() < minimum.getTime()) return minimum;
  return input.requestedNextEvaluationAt;
}

export type GeoMonitorExecutionResult = {
  subscriptionId: number;
  subscriptionKey: string;
  runId?: number;
  workflowId?: string;
  skipped?: string;
  failure?: string;
};

/**
 * Claims and schedules due monitors. This function never performs imagery,
 * routing, or model work itself: it only creates a policy-validated GeoAI run
 * and hands execution to the dedicated Temporal worker. It is safe to invoke
 * repeatedly; a conditional next-evaluation update acts as the claim.
 */
export async function evaluateDueGeoInnovationMonitors(input: {
  now?: Date;
  limit?: number;
} = {}): Promise<GeoMonitorExecutionResult[]> {
  const db = await requireDb();
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const due = await db.select().from(geoMonitorSubscriptions)
    .where(and(eq(geoMonitorSubscriptions.status, "active"), lte(geoMonitorSubscriptions.nextEvaluationAt, now)))
    .orderBy(asc(geoMonitorSubscriptions.nextEvaluationAt))
    .limit(limit);
  const results: GeoMonitorExecutionResult[] = [];

  for (const subscription of due) {
    const base = { subscriptionId: subscription.id, subscriptionKey: subscription.subscriptionKey };
    try {
      if (!subscription.settings || typeof subscription.settings !== "object" || Array.isArray(subscription.settings)) throw new Error("Geo monitor settings are invalid");
      const settings = subscription.settings as Record<string, unknown>;
      const interval = parseGeoMonitorInterval(subscription.scheduleHint, settings);
      if (!interval) {
        results.push({ ...base, skipped: "manual_authorized_trigger" });
        continue;
      }
      const nextEvaluationAt = new Date(now.getTime() + interval);
      const [claim] = await db.update(geoMonitorSubscriptions).set({
        nextEvaluationAt,
        updatedAt: now,
      }).where(and(
        eq(geoMonitorSubscriptions.id, subscription.id),
        eq(geoMonitorSubscriptions.status, "active"),
        lte(geoMonitorSubscriptions.nextEvaluationAt, now),
      )).returning();
      if (!claim) {
        results.push({ ...base, skipped: "claimed_by_another_scheduler" });
        continue;
      }

      const manifest = monitorManifest(subscription);
      const created = await createGeoAnalysisRun({ manifest: manifest as any, requestedBy: subscription.requestedBy });
      await queueGeoAnalysisRun(created.run.id);
      try {
        const workflow = await startGeoAiAnalysisWorkflow({ runId: created.run.id });
        await attachGeoAnalysisWorkflow(created.run.id, workflow.workflowId);
        await db.update(geoMonitorSubscriptions).set({
          lastRunId: created.run.id,
          lastEvaluatedAt: now,
          updatedAt: now,
        }).where(eq(geoMonitorSubscriptions.id, subscription.id));
        results.push({ ...base, runId: created.run.id, workflowId: workflow.workflowId });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to start GeoAI monitor workflow";
        await failGeoAnalysisRun(created.run.id, message).catch(() => undefined);
        throw new Error(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to evaluate monitor";
      // A malformed monitor stays visible for correction and is not silently disabled.
      results.push({ ...base, failure: message });
    }
  }
  return results;
}
