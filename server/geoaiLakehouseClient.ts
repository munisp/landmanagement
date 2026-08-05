type JsonRecord = Record<string, unknown>;

function getConfig() {
  const baseUrl = process.env.LAKEHOUSE_API_URL?.trim().replace(/\/$/, "");
  const apiKey = process.env.LAKEHOUSE_API_KEY?.trim();
  if (!baseUrl) throw new Error("LAKEHOUSE_API_URL must be configured for GeoAI processing");
  if (!apiKey) throw new Error("LAKEHOUSE_API_KEY must be configured for GeoAI processing");
  return { baseUrl, apiKey };
}

async function postGeoAi<T extends JsonRecord>(path: string, payload: JsonRecord): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.GEOAI_LAKEHOUSE_TIMEOUT_MS || 120000));
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Lakehouse-Api-Key": apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.text();
    let parsed: unknown = body;
    try { parsed = body ? JSON.parse(body) : {}; } catch { /* preserve raw response */ }
    if (!response.ok) {
      const detail = typeof parsed === "object" && parsed !== null && "detail" in parsed
        ? JSON.stringify((parsed as JsonRecord).detail)
        : String(parsed);
      throw new Error(`Lakehouse GeoAI ${path} failed with HTTP ${response.status}: ${detail.slice(0, 1000)}`);
    }
    if (!parsed || typeof parsed !== "object") throw new Error(`Lakehouse GeoAI ${path} returned a non-object response`);
    return parsed as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function validateSpatialGeometry(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geoai/spatial/validate", payload);
}

export function computeNetworkAccessibility(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geoai/network/accessibility", payload);
}

export function inspectGeoAiImagery(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geoai/imagery/inspect", payload);
}

export function performGeoAiChangeDetection(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geoai/imagery/change-detection", payload);
}

export function inspectGeoAiLidar(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geoai/lidar/inspect", payload);
}

export function validateGeoAiModelEvidence(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geoai/models/validate-evidence", payload);
}


export function assessGeometryQuality(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/geometry/quality", payload);
}

export function buildHazardProfile(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/hazards/profile", payload);
}

export function inspectCogReadiness(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/raster/cog-readiness", payload);
}

export function validateStacCatalogItem(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/catalog/stac-validate", payload);
}

export function vectorizeChangeAlerts(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/imagery/change-vectorization", payload);
}

export function evaluateAccessibilityEquity(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/network/accessibility-equity", payload);
}

export function verifyFieldGeofence(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/field/geofence-verify", payload);
}

export function computeZonalStatistics(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/raster/zonal-statistics", payload);
}

export function preparePrivacyRelease(payload: JsonRecord) {
  return postGeoAi<JsonRecord>("/geo-innovations/privacy/release-feature", payload);
}
