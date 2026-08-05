/**
 * Synthetic fallback guard.
 *
 * Production services must fail closed when a required provider is unavailable.
 * Development and test runs may use explicitly isolated fixtures, but no runtime
 * environment variable can re-enable fabricated provider payloads in production.
 */
export function assertMockFallbackAllowed(context: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[Security] Synthetic fallback is prohibited in production: ${context}. ` +
        "Repair the upstream integration or route the case to an explicit review queue."
    );
  }
}

/** Returns true only for non-production test and development isolation. */
export function isMockFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}
