import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../commercialBillingActivities";

const { reconcileCommercialBilling } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 seconds",
  retry: { initialInterval: "30 seconds", maximumInterval: "10 minutes", maximumAttempts: 5 },
});

export interface CommercialBillingWorkflowInput {
  intervalSeconds: number;
}

export async function commercialBillingWorkflow(input: CommercialBillingWorkflowInput): Promise<void> {
  if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 3600 || input.intervalSeconds > 86_400) {
    throw new Error("Commercial billing interval must be between one hour and one day");
  }
  while (true) {
    await reconcileCommercialBilling();
    await sleep(`${input.intervalSeconds} seconds`);
  }
}
