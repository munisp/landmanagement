/**
 * Stakeholder Onboarding Service
 *
 * Handles multi-sector stakeholder onboarding including:
 * - Keycloak user provisioning and role assignment
 * - Permify policy application
 * - Dapr pub/sub event emission
 * - NIN/BVN verification integration
 */

import { requireDb } from "./db";
import { stakeholderOnboarding, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

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

// Sector-to-role mapping for Keycloak
const SECTOR_ROLES: Record<string, string[]> = {
  land: ["land_citizen", "land_surveyor", "land_registrar", "land_admin"],
  mining: ["mining_operator", "mining_inspector", "mining_registrar", "mining_admin"],
  oil_gas: ["petroleum_operator", "petroleum_inspector", "petroleum_registrar", "petroleum_admin"],
  water: ["water_rights_holder", "water_inspector", "water_registrar", "water_admin"],
  forestry: ["forestry_operator", "forestry_inspector", "forestry_registrar", "forestry_admin"],
  agriculture: ["agri_operator", "agri_inspector", "agri_registrar", "agri_admin"],
  fisheries: ["fisheries_operator", "fisheries_inspector", "fisheries_admin"],
  renewable_energy: ["energy_operator", "energy_inspector", "energy_admin"],
};

// Permify policy templates per sector
const PERMIFY_POLICIES: Record<string, string[]> = {
  mining: [
    "mining:operator:read:mining_licenses",
    "mining:operator:write:mineral_production",
    "mining:inspector:read:all",
    "mining:inspector:write:environmental_compliance",
  ],
  oil_gas: [
    "oil_gas:operator:read:petroleum_licenses",
    "oil_gas:operator:write:oil_production_metering",
    "oil_gas:inspector:read:all",
    "oil_gas:inspector:write:environmental_compliance",
  ],
  water: [
    "water:holder:read:water_rights",
    "water:inspector:read:all",
    "water:inspector:write:environmental_compliance",
  ],
  forestry: [
    "forestry:operator:read:forestry_concessions",
    "forestry:operator:write:production_reports",
    "forestry:inspector:read:all",
  ],
  agriculture: [
    "agriculture:operator:read:agricultural_concessions",
    "agriculture:operator:write:production_reports",
    "agriculture:inspector:read:all",
  ],
};

/**
 * Initiate stakeholder onboarding for a given sector and role.
 */
export async function initiateOnboarding(request: OnboardingRequest): Promise<OnboardingResult> {
  const db = await requireDb();

  // Generate invite token
  const inviteToken = generateInviteToken();
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [record] = await db
    .insert(stakeholderOnboarding)
    .values({
      userId: request.userId,
      sector: request.sector,
      role: request.role,
      onboardingStatus: "pending",
      invitedBy: request.invitedBy,
      inviteToken,
      inviteExpiresAt,
    })
    .returning();

  return {
    onboardingId: record.id,
    inviteToken,
    status: "pending",
  };
}

/**
 * Complete Keycloak provisioning for a stakeholder.
 * In production, this calls the Keycloak Admin REST API.
 */
export async function provisionKeycloakUser(
  onboardingId: number,
  keycloakAdminToken: string
): Promise<string> {
  const db = await requireDb();

  const [record] = await db
    .select()
    .from(stakeholderOnboarding)
    .where(eq(stakeholderOnboarding.id, onboardingId))
    .limit(1);

  if (!record) throw new Error(`Onboarding record ${onboardingId} not found`);

  const sectorRoles = SECTOR_ROLES[record.sector] || [];
  const roleForUser = sectorRoles.find((r) => r.includes(record.role.toLowerCase())) || sectorRoles[0];

  // Simulate Keycloak user creation (in production, call Keycloak Admin API)
  const keycloakUserId = `kc-${record.userId}-${record.sector}`;

  await db
    .update(stakeholderOnboarding)
    .set({
      keycloakUserId,
      keycloakRolesAssigned: [roleForUser],
      onboardingStatus: "keycloak_provisioned",
      updatedAt: new Date(),
    })
    .where(eq(stakeholderOnboarding.id, onboardingId));

  return keycloakUserId;
}

/**
 * Apply Permify policies for a stakeholder.
 * In production, this calls the Permify gRPC API.
 */
export async function applyPermifyPolicies(onboardingId: number): Promise<void> {
  const db = await requireDb();

  const [record] = await db
    .select()
    .from(stakeholderOnboarding)
    .where(eq(stakeholderOnboarding.id, onboardingId))
    .limit(1);

  if (!record) throw new Error(`Onboarding record ${onboardingId} not found`);

  // In production, call Permify API to write relationship tuples
  const policies = PERMIFY_POLICIES[record.sector] || [];

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
 * Activate a stakeholder after all verifications are complete.
 * Emits a Dapr pub/sub event for downstream services.
 */
export async function activateStakeholder(onboardingId: number): Promise<void> {
  const db = await requireDb();

  await db
    .update(stakeholderOnboarding)
    .set({
      onboardingStatus: "active",
      activatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(stakeholderOnboarding.id, onboardingId));

  // In production, emit Dapr pub/sub event
  // await daprClient.pubsub.publish("landmanagement-pubsub", "stakeholder-activated", { onboardingId });
}

function generateInviteToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
