import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { eventOutbox, stakeholderOnboarding, users } from "../drizzle/schema";
import { provisionKeycloakUser as provisionKeycloakSubject } from "./keycloakAdminService";
import { requireDb } from "./db";
import { synchronizePlatformRole } from "./permifyService";

export interface OnboardingRequest {
  userId: number;
  sector: "land" | "mining" | "oil_gas" | "water" | "forestry" | "agriculture" | "fisheries" | "renewable_energy";
  role: string;
  invitedBy?: number;
}

export interface OnboardingResult {
  onboardingId: number;
  inviteToken: string;
  keycloakUserId?: string;
  status: string;
}

const SECTOR_ROLES: Record<OnboardingRequest["sector"], readonly string[]> = {
  land: ["land_citizen", "land_surveyor", "land_registrar", "land_admin"],
  mining: ["mining_operator", "mining_inspector", "mining_registrar", "mining_admin"],
  oil_gas: ["petroleum_operator", "petroleum_inspector", "petroleum_registrar", "petroleum_admin"],
  water: ["water_rights_holder", "water_inspector", "water_registrar", "water_admin"],
  forestry: ["forestry_operator", "forestry_inspector", "forestry_registrar", "forestry_admin"],
  agriculture: ["agri_operator", "agri_inspector", "agri_registrar", "agri_admin"],
  fisheries: ["fisheries_operator", "fisheries_inspector", "fisheries_admin"],
  renewable_energy: ["energy_operator", "energy_inspector", "energy_admin"],
};

function resolveSectorRole(sector: OnboardingRequest["sector"], inputRole: string): string {
  const requested = inputRole.trim().toLowerCase();
  const roles = SECTOR_ROLES[sector];
  const matched = roles.find((role) => role === requested || role.endsWith(`_${requested}`));
  if (!matched) {
    throw new Error(`Role ${inputRole} is not permitted for the ${sector} sector`);
  }
  return matched;
}

function appRoleForSectorRole(role: string): "user" | "surveyor" | "registrar" | "admin" {
  if (role.endsWith("_admin")) return "admin";
  if (role.includes("registrar")) return "registrar";
  if (role.includes("surveyor") || role.includes("inspector")) return "surveyor";
  return "user";
}

async function getOnboardingWithUser(onboardingId: number) {
  const db = await requireDb();
  const rows = await db
    .select({ onboarding: stakeholderOnboarding, user: users })
    .from(stakeholderOnboarding)
    .innerJoin(users, eq(stakeholderOnboarding.userId, users.id))
    .where(eq(stakeholderOnboarding.id, onboardingId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`Onboarding record ${onboardingId} was not found`);
  return { db, ...row };
}

/** Create a pending, cryptographically random stakeholder invitation. */
export async function initiateOnboarding(request: OnboardingRequest): Promise<OnboardingResult> {
  const db = await requireDb();
  const role = resolveSectorRole(request.sector, request.role);
  const user = await db.select().from(users).where(eq(users.id, request.userId)).limit(1);
  if (!user[0]) throw new Error(`User ${request.userId} was not found`);

  const inviteToken = randomBytes(32).toString("base64url");
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [record] = await db
    .insert(stakeholderOnboarding)
    .values({
      userId: request.userId,
      sector: request.sector,
      role,
      onboardingStatus: "pending",
      invitedBy: request.invitedBy ?? null,
      inviteToken,
      inviteExpiresAt,
    })
    .returning();

  return { onboardingId: record.id, inviteToken, status: record.onboardingStatus };
}

/** Provision a real Keycloak subject and assign the validated sector role. */
export async function provisionKeycloakUser(onboardingId: number): Promise<string> {
  const { db, onboarding, user } = await getOnboardingWithUser(onboardingId);
  const sectorRole = resolveSectorRole(onboarding.sector, onboarding.role);
  const result = await provisionKeycloakSubject({
    user,
    realmRoles: [sectorRole],
    requirePasswordSetup: true,
  });

  await db
    .update(stakeholderOnboarding)
    .set({
      keycloakUserId: result.keycloakUserId,
      keycloakRolesAssigned: result.assignedRoles,
      onboardingStatus: "keycloak_provisioned",
      updatedAt: new Date(),
    })
    .where(eq(stakeholderOnboarding.id, onboardingId));

  return result.keycloakUserId;
}

/** Synchronize the effective application role into the versioned Permify model. */
export async function applyPermifyPolicies(onboardingId: number): Promise<void> {
  const { db, onboarding, user } = await getOnboardingWithUser(onboardingId);
  if (!onboarding.keycloakUserId) {
    throw new Error("Keycloak provisioning must complete before Permify policy synchronization");
  }

  const role = appRoleForSectorRole(resolveSectorRole(onboarding.sector, onboarding.role));
  const [updatedUser] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();
  if (!updatedUser) throw new Error(`User ${user.id} could not be updated for authorization synchronization`);

  await synchronizePlatformRole(updatedUser);
  await db
    .update(stakeholderOnboarding)
    .set({
      permifyPoliciesApplied: true,
      onboardingStatus: "policies_applied",
      updatedAt: new Date(),
    })
    .where(eq(stakeholderOnboarding.id, onboardingId));
}

/**
 * Activate a stakeholder only after verified prerequisites, then atomically
 * enqueue the downstream event for the Dapr pub/sub worker.
 */
export async function activateStakeholder(onboardingId: number): Promise<void> {
  const { db, onboarding } = await getOnboardingWithUser(onboardingId);
  if (!onboarding.keycloakUserId || !onboarding.permifyPoliciesApplied) {
    throw new Error("Keycloak provisioning and Permify policy synchronization are required before activation");
  }
  if (!onboarding.ninVerified || !onboarding.documentsVerified) {
    throw new Error("Identity and document verification must complete before stakeholder activation");
  }
  if (onboarding.inviteExpiresAt && onboarding.inviteExpiresAt < new Date()) {
    throw new Error("The stakeholder invitation has expired and must be reissued");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(stakeholderOnboarding)
      .set({ onboardingStatus: "active", activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(stakeholderOnboarding.id, onboardingId));

    await tx.insert(eventOutbox).values({
      backend: "dapr_pubsub",
      topic: "stakeholder-activated",
      eventType: "stakeholder.activated.v1",
      aggregateType: "stakeholder_onboarding",
      aggregateId: String(onboardingId),
      partitionKey: String(onboarding.userId),
      payload: {
        onboardingId,
        userId: onboarding.userId,
        sector: onboarding.sector,
        role: onboarding.role,
        keycloakUserId: onboarding.keycloakUserId,
        activatedAt: new Date().toISOString(),
      },
      headers: { "ce-type": "stakeholder.activated.v1", "content-type": "application/json" },
      deliveryStatus: "pending",
      availableAt: new Date(),
    });
  });
}
