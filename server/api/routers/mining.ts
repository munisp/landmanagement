import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc";
import { miningLicenses, mineralProduction } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { paginatedQuery } from "../../db-helpers";
import { requireDb } from "../../db";

export const miningRouter = router({
  listLicenses: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: miningLicenses, limit: input.limit, page: input.page });
    }),
  getLicense: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }: { input: { id: number } }) => {
      const db = await requireDb();
      const result = await db.select().from(miningLicenses).where(eq(miningLicenses.id, input.id)).limit(1);
      return result[0] || null;
    }),
  reportProduction: protectedProcedure
    .input(z.object({
      licenseId: z.number(),
      mineralType: z.string(),
      volumeExtracted: z.number(),
      unit: z.string().default("tonnes"),
      productionDate: z.date()
    }))
    .mutation(async ({ ctx, input }: { ctx: any; input: any }) => {
      const db = await requireDb();
      const result = await db.insert(mineralProduction).values({
        licenseId: input.licenseId,
        mineralType: input.mineralType,
        volumeExtracted: input.volumeExtracted.toString(),
        unit: input.unit,
        productionDate: input.productionDate,
        reportedBy: ctx.user.id,
        royaltyAmountNgn: 0
      }).returning();
      return result[0];
    }),
});
