import { z } from "zod";
import { adminProcedure, router } from "../../_core/trpc";
import { listOnboardingVerificationEvidence, reviewOnboardingDocumentEvidence } from "../../onboardingVerificationService";

export const onboardingVerificationRouter = router({
  listEvidence: adminProcedure.input(z.object({ onboardingId: z.number().int().positive() })).query(async ({ input }) => (
    listOnboardingVerificationEvidence(input.onboardingId)
  )),
  reviewDocument: adminProcedure.input(z.object({
    evidenceId: z.number().int().positive(),
    outcome: z.enum(["verified", "rejected"]),
    notes: z.string().trim().min(3).max(2_000),
  })).mutation(async ({ input, ctx }) => (
    reviewOnboardingDocumentEvidence({ ...input, reviewerId: ctx.user.id })
  )),
});
