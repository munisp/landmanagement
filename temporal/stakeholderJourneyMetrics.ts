type JourneyActivityOutcome = "continue" | "awaiting_intervention" | "completed" | "blocked" | "cancelled";

const outcomes = new Map<JourneyActivityOutcome, number>([
  ["continue", 0],
  ["awaiting_intervention", 0],
  ["completed", 0],
  ["blocked", 0],
  ["cancelled", 0],
]);
let preparedTotal = 0;
let unexpectedErrorsTotal = 0;

export function observeStakeholderJourneyPrepared() {
  preparedTotal += 1;
}

export function observeStakeholderJourneyOutcome(outcome: JourneyActivityOutcome) {
  outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
}

export function observeStakeholderJourneyUnexpectedError() {
  unexpectedErrorsTotal += 1;
}

export function stakeholderJourneyPrometheusMetrics(): string {
  const outcomeLines = [...outcomes.entries()]
    .map(([outcome, total]) => `stakeholder_journey_activity_outcomes_total{outcome="${outcome}"} ${total}`)
    .join("\n");
  return [
    "# HELP stakeholder_journey_runs_prepared_total Number of durable journey runs prepared by this worker.",
    "# TYPE stakeholder_journey_runs_prepared_total counter",
    `stakeholder_journey_runs_prepared_total ${preparedTotal}`,
    "# HELP stakeholder_journey_activity_outcomes_total Number of executed journey activities by durable outcome.",
    "# TYPE stakeholder_journey_activity_outcomes_total counter",
    outcomeLines,
    "# HELP stakeholder_journey_activity_unexpected_errors_total Number of unexpected worker activity errors before a durable outcome was recorded.",
    "# TYPE stakeholder_journey_activity_unexpected_errors_total counter",
    `stakeholder_journey_activity_unexpected_errors_total ${unexpectedErrorsTotal}`,
    "",
  ].join("\n");
}
