/**
 * Legal Framework Recognition Router
 * Digital signatures, cryptographic audit chains, and gazette publication.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";

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

function serviceUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${name} is not configured` });
  return value.replace(/\/$/, "");
}

async function callService(url: string, method: "GET" | "POST", body?: unknown) {
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as any).error ?? `Service returned HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TRPCError({ code: "TIMEOUT", message: "Legal service timed out" });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Legal service is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    });
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
    .mutation(async ({ input, ctx }) => callService(`${serviceUrl("CRYPTO_AUDIT_SERVICE_URL")}/sign`, "POST", {
      ...input,
      signedBy: ctx.user.id,
      signerRole: ctx.user.role,
    })),

  verifyDocument: protectedProcedure
    .input(z.object({ documentId: z.string(), documentContent: z.string() }))
    .query(async ({ input }) => callService(`${serviceUrl("CRYPTO_AUDIT_SERVICE_URL")}/verify`, "POST", input)),

  getAuditChain: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input }) => callService(`${serviceUrl("CRYPTO_AUDIT_SERVICE_URL")}/chain/${encodeURIComponent(input.documentId)}`, "GET")),

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
      return callService(`${serviceUrl("GAZETTE_SERVICE_URL")}/gazette/submit`, "POST", { ...input, submittedBy: ctx.user.id });
    }),

  getGazetteNotice: protectedProcedure
    .input(z.object({ gnn: z.string() }))
    .query(async ({ input }) => callService(`${serviceUrl("GAZETTE_SERVICE_URL")}/gazette/${encodeURIComponent(input.gnn)}`, "GET")),

  listPendingGazettes: protectedProcedure.query(async ({ ctx }) => {
    if (!["admin", "registrar", "federal_registrar"].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role" });
    }
    return callService(`${serviceUrl("GAZETTE_SERVICE_URL")}/gazette/pending`, "GET");
  }),

  confirmGazette: protectedProcedure
    .input(z.object({ gnn: z.string(), volume: z.string(), page: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!["admin", "federal_registrar"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Federal Registrar role required" });
      }
      return callService(`${serviceUrl("GAZETTE_SERVICE_URL")}/gazette/confirm`, "POST", { ...input, confirmedBy: ctx.user.id });
    }),

  servicesHealth: protectedProcedure.query(async () => {
    const [crypto, gazette] = await Promise.allSettled([
      callService(`${serviceUrl("CRYPTO_AUDIT_SERVICE_URL")}/health`, "GET"),
      callService(`${serviceUrl("GAZETTE_SERVICE_URL")}/health`, "GET"),
    ]);
    return {
      cryptoAuditService: crypto.status === "fulfilled" ? crypto.value : { status: "unreachable" },
      gazetteService: gazette.status === "fulfilled" ? gazette.value : { status: "unreachable" },
    };
  }),
});
