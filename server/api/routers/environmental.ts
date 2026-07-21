import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc";
import { environmentalCompliance } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { paginatedQuery } from "../../db-helpers";
import { requireDb } from "../../db";

export const environmentalRouter = router({
  listComplianceRecords: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: environmentalCompliance, limit: input.limit, page: input.page });
    }),
  getComplianceRecord: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }: { input: { id: number } }) => {
      const db = await requireDb();
      const result = await db.select().from(environmentalCompliance).where(eq(environmentalCompliance.id, input.id)).limit(1);
      return result[0] || null;
    }),
});
