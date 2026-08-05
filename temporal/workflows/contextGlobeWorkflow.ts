import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../contextGlobeActivities";

const { reconcileContextGlobe } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 seconds",
  retry: { initialInterval: "5 seconds", maximumInterval: "60 seconds", maximumAttempts: 3 },
});

export interface ContextGlobeReconciliationInput {
  pollIntervalSeconds: number;
}

export async function contextGlobeReconciliationWorkflow(input: ContextGlobeReconciliationInput): Promise<void> {
  if (!Number.isInteger(input.pollIntervalSeconds) || input.pollIntervalSeconds < 60 || input.pollIntervalSeconds > 3600) {
    throw new Error("Context Globe reconciliation poll interval must be between 60 and 3600 seconds");
  }
  while (true) {
    await reconcileContextGlobe();
    await sleep(`${input.pollIntervalSeconds} seconds`);
  }
}
