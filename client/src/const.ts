function browserOrigin(): string {
  if (typeof window === "undefined") {
    throw new Error("OAuth URL generation requires a browser origin");
  }
  return window.location.origin;
}

/**
 * Generate a login URL using only deployment-provided identity configuration.
 * Missing or malformed configuration is surfaced to the UI instead of being
 * redirected through preview-login or a local development portal.
 */
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL?.trim();
  const appId = import.meta.env.VITE_APP_ID?.trim();
  if (!oauthPortalUrl || !appId) {
    throw new Error("VITE_OAUTH_PORTAL_URL and VITE_APP_ID must be configured for authentication");
  }

  const redirectUri = `${browserOrigin()}/api/oauth/callback`;
  const state = btoa(redirectUri);
  const url = new URL("/app-auth", oauthPortalUrl);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url.toString();
};
