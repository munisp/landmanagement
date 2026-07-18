/**
 * Central environment contract.
 *
 * Security hardening (2026-07-18):
 * - In production, a missing/weak JWT_SECRET now fails fast instead of silently
 *   signing session cookies with an empty secret.
 * - Development falls back to a clearly-marked insecure dev-only secret so local
 *   offline runs keep working without configuration.
 */

const isProduction = process.env.NODE_ENV === "production";

const DEV_ONLY_COOKIE_SECRET = "idlr-dev-only-insecure-secret-do-not-use-in-prod";

const WEAK_SECRET_MARKERS = ["change-me", "placeholder", "example", "dev-only"];

function resolveCookieSecret(): string {
  const configured = process.env.JWT_SECRET ?? "";
  const weak =
    configured.length < 32 ||
    WEAK_SECRET_MARKERS.some((marker) => configured.toLowerCase().includes(marker));

  if (isProduction && weak) {
    throw new Error(
      "[Security] JWT_SECRET is missing or too weak for production. " +
        "Set a random secret of at least 32 characters before starting the server."
    );
  }

  if (!configured) {
    return DEV_ONLY_COOKIE_SECRET;
  }
  return configured;
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: resolveCookieSecret(),
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
