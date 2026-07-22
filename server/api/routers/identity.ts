/**
 * NIMC NIN/BVN Identity Verification Router
 * Integrates with the configured identity service for NIN and BVN verification.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";

const TIMEOUT_MS = 10_000;

function identityServiceUrl(): string {
  const url = process.env.IDENTITY_SERVICE_URL?.trim();
  if (!url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "IDENTITY_SERVICE_URL is not configured" });
  return url.replace(/\/$/, "");
}

function serviceError(service: string, error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${service} is unavailable: ${message}` });
}

async function callIdentityService(endpoint: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${identityServiceUrl()}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(error.error ?? `Identity service returned HTTP ${res.status}`);
    }
    return res.json();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TRPCError({ code: "TIMEOUT", message: "Identity service timed out" });
    }
    throw serviceError("Identity service", error);
  }
}

export const identityRouter = router({
  verifyNIN: protectedProcedure
    .input(z.object({ nin: z.string().length(11), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => callIdentityService("/verify/nin", {
      nin: input.nin,
      userId: input.userId ?? ctx.user.id,
    })),

  verifyBVN: protectedProcedure
    .input(z.object({ bvn: z.string().length(11), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => callIdentityService("/verify/bvn", {
      bvn: input.bvn,
      userId: input.userId ?? ctx.user.id,
    })),

  getVerificationStatus: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const userId = input.userId ?? ctx.user.id;
      try {
        const res = await fetch(`${identityServiceUrl()}/status/${userId}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (res.status === 404) return { verified: false, status: "NOT_FOUND" };
        if (!res.ok) throw new Error(`Identity service returned HTTP ${res.status}`);
        return res.json();
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new TRPCError({ code: "TIMEOUT", message: "Identity service timed out" });
        }
        throw serviceError("Identity service", error);
      }
    }),

  listVerifications: protectedProcedure.query(async ({ ctx }) => {
    if (!["admin", "registrar"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    try {
      const res = await fetch(`${identityServiceUrl()}/verifications`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`Identity service returned HTTP ${res.status}`);
      return res.json();
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new TRPCError({ code: "TIMEOUT", message: "Identity service timed out" });
      }
      throw serviceError("Identity service", error);
    }
  }),

  serviceHealth: protectedProcedure.query(async () => {
    try {
      const res = await fetch(`${identityServiceUrl()}/health`, { signal: AbortSignal.timeout(3_000) });
      return res.ok
        ? await res.json()
        : { status: "unhealthy", httpStatus: res.status };
    } catch (error) {
      return { status: "unreachable", detail: error instanceof Error ? error.message : String(error) };
    }
  }),
});
