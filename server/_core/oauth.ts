import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function normalizePreviewRole(input: string | undefined): "user" | "surveyor" | "registrar" | "admin" {
  const value = input?.toLowerCase().trim();
  if (value === "admin" || value === "registrar" || value === "surveyor") {
    return value;
  }
  return "user";
}

function normalizeRedirectTarget(input: string | undefined): string {
  if (!input || !input.startsWith("/") || input.startsWith("//")) {
    return "/dashboard";
  }
  return input;
}

function buildPreviewIdentity(role: "user" | "surveyor" | "registrar" | "admin") {
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return {
    openId: `preview-${role}-account`,
    name: `${label} Preview User`,
    email: `${role}@preview.local`,
    role,
  } as const;
}

function getKeycloakConfig(req: Request) {
  const baseUrl = process.env.KEYCLOAK_URL;
  const realm = process.env.KEYCLOAK_REALM || 'idlr';
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
  const appUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
  const callbackUrl = `${appUrl.replace(/\/$/, '')}/api/auth/keycloak/callback`;

  if (!baseUrl || !clientId || !clientSecret) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    realm,
    clientId,
    clientSecret,
    callbackUrl,
  };
}

async function exchangeKeycloakCode(code: string, req: Request) {
  const config = getKeycloakConfig(req);
  if (!config) {
    throw new Error('Keycloak is not configured');
  }

  const tokenUrl = `${config.baseUrl}/realms/${config.realm}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.callbackUrl,
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Keycloak token exchange failed with status ${tokenResponse.status}`);
  }

  return tokenResponse.json() as Promise<{ access_token: string }>;
}

async function getKeycloakUserInfo(accessToken: string, req: Request) {
  const config = getKeycloakConfig(req);
  if (!config) {
    throw new Error('Keycloak is not configured');
  }

  const userInfoUrl = `${config.baseUrl}/realms/${config.realm}/protocol/openid-connect/userinfo`;
  const response = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Keycloak userinfo request failed with status ${response.status}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export function registerOAuthRoutes(app: Express) {
  app.get('/api/auth/keycloak/login', async (req: Request, res: Response) => {
    const config = getKeycloakConfig(req);
    if (!config) {
      res.status(503).json({ error: 'Keycloak is not configured' });
      return;
    }

    const redirectTo = normalizeRedirectTarget(getQueryParam(req, 'redirectTo'));
    const state = Buffer.from(JSON.stringify({ redirectTo, nonce: Date.now() })).toString('base64url');
    const authUrl = new URL(`${config.baseUrl}/realms/${config.realm}/protocol/openid-connect/auth`);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('redirect_uri', config.callbackUrl);
    authUrl.searchParams.set('state', state);

    res.redirect(302, authUrl.toString());
  });

  app.get('/api/auth/keycloak/callback', async (req: Request, res: Response) => {
    const code = getQueryParam(req, 'code');
    const encodedState = getQueryParam(req, 'state');

    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }

    try {
      const tokenResponse = await exchangeKeycloakCode(code, req);
      const userInfo = await getKeycloakUserInfo(tokenResponse.access_token, req);
      const preferredUsername = typeof userInfo.preferred_username === 'string' ? userInfo.preferred_username : undefined;
      const subject = typeof userInfo.sub === 'string' ? userInfo.sub : preferredUsername;

      if (!subject) {
        res.status(400).json({ error: 'Keycloak user subject missing' });
        return;
      }

      await db.upsertUser({
        openId: `keycloak:${subject}`,
        name: typeof userInfo.name === 'string' ? userInfo.name : preferredUsername ?? null,
        email: typeof userInfo.email === 'string' ? userInfo.email : null,
        loginMethod: 'keycloak',
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(`keycloak:${subject}`, {
        name: typeof userInfo.name === 'string' ? userInfo.name : preferredUsername ?? '',
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      let redirectTo = '/dashboard';
      if (encodedState) {
        try {
          const decoded = JSON.parse(Buffer.from(encodedState, 'base64url').toString('utf8')) as { redirectTo?: string };
          redirectTo = normalizeRedirectTarget(decoded.redirectTo);
        } catch {
          redirectTo = '/dashboard';
        }
      }

      res.redirect(302, redirectTo);
    } catch (error) {
      console.error('[KeycloakAuth] Callback failed', error);
      res.status(500).json({ error: 'Keycloak callback failed' });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  app.get("/api/auth/preview-login", async (req: Request, res: Response) => {
    const role = normalizePreviewRole(getQueryParam(req, "role"));
    const redirectTo = normalizeRedirectTarget(getQueryParam(req, "redirectTo"));
    const identity = buildPreviewIdentity(role);

    try {
      await db.upsertUser({
        openId: identity.openId,
        name: identity.name,
        email: identity.email,
        loginMethod: "preview",
        role: identity.role,
        lastSignedIn: new Date(),
      });
    } catch (error) {
      console.warn("[PreviewAuth] Unable to persist preview user", error);
    }

    try {
      const sessionToken = await sdk.createSessionToken(identity.openId, {
        name: identity.name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, redirectTo);
    } catch (error) {
      console.error("[PreviewAuth] Failed to create preview session", error);
      res.status(500).json({ error: "Preview login failed" });
    }
  });
}
