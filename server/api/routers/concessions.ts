import { z } from "zod";
import { router, protectedProcedure } from "../../_core/trpc";
import { waterRights, agriculturalConcessions, forestryConcessions } from "../../../drizzle/schema";
import { paginatedQuery } from "../../db-helpers";

export const concessionsRouter = router({
  listWaterRights: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: waterRights, limit: input.limit, page: input.page });
    }),
  listAgriConcessions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: agriculturalConcessions, limit: input.limit, page: input.page });
    }),
  listForestryConcessions: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }: { input: { limit: number; page: number } }) => {
      return paginatedQuery({ table: forestryConcessions, limit: input.limit, page: input.page });
    }),
});
