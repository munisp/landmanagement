import { z } from 'zod';

import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  verifyBankAccount,
  initiateBankTransfer,
  getBankAccountBalance,
  initializePaystackPayment,
  verifyPaystackPayment,
  initializeFlutterwavePayment,
  verifyFlutterwavePayment,
  submitMortgageLoanApplication as submitMortgageLoanApplicationExternally,
  checkMortgageLoanStatus as checkMortgageLoanStatusExternally,
  getCreditScore,
  generatePaymentReference,
  calculateLoanAffordability,
} from '../../financialIntegrationsService';
import {
  createMortgageApplication,
  getMortgageApplicationById,
  getMortgageWorkflow,
  listMortgageApplicationsForUser,
  seedMortgageApplications,
  transitionMortgageApplicationStatus,
  updateMortgageApplication,
  type MortgageLifecycleStatus,
} from '../../mortgageApplicationRepository';

const mortgageEditableFieldsSchema = z.object({
  applicationId: z.string(),
  propertyId: z.number().int().positive().optional(),
  loanAmount: z.number().positive().optional(),
  interestRate: z.number().positive().optional(),
  loanTerm: z.number().int().positive().optional(),
  monthlyIncome: z.number().positive().optional(),
  employmentStatus: z.enum(['employed', 'self-employed', 'unemployed', 'retired']).optional(),
  creditScore: z.number().min(300).max(900).optional(),
  downPayment: z.number().min(0).optional(),
  bankName: z.string().min(2).optional(),
  bankBranch: z.string().nullable().optional(),
});

const mortgageStatusSchema = z.enum(['pending', 'under_review', 'approved', 'rejected', 'disbursed', 'cancelled']);

function toStatusMessage(status: MortgageLifecycleStatus) {
  switch (status) {
    case 'pending':
      return 'Mortgage application captured and queued for underwriting.';
    case 'under_review':
      return 'Mortgage application is currently under underwriting review.';
    case 'approved':
      return 'Mortgage application approved. Repayment setup can now continue.';
    case 'rejected':
      return 'Mortgage application did not satisfy the current underwriting policy.';
    case 'disbursed':
      return 'Mortgage funds have been disbursed and the live loan lifecycle has started.';
    case 'cancelled':
      return 'Mortgage application was cancelled and removed from the active queue.';
    default:
      return 'Mortgage application updated.';
  }
}

export const financialRouter = router({
  /**
   * Verify bank account
   */
  verifyBankAccount: protectedProcedure
    .input(
      z.object({
        accountNumber: z.string(),
        bankCode: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return await verifyBankAccount(input.accountNumber, input.bankCode);
    }),

  /**
   * Initiate bank transfer
   */
  initiateBankTransfer: protectedProcedure
    .input(
      z.object({
        sourceAccount: z.string(),
        destinationAccount: z.string(),
        amount: z.number().positive(),
        currency: z.string().default('NGN'),
        narration: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const reference = generatePaymentReference('TRANSFER');
      return await initiateBankTransfer({
        ...input,
        reference,
      });
    }),

  /**
   * Get bank account balance
   */
  getBankAccountBalance: protectedProcedure
    .input(
      z.object({
        accountNumber: z.string(),
        bankCode: z.string(),
      })
    )
    .query(async ({ input }) => {
      const balance = await getBankAccountBalance(input.accountNumber, input.bankCode);
      return { balance };
    }),

  /**
   * Initialize Paystack payment
   */
  initializePaystackPayment: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        amount: z.number().positive(),
        callback_url: z.string().url().optional(),
        metadata: z.any().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const reference = generatePaymentReference('PAYSTACK');
      return await initializePaystackPayment({
        ...input,
        reference,
      });
    }),

  /**
   * Verify Paystack payment
   */
  verifyPaystackPayment: protectedProcedure
    .input(z.object({ reference: z.string() }))
    .query(async ({ input }) => {
      return await verifyPaystackPayment(input.reference);
    }),

  /**
   * Initialize Flutterwave payment
   */
  initializeFlutterwavePayment: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        amount: z.number().positive(),
        currency: z.string().default('NGN'),
        redirect_url: z.string().url().optional(),
        customer: z.object({
          email: z.string().email(),
          name: z.string(),
          phonenumber: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const tx_ref = generatePaymentReference('FLW');
      return await initializeFlutterwavePayment({
        ...input,
        tx_ref,
      });
    }),

  /**
   * Verify Flutterwave payment
   */
  verifyFlutterwavePayment: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return await verifyFlutterwavePayment(input.transactionId);
    }),

  /**
   * Submit mortgage loan application with local persistence and optional upstream underwriting sync
   */
  submitMortgageLoanApplication: protectedProcedure
    .input(
      z.object({
        propertyId: z.number().positive(),
        loanAmount: z.number().positive(),
        interestRate: z.number().positive(),
        loanTerm: z.number().positive(),
        monthlyIncome: z.number().positive(),
        employmentStatus: z.enum(['employed', 'self-employed', 'unemployed', 'retired']),
        creditScore: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const application = await createMortgageApplication({
        ...input,
        userId: ctx.user.id,
      });

      let message = toStatusMessage(application.status);
      let externalDecision: Record<string, any> | null = null;

      try {
        externalDecision = await submitMortgageLoanApplicationExternally({
          ...input,
          userId: ctx.user.id,
        });

        if (externalDecision.status === 'approved' && application.status === 'under_review') {
          await transitionMortgageApplicationStatus({
            applicationId: application.applicationId,
            actorId: ctx.user.id,
            nextStatus: 'approved',
          });
        }

        if (externalDecision.status === 'rejected' && application.status !== 'rejected') {
          await transitionMortgageApplicationStatus({
            applicationId: application.applicationId,
            actorId: ctx.user.id,
            nextStatus: 'rejected',
            rejectionReason: externalDecision.message || 'Rejected by external underwriting integration.',
          });
        }

        if (externalDecision.message) {
          message = externalDecision.message;
        }
      } catch (error) {
        console.warn('[financial.submitMortgageLoanApplication] Upstream underwriting sync unavailable; local workflow continues:', error);
      }

      const persisted = await getMortgageApplicationById(application.applicationId, ctx.user.id);

      return {
        ...(persisted ?? application),
        message,
        externalDecision,
      };
    }),

  /**
   * Check mortgage loan status
   */
  checkMortgageLoanStatus: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const localApplication = await getMortgageApplicationById(input.applicationId, ctx.user.id);

      if (localApplication) {
        return {
          applicationId: localApplication.applicationId,
          status: localApplication.status,
          approvedAmount: localApplication.status === 'approved' || localApplication.status === 'disbursed'
            ? localApplication.loanAmount
            : undefined,
          monthlyPayment: localApplication.monthlyPayment,
          message: toStatusMessage(localApplication.status),
          local: true,
        };
      }

      return await checkMortgageLoanStatusExternally(input.applicationId);
    }),

  /**
   * Get credit score
   */
  getCreditScore: protectedProcedure.query(async ({ ctx }) => {
    return await getCreditScore(ctx.user.id);
  }),

  /**
   * Calculate loan affordability
   */
  calculateLoanAffordability: publicProcedure
    .input(
      z.object({
        monthlyIncome: z.number().positive(),
        loanAmount: z.number().positive(),
        interestRate: z.number().positive(),
        loanTerm: z.number().positive(),
      })
    )
    .query(({ input }) => {
      return calculateLoanAffordability(
        input.monthlyIncome,
        input.loanAmount,
        input.interestRate,
        input.loanTerm
      );
    }),

  /**
   * Generate payment reference
   */
  generatePaymentReference: publicProcedure
    .input(z.object({ prefix: z.string().optional() }))
    .query(({ input }) => {
      return {
        reference: generatePaymentReference(input.prefix),
      };
    }),

  /**
   * Reset and reseed local mortgage application scenarios
   */
  seedMortgageApplications: protectedProcedure.mutation(async () => {
    return await seedMortgageApplications();
  }),

  /**
   * Get user's mortgage applications
   */
  getUserMortgageApplications: protectedProcedure.query(async ({ ctx }) => {
    return await listMortgageApplicationsForUser(ctx.user.id);
  }),

  /**
   * Get a single mortgage application for the current user
   */
  getMortgageApplicationById: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const application = await getMortgageApplicationById(input.applicationId, ctx.user.id);
      if (!application) {
        throw new Error('Application not found');
      }
      return application;
    }),

  /**
   * Get the workflow timeline for a mortgage application
   */
  getMortgageApplicationWorkflow: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const workflow = await getMortgageWorkflow(input.applicationId, ctx.user.id);
      if (!workflow) {
        throw new Error('Application workflow not found');
      }
      return workflow;
    }),

  /**
   * Update mortgage application fields before final approval/disbursement
   */
  updateMortgageApplication: protectedProcedure
    .input(mortgageEditableFieldsSchema)
    .mutation(async ({ input, ctx }) => {
      return await updateMortgageApplication(input.applicationId, ctx.user.id, {
        propertyId: input.propertyId,
        loanAmount: input.loanAmount,
        interestRate: input.interestRate,
        loanTerm: input.loanTerm,
        monthlyIncome: input.monthlyIncome,
        employmentStatus: input.employmentStatus,
        creditScore: input.creditScore,
        downPayment: input.downPayment,
        bankName: input.bankName,
        bankBranch: input.bankBranch,
      });
    }),

  /**
   * Update mortgage application status (operations or loan officer action)
   */
  updateMortgageApplicationStatus: protectedProcedure
    .input(
      z.object({
        applicationId: z.string(),
        status: mortgageStatusSchema,
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return await transitionMortgageApplicationStatus({
        applicationId: input.applicationId,
        actorId: ctx.user.id,
        nextStatus: input.status,
        rejectionReason: input.rejectionReason,
      });
    }),

  /**
   * Borrower cancellation endpoint for still-open applications
   */
  cancelMortgageApplication: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const application = await getMortgageApplicationById(input.applicationId, ctx.user.id);
      if (!application) {
        throw new Error('Application not found');
      }

      return await transitionMortgageApplicationStatus({
        applicationId: input.applicationId,
        actorId: ctx.user.id,
        nextStatus: 'cancelled',
      });
    }),
});
