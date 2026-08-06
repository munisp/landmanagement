import { verifyKeycloakAdminReadiness } from "./keycloakAdminService";
import { verifyPermifyReadiness } from "./permifyService";
import { getTemporalOrchestrationReadiness } from "./temporalClient";

export type IntegrationReadinessState = "ready" | "not_ready";

export type IntegrationReadinessCheck = {
  name: "keycloak" | "permify" | "identity_verification" | "document_verification" | "dapr" | "temporal" | "stakeholder_journeys";
  state: IntegrationReadinessState;
  detail: string;
};

const REQUIRED_KEYCLOAK_ROLES = [
  "user", "surveyor", "registrar", "admin",
  "land_citizen", "land_surveyor", "land_registrar", "land_admin",
  "mining_operator", "mining_inspector", "mining_registrar", "mining_admin",
  "petroleum_operator", "petroleum_inspector", "petroleum_registrar", "petroleum_admin",
  "water_rights_holder", "water_inspector", "water_registrar", "water_admin",
  "forestry_operator", "forestry_inspector", "forestry_registrar", "forestry_admin",
  "agri_operator", "agri_inspector", "agri_registrar", "agri_admin",
  "fisheries_operator", "fisheries_inspector", "fisheries_admin",
  "energy_operator", "energy_inspector", "energy_admin",
] as const;

function configured(...keys: string[]): string[] {
  return keys.filter((key) => !process.env[key]?.trim());
}

async function getJson(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    const text = await response.text();
    let payload: unknown = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeKeycloak(): Promise<IntegrationReadinessCheck> {
  const missing = configured("KEYCLOAK_URL", "KEYCLOAK_REALM", "KEYCLOAK_ADMIN_REALM", "KEYCLOAK_ADMIN_CLIENT_ID", "KEYCLOAK_ADMIN_CLIENT_SECRET");
  if (missing.length) return { name: "keycloak", state: "not_ready", detail: `Missing ${missing.join(", ")}` };
  if (process.env.KEYCLOAK_ADMIN_REALM !== process.env.KEYCLOAK_REALM) {
    return { name: "keycloak", state: "not_ready", detail: "The provisioning client must be confined to KEYCLOAK_REALM" };
  }
  const baseUrl = process.env.KEYCLOAK_URL!.replace(/\/$/, "");
  try {
    const discovery = await getJson(`${baseUrl}/realms/${encodeURIComponent(process.env.KEYCLOAK_REALM!)}/.well-known/openid-configuration`, Number(process.env.KEYCLOAK_TIMEOUT_MS || 10_000));
    if (!discovery.ok) return { name: "keycloak", state: "not_ready", detail: `OIDC discovery returned ${discovery.status}` };
    const result = await verifyKeycloakAdminReadiness(REQUIRED_KEYCLOAK_ROLES);
    return { name: "keycloak", state: "ready", detail: `OIDC discovery and realm-admin role validation passed for ${result.roleCount} roles` };
  } catch (error) {
    return { name: "keycloak", state: "not_ready", detail: error instanceof Error ? error.message : "Keycloak readiness probe failed" };
  }
}

async function probePermify(): Promise<IntegrationReadinessCheck> {
  const missing = configured("PERMIFY_URL", "PERMIFY_TENANT_ID");
  if (missing.length) return { name: "permify", state: "not_ready", detail: `Missing ${missing.join(", ")}` };
  try {
    const result = await verifyPermifyReadiness();
    return { name: "permify", state: "ready", detail: `Authorization schema ${result.schemaVersion} is published for the configured tenant` };
  } catch (error) {
    return { name: "permify", state: "not_ready", detail: error instanceof Error ? error.message : "Permify readiness probe failed" };
  }
}

async function probePrivateVerifier(name: "identity_verification" | "document_verification", urlVariable: string): Promise<IntegrationReadinessCheck> {
  const baseUrl = process.env[urlVariable]?.replace(/\/$/, "");
  if (!baseUrl) return { name, state: "not_ready", detail: `Missing ${urlVariable}` };
  try {
    const result = await getJson(`${baseUrl}/health`, Number(process.env.VERIFICATION_SERVICE_TIMEOUT_MS || 10_000));
    return result.ok
      ? { name, state: "ready", detail: "Private verifier health endpoint passed" }
      : { name, state: "not_ready", detail: `Verifier health endpoint returned ${result.status}` };
  } catch (error) {
    return { name, state: "not_ready", detail: error instanceof Error ? error.message : "Verifier readiness probe failed" };
  }
}

async function probeDapr(): Promise<IntegrationReadinessCheck> {
  const missing = configured("DAPR_HTTP_URL", "DAPR_PUBSUB_NAME", "DAPR_STATE_STORE");
  if (missing.length) return { name: "dapr", state: "not_ready", detail: `Missing ${missing.join(", ")}` };
  const baseUrl = process.env.DAPR_HTTP_URL!.replace(/\/$/, "");
  try {
    const health = await getJson(`${baseUrl}/v1.0/healthz`, 5_000);
    if (!health.ok) return { name: "dapr", state: "not_ready", detail: `Dapr health endpoint returned ${health.status}` };
    const metadata = await getJson(`${baseUrl}/v1.0/metadata`, 5_000);
    const components = Array.isArray((metadata.payload as { components?: unknown[] } | null)?.components)
      ? ((metadata.payload as { components: Array<{ name?: string }> }).components)
      : [];
    const names = new Set(components.map((component) => component.name));
    const missingComponents = [process.env.DAPR_PUBSUB_NAME!, process.env.DAPR_STATE_STORE!].filter((name) => !names.has(name));
    return missingComponents.length
      ? { name: "dapr", state: "not_ready", detail: `Configured components unavailable: ${missingComponents.join(", ")}` }
      : { name: "dapr", state: "ready", detail: "Sidecar, pub/sub component, and state store are available" };
  } catch (error) {
    return { name: "dapr", state: "not_ready", detail: error instanceof Error ? error.message : "Dapr readiness probe failed" };
  }
}

async function probeStakeholderJourneys(): Promise<IntegrationReadinessCheck> {
  const missing = configured(
    "TEMPORAL_STAKEHOLDER_JOURNEY_TASK_QUEUE",
    "PORTFOLIO_INTEGRATION_GATEWAY_URL",
    "PORTFOLIO_INTEGRATION_SECRET",
    "PORTFOLIO_SPATIAL_ENGINE_URL",
    "PORTFOLIO_SPATIAL_ENGINE_SECRET",
    "LAKEHOUSE_PORTFOLIO_ANALYTICS_URL",
    "LAKEHOUSE_INTERNAL_TOKEN",
  );
  if (missing.length) return { name: "stakeholder_journeys", state: "not_ready", detail: `Missing ${missing.join(", ")}` };
  try {
    const temporal = await getTemporalOrchestrationReadiness();
    const [gateway, spatial, lakehouse] = await Promise.all([
      getJson(`${process.env.PORTFOLIO_INTEGRATION_GATEWAY_URL!.replace(/\/$/, "")}/ready`, 5_000),
      getJson(`${process.env.PORTFOLIO_SPATIAL_ENGINE_URL!.replace(/\/$/, "")}/ready`, 5_000),
      getJson(`${process.env.LAKEHOUSE_PORTFOLIO_ANALYTICS_URL!.replace(/\/$/, "")}/health`, 5_000),
    ]);
    if (!gateway.ok || !spatial.ok || !lakehouse.ok) return { name: "stakeholder_journeys", state: "not_ready", detail: "One or more journey middleware readiness probes failed" };
    return { name: "stakeholder_journeys", state: "ready", detail: `Temporal namespace ${temporal.namespace}, journey queue, Go gateway, Rust spatial engine, and Python Lakehouse are reachable` };
  } catch (error) {
    return { name: "stakeholder_journeys", state: "not_ready", detail: error instanceof Error ? error.message : "Stakeholder journey readiness probe failed" };
  }
}

function probeTemporal(): IntegrationReadinessCheck {
  const missing = configured("TEMPORAL_ADDRESS", "TEMPORAL_NAMESPACE", "TEMPORAL_PROPERTY_TRANSACTION_TASK_QUEUE");
  return missing.length
    ? { name: "temporal", state: "not_ready", detail: `Missing ${missing.join(", ")}` }
    : { name: "temporal", state: "ready", detail: "Temporal connection and primary task queue are configured; worker execution must be verified by deployment health checks" };
}

export async function runIntegrationReadinessPreflight() {
  const checks = await Promise.all([
    probeKeycloak(),
    probePermify(),
    probePrivateVerifier("identity_verification", "IDENTITY_SERVICE_URL"),
    probePrivateVerifier("document_verification", "DOCUMENT_VERIFICATION_SERVICE_URL"),
    probeDapr(),
    Promise.resolve(probeTemporal()),
    probeStakeholderJourneys(),
  ]);
  return { generatedAt: new Date().toISOString(), ready: checks.every((check) => check.state === "ready"), checks };
}
