import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { CONTEXT_MAX_TTL_SECONDS, issueContextCapability, type ContextAudience } from "../../contextGlobeCapability";
import { listContextEvents, listContextLayers, setContextLayerSubscription } from "../../contextGlobeService";

const layerKeys = z.array(z.string().regex(/^[a-z][a-z0-9-]{1,63}$/)).min(1).max(8);
const windowSchema = z.object({
  layerKeys: layerKeys.optional(),
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
});

function requestId(headers: Record<string, string | string[] | undefined>) {
  return headers["x-request-id"];
}

function capabilityEndpoint(audience: ContextAudience) {
  if (audience === "context_stream") return "/api/context-globe/stream";
  if (audience === "context_tiles") return "/api/context-globe/features.geojson";
  return "/api/context-globe/mobile-summary";
}

export const contextGlobeRouter = router({
  listLayers: protectedProcedure.query(async ({ ctx }) => listContextLayers(ctx.user.id)),

  setLayerEnabled: protectedProcedure
    .input(z.object({ layerKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => setContextLayerSubscription(ctx.user.id, input.layerKey, input.enabled)),

  listEvents: protectedProcedure
    .input(windowSchema)
    .query(async ({ ctx, input }) => listContextEvents({ userId: ctx.user.id, ...input })),

  issueCapability: protectedProcedure
    .input(z.object({
      audience: z.enum(["context_stream", "context_tiles", "context_mobile"]),
      layerKeys,
      purpose: z.string().min(3).max(128),
      ttlSeconds: z.number().int().min(30).max(CONTEXT_MAX_TTL_SECONDS).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const issued = await issueContextCapability({
        userId: ctx.user.id,
        audience: input.audience,
        layerKeys: input.layerKeys,
        purpose: input.purpose,
        ttlSeconds: input.ttlSeconds,
        requestId: requestId(ctx.req.headers),
      });
      return {
        audience: input.audience,
        endpoint: capabilityEndpoint(input.audience),
        ...issued,
        transport: "X-Context-Capability: Bearer capability; same-origin middleware gateway only" as const,
        cachePolicy: "private, max-age=30" as const,
      };
    }),
});
