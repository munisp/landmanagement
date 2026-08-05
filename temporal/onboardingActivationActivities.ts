import { reconcileStakeholderActivation } from "../server/stakeholderOnboardingService";

export async function reconcileOnboardingActivation(input: { onboardingId: number }) {
  if (!Number.isInteger(input.onboardingId) || input.onboardingId < 1) throw new Error("onboardingId must be a positive integer");
  return reconcileStakeholderActivation(input.onboardingId);
}
