import { Context } from "@temporalio/activity";
import { executeGeoAnalysisRun } from "../../server/geoaiExecutionService";

export interface ExecuteGeoAiAnalysisParams {
  runId: number;
}

export interface ExecuteGeoAiAnalysisResult {
  runId: number;
  status: string;
  evidenceStatus: string;
}

export async function executeGeoAiAnalysis(params: ExecuteGeoAiAnalysisParams): Promise<ExecuteGeoAiAnalysisResult> {
  if (!Number.isSafeInteger(params.runId) || params.runId <= 0) {
    throw new Error("GeoAI Temporal activity requires a positive analysis run ID");
  }
  Context.current().log.info("Executing GeoAI analysis run", { runId: params.runId });
  const result = await executeGeoAnalysisRun(params.runId);
  return {
    runId: result.id,
    status: result.status,
    evidenceStatus: result.evidenceStatus,
  };
}


export interface EvaluateGeoInnovationMonitorsParams {
  limit?: number;
}

export interface EvaluateGeoInnovationMonitorsResult {
  evaluated: number;
  scheduled: number;
  failed: number;
}

export async function evaluateGeoInnovationMonitors(params: EvaluateGeoInnovationMonitorsParams = {}): Promise<EvaluateGeoInnovationMonitorsResult> {
  const { evaluateDueGeoInnovationMonitors } = await import("../../server/geoInnovationMonitorService");
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  Context.current().log.info("Evaluating due GeoAI innovation monitors", { limit });
  const results = await evaluateDueGeoInnovationMonitors({ limit });
  return {
    evaluated: results.length,
    scheduled: results.filter((result) => result.runId !== undefined).length,
    failed: results.filter((result) => result.failure !== undefined).length,
  };
}
