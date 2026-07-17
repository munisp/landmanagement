import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  createMortgageApplication,
  getMortgageApplicationById,
  getMortgageWorkflow,
  listMortgageApplicationsForUser,
} from '../../mortgageApplicationRepository';

function calculateMonthlyPayment(loanAmount: number, interestRate: number, loanTermYears: number) {
  const monthlyRate = interestRate / 100 / 12;
  const numberOfPayments = loanTermYears * 12;
  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0 || numberOfPayments <= 0) {
    return Math.round(loanAmount / Math.max(numberOfPayments, 1));
  }

  const numerator = loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments);
  const denominator = Math.pow(1 + monthlyRate, numberOfPayments) - 1;
  return denominator > 0 ? Math.round(numerator / denominator) : Math.round(loanAmount / numberOfPayments);
}

const createInput = z.object({
  propertyId: z.number(),
  loanAmount: z.number().positive(),
  interestRate: z.number().positive(),
  loanTermYears: z.number().int().positive(),
  monthlyIncome: z.number().positive(),
  employmentStatus: z.enum(['employed', 'self-employed', 'unemployed', 'retired']),
  bankName: z.string().min(2),
  bankBranch: z.string().optional(),
  creditScore: z.number().int().min(300).max(850).optional(),
});

export const mortgageApplicationsRouter = router({
  calculate: protectedProcedure
    .input(
      z.object({
        propertyValue: z.number().positive(),
        loanAmount: z.number().positive(),
        interestRate: z.number().positive(),
        loanTermYears: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      const monthlyPayment = calculateMonthlyPayment(input.loanAmount, input.interestRate, input.loanTermYears);
      const totalPayment = monthlyPayment * input.loanTermYears * 12;
      const totalInterest = totalPayment - input.loanAmount;
      const loanToValue = Number(((input.loanAmount / input.propertyValue) * 100).toFixed(1));

      return {
        monthlyPayment,
        totalPayment,
        totalInterest,
        downPayment: Math.max(input.propertyValue - input.loanAmount, 0),
        loanToValue,
      };
    }),

  create: protectedProcedure.input(createInput).mutation(async ({ input, ctx }) => {
    const created = await createMortgageApplication({
      userId: Number(ctx.user.id),
      propertyId: input.propertyId,
      loanAmount: input.loanAmount,
      interestRate: input.interestRate,
      loanTerm: input.loanTermYears * 12,
      monthlyIncome: input.monthlyIncome,
      employmentStatus: input.employmentStatus,
      creditScore: input.creditScore,
    });

    return {
      ...created,
      preferredBank: input.bankName,
      preferredBranch: input.bankBranch || null,
    };
  }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const applications = await listMortgageApplicationsForUser(Number(ctx.user.id));
    return { applications };
  }),

  getById: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const application = await getMortgageApplicationById(input.applicationId, Number(ctx.user.id));
      if (!application) {
        throw new Error('Mortgage application not found');
      }
      return application;
    }),

  workflow: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const workflow = await getMortgageWorkflow(input.applicationId, Number(ctx.user.id));
      if (!workflow) {
        throw new Error('Mortgage workflow not found');
      }
      return workflow;
    }),
});
