import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc";
import { oilGasBlocks, petroleumLicenses, oilProductionMetering } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { paginatedQuery } from "../../db-helpers";
import { requireDb } from "../../db";

export const oilGasRouter = router({
  listBlocks: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: oilGasBlocks, limit: input.limit, page: input.page });
    }),
  listLicenses: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: petroleumLicenses, limit: input.limit, page: input.page });
    }),
  reportMetering: protectedProcedure
    .input(z.object({
      licenseId: z.number(),
      wellId: z.string(),
      barrelsProduced: z.number(),
      gasFlaredMcf: z.number().default(0),
      timestamp: z.date()
    }))
    .mutation(async ({ ctx, input }: { ctx: any; input: any }) => {
      const db = await requireDb();
      const result = await db.insert(oilProductionMetering).values({
        licenseId: input.licenseId,
        wellId: input.wellId,
        barrelsProduced: input.barrelsProduced.toString(),
        gasFlaredMcf: input.gasFlaredMcf.toString(),
        timestamp: input.timestamp,
        reportedBy: ctx.user.id,
        royaltyAmountUsd: 0
      }).returning();
      return result[0];
    }),
});
