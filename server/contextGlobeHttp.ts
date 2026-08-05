import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import express from "express";
import { sdk } from "./_core/sdk";
import { extractContextCapability, verifyContextCapability, type ContextAudience } from "./contextGlobeCapability";

export const contextGlobeHttpRouter = express.Router();
const LAYER_KEY = /^[a-z][a-z0-9-]{1,63}$/;
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function requestId(req: express.Request) {
  const candidate = req.header("x-request-id")?.trim();
  return candidate && /^[A-Za-z0-9_.:-]{8,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function configuredService(variable: "CONTEXT_STREAM_SERVICE_URL" | "CONTEXT_TILES_SERVICE_URL"): URL {
  const raw = process.env[variable]?.trim();
  if (!raw) throw new Error(`${variable} is required for Context Globe delivery`);
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${variable} must be a credential-free HTTP(S) base URL`);
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

function parsedLayers(value: unknown, allowed: string[]): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const layers = [...new Set(raw.map((layer) => String(layer).trim().toLowerCase()).filter(Boolean))].sort();
  if (!layers.length || layers.some((layer) => !LAYER_KEY.test(layer) || !allowed.includes(layer))) throw new Error("Requested Context Globe layers are invalid or outside the capability scope");
  return layers;
}

function parsedWindow(req: express.Request) {
  const now = Date.now();
  const rawStart = typeof req.query.start === "string" ? Date.parse(req.query.start) : now - 24 * 60 * 60 * 1000;
  const rawEnd = typeof req.query.end === "string" ? Date.parse(req.query.end) : now;
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawStart > rawEnd || rawEnd - rawStart > MAX_WINDOW_MS || rawEnd > now + 5 * 60 * 1000) {
    throw new Error("Requested Context Globe time window is invalid");
  }
  return { start: new Date(rawStart).toISOString(), end: new Date(rawEnd).toISOString() };
}

async function requireContextAccess(req: express.Request, audience: ContextAudience) {
  const user = await sdk.authenticateRequest(req);
  const capability = verifyContextCapability(extractContextCapability(req.header("x-context-capability") ?? undefined), audience);
  if (capability.sub !== user.id) throw new Error("Context capability subject does not match the authenticated user");
  return { user, capability };
}

function deliveryHeaders(capability: string, correlationId: string): HeadersInit {
  return {
    Authorization: `Bearer ${capability}`,
    "X-Request-Id": correlationId,
    "X-Context-Service-Version": "1",
  };
}

function forwardHeaders(upstream: Response, res: express.Response, correlationId: string, contentType?: string) {
  res.setHeader("Content-Type", upstream.headers.get("content-type") || contentType || "application/json");
  res.setHeader("Cache-Control", "private, max-age=30, must-revalidate");
  res.setHeader("X-Request-Id", correlationId);
  res.setHeader("Vary", "Authorization, X-Context-Capability");
}

function sendError(res: express.Response, error: unknown, correlationId: string) {
  const message = error instanceof Error ? error.message : "Context Globe delivery failed";
  const unauthorized = /authentication|capability|signature|expired|subject|audience/i.test(message);
  const invalid = /invalid|window|layer/i.test(message);
  res.status(unauthorized ? 401 : invalid ? 400 : 502).setHeader("X-Request-Id", correlationId).json({
    error: unauthorized ? "Context Globe authorization failed" : invalid ? "Invalid Context Globe request" : "Context Globe service is unavailable",
    requestId: correlationId,
  });
}

contextGlobeHttpRouter.get("/features.geojson", async (req, res) => {
  const correlationId = requestId(req);
  try {
    const { capability, user } = await requireContextAccess(req, "context_tiles");
    const layers = parsedLayers(req.query.layers, capability.layers);
    const window = parsedWindow(req);
    const service = configuredService("CONTEXT_TILES_SERVICE_URL");
    const target = new URL(`${service.toString()}/features.geojson`);
    target.searchParams.set("layers", layers.join(","));
    target.searchParams.set("start", window.start);
    target.searchParams.set("end", window.end);
    const upstream = await fetch(target, { headers: deliveryHeaders(req.header("x-context-capability")!, correlationId), signal: AbortSignal.timeout(Number(process.env.CONTEXT_DELIVERY_TIMEOUT_MS || 8_000)) });
    if (!upstream.ok) throw new Error(`Context tiles service returned ${upstream.status}`);
    forwardHeaders(upstream, res, correlationId, "application/geo+json");
    res.setHeader("X-Context-User", String(user.id));
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body as never), res);
  } catch (error) {
    sendError(res, error, correlationId);
  }
});

contextGlobeHttpRouter.get("/stream", async (req, res) => {
  const correlationId = requestId(req);
  try {
    const { capability } = await requireContextAccess(req, "context_stream");
    const layers = parsedLayers(req.query.layers, capability.layers);
    const service = configuredService("CONTEXT_STREAM_SERVICE_URL");
    const target = new URL(`${service.toString()}/stream`);
    target.searchParams.set("layers", layers.join(","));
    const upstream = await fetch(target, { headers: { ...deliveryHeaders(req.header("x-context-capability")!, correlationId), Accept: "text/event-stream" }, signal: AbortSignal.timeout(Number(process.env.CONTEXT_STREAM_CONNECT_TIMEOUT_MS || 8_000)) });
    if (!upstream.ok) throw new Error(`Context stream service returned ${upstream.status}`);
    forwardHeaders(upstream, res, correlationId, "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body as never), res);
  } catch (error) {
    sendError(res, error, correlationId);
  }
});

contextGlobeHttpRouter.get("/mobile-summary", async (req, res) => {
  const correlationId = requestId(req);
  try {
    const { capability } = await requireContextAccess(req, "context_mobile");
    const layers = parsedLayers(req.query.layers, capability.layers);
    const window = parsedWindow(req);
    const service = configuredService("CONTEXT_TILES_SERVICE_URL");
    const target = new URL(`${service.toString()}/summary`);
    target.searchParams.set("layers", layers.join(","));
    target.searchParams.set("start", window.start);
    target.searchParams.set("end", window.end);
    const upstream = await fetch(target, { headers: deliveryHeaders(req.header("x-context-capability")!, correlationId), signal: AbortSignal.timeout(Number(process.env.CONTEXT_DELIVERY_TIMEOUT_MS || 8_000)) });
    if (!upstream.ok) throw new Error(`Context mobile summary returned ${upstream.status}`);
    forwardHeaders(upstream, res, correlationId);
    res.status(200).send(await upstream.text());
  } catch (error) {
    sendError(res, error, correlationId);
  }
});
