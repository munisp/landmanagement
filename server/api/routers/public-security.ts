import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from '../../_core/trpc';
import { getChallengeConfiguration, verifyChallengeToken } from '../../challengeVerification';

export const publicSecurityRouter = router({
  challengeConfig: publicProcedure.query(() => {
    return getChallengeConfiguration();
  }),

  verifyChallenge: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        required: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await verifyChallengeToken({
        token: input.token,
        required: input.required,
        remoteIp: ctx.req.ip,
      });

      if (!result.success && input.required) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: result.message || 'Challenge verification failed',
        });
      }

      return result;
    }),
});
