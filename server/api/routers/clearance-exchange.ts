import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import * as clearanceExchangeService from '../../clearanceExchangeService';

const agencyEnum = z.enum([
  'firs_tax',
  'identity_verification',
  'survey',
  'land_use',
  'environmental',
  'governor_consent',
]);

export const clearanceExchangeRouter = router({
  catalog: protectedProcedure.query(async () => {
    return clearanceExchangeService.AGENCY_CATALOG;
  }),

  initiate: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive(),
        agencies: z.array(agencyEnum).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const clearances = await clearanceExchangeService.initiateClearances(input);
      return { total: clearances.length, clearances };
    }),

  list: protectedProcedure
    .input(z.object({ transactionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const clearances = await clearanceExchangeService.getClearances(input.transactionId);
      return { total: clearances.length, clearances };
    }),

  state: protectedProcedure
    .input(z.object({ transactionId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return clearanceExchangeService.getClearanceState(input.transactionId);
    }),

  submit: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive(),
        agency: agencyEnum,
        referenceNumber: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return clearanceExchangeService.submitClearance(input);
    }),

  decide: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive(),
        agency: agencyEnum,
        decision: z.enum(['approved', 'rejected']),
        notes: z.string().optional(),
        referenceNumber: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return clearanceExchangeService.decideClearance(input);
    }),

  expire: protectedProcedure
    .input(
      z.object({
        transactionId: z.number().int().positive(),
        agency: agencyEnum,
      })
    )
    .mutation(async ({ input }) => {
      return clearanceExchangeService.expireClearance(input.transactionId, input.agency);
    }),
});
