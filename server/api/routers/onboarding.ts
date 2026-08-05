import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../../_core/trpc";
import { stakeholderOnboarding } from "../../../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { paginatedQuery } from "../../db-helpers";
import { requireDb } from "../../db";
import {
  activateStakeholder,
  applyPermifyPolicies,
  initiateOnboarding,
  provisionKeycloakUser,
} from "../../stakeholderOnboardingService";

type JourneyStep = {
  id: string;
  title: string;
  status: "complete" | "current" | "blocked" | "information";
  description: string;
  owner: "participant" | "administrator" | "verifier" | "training_team";
  href?: string;
};

function launchForRole(role: string) {
  const normalized = role.toLowerCase();
  if (normalized.includes("surveyor") || normalized.includes("inspector")) return { href: "/field-survey-operations", label: "Open field work", description: "Review your assigned inspection or governed evidence work." };
  if (normalized.includes("registrar")) return { href: "/registry-operations-cloud", label: "Open registry operations", description: "Review accountable service cases within your institution." };
  if (normalized.includes("admin")) return { href: "/admin/stakeholder-onboarding", label: "Open activation management", description: "Review participant readiness and authorized activation work." };
  if (normalized.includes("lender") || normalized.includes("loan")) return { href: "/lender-collateral-control", label: "Open collateral control", description: "Review lender cases within the responsible organization." };
  if (normalized.includes("legal") || normalized.includes("convey")) return { href: "/conveyancing-workspace", label: "Open conveyancing workspace", description: "Open or review a governed legal matter." };
  if (normalized.includes("assessor") || normalized.includes("tax")) return { href: "/valuation-tax-operations", label: "Open assessment operations", description: "Review factual evidence and accountable assessment work." };
  return { href: "/commercial-portfolio", label: "Choose your workspace", description: "Start in the product workspace that matches your approved responsibility." };
}

function buildJourney(record: typeof stakeholderOnboarding.$inferSelect | null, fallbackRole: string): { role: string; status: string; steps: JourneyStep[]; next: { title: string; description: string; owner: JourneyStep["owner"]; href?: string; actionLabel?: string }; launch: ReturnType<typeof launchForRole> } {
  const role = record?.role ?? fallbackRole ?? "participant";
  const launch = launchForRole(role);
  if (!record) {
    return {
      role,
      status: "workspace_ready",
      steps: [{ id: "workspace", title: "Workspace access", status: "information", description: "No managed invitation is attached to this account. Your existing role determines the workspaces available to you.", owner: "administrator" }],
      next: { title: "Choose your approved workspace", description: "Open the workspace that matches your responsibility. If access is missing, ask an authorized administrator to update your role.", owner: "administrator", href: launch.href, actionLabel: launch.label },
      launch,
    };
  }

  const identityComplete = record.ninVerified && record.documentsVerified;
  const active = record.onboardingStatus === "active";
  const steps: JourneyStep[] = [
    { id: "invitation", title: "Invitation and role", status: "complete", description: `Your ${record.sector.replaceAll("_", " ")} role is recorded as ${record.role.replaceAll("_", " ")}.`, owner: "administrator" },
    { id: "secure_access", title: "Secure account", status: record.keycloakUserId ? "complete" : "blocked", description: record.keycloakUserId ? "Secure account provisioning is complete." : "Secure account provisioning is waiting for an authorized administrator.", owner: "administrator" },
    { id: "access_policy", title: "Workspace access", status: record.permifyPoliciesApplied ? "complete" : record.keycloakUserId ? "current" : "blocked", description: record.permifyPoliciesApplied ? "Your access policy is synchronized." : "The platform is applying your approved access policy after secure-account setup.", owner: "administrator" },
    { id: "identity", title: "Identity and documents", status: identityComplete ? "complete" : record.permifyPoliciesApplied ? "current" : "blocked", description: identityComplete ? "Required identity and document checks are complete." : "Identity and document verification must complete before activation.", owner: identityComplete ? "verifier" : "participant", href: !record.ninVerified ? "/identity-verification" : undefined },
    { id: "training", title: "Training and support", status: record.trainingCompleted ? "complete" : "information", description: record.trainingCompleted ? "Required training is recorded as complete." : "Use the support center for role-specific guidance before your first governed task.", owner: "training_team", href: "/training-support-center" },
    { id: "first_task", title: "First governed task", status: active ? "current" : "blocked", description: active ? launch.description : "This step unlocks after the activation prerequisites are complete and an authorized administrator activates your participation.", owner: active ? "participant" : "administrator", href: active ? launch.href : undefined },
  ];

  if (active) return { role, status: record.onboardingStatus, steps, next: { title: launch.label, description: launch.description, owner: "participant", href: launch.href, actionLabel: launch.label }, launch };
  if (!record.keycloakUserId) return { role, status: record.onboardingStatus, steps, next: { title: "Wait for secure account setup", description: "An authorized administrator must provision your secure account before access policies can be applied.", owner: "administrator" }, launch };
  if (!record.permifyPoliciesApplied) return { role, status: record.onboardingStatus, steps, next: { title: "Wait for workspace access", description: "An authorized administrator is applying the approved workspace policy for your role.", owner: "administrator" }, launch };
  if (!record.ninVerified) return { role, status: record.onboardingStatus, steps, next: { title: "Complete identity verification", description: "Confirm the required identity information through the approved verification flow.", owner: "participant", href: "/identity-verification", actionLabel: "Verify identity" }, launch };
  if (!record.documentsVerified) return { role, status: record.onboardingStatus, steps, next: { title: "Submit or await document verification", description: "An authorized verifier must confirm the required documents before activation. Use support if you do not know which document is required.", owner: "verifier", href: "/training-support-center", actionLabel: "Open support" }, launch };
  return { role, status: record.onboardingStatus, steps, next: { title: "Activation review", description: "Your prerequisites are complete. An authorized administrator can now activate your participant record.", owner: "administrator" }, launch };
}

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
  getMyJourney: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const record = await db
      .select()
      .from(stakeholderOnboarding)
      .where(eq(stakeholderOnboarding.userId, ctx.user.id))
      .orderBy(desc(stakeholderOnboarding.updatedAt))
      .limit(1);
    return buildJourney(record[0] ?? null, ctx.user.role ?? "participant");
  }),

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
