/**
 * NIMC NIN/BVN Identity Verification Router
 * Integrates with the Go identity-service for NIN and BVN verification.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";

const IDENTITY_SERVICE_URL = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:8091";
const TIMEOUT_MS = 10_000;

async function callIdentityService(endpoint: string, body: Record<string, unknown>) {
  try {
    const res = await fetch(`${IDENTITY_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Identity service error");
    }
    return res.json();
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      throw new TRPCError({ code: "TIMEOUT", message: "Identity service timed out" });
    }
    // Service unavailable — return graceful degradation
    return { verified: false, status: "SERVICE_UNAVAILABLE", error: err.message };
  }
}

export const identityRouter = router({
  verifyNIN: protectedProcedure
    .input(z.object({ nin: z.string().length(11), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      return callIdentityService("/verify/nin", {
        nin: input.nin,
        userId: input.userId ?? ctx.user.id,
      });
    }),

  verifyBVN: protectedProcedure
    .input(z.object({ bvn: z.string().length(11), userId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      return callIdentityService("/verify/bvn", {
        bvn: input.bvn,
        userId: input.userId ?? ctx.user.id,
      });
    }),

  getVerificationStatus: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const userId = input.userId ?? ctx.user.id;
      try {
        const res = await fetch(`${IDENTITY_SERVICE_URL}/status/${userId}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return { verified: false, status: "NOT_FOUND" };
        return res.json();
      } catch {
        return { verified: false, status: "SERVICE_UNAVAILABLE" };
      }
    }),

  listVerifications: protectedProcedure.query(async ({ ctx }) => {
    if (!["admin", "registrar"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
    }
    try {
      const res = await fetch(`${IDENTITY_SERVICE_URL}/verifications`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { verifications: [], count: 0 };
      return res.json();
    } catch {
      return { verifications: [], count: 0, error: "Service unavailable" };
    }
  }),

  serviceHealth: protectedProcedure.query(async () => {
    try {
      const res = await fetch(`${IDENTITY_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(3_000),
      });
      return res.ok ? await res.json() : { status: "unhealthy" };
    } catch {
      return { status: "unreachable" };
    }
  }),
});
