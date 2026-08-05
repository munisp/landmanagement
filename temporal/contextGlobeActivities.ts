import { Context } from "@temporalio/activity";

type ContextLayerStatus = {
  layer_key: "seismic" | "weather-alerts";
  enabled: boolean;
  quality_state: "verified" | "degraded" | "rejected" | null;
  http_status: number | null;
  completed_at: string | null;
};

type ContextStatusResponse = {
  service: "context-globe-ingestion";
  status: "ready" | "degraded";
  observedAt: string;
  layers: ContextLayerStatus[];
};

function requiredConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for Context Globe Temporal reconciliation`);
  return value;
}

function lakehouseStatusUrl(): string {
  const raw = requiredConfig("LAKEHOUSE_API_URL");
  const parsed = new URL(raw);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("LAKEHOUSE_API_URL must be a credential-free HTTP(S) base URL");
  }
  parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/context-globe/status`;
  return parsed.toString();
}

function isContextStatus(value: unknown): value is ContextStatusResponse {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  if (status.service !== "context-globe-ingestion" || !["ready", "degraded"].includes(String(status.status)) || typeof status.observedAt !== "string" || !Array.isArray(status.layers)) return false;
  return status.layers.every((layer) => {
    if (!layer || typeof layer !== "object") return false;
    const record = layer as Record<string, unknown>;
    return ["seismic", "weather-alerts"].includes(String(record.layer_key)) && typeof record.enabled === "boolean";
  });
}

export async function reconcileContextGlobe(): Promise<{ observedAt: string; layerCount: number }> {
  const response = await fetch(lakehouseStatusUrl(), {
    headers: { Accept: "application/json", "X-Lakehouse-Api-Key": requiredConfig("LAKEHOUSE_API_KEY") },
    signal: AbortSignal.timeout(Number(process.env.CONTEXT_TEMPORAL_STATUS_TIMEOUT_MS || 10_000)),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !isContextStatus(payload)) throw new Error("Context Globe Lakehouse status endpoint is unavailable or returned an invalid contract");
  const enabled = payload.layers.filter((layer) => layer.enabled);
  const unhealthy = enabled.filter((layer) => layer.quality_state !== "verified" || layer.http_status === null || !layer.completed_at);
  if (payload.status !== "ready" || unhealthy.length) {
    throw new Error(`Context Globe reconciliation found ${unhealthy.length || enabled.length} unhealthy enabled layer(s)`);
  }
  Context.current().log.info("Context Globe ingestion reconciliation succeeded", { observedAt: payload.observedAt, layers: enabled.map((layer) => layer.layer_key) });
  return { observedAt: payload.observedAt, layerCount: enabled.length };
}
