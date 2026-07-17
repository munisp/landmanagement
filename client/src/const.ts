const DEFAULT_OAUTH_PORTAL_URL = "http://localhost:3100";
const DEFAULT_APP_ID = "idlr-pts-platform";
const DEFAULT_PREVIEW_ROLE = "admin";

function getSafeOrigin() {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  return window.location.origin;
}

function getPreviewLoginUrl() {
  const redirectTo = typeof window === "undefined"
    ? "/dashboard"
    : `${window.location.pathname}${window.location.search}`.startsWith("/dashboard")
      ? `${window.location.pathname}${window.location.search}`
      : "/dashboard";

  const url = new URL("/api/auth/preview-login", getSafeOrigin());
  url.searchParams.set("role", DEFAULT_PREVIEW_ROLE);
  url.searchParams.set("redirectTo", redirectTo || "/dashboard");
  return url.toString();
}

// Generate login URL at runtime so redirect URI reflects the current origin.
// The helper is intentionally defensive so the PWA still renders even when
// environment variables are not yet configured in development or preview mode.
export const getLoginUrl = () => {
  const configuredPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL?.trim();
  const configuredAppId = import.meta.env.VITE_APP_ID?.trim();

  if (!configuredPortalUrl) {
    return getPreviewLoginUrl();
  }

  const oauthPortalUrl = configuredPortalUrl || DEFAULT_OAUTH_PORTAL_URL;
  const appId = configuredAppId || DEFAULT_APP_ID;
  const redirectUri = `${getSafeOrigin()}/api/oauth/callback`;
  const state = btoa(redirectUri);

  try {
    const url = new URL("/app-auth", oauthPortalUrl);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");
    return url.toString();
  } catch {
    return getPreviewLoginUrl();
  }
};
