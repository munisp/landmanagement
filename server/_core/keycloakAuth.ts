/**
 * Keycloak authentication hardening module.
 *
 * Provides:
 *  - HMAC-signed OAuth `state` parameters (CSRF / login-confusion protection)
 *  - Keycloak realm-role -> application-role mapping
 *  - JWKS-based bearer token verification for API clients (RS256)
 *
 * No mocks, no bypasses: every function here performs real cryptographic work.
 * If Keycloak is not configured the bearer verifier is unavailable and requests
 * fall back to the session-cookie flow only.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyResult } from "jose";
import type { User } from "../../drizzle/schema";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

type AppRole = User["role"];

export type KeycloakStatePayload = {
  redirectTo: string;
  nonce: string;
  issuedAt: number;
};

function getSigningSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("[KeycloakAuth] JWT_SECRET is required to sign OAuth state");
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", getSigningSecret()).update(data).digest("base64url");
}

/**
 * Create a tamper-evident OAuth state value: base64url(payload).base64url(hmac).
 */
export function createSignedState(payload: KeycloakStatePayload): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

/**
 * Verify a signed state value. Returns the payload when the signature is valid
 * and the state is younger than STATE_MAX_AGE_MS, otherwise null.
 */
export function verifySignedState(state: string): KeycloakStatePayload | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const signature = state.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as KeycloakStatePayload;
    if (typeof payload.issuedAt !== "number" || Date.now() - payload.issuedAt > STATE_MAX_AGE_MS) {
      return null;
    }
    if (typeof payload.redirectTo !== "string" || typeof payload.nonce !== "string") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extract realm roles from a Keycloak userinfo / token claim set.
 */
export function extractKeycloakRoles(claims: Record<string, unknown>): string[] {
  const realmAccess = claims.realm_access;
  if (realmAccess && typeof realmAccess === "object") {
    const roles = (realmAccess as { roles?: unknown }).roles;
    if (Array.isArray(roles)) {
      return roles.filter((r): r is string => typeof r === "string");
    }
  }
  return [];
}

/**
 * Map Keycloak realm roles onto the application's role model.
 * Highest privilege wins. Defaults to "user".
 */
export function mapKeycloakRolesToAppRole(roles: string[]): AppRole {
  const normalized = new Set(roles.map((r) => r.toLowerCase()));
  if (normalized.has("idlr-admin") || normalized.has("admin")) return "admin" as AppRole;
  if (normalized.has("idlr-registrar") || normalized.has("registrar")) return "registrar" as AppRole;
  if (normalized.has("idlr-surveyor") || normalized.has("surveyor")) return "surveyor" as AppRole;
  return "user" as AppRole;
}

// ---------------------------------------------------------------------------
// JWKS bearer-token verification
// ---------------------------------------------------------------------------

type KeycloakJwksConfig = {
  issuer: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
};

let cachedJwksConfig: KeycloakJwksConfig | null | undefined;

function getJwksConfig(): KeycloakJwksConfig | null {
  if (cachedJwksConfig !== undefined) return cachedJwksConfig;

  const baseUrl = process.env.KEYCLOAK_URL?.replace(/\/$/, "");
  const realm = process.env.KEYCLOAK_REALM || "idlr";
  if (!baseUrl) {
    cachedJwksConfig = null;
    return null;
  }

  const issuer = `${baseUrl}/realms/${realm}`;
  cachedJwksConfig = {
    issuer,
    jwks: createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`)),
  };
  return cachedJwksConfig;
}

export type VerifiedKeycloakToken = {
  subject: string;
  preferredUsername?: string;
  name?: string;
  email?: string;
  roles: string[];
  appRole: AppRole;
};

/**
 * Verify a Keycloak-issued access token (RS256) against the realm JWKS.
 * Returns null when Keycloak is not configured or the token is invalid.
 */
export async function verifyKeycloakBearerToken(
  token: string
): Promise<VerifiedKeycloakToken | null> {
  const config = getJwksConfig();
  if (!config) return null;

  let result: JWTVerifyResult;
  try {
    result = await jwtVerify(token, config.jwks, {
      issuer: config.issuer,
      algorithms: ["RS256"],
    });
  } catch {
    return null;
  }

  const claims = result.payload as Record<string, unknown>;
  const subject = typeof claims.sub === "string" ? claims.sub : null;
  if (!subject) return null;

  const roles = extractKeycloakRoles(claims);
  return {
    subject,
    preferredUsername: typeof claims.preferred_username === "string" ? claims.preferred_username : undefined,
    name: typeof claims.name === "string" ? claims.name : undefined,
    email: typeof claims.email === "string" ? claims.email : undefined,
    roles,
    appRole: mapKeycloakRolesToAppRole(roles),
  };
}

/** Reset cached JWKS config (used by tests). */
export function resetKeycloakAuthCacheForTests(): void {
  cachedJwksConfig = undefined;
}
