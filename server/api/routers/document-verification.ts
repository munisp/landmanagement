import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  processDocumentVerification,
  getVerificationDetails,
  updateVerificationStatus,
  getApplicationVerifications,
  getVerificationsRequiringReview,
} from '../../documentVerificationService';

export const documentVerificationRouter = router({
  /**
   * Process document verification with OCR and fraud detection
   */
  processDocument: protectedProcedure
    .input(
      z.object({
        applicationId: z.number(),
        documentType: z.enum([
          'income_statement',
          'employment_letter',
          'bank_statement',
          'tax_return',
          'pay_stub',
          'identification',
          'proof_of_address',
          'credit_report',
          'other',
        ]),
        documentUrl: z.string(),
        fileName: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await processDocumentVerification({
        ...input,
        userId: ctx.user.id,
      });
      return result;
    }),

  /**
   * Get verification details
   */
  getVerification: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ input }) => {
      const result = await getVerificationDetails(input.verificationId);
      return result;
    }),

  /**
   * Update verification status (manual review)
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        verificationId: z.string(),
        newStatus: z.enum(['verified', 'rejected', 'requires_review']),
        reviewNotes: z.string().optional(),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await updateVerificationStatus({
        ...input,
        reviewerId: ctx.user.id,
      });
      return result;
    }),

  /**
   * Get verifications for application
   */
  getApplicationVerifications: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }) => {
      const result = await getApplicationVerifications(input.applicationId);
      return result;
    }),

  /**
   * Get verifications requiring review
   */
  getVerificationsRequiringReview: protectedProcedure.query(async () => {
    const result = await getVerificationsRequiringReview();
    return result;
  }),
});
