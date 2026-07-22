import { describe, expect, it } from 'vitest';
import * as parcelDigitalTwinService from './parcelDigitalTwinService';
import * as caseConciergeService from './caseConciergeService';
import * as operationalEventStreamService from './operationalEventStreamService';
import * as commandCenterService from './commandCenterService';

/**
 * Next-generation features wave 2 — offline regression coverage:
 * Parcel Digital Twin, Case Concierge, Operational Event Stream,
 * Institutional Command Center.
 */

describe('Parcel Digital Twin & Scenario Lab', () => {
  it('builds a digital twin profile for a seeded parcel', async () => {
    const twin = await parcelDigitalTwinService.buildDigitalTwin(1);
    expect(twin.parcelId).toBe(1);
    expect(twin.estimatedValue).toBeGreaterThan(0);
    expect(twin.elevationSignal).toBeGreaterThanOrEqual(0);
    expect(twin.amenitySignal).toBeLessThanOrEqual(1);
  });

  it('runs a scenario with explainable model outputs', async () => {
    const result = await parcelDigitalTwinService.runScenario(1, {
      name: 'test-scenario',
      valuationChangePct: 15,
      floodRiskLevel: 'moderate',
      solarIrradianceKwhM2Day: 5.5,
    });
    expect(result.valuation.scenarioValue).toBeGreaterThan(0);
    expect(result.flood.exposureScore).toBeGreaterThanOrEqual(0);
    expect(result.flood.exposureScore).toBeLessThanOrEqual(100);
    expect(result.solar.annualYieldKwh).toBeGreaterThan(0);
    expect(['excellent', 'good', 'marginal', 'poor']).toContain(result.feasibility.band);
    expect(result.feasibility.recommendation.length).toBeGreaterThan(0);
  });

  it('ranks scenarios deterministically by feasibility', async () => {
    const comparison = await parcelDigitalTwinService.compareScenarios(1, [
      { name: 'conservative', valuationChangePct: -10, floodRiskLevel: 'high' },
      { name: 'growth', valuationChangePct: 25, floodRiskLevel: 'none' },
    ]);
    expect(comparison.scenariosCompared).toBe(2);
    expect(comparison.best).toBeDefined();
    expect(comparison.ranked[0].feasibilityScore).toBeGreaterThanOrEqual(
      comparison.ranked[comparison.ranked.length - 1].feasibilityScore
    );
  });
});

describe('Citizen Self-Service Case Concierge', () => {
  it('walks a dispute filing flow end to end with dynamic adaptation', async () => {
    const { session, step } = await caseConciergeService.startSession({ userId: 1, caseType: 'dispute_filing' });
    expect(step.stepId).toBe('parcel_reference');

    let next = await caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'parcel_reference', answer: 'LG-VI-2024-001' });
    expect(next.nextStep?.stepId).toBe('dispute_category');

    next = await caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'dispute_category', answer: 'boundary' });
    expect(next.nextStep?.stepId).toBe('respondent_known');

    // Say "no" — the respondent_details step must be skipped dynamically
    next = await caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'respondent_known', answer: 'no' });
    expect(next.nextStep?.stepId).toBe('prior_attempts');

    next = await caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'prior_attempts', answer: 'community mediation failed' });
    expect(next.nextStep?.stepId).toBe('evidence_checklist');

    next = await caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'evidence_checklist', answer: ['proof_of_ownership', 'survey_plan'] });
    expect(next.nextStep?.stepId).toBe('contact');

    const final = await caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'contact', answer: 'citizen@example.ng' });
    expect(final.result).toBeDefined();
    expect(final.result!.targetWorkflow).toBe('disputes.create');
    expect(final.result!.assembledPayload.parcelReference).toBe('LG-VI-2024-001');
    expect(final.result!.nextSteps.length).toBeGreaterThan(0);
    expect(final.session.status).toBe('completed');
  });

  it('enforces step ordering and required answers', async () => {
    const { session } = await caseConciergeService.startSession({ userId: 2, caseType: 'payment_issue' });
    await expect(
      caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'amount', answer: 5000 })
    ).rejects.toThrow();
    await expect(
      caseConciergeService.answerStep({ sessionId: session.sessionId, stepId: 'payment_reference', answer: '' })
    ).rejects.toThrow();
  });
});

describe('Field-to-Registry Operational Event Stream', () => {
  it('publishes and replays events with filters', async () => {
    const published = await operationalEventStreamService.publishEvent({
      topic: 'field_survey_submitted',
      aggregateType: 'parcel',
      aggregateId: '1',
      actorId: 1,
      payload: { officer: 'field-01', notes: 'corner beacons verified' },
    });
    expect(published.id).toBeGreaterThan(0);

    const stream = await operationalEventStreamService.getStream({ topics: ['field_survey_submitted'], limit: 10 });
    expect(stream.length).toBeGreaterThan(0);
    expect(stream[0].topic).toBe('field_survey_submitted');
  });

  it('rejects unknown topics', async () => {
    await expect(
      operationalEventStreamService.publishEvent({ topic: 'not_a_topic' as any })
    ).rejects.toThrow();
  });

  it('reports stream statistics', async () => {
    const stats = await operationalEventStreamService.getStreamStats();
    expect(stats.topics).toContain('integrity_finding_detected');
    expect(stats.totalBuffered).toBeGreaterThanOrEqual(0);
  });
});

describe('Institutional Command Center', () => {
  it('produces a forecast with posture, signals, and predictions', async () => {
    const forecast = await commandCenterService.getOperationalForecast();
    expect(forecast.postureScore).toBeGreaterThanOrEqual(0);
    expect(forecast.postureScore).toBeLessThanOrEqual(100);
    expect(['strong', 'stable', 'strained', 'critical']).toContain(forecast.posture);
    expect(forecast.predictions.backlogProjection.days30).toBeGreaterThanOrEqual(0);
    expect(['descriptive', 'diagnostic', 'predictive']).toContain(forecast.maturityLevel);
    for (const signal of forecast.signals) {
      expect(['info', 'watch', 'warning', 'critical']).toContain(signal.severity);
      expect(signal.recommendedAction.length).toBeGreaterThan(0);
    }
  });

  it('summarizes the command center header', async () => {
    const summary = await commandCenterService.getCommandCenterSummary();
    expect(summary.postureScore).toBeGreaterThanOrEqual(0);
    expect(summary.activeSignals).toBeGreaterThanOrEqual(0);
  });
});
