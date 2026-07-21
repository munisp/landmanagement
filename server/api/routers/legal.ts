/**
 * Legal Framework Recognition Router
 * Digital signatures, cryptographic audit chains, gazette publication.
 * Legal basis: Nigeria Evidence Act 2011 s.84; Land Use Act 1978 (as amended)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";

const CRYPTO_SERVICE_URL = process.env.CRYPTO_AUDIT_SERVICE_URL ?? "http://localhost:8092";
const GAZETTE_SERVICE_URL = process.env.GAZETTE_SERVICE_URL ?? "http://localhost:8093";
const TIMEOUT_MS = 10_000;

const documentTypeEnum = z.enum([
  "CERTIFICATE_OF_OCCUPANCY",
  "DEED_OF_ASSIGNMENT",
  "DEED_OF_MORTGAGE",
  "SURVEY_PLAN",
  "POWER_OF_ATTORNEY",
  "COURT_ORDER",
  "GOVERNMENT_ACQUISITION",
  "GAZETTE_NOTICE",
]);

const gazetteNoticeTypeEnum = z.enum([
  "LAND_ACQUISITION",
  "TITLE_REVOCATION",
  "BOUNDARY_ADJUSTMENT",
  "ZONING_CHANGE",
  "INFRASTRUCTURE_RESERVATION",
  "ENVIRONMENTAL_PROTECTION",
]);

async function callService(url: string, method: "GET" | "POST", body?: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as any).error ?? `Service error ${res.status}`);
    }
    return res.json();
  } catch (err: any) {
    if (err.name === "TimeoutError") {
      throw new TRPCError({ code: "TIMEOUT", message: "Service timed out" });
    }
    return { error: err.message, serviceUnavailable: true };
  }
}

export const legalRouter = router({
  signDocument: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      documentType: documentTypeEnum,
      parcelId: z.string().optional(),
      ownerName: z.string(),
      documentContent: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return callService(`${CRYPTO_SERVICE_URL}/sign`, "POST", {
        ...input,
        signedBy: ctx.user.id,
        signerRole: ctx.user.role,
      });
    }),

  verifyDocument: protectedProcedure
    .input(z.object({ documentId: z.string(), documentContent: z.string() }))
    .query(async ({ input }) => {
      return callService(`${CRYPTO_SERVICE_URL}/verify`, "POST", input);
    }),

  getAuditChain: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input }) => {
      return callService(`${CRYPTO_SERVICE_URL}/chain/${input.documentId}`, "GET");
    }),

  submitGazette: protectedProcedure
    .input(z.object({
      noticeType: gazetteNoticeTypeEnum,
      parcelIds: z.array(z.string()),
      stateCode: z.string().min(2).max(3),
      lgaCode: z.string().optional(),
      title: z.string().min(10),
      description: z.string().optional(),
      authorizedBy: z.string(),
      authorizerTitle: z.string(),
      legalBasis: z.string().optional(),
      effectiveDate: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "registrar", "federal_registrar"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role for gazette submission" });
      }
      return callService(`${GAZETTE_SERVICE_URL}/gazette/submit`, "POST", {
        ...input,
        submittedBy: ctx.user.id,
      });
    }),

  getGazetteNotice: protectedProcedure
    .input(z.object({ gnn: z.string() }))
    .query(async ({ input }) => {
      return callService(`${GAZETTE_SERVICE_URL}/gazette/${input.gnn}`, "GET");
    }),

  listPendingGazettes: protectedProcedure.query(async ({ ctx }) => {
    if (!["admin", "registrar", "federal_registrar"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role" });
    }
    return callService(`${GAZETTE_SERVICE_URL}/gazette/pending`, "GET");
  }),

  confirmGazette: protectedProcedure
    .input(z.object({ gnn: z.string(), volume: z.string(), page: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "federal_registrar"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Federal Registrar role required" });
      }
      return callService(`${GAZETTE_SERVICE_URL}/gazette/confirm`, "POST", {
        ...input,
        confirmedBy: ctx.user.id,
      });
    }),

  servicesHealth: protectedProcedure.query(async () => {
    const [crypto, gazette] = await Promise.allSettled([
      callService(`${CRYPTO_SERVICE_URL}/health`, "GET"),
      callService(`${GAZETTE_SERVICE_URL}/health`, "GET"),
    ]);
    return {
      cryptoAuditService: crypto.status === "fulfilled" ? crypto.value : { status: "unreachable" },
      gazetteService: gazette.status === "fulfilled" ? gazette.value : { status: "unreachable" },
    };
  }),
});
