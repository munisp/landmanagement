import {
  condition,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type * as activities from "../stakeholderJourneyActivities";

export interface StakeholderJourneyWorkflowInput {
  runKey: string;
}

export interface StakeholderJourneyWorkflowState {
  runKey: string;
  phase: "starting" | "running" | "awaiting_intervention" | "completed" | "blocked" | "cancelled";
  currentStepKey?: string;
  interventionKey?: string;
  reason?: string;
}

export const journeyInterventionSignal = defineSignal<[{ interventionKey: string }]>("journeyIntervention");
export const journeyCancellationSignal = defineSignal("journeyCancellation");
export const getStakeholderJourneyStateQuery = defineQuery<StakeholderJourneyWorkflowState>("getStakeholderJourneyState");

const { prepareJourneyRun, executeJourneyStep } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { initialInterval: "2 seconds", backoffCoefficient: 2, maximumInterval: "30 seconds", maximumAttempts: 4 },
});

/**
 * One generic workflow executes all configured stakeholder journey templates.
 * Domain differences are resolved by the persisted template and activity
 * adapters; this workflow deliberately contains no land, payment, or policy
 * decision logic.
 */
export async function stakeholderJourneyWorkflow(input: StakeholderJourneyWorkflowInput): Promise<StakeholderJourneyWorkflowState> {
  let state: StakeholderJourneyWorkflowState = { runKey: input.runKey, phase: "starting" };
  let receivedInterventionKey: string | undefined;
  let cancellationRequested = false;

  setHandler(getStakeholderJourneyStateQuery, () => state);
  setHandler(journeyInterventionSignal, ({ interventionKey }) => {
    receivedInterventionKey = interventionKey;
  });
  setHandler(journeyCancellationSignal, () => {
    cancellationRequested = true;
  });

  const prepared = await prepareJourneyRun(input.runKey);
  if (prepared.status === "completed") return { ...state, phase: "completed" };
  if (prepared.status === "cancelled") return { ...state, phase: "cancelled" };
  if (prepared.status === "failed") return { ...state, phase: "blocked", reason: "The persisted journey is failed and requires operator recovery." };

  state = { ...state, phase: "running" };
  for (;;) {
    if (cancellationRequested) return { ...state, phase: "cancelled", reason: "Journey was cancelled by an authorized actor." };
    const result = await executeJourneyStep(input.runKey);
    if (result.outcome === "continue") {
      state = { ...state, phase: "running", currentStepKey: result.stepKey, interventionKey: undefined, reason: undefined };
      continue;
    }
    if (result.outcome === "completed") return { ...state, phase: "completed", currentStepKey: result.stepKey, interventionKey: undefined, reason: undefined };
    if (result.outcome === "cancelled") return { ...state, phase: "cancelled", currentStepKey: result.stepKey, interventionKey: undefined, reason: result.reason };
    if (result.outcome === "blocked") return { ...state, phase: "blocked", currentStepKey: result.stepKey, interventionKey: undefined, reason: result.reason };

    state = {
      ...state,
      phase: "awaiting_intervention",
      currentStepKey: result.stepKey,
      interventionKey: result.interventionKey,
      reason: result.reason,
    };
    const expectedKey = result.interventionKey;
    await condition(() => receivedInterventionKey === expectedKey || cancellationRequested, "30 days");
    if (cancellationRequested) return { ...state, phase: "cancelled", reason: "Journey was cancelled by an authorized actor." };
    if (receivedInterventionKey !== expectedKey) {
      return { ...state, phase: "blocked", reason: "The authorized intervention expired before resolution." };
    }
    receivedInterventionKey = undefined;
    state = { ...state, phase: "running", interventionKey: undefined, reason: undefined };
  }
}
