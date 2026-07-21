import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc";
import { cofOApplications, cofOStageLog } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { paginatedQuery } from "../../db-helpers";
import { requireDb } from "../../db";

export const cofoWorkflowRouter = router({
  listApplications: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: cofOApplications, limit: input.limit, page: input.page });
    }),
  getApplication: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }: { input: { id: number } }) => {
      const db = await requireDb();
      const result = await db.select().from(cofOApplications).where(eq(cofOApplications.id, input.id)).limit(1);
      return result[0] || null;
    }),
  getStageLogs: protectedProcedure
    .input(z.object({ applicationId: z.number() }))
    .query(async ({ input }: { input: { applicationId: number } }) => {
      const db = await requireDb();
      return db.select().from(cofOStageLog).where(eq(cofOStageLog.applicationId, input.applicationId));
    }),
});
