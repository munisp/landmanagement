import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { addAssessmentEvidence, createTaxAccount, decideAppeal, fileAppeal, issueAssessment, openAssessmentCase, recordVerifiedTaxPayment, taxDashboard } from "../../taxOperationsService";
const accountKey=z.string().regex(/^TAX-[A-Z0-9]{20}$/); const caseKey=z.string().regex(/^TAC-[A-Z0-9]{20}$/); const appealKey=z.string().regex(/^TAP-[A-Z0-9]{20}$/);
export const taxOperationsRouter=router({
 createAccount:protectedProcedure.input(z.object({legalName:z.string().trim().min(2).max(255),billingEmail:z.string().email().max(320)})).mutation(({ctx,input})=>createTaxAccount({actorId:ctx.user.id,...input})),
 dashboard:protectedProcedure.input(z.object({accountKey})).query(({ctx,input})=>taxDashboard({actorId:ctx.user.id,...input})),
 openCase:protectedProcedure.input(z.object({accountKey,parcelId:z.number().int().positive(),taxYear:z.number().int().min(2000).max(2200),declaredBasisMinor:z.number().int().min(0).optional(),currency:z.string().regex(/^[A-Z]{3}$/)})).mutation(({ctx,input})=>openAssessmentCase({actorId:ctx.user.id,...input})),
 addEvidence:protectedProcedure.input(z.object({accountKey,caseKey,kind:z.string().trim().min(2).max(64),sourceReference:z.string().trim().min(2).max(160),description:z.string().trim().min(3).max(4000)})).mutation(({ctx,input})=>addAssessmentEvidence({actorId:ctx.user.id,...input})),
 issueAssessment:protectedProcedure.input(z.object({accountKey,caseKey,assessedAmountMinor:z.number().int().min(0),assessmentReference:z.string().trim().min(2).max(160)})).mutation(({ctx,input})=>issueAssessment({actorId:ctx.user.id,...input})),
 fileAppeal:protectedProcedure.input(z.object({accountKey,caseKey,grounds:z.string().trim().min(10).max(4000),evidenceReference:z.string().trim().min(2).max(160)})).mutation(({ctx,input})=>fileAppeal({actorId:ctx.user.id,...input})),
 decideAppeal:protectedProcedure.input(z.object({accountKey,appealKey,nextStatus:z.enum(["upheld","adjusted","withdrawn"]),decisionNote:z.string().trim().min(8).max(4000)})).mutation(({ctx,input})=>decideAppeal({actorId:ctx.user.id,...input})),
 recordVerifiedPayment:protectedProcedure.input(z.object({accountKey,caseKey,provider:z.string().trim().min(2).max(32),providerReference:z.string().trim().min(2).max(160),amountMinor:z.number().int().min(0),currency:z.string().regex(/^[A-Z]{3}$/)})).mutation(({ctx,input})=>recordVerifiedTaxPayment({actorId:ctx.user.id,...input})),
});
