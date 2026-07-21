import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc";
import { stakeholderOnboarding } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { paginatedQuery } from "../../db-helpers";
import { requireDb } from "../../db";

export const onboardingRouter = router({
  listOnboardingRecords: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: stakeholderOnboarding, limit: input.limit, page: input.page });
    }),
  getOnboardingRecord: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }: { input: { id: number } }) => {
      const db = await requireDb();
      const result = await db.select().from(stakeholderOnboarding).where(eq(stakeholderOnboarding.id, input.id)).limit(1);
      return result[0] || null;
    }),
});
