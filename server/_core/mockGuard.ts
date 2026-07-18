/**
 * Mock-fallback guard (security hardening, 2026-07-18).
 *
 * Several integrations (payments, credit bureau, fraud signals) historically
 * returned synthetic "mock" payloads whenever the upstream provider was
 * unreachable. In development that keeps the offline-capable workflow alive,
 * but in production it can silently turn a failed provider call into fabricated
 * financial data — a serious integrity risk.
 *
 * `assertMockFallbackAllowed` makes the fallback explicit:
 * - development / test: fallback allowed (existing behaviour preserved);
 * - production: fallback throws unless ALLOW_MOCK_FALLBACKS=true is set
 *   deliberately by the operator.
 */
export function assertMockFallbackAllowed(context: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  const explicitlyAllowed = process.env.ALLOW_MOCK_FALLBACKS === "true";

  if (isProduction && !explicitlyAllowed) {
    throw new Error(
      `[Security] Mock fallback blocked in production: ${context}. ` +
        `Fix the upstream integration or set ALLOW_MOCK_FALLBACKS=true to override (not recommended).`
    );
  }
}

/** Returns true when returning synthetic fallback data is acceptable. */
export function isMockFallbackAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_FALLBACKS === "true";
}
