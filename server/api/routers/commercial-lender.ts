import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../../_core/trpc";
import {
  addCommercialMember,
  createCollateralCase,
  createCommercialLenderAccount,
  createCommercialConveyancingAccount,
  createCommercialFieldAccount,
  createFieldAssignment,
  getConveyancingWorkspaceDashboard,
  getFieldSurveyDashboard,
  getLenderCollateralDashboard,
  issueCommercialInvoice,
  listCommercialAccountsForUser,
  initializeCommercialInvoicePayment,
  verifyCommercialInvoicePayment,
  reviewCollateralEvidence,
  reviewConveyancingEvidence,
  submitCollateralEvidence,
  submitConveyancingEvidence,
  transitionCollateralCase,
  transitionConveyancingMatter,
  openConveyancingMatter,
  reviewFieldEvidence,
  submitFieldEvidence,
  transitionFieldAssignment,
  runCommercialBillingCycle,
} from "../../commercialLenderService";

const accountKey = z.string().regex(/^(?:LEND|CONV|FIELD)-[A-Z0-9]{20}$/);
const caseKey = z.string().regex(/^COL-[A-Z0-9]{20}$/);
const evidenceKey = z.string().regex(/^EVD-[A-Z0-9]{20}$/);
const matterKey = z.string().regex(/^MAT-[A-Z0-9]{20}$/);
const matterEvidenceKey = z.string().regex(/^MTE-[A-Z0-9]{20}$/);
const fieldAssignmentKey = z.string().regex(/^ASN-[A-Z0-9]{20}$/);
const fieldEvidenceKey = z.string().regex(/^FSE-[A-Z0-9]{20}$/);
const memberRole = z.enum(["owner", "billing_admin", "lender_admin", "lender_analyst", "reviewer", "matter_manager", "legal_reviewer", "field_manager", "field_inspector", "field_reviewer"]);
const caseStatus = z.enum(["opened", "evidence_requested", "ready_for_review", "under_review", "conditional_approval", "approved", "declined", "withdrawn"]);

export const commercialLenderRouter = router({
  products: protectedProcedure.query(async () => ({
    products: [
      { productKey: "lender-collateral-core", name: "Lender Collateral Control", decisionBoundary: "Human lender personnel remain responsible for every lending decision." },
      { productKey: "conveyancing-workspace", name: "Conveyancing and Title Verification Workspace", decisionBoundary: "Legal professionals remain responsible for legal advice and title conclusions." },
      { productKey: "field-survey-operations", name: "Field Survey and Parcel Inspection", decisionBoundary: "Only authorized reviewers may promote field evidence into a registry workflow." },
    ],
  })),

  createLenderAccount: protectedProcedure
    .input(z.object({
      legalName: z.string().trim().min(2).max(255),
      billingEmail: z.string().trim().email().max(320),
      lenderName: z.string().trim().min(2).max(255),
      policyVersion: z.string().trim().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => createCommercialLenderAccount({ actorId: ctx.user.id, ...input })),

  createConveyancingAccount: protectedProcedure
    .input(z.object({
      legalName: z.string().trim().min(2).max(255),
      billingEmail: z.string().trim().email().max(320),
    }))
    .mutation(async ({ ctx, input }) => createCommercialConveyancingAccount({ actorId: ctx.user.id, ...input })),

  createFieldSurveyAccount: protectedProcedure
    .input(z.object({
      legalName: z.string().trim().min(2).max(255),
      billingEmail: z.string().trim().email().max(320),
    }))
    .mutation(async ({ ctx, input }) => createCommercialFieldAccount({ actorId: ctx.user.id, ...input })),

  listMyAccounts: protectedProcedure.query(async ({ ctx }) => listCommercialAccountsForUser(ctx.user.id)),

  addMember: protectedProcedure
    .input(z.object({ accountKey, userId: z.number().int().positive(), role: memberRole }))
    .mutation(async ({ ctx, input }) => addCommercialMember({ actorId: ctx.user.id, ...input })),

  dashboard: protectedProcedure
    .input(z.object({ accountKey, caseKey: caseKey.optional() }))
    .query(async ({ ctx, input }) => getLenderCollateralDashboard({ actorId: ctx.user.id, ...input })),

  createCase: protectedProcedure
    .input(z.object({
      accountKey,
      parcelId: z.number().int().positive(),
      requestedAmountMinor: z.number().int().positive(),
      declaredCollateralValueMinor: z.number().int().nonnegative().optional(),
      currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
      mortgageApplicationId: z.number().int().positive().optional(),
      borrowerId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => createCollateralCase({ actorId: ctx.user.id, ...input })),

  submitEvidence: protectedProcedure
    .input(z.object({
      accountKey,
      caseKey,
      evidenceType: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,63}$/),
      sourceReference: z.string().trim().min(1).max(160),
      sourceChecksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => submitCollateralEvidence({ actorId: ctx.user.id, ...input })),

  reviewEvidence: protectedProcedure
    .input(z.object({
      accountKey,
      evidenceKey,
      status: z.enum(["accepted", "rejected"]),
      reviewNotes: z.string().trim().min(8).max(5000),
    }))
    .mutation(async ({ ctx, input }) => reviewCollateralEvidence({ actorId: ctx.user.id, ...input })),

  transitionCase: protectedProcedure
    .input(z.object({
      accountKey,
      caseKey,
      nextStatus: caseStatus,
      decisionNotes: z.string().trim().max(10000).optional(),
      assignedReviewerId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => transitionCollateralCase({ actorId: ctx.user.id, ...input })),

  conveyancingDashboard: protectedProcedure
    .input(z.object({ accountKey, matterKey: matterKey.optional() }))
    .query(async ({ ctx, input }) => getConveyancingWorkspaceDashboard({ actorId: ctx.user.id, ...input })),

  openConveyancingMatter: protectedProcedure
    .input(z.object({
      accountKey,
      parcelId: z.number().int().positive(),
      transactionReference: z.string().trim().min(1).max(96).optional(),
      clientId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => openConveyancingMatter({ actorId: ctx.user.id, ...input })),

  submitConveyancingEvidence: protectedProcedure
    .input(z.object({
      accountKey,
      matterKey,
      evidenceType: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,63}$/),
      sourceReference: z.string().trim().min(1).max(160),
      sourceChecksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => submitConveyancingEvidence({ actorId: ctx.user.id, ...input })),

  reviewConveyancingEvidence: protectedProcedure
    .input(z.object({
      accountKey,
      evidenceKey: matterEvidenceKey,
      status: z.enum(["accepted", "rejected"]),
      reviewNotes: z.string().trim().min(8).max(5000),
    }))
    .mutation(async ({ ctx, input }) => reviewConveyancingEvidence({ actorId: ctx.user.id, ...input })),

  transitionConveyancingMatter: protectedProcedure
    .input(z.object({
      accountKey,
      matterKey,
      nextStatus: z.enum(["opened", "evidence_requested", "title_review", "legal_drafting", "signatures_pending", "closing_ready", "completed", "withdrawn"]),
      notes: z.string().trim().max(10000).optional(),
      assignedReviewerId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => transitionConveyancingMatter({ actorId: ctx.user.id, ...input })),

  fieldSurveyDashboard: protectedProcedure
    .input(z.object({ accountKey, assignmentKey: fieldAssignmentKey.optional() }))
    .query(async ({ ctx, input }) => getFieldSurveyDashboard({ actorId: ctx.user.id, ...input })),

  createFieldAssignment: protectedProcedure
    .input(z.object({
      accountKey,
      parcelId: z.number().int().positive(),
      assignedTo: z.number().int().positive(),
      instructions: z.string().trim().min(8).max(10000),
      scheduledFor: z.string().datetime({ offset: true }).optional(),
      dueAt: z.string().datetime({ offset: true }).optional(),
    }))
    .mutation(async ({ ctx, input }) => createFieldAssignment({ actorId: ctx.user.id, ...input })),

  submitFieldEvidence: protectedProcedure
    .input(z.object({
      accountKey,
      assignmentKey: fieldAssignmentKey,
      evidenceType: z.string().trim().regex(/^[a-z][a-z0-9_-]{1,63}$/),
      sourceReference: z.string().trim().min(1).max(160),
      sourceChecksumSha256: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
      capturedAt: z.string().datetime({ offset: true }),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      geometry: z.record(z.string(), z.unknown()).optional(),
      qualityFlags: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).max(20).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => submitFieldEvidence({ actorId: ctx.user.id, ...input })),

  reviewFieldEvidence: protectedProcedure
    .input(z.object({
      accountKey,
      evidenceKey: fieldEvidenceKey,
      status: z.enum(["accepted", "rejected"]),
      reviewNotes: z.string().trim().min(8).max(5000),
    }))
    .mutation(async ({ ctx, input }) => reviewFieldEvidence({ actorId: ctx.user.id, ...input })),

  transitionFieldAssignment: protectedProcedure
    .input(z.object({
      accountKey,
      assignmentKey: fieldAssignmentKey,
      nextStatus: z.enum(["assigned", "in_progress", "submitted", "under_review", "accepted", "returned", "cancelled"]),
      reviewNotes: z.string().trim().max(10000).optional(),
    }))
    .mutation(async ({ ctx, input }) => transitionFieldAssignment({ actorId: ctx.user.id, ...input })),

  issueInvoice: protectedProcedure
    .input(z.object({ accountKey, dueDays: z.number().int().min(1).max(90).optional() }))
    .mutation(async ({ ctx, input }) => issueCommercialInvoice({ actorId: ctx.user.id, ...input })),

  runBillingCycle: adminProcedure
    .input(z.object({ graceDays: z.number().int().min(0).max(90).optional() }))
    .mutation(async ({ input }) => runCommercialBillingCycle(input)),

  initializeInvoicePayment: protectedProcedure
    .input(z.object({
      accountKey,
      invoiceKey: z.string().regex(/^INV-[A-Z0-9]{20}$/),
      callbackUrl: z.string().url().max(1000).refine((value) => value.startsWith("https://"), "Commercial payment callbacks must use HTTPS"),
    }))
    .mutation(async ({ ctx, input }) => initializeCommercialInvoicePayment({ actorId: ctx.user.id, ...input })),

  verifyInvoicePayment: protectedProcedure
    .input(z.object({
      accountKey,
      invoiceKey: z.string().regex(/^INV-[A-Z0-9]{20}$/),
      providerTransactionId: z.string().trim().min(1).max(160).optional(),
    }))
    .mutation(async ({ ctx, input }) => verifyCommercialInvoicePayment({ actorId: ctx.user.id, ...input })),
});
