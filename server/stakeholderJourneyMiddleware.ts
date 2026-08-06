import { createHmac, randomUUID } from "node:crypto";

const timeoutMs = () => {
  const value = Number.parseInt(process.env.STAKEHOLDER_JOURNEY_MIDDLEWARE_TIMEOUT_MS ?? "5000", 10);
  return Number.isFinite(value) && value >= 500 && value <= 20_000 ? value : 5000;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for stakeholder journey middleware delivery`);
  return value;
}

function requireHttps(url: string, name: string): string {
  if (process.env.NODE_ENV !== "production") return url;
  if (!url.startsWith("https://")) throw new Error(`${name} must use HTTPS in production`);
  return url;
}

async function boundedFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs()) });
}

/** Publish minimized lifecycle evidence through the Go gateway. */
export async function publishStakeholderJourneyEvent(input: {
  runKey: string;
  templateCode: string;
  eventType: "workflow.created" | "workflow.reviewed" | "workflow.closed" | "evidence.recorded";
  payload: Record<string, unknown>;
}) {
  const endpoint = requireHttps(required("PORTFOLIO_INTEGRATION_GATEWAY_URL"), "PORTFOLIO_INTEGRATION_GATEWAY_URL").replace(/\/$/, "") + "/v1/events";
  const secret = required("PORTFOLIO_INTEGRATION_SECRET");
  if (secret.length < 32) throw new Error("PORTFOLIO_INTEGRATION_SECRET must be at least 32 characters");
  const event = {
    eventKey: `JEV-${randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase()}`,
    accountKey: `JOURNEY-${input.runKey}`,
    productKey: "stakeholder-journey-engine",
    eventType: input.eventType,
    purpose: "Governed reusable stakeholder journey orchestration evidence",
    sourceReference: input.runKey,
    occurredAt: new Date().toISOString(),
    payload: { templateCode: input.templateCode, ...input.payload },
  };
  const body = JSON.stringify(event);
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const response = await boundedFetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-portfolio-timestamp": timestamp,
      "x-portfolio-signature": signature,
    },
    body,
  });
  if (!response.ok) throw new Error(`Portfolio integration gateway rejected journey event with HTTP ${response.status}`);
  return { eventKey: event.eventKey };
}

interface SpatialPoint { key: string; latitude: number; longitude: number; }

function validatePoint(value: unknown): value is SpatialPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<SpatialPoint>;
  return typeof point.key === "string" && point.key.length > 0 && point.key.length <= 96
    && typeof point.latitude === "number" && Number.isFinite(point.latitude) && point.latitude >= -90 && point.latitude <= 90
    && typeof point.longitude === "number" && Number.isFinite(point.longitude) && point.longitude >= -180 && point.longitude <= 180;
}

/** Invoke Rust only for an explicit bounded spatial request supplied by a supported template. */
export async function executeJourneySpatialRequest(input: { templateCode: string; context: Record<string, unknown> }) {
  if (!(["J10", "J14"] as const).includes(input.templateCode as "J10" | "J14")) return null;
  const request = input.context.spatialRequest;
  if (!request || typeof request !== "object") return null;
  const endpoint = requireHttps(required("PORTFOLIO_SPATIAL_ENGINE_URL"), "PORTFOLIO_SPATIAL_ENGINE_URL").replace(/\/$/, "");
  const secret = required("PORTFOLIO_SPATIAL_ENGINE_SECRET");
  if (secret.length < 32) throw new Error("PORTFOLIO_SPATIAL_ENGINE_SECRET must be at least 32 characters");

  if (input.templateCode === "J10") {
    const payload = request as { corridor?: unknown; assets?: unknown; bufferMeters?: unknown };
    if (!Array.isArray(payload.corridor) || !Array.isArray(payload.assets) || !payload.corridor.every(validatePoint) || !payload.assets.every(validatePoint) || typeof payload.bufferMeters !== "number") {
      throw new Error("J10 spatial request requires bounded corridor points, assets, and bufferMeters");
    }
    const response = await boundedFetch(`${endpoint}/v1/corridor/inspect`, { method: "POST", headers: { "content-type": "application/json", "x-portfolio-engine-key": secret }, body: JSON.stringify({ corridor: payload.corridor, assets: payload.assets, buffer_meters: payload.bufferMeters }) });
    if (!response.ok) throw new Error(`Rust spatial engine rejected corridor request with HTTP ${response.status}`);
    return { engine: "rust-portfolio-spatial-engine", result: await response.json() };
  }

  const payload = request as { assets?: unknown; events?: unknown; maxDistanceMeters?: unknown };
  if (!Array.isArray(payload.assets) || !payload.assets.every(validatePoint) || !Array.isArray(payload.events) || payload.events.length > 20_000 || typeof payload.maxDistanceMeters !== "number") {
    throw new Error("J14 spatial request requires bounded assets, events, and maxDistanceMeters");
  }
  const response = await boundedFetch(`${endpoint}/v1/exposure/summarize`, { method: "POST", headers: { "content-type": "application/json", "x-portfolio-engine-key": secret }, body: JSON.stringify({ assets: payload.assets, events: payload.events, max_distance_meters: payload.maxDistanceMeters }) });
  if (!response.ok) throw new Error(`Rust spatial engine rejected exposure request with HTTP ${response.status}`);
  return { engine: "rust-portfolio-spatial-engine", result: await response.json() };
}

/** Invoke the protected Python Lakehouse only for explicit bounded aggregate inputs. */
export async function executeJourneyLakehouseRequest(input: { templateCode: string; context: Record<string, unknown> }) {
  if (!(["J14", "J17", "J19"] as const).includes(input.templateCode as "J14" | "J17" | "J19")) return null;
  const request = input.context.lakehouseRequest;
  if (!request || typeof request !== "object") return null;
  const endpoint = requireHttps(required("LAKEHOUSE_PORTFOLIO_ANALYTICS_URL"), "LAKEHOUSE_PORTFOLIO_ANALYTICS_URL").replace(/\/$/, "");
  const token = required("LAKEHOUSE_INTERNAL_TOKEN");
  if (token.length < 32) throw new Error("LAKEHOUSE_INTERNAL_TOKEN must be at least 32 characters");
  const payload = request as { endpoint?: unknown; payload?: unknown };
  if (!(["planning-report", "exposure-summary", "usage-rollup"] as string[]).includes(String(payload.endpoint)) || !payload.payload || typeof payload.payload !== "object") {
    throw new Error("Lakehouse journey request must declare a supported bounded portfolio analytics endpoint and payload");
  }
  const response = await boundedFetch(`${endpoint}/portfolio-analytics/${payload.endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload.payload),
  });
  if (!response.ok) throw new Error(`Lakehouse portfolio analytics rejected journey request with HTTP ${response.status}`);
  return { engine: "python-lakehouse-portfolio-analytics", result: await response.json() };
}
