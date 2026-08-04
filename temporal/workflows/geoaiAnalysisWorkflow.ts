import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/geoai";

const { executeGeoAiAnalysis } = proxyActivities<typeof activities>({
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
