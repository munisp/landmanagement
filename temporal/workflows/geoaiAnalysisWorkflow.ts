import { continueAsNew, proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../activities/geoai";

const { executeGeoAiAnalysis, evaluateGeoInnovationMonitors } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "60 seconds",
  retry: { maximumAttempts: 3, initialInterval: "10 seconds", maximumInterval: "5 minutes", backoffCoefficient: 2 },
});

export interface GeoAiAnalysisWorkflowInput {
  runId: number;
}

export interface GeoAiAnalysisWorkflowResult {
  runId: number;
  status: string;
  evidenceStatus: string;
}

/**
 * Durable orchestration boundary for all evidence-gated GeoAI operations.
 * Human review is deliberately not performed inside this workflow: completed
 * work becomes provisional or insufficient-evidence and the platform review
 * endpoint records the independent verified/rejected decision.
 */
export async function geoAiAnalysisWorkflow(input: GeoAiAnalysisWorkflowInput): Promise<GeoAiAnalysisWorkflowResult> {
  if (!Number.isSafeInteger(input.runId) || input.runId <= 0) {
    throw new Error("GeoAI workflow requires a positive run ID");
  }
  return executeGeoAiAnalysis({ runId: input.runId });
}

export interface GeoInnovationMonitorWorkflowInput {
  pollIntervalSeconds: number;
  monitorLimit?: number;
  cycle?: number;
}

/**
 * A durable scheduler for subscriptions that have an explicit persisted ISO
 * interval. Individual monitor configuration is validated by the activity;
 * this workflow supplies only a bounded polling cadence and continues-as-new
 * periodically to keep Temporal history compact.
 */
export async function geoInnovationMonitorWorkflow(input: GeoInnovationMonitorWorkflowInput): Promise<void> {
  if (!Number.isInteger(input.pollIntervalSeconds) || input.pollIntervalSeconds < 60 || input.pollIntervalSeconds > 86_400) {
    throw new Error("Geo innovation monitor workflow pollIntervalSeconds must be between 60 and 86400");
  }
  const cycle = input.cycle ?? 0;
  await evaluateGeoInnovationMonitors({ limit: input.monitorLimit ?? 25 });
  await sleep(`${input.pollIntervalSeconds}s`);
  // Limit history while retaining a stable workflow ID and durable cadence.
  if (cycle >= 499) {
    await continueAsNew<typeof geoInnovationMonitorWorkflow>({ ...input, cycle: 0 });
    return;
  }
  await geoInnovationMonitorWorkflow({ ...input, cycle: cycle + 1 });
}
