import { proxyActivities } from "@temporalio/workflow";

export type OnboardingActivationWorkflowInput = {
  onboardingId: number;
  eventId: string;
};

const { reconcileOnboardingActivation } = proxyActivities<{
  reconcileOnboardingActivation(input: { onboardingId: number }): Promise<{ activated: boolean; reason?: string }>;
}>({ startToCloseTimeout: "30 seconds", retry: { maximumAttempts: 5, initialInterval: "1 second", maximumInterval: "30 seconds" } });

/** One verification event produces one idempotent reconciliation attempt. Subsequent provider events start their own workflow. */
export async function onboardingActivationWorkflow(input: OnboardingActivationWorkflowInput) {
  if (!Number.isInteger(input.onboardingId) || input.onboardingId < 1 || !input.eventId.trim()) throw new Error("Invalid onboarding activation workflow input");
  return reconcileOnboardingActivation({ onboardingId: input.onboardingId });
}
