import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  clearAuthToken,
  getStoredSessionTokens,
  setStoredSessionTokens,
  type MobileSessionTokens,
} from "../services/api";
import { getKeycloakClientId, getKeycloakIssuer, getKeycloakScopes } from "../lib/runtimeConfig";

WebBrowser.maybeCompleteAuthSession();

export type MobileIdentity = {
  subject: string | null;
  name: string | null;
  email: string | null;
  preferredUsername: string | null;
  roles: string[];
};

type SessionState = {
  status: "loading" | "signed_out" | "signed_in" | "configuration_error";
  identity: MobileIdentity | null;
  accessToken: string | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<string | null>;
};

const MobileSessionContext = createContext<SessionState | null>(null);

function defaultIdentity(): MobileIdentity {
  return { subject: null, name: null, email: null, preferredUsername: null, roles: [] };
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("The identity provider returned an invalid access token");
  const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = globalThis.atob(padded);
  return JSON.parse(decoded) as Record<string, unknown>;
}

function deriveIdentity(token: string): MobileIdentity {
  const payload = decodeJwtPayload(token);
  const realmRoles = Array.isArray((payload.realm_access as any)?.roles)
    ? (payload.realm_access as any).roles.filter((role: unknown): role is string => typeof role === "string")
    : [];
  const appRole = typeof payload.app_role === "string" ? [payload.app_role] : [];
  return {
    subject: typeof payload.sub === "string" ? payload.sub : null,
    name: typeof payload.name === "string" ? payload.name : null,
    email: typeof payload.email === "string" ? payload.email : null,
    preferredUsername: typeof payload.preferred_username === "string" ? payload.preferred_username : null,
    roles: [...new Set([...realmRoles, ...appRole])],
  };
}

function expiryForToken(token: string): number | null {
  try {
    const exp = Number(decodeJwtPayload(token).exp);
    return Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function oauthConfiguration() {
  try {
    const issuer = getKeycloakIssuer();
    return {
      issuer,
      clientId: getKeycloakClientId(),
      scopes: getKeycloakScopes(),
      redirectUri: AuthSession.makeRedirectUri({ scheme: "idlrpts", path: "auth/callback" }),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Native identity configuration is invalid" };
  }
}

export function MobileSessionProvider({ children }: { children: React.ReactNode }) {
  const config = useMemo(oauthConfiguration, []);
  const [status, setStatus] = useState<SessionState["status"]>("loading");
  const [tokens, setTokens] = useState<MobileSessionTokens | null>(null);
  const [identity, setIdentity] = useState<MobileIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<string | null> | null>(null);

  const applyTokens = useCallback(async (next: MobileSessionTokens | null) => {
    if (!next) {
      await clearAuthToken();
      setTokens(null);
      setIdentity(null);
      setStatus("signed_out");
      return;
    }
    const expiresAt = next.expiresAt ?? expiryForToken(next.accessToken);
    const normalized = { ...next, expiresAt };
    await setStoredSessionTokens(normalized);
    setTokens(normalized);
    setIdentity(deriveIdentity(normalized.accessToken));
    setStatus("signed_in");
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      if ("error" in config) {
        if (active) {
          setStatus("configuration_error");
          setError(config.error ?? "Native identity configuration is invalid");
        }
        return;
      }
      try {
        const stored = await getStoredSessionTokens();
        if (!active) return;
        if (!stored) {
          setStatus("signed_out");
          return;
        }
        setTokens(stored);
        setIdentity(deriveIdentity(stored.accessToken));
        setStatus("signed_in");
      } catch (cause) {
        await clearAuthToken();
        if (active) {
          setStatus("signed_out");
          setError(cause instanceof Error ? cause.message : "Unable to restore the mobile session");
        }
      }
    })();
    return () => { active = false; };
  }, [config]);

  const refresh = useCallback(async (): Promise<string | null> => {
    if ("error" in config || !tokens?.refreshToken) return tokens?.accessToken ?? null;
    if (refreshInFlight.current) return refreshInFlight.current;
    refreshInFlight.current = (async () => {
      try {
        const discovery = await AuthSession.fetchDiscoveryAsync(config.issuer);
        const refreshed = await AuthSession.refreshAsync({
          clientId: config.clientId,
          refreshToken: tokens.refreshToken as string,
        }, discovery);
        const accessToken = refreshed.accessToken;
        if (!accessToken) throw new Error("The identity provider did not return an access token during refresh");
        await applyTokens({
          accessToken,
          refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
          expiresAt: refreshed.expiresIn ? Date.now() + refreshed.expiresIn * 1000 : expiryForToken(accessToken),
        });
        return accessToken;
      } catch (cause) {
        await applyTokens(null);
        setError(cause instanceof Error ? cause.message : "Your session expired. Sign in again.");
        return null;
      } finally {
        refreshInFlight.current = null;
      }
    })();
    return refreshInFlight.current;
  }, [applyTokens, config, tokens]);

  useEffect(() => {
    if (status !== "signed_in" || !tokens?.expiresAt) return;
    const refreshInMs = Math.max(1_000, tokens.expiresAt - Date.now() - 60_000);
    const timeout = setTimeout(() => { void refresh(); }, refreshInMs);
    return () => clearTimeout(timeout);
  }, [refresh, status, tokens?.expiresAt]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && tokens?.expiresAt && tokens.expiresAt - Date.now() < 60_000) {
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh, tokens?.expiresAt]);

  const signIn = useCallback(async () => {
    if ("error" in config) {
      setError(config.error ?? "Native identity configuration is invalid");
      setStatus("configuration_error");
      return;
    }
    setError(null);
    try {
      const discovery = await AuthSession.fetchDiscoveryAsync(config.issuer);
      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: config.scopes,
        usePKCE: true,
      });
      const result = await request.promptAsync(discovery);
      if (result.type === "cancel" || result.type === "dismiss") return;
      if (result.type !== "success" || !result.params.code) {
        throw new Error(result.type === "error" ? result.params.error_description ?? result.params.error ?? "Identity-provider sign-in failed" : "No authorization code was returned");
      }
      const exchange = await AuthSession.exchangeCodeAsync({
        clientId: config.clientId,
        code: result.params.code,
        redirectUri: config.redirectUri,
        extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
      }, discovery);
      if (!exchange.accessToken) throw new Error("The identity provider did not return an access token");
      await applyTokens({
        accessToken: exchange.accessToken,
        refreshToken: exchange.refreshToken,
        expiresAt: exchange.expiresIn ? Date.now() + exchange.expiresIn * 1000 : expiryForToken(exchange.accessToken),
      });
    } catch (cause) {
      setStatus("signed_out");
      setError(cause instanceof Error ? cause.message : "Unable to complete secure sign-in");
    }
  }, [applyTokens, config]);

  const signOut = useCallback(async () => {
    await applyTokens(null);
    setError(null);
  }, [applyTokens]);

  const value = useMemo<SessionState>(() => ({
    status,
    identity: status === "signed_in" ? identity : null,
    accessToken: status === "signed_in" ? tokens?.accessToken ?? null : null,
    error,
    signIn,
    signOut,
    refresh,
  }), [error, identity, refresh, signIn, signOut, status, tokens?.accessToken]);

  return <MobileSessionContext.Provider value={value}>{children}</MobileSessionContext.Provider>;
}

export function useMobileSession(): SessionState {
  const context = useContext(MobileSessionContext);
  if (!context) throw new Error("useMobileSession must be used inside MobileSessionProvider");
  return context;
}

export function useMobileRoleHint(role: string): boolean {
  const session = useMobileSession();
  return session.identity?.roles.includes(role) ?? false;
}
