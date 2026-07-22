import type { User } from "../drizzle/schema";

type KeycloakRole = {
  id: string;
  name: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
};

type KeycloakUser = {
  id: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  requiredActions?: string[];
};

type AdminConfig = {
  baseUrl: string;
  realm: string;
  adminRealm: string;
  clientId: string;
  clientSecret: string;
};

function getConfig(): AdminConfig {
  const baseUrl = process.env.KEYCLOAK_URL?.replace(/\/$/, "");
  const realm = process.env.KEYCLOAK_REALM?.trim();
  const adminRealm = process.env.KEYCLOAK_ADMIN_REALM?.trim();
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID?.trim();
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET?.trim();

  if (!baseUrl || !realm || !adminRealm || !clientId || !clientSecret) {
    throw new Error(
      "KEYCLOAK_URL, KEYCLOAK_REALM, KEYCLOAK_ADMIN_REALM, KEYCLOAK_ADMIN_CLIENT_ID, and KEYCLOAK_ADMIN_CLIENT_SECRET are required for Keycloak administration",
    );
  }
  return { baseUrl, realm, adminRealm, clientId, clientSecret };
}

async function getAdminToken(): Promise<string> {
  const config = getConfig();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.KEYCLOAK_TIMEOUT_MS || 10_000));
  try {
    const response = await fetch(
      `${config.baseUrl}/realms/${encodeURIComponent(config.adminRealm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal,
      },
    );
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
    if (!response.ok || !payload.access_token) {
      throw new Error(`Keycloak service-account token request failed (${response.status}): ${payload.error_description || "no access token returned"}`);
    }
    return payload.access_token;
  } finally {
    clearTimeout(timeout);
  }
}

async function adminRequest<T>(method: string, pathname: string, body?: unknown): Promise<{ payload: T; location: string | null; status: number }> {
  const config = getConfig();
  const token = await getAdminToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.KEYCLOAK_TIMEOUT_MS || 10_000));
  try {
    const response = await fetch(`${config.baseUrl}/admin/realms/${encodeURIComponent(config.realm)}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload: T = {} as T;
    if (responseText) {
      try {
        payload = JSON.parse(responseText) as T;
      } catch {
        payload = responseText as T;
      }
    }
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "errorMessage" in payload
        ? String((payload as { errorMessage?: unknown }).errorMessage)
        : responseText;
      throw new Error(`Keycloak Admin API ${method} ${pathname} failed (${response.status}): ${message || "unknown error"}`);
    }
    return { payload, location: response.headers.get("location"), status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const values = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!values.length) return {};
  return { firstName: values[0], lastName: values.slice(1).join(" ") || undefined };
}

function usernameForUser(user: Pick<User, "openId" | "email" | "name">): string {
  const email = user.email?.trim().toLowerCase();
  if (email) return email;
  const openId = user.openId.replace(/^keycloak:/, "").trim();
  if (!openId) throw new Error("A user email or immutable identity subject is required for Keycloak provisioning");
  return openId;
}

async function findUserByUsername(username: string): Promise<KeycloakUser | null> {
  const result = await adminRequest<KeycloakUser[]>("GET", `/users?username=${encodeURIComponent(username)}&exact=true`);
  return result.payload[0] ?? null;
}

async function realmRole(roleName: string): Promise<KeycloakRole> {
  const result = await adminRequest<KeycloakRole>("GET", `/roles/${encodeURIComponent(roleName)}`);
  if (!result.payload?.id || !result.payload?.name) {
    throw new Error(`Keycloak realm role ${roleName} was not found`);
  }
  return result.payload;
}

export async function provisionKeycloakUser(params: {
  user: Pick<User, "id" | "openId" | "email" | "name">;
  realmRoles: string[];
  requirePasswordSetup?: boolean;
}): Promise<{ keycloakUserId: string; username: string; assignedRoles: string[] }> {
  const username = usernameForUser(params.user);
  const { firstName, lastName } = splitName(params.user.name);
  let keycloakUser = await findUserByUsername(username);

  if (!keycloakUser) {
    const created = await adminRequest<unknown>("POST", "/users", {
      username,
      email: params.user.email ?? undefined,
      firstName,
      lastName,
      enabled: true,
      emailVerified: false,
      requiredActions: params.requirePasswordSetup ? ["UPDATE_PASSWORD"] : [],
    });
    const locationId = created.location?.split("/").filter(Boolean).pop();
    keycloakUser = locationId ? { id: locationId, username } : await findUserByUsername(username);
  }

  if (!keycloakUser?.id) {
    throw new Error("Keycloak user creation returned no user identifier");
  }

  const roles = await Promise.all(params.realmRoles.filter(Boolean).map(realmRole));
  if (roles.length) {
    await adminRequest("POST", `/users/${encodeURIComponent(keycloakUser.id)}/role-mappings/realm`, roles);
  }

  return { keycloakUserId: keycloakUser.id, username, assignedRoles: roles.map((role) => role.name) };
}

function subjectFromOpenId(openId: string): string {
  const subject = openId.startsWith("keycloak:") ? openId.slice("keycloak:".length) : "";
  if (!subject) {
    throw new Error("The current account is not backed by a Keycloak subject");
  }
  return subject;
}

export async function updateKeycloakProfile(user: Pick<User, "openId" | "name" | "email">, input: { name: string; email: string }): Promise<void> {
  const keycloakUserId = subjectFromOpenId(user.openId);
  const { firstName, lastName } = splitName(input.name);
  await adminRequest("PUT", `/users/${encodeURIComponent(keycloakUserId)}`, {
    email: input.email,
    firstName,
    lastName,
    enabled: true,
  });
}

export async function changeKeycloakPassword(params: {
  user: Pick<User, "openId" | "email">;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const username = params.user.email?.trim() || subjectFromOpenId(params.user.openId);
  const config = getConfig();
  const verificationBody = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.KEYCLOAK_CLIENT_ID?.trim() || config.clientId,
    client_secret: process.env.KEYCLOAK_CLIENT_SECRET?.trim() || config.clientSecret,
    username,
    password: params.currentPassword,
  });
  const verificationResponse = await fetch(
    `${config.baseUrl}/realms/${encodeURIComponent(config.realm)}/protocol/openid-connect/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: verificationBody.toString() },
  );
  if (!verificationResponse.ok) {
    throw new Error("Current Keycloak password could not be verified");
  }

  const keycloakUserId = subjectFromOpenId(params.user.openId);
  await adminRequest("PUT", `/users/${encodeURIComponent(keycloakUserId)}/reset-password`, {
    type: "password",
    value: params.newPassword,
    temporary: false,
  });
}

export async function requireKeycloakTotpEnrollment(user: Pick<User, "openId">): Promise<void> {
  const keycloakUserId = subjectFromOpenId(user.openId);
  const existing = await adminRequest<KeycloakUser>("GET", `/users/${encodeURIComponent(keycloakUserId)}`);
  const requiredActions = new Set(existing.payload.requiredActions ?? []);
  requiredActions.add("CONFIGURE_TOTP");
  await adminRequest("PUT", `/users/${encodeURIComponent(keycloakUserId)}`, {
    requiredActions: [...requiredActions],
  });
}
