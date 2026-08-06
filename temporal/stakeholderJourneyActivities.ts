import {
  executeJourneyStep as executePersistedJourneyStep,
  prepareJourneyRun as preparePersistedJourneyRun,
} from "../server/stakeholderJourneyService";
import {
  observeStakeholderJourneyOutcome,
  observeStakeholderJourneyPrepared,
  observeStakeholderJourneyUnexpectedError,
} from "./stakeholderJourneyMetrics";

export async function prepareJourneyRun(runKey: string) {
  try {
    const result = await preparePersistedJourneyRun(runKey);
    observeStakeholderJourneyPrepared();
    return result;
  } catch (error) {
    observeStakeholderJourneyUnexpectedError();
    throw error;
  }
}

export async function executeJourneyStep(runKey: string) {
  try {
    const result = await executePersistedJourneyStep(runKey);
    observeStakeholderJourneyOutcome(result.outcome);
    return result;
  } catch (error) {
    observeStakeholderJourneyUnexpectedError();
    throw error;
  }
}
