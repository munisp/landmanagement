import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import {
  addDisputeEvidence,
  assignMediator,
  createDispute,
  getDisputeById,
  getDisputeStats,
  listDisputes,
  scheduleDisputeHearing,
  transitionDispute,
} from '../../disputeRepository';
import { getParcelByNumber } from '../../parcelRepository';

function inferJurisdiction(parcelNumber: string) {
  if (parcelNumber.startsWith('LG-')) {
    return { state: 'Lagos', lga: 'Unknown' };
  }
  if (parcelNumber.startsWith('AB-')) {
    return { state: 'FCT', lga: 'Unknown' };
  }
  if (parcelNumber.startsWith('KN-')) {
    return { state: 'Kano', lga: 'Unknown' };
  }
  return { state: 'Unknown', lga: 'Unknown' };
}

export const disputesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['pending', 'investigating', 'mediation', 'hearing', 'resolved', 'dismissed', 'all']).optional(),
        type: z.enum(['boundary_dispute', 'ownership_dispute', 'title_dispute', 'encroachment', 'fraud', 'tax_assessment', 'other', 'all']).optional(),
        state: z.string().optional(),
        lga: z.string().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }),
    )
    .query(async ({ input }) => {
      return listDisputes(input);
    }),

  stats: protectedProcedure.query(async () => {
    return getDisputeStats();
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const dispute = getDisputeById(input.id);
      if (!dispute) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dispute not found' });
      }
      return dispute;
    }),

  create: protectedProcedure
    .input(
      z.object({
        parcelNumber: z.string().min(3),
        type: z.enum(['boundary_dispute', 'ownership_dispute', 'title_dispute', 'encroachment', 'fraud', 'tax_assessment', 'other']),
        respondent: z.string().min(2),
        description: z.string().min(20),
        requestedRelief: z.string().optional(),
        evidenceFiles: z
          .array(
            z.object({
              fileName: z.string().min(1),
              fileType: z.string().optional(),
              note: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const parcel = await getParcelByNumber(input.parcelNumber);
      const inferred = inferJurisdiction(input.parcelNumber);
      const filedBy = ctx.user.name || ctx.user.email || `User ${ctx.user.id}`;

      const dispute = createDispute({
        parcelNumber: input.parcelNumber,
        parcelId: parcel?.id,
        type: input.type,
        state: parcel?.state || inferred.state,
        lga: parcel?.lga || inferred.lga,
        filedBy,
        filedByUserId: Number(ctx.user.id),
        respondent: input.respondent,
        description: input.description,
        requestedRelief: input.requestedRelief,
        evidence: input.evidenceFiles?.map((item) => ({
          fileName: item.fileName,
          fileType: item.fileType,
          uploadedBy: filedBy,
          note: item.note,
        })),
      });

      return {
        success: true,
        dispute,
      };
    }),

  assignMediator: protectedProcedure
    .input(
      z.object({
        disputeId: z.number(),
        mediator: z.string().min(2),
        hearingDate: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const dispute = assignMediator({
        disputeId: input.disputeId,
        mediator: input.mediator,
        hearingDate: input.hearingDate,
        actor: ctx.user.name || ctx.user.email || `User ${ctx.user.id}`,
      });

      return {
        success: true,
        dispute,
      };
    }),

  scheduleHearing: protectedProcedure
    .input(
      z.object({
        disputeId: z.number(),
        hearingDate: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const dispute = scheduleDisputeHearing({
        disputeId: input.disputeId,
        hearingDate: input.hearingDate,
        actor: ctx.user.name || ctx.user.email || `User ${ctx.user.id}`,
      });

      return {
        success: true,
        dispute,
      };
    }),

  transition: protectedProcedure
    .input(
      z.object({
        disputeId: z.number(),
        nextStatus: z.enum(['investigating', 'mediation', 'hearing', 'resolved', 'dismissed']),
        resolution: z.string().optional(),
        mediator: z.string().optional(),
        hearingDate: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const dispute = transitionDispute({
        disputeId: input.disputeId,
        nextStatus: input.nextStatus,
        resolution: input.resolution,
        mediator: input.mediator,
        hearingDate: input.hearingDate,
        actor: ctx.user.name || ctx.user.email || `User ${ctx.user.id}`,
      });

      return {
        success: true,
        dispute,
      };
    }),

  addEvidence: protectedProcedure
    .input(
      z.object({
        disputeId: z.number(),
        fileName: z.string().min(1),
        fileType: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const dispute = addDisputeEvidence({
        disputeId: input.disputeId,
        fileName: input.fileName,
        fileType: input.fileType,
        note: input.note,
        uploadedBy: ctx.user.name || ctx.user.email || `User ${ctx.user.id}`,
      });

      return {
        success: true,
        dispute,
      };
    }),
});
