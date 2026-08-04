import { Platform } from "react-native";

function requiredPublicEnv(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured for the native IDLR application`);
  }
  return value;
}

function normalizeUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL`);
  }
  if (url.protocol !== "https:" && !(Platform.OS === "web" && url.protocol === "http:")) {
    throw new Error(`${name} must use HTTPS outside web development`);
  }
  return url.toString().replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  return normalizeUrl(requiredPublicEnv("EXPO_PUBLIC_API_URL"), "EXPO_PUBLIC_API_URL");
}

export function getKeycloakIssuer(): string {
  const base = normalizeUrl(requiredPublicEnv("EXPO_PUBLIC_KEYCLOAK_URL"), "EXPO_PUBLIC_KEYCLOAK_URL");
  const realm = requiredPublicEnv("EXPO_PUBLIC_KEYCLOAK_REALM").replace(/^\/+|\/+$/g, "");
  return `${base}/realms/${encodeURIComponent(realm)}`;
}

export function getKeycloakClientId(): string {
  return requiredPublicEnv("EXPO_PUBLIC_KEYCLOAK_CLIENT_ID");
}

export function getKeycloakScopes(): string[] {
  const raw = process.env.EXPO_PUBLIC_KEYCLOAK_SCOPES?.trim();
  return raw ? raw.split(/[\s,]+/).filter(Boolean) : ["openid", "profile", "email"];
}

export function getOptionalGeoAiMapTileUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_GEOAI_MAP_TILE_URL?.trim();
  return configured ? normalizeUrl(configured, "EXPO_PUBLIC_GEOAI_MAP_TILE_URL") : null;
}
