/**
 * Certificate of Occupancy (C of O) Temporal Workflow
 *
 * Implements the full 9-stage saga for C of O issuance:
 *   submission -> nin_verification -> document_review ->
 *   survey_verification -> site_inspection -> legal_review ->
 *   governor_consent -> gazette_publication -> issuance
 *
 * Each stage transition updates the cof_o_applications table and
 * inserts an audit log entry into cof_o_stage_log.
 */

import {
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
  condition,
  ApplicationFailure,
} from "@temporalio/workflow";

// ── Signal definitions ───────────────────────────────────────
export const advanceStageSignal = defineSignal<[{ stage: string; performedBy: number; notes?: string }]>(
  "advanceStage"
);
export const rejectApplicationSignal = defineSignal<[{ reason: string; performedBy: number }]>(
  "rejectApplication"
);

// ── Activity stubs ───────────────────────────────────────────
const activities = proxyActivities<{
  verifyNIN(applicationId: number): Promise<boolean>;
  reviewDocuments(applicationId: number): Promise<boolean>;
  verifySurvey(applicationId: number): Promise<boolean>;
  conductSiteInspection(applicationId: number): Promise<boolean>;
  conductLegalReview(applicationId: number): Promise<boolean>;
  obtainGovernorConsent(applicationId: number): Promise<boolean>;
  publishGazette(applicationId: number): Promise<string>;
  issueCertificate(applicationId: number, gazetteRef: string): Promise<string>;
  updateApplicationStage(applicationId: number, stage: string, timestamp: Date): Promise<void>;
  logStageTransition(
    applicationId: number,
    fromStage: string,
    toStage: string,
    action: string,
    performedBy: number,
    notes?: string
  ): Promise<void>;
  notifyApplicant(applicationId: number, stage: string, message: string): Promise<void>;
}>({
  startToCloseTimeout: "24 hours",
  retryPolicy: { maximumAttempts: 3, initialInterval: "1 minute" },
});

// ── Workflow definition ──────────────────────────────────────
export interface CofOWorkflowInput {
  applicationId: number;
  applicantId: number;
  parcelId: number;
  sector: string;
}

export async function cofOWorkflow(input: CofOWorkflowInput): Promise<{ certificateNumber: string }> {
  const { applicationId } = input;

  let currentStage = "submission";
  let isRejected = false;
  let rejectionReason = "";
  let pendingAdvance: { stage: string; performedBy: number; notes?: string } | null = null;
  let pendingReject: { reason: string; performedBy: number } | null = null;

  // Signal handlers
  setHandler(advanceStageSignal, (payload) => {
    pendingAdvance = payload;
  });
  setHandler(rejectApplicationSignal, (payload) => {
    pendingReject = payload;
  });

  const stages: string[] = [
    "submission",
    "nin_verification",
    "document_review",
    "survey_verification",
    "site_inspection",
    "legal_review",
    "governor_consent",
    "gazette_publication",
    "issuance",
  ];

  let gazetteRef = "";

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const nextStage = stages[i + 1];

    currentStage = stage;
    await activities.updateApplicationStage(applicationId, stage, new Date());

    if (stage === "submission") {
      await activities.notifyApplicant(applicationId, stage, "Your C of O application has been received.");
    }

    // Wait for signal or timeout (30 days per stage)
    await condition(
      () => pendingAdvance !== null || pendingReject !== null,
      "30 days"
    );

    if (pendingReject) {
      isRejected = true;
      rejectionReason = pendingReject.reason;
      await activities.logStageTransition(
        applicationId,
        stage,
        "rejected",
        "reject",
        pendingReject.performedBy,
        pendingReject.reason
      );
      await activities.updateApplicationStage(applicationId, "rejected", new Date());
      await activities.notifyApplicant(
        applicationId,
        "rejected",
        `Your C of O application has been rejected: ${rejectionReason}`
      );
      throw ApplicationFailure.create({ message: `Application rejected: ${rejectionReason}`, nonRetryable: true });
    }

    if (pendingAdvance && nextStage) {
      await activities.logStageTransition(
        applicationId,
        stage,
        nextStage,
        "advance",
        pendingAdvance.performedBy,
        pendingAdvance.notes
      );
      pendingAdvance = null;
    }

    // Automated stage actions
    if (stage === "nin_verification") {
      const ninOk = await activities.verifyNIN(applicationId);
      if (!ninOk) {
        throw ApplicationFailure.create({ message: "NIN verification failed", nonRetryable: false });
      }
    } else if (stage === "document_review") {
      await activities.reviewDocuments(applicationId);
    } else if (stage === "survey_verification") {
      await activities.verifySurvey(applicationId);
    } else if (stage === "site_inspection") {
      await activities.conductSiteInspection(applicationId);
    } else if (stage === "legal_review") {
      await activities.conductLegalReview(applicationId);
    } else if (stage === "governor_consent") {
      await activities.obtainGovernorConsent(applicationId);
    } else if (stage === "gazette_publication") {
      gazetteRef = await activities.publishGazette(applicationId);
    }
  }

  // Final issuance
  const certificateNumber = await activities.issueCertificate(applicationId, gazetteRef);
  await activities.updateApplicationStage(applicationId, "issuance", new Date());
  await activities.notifyApplicant(
    applicationId,
    "issuance",
    `Your Certificate of Occupancy has been issued. Certificate Number: ${certificateNumber}`
  );

  return { certificateNumber };
}
