import { z } from "zod";
import { adminProcedure, router } from "../../_core/trpc";
import { stakeholderOnboarding } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import { paginatedQuery } from "../../db-helpers";
import { requireDb } from "../../db";
import {
  activateStakeholder,
  applyPermifyPolicies,
  initiateOnboarding,
  provisionKeycloakUser,
} from "../../stakeholderOnboardingService";

const sectorSchema = z.enum([
  "land",
  "mining",
  "oil_gas",
  "water",
  "forestry",
  "agriculture",
  "fisheries",
  "renewable_energy",
]);

export const onboardingRouter = router({
  listOnboardingRecords: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), page: z.number().min(1).default(1) }))
    .query(async ({ input }) => {
      return paginatedQuery({ table: stakeholderOnboarding, limit: input.limit, page: input.page });
    }),

  getOnboardingRecord: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const result = await db.select().from(stakeholderOnboarding).where(eq(stakeholderOnboarding.id, input.id)).limit(1);
      return result[0] || null;
    }),

  initiate: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      sector: sectorSchema,
      role: z.string().trim().min(3).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      return initiateOnboarding({ ...input, invitedBy: ctx.user.id });
    }),

  provisionKeycloak: adminProcedure
    .input(z.object({ onboardingId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const keycloakUserId = await provisionKeycloakUser(input.onboardingId);
      return { keycloakUserId };
    }),

  applyPolicies: adminProcedure
    .input(z.object({ onboardingId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await applyPermifyPolicies(input.onboardingId);
      return { success: true };
    }),

  activate: adminProcedure
    .input(z.object({ onboardingId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await activateStakeholder(input.onboardingId);
      return { success: true };
    }),
});
