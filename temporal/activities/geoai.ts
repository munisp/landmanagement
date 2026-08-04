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
