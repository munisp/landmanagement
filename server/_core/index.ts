import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import {
  corsMiddleware,
  helmetMiddleware,
  rateLimiters,
  requestSizeLimiter,
  sameOriginGuard,
} from "./security";
import { notificationWS } from "../notificationWebSocketService";
import { dashboardWS } from "../dashboardWebSocketService";
import { realtimeWebSocketService } from "../realtimeWebSocketService";
import { externalApiRouter } from "../externalApi";
import { startEmailQueueProcessor } from "../emailQueueService";
import { healthCheck, livenessProbe, readinessProbe, startupProbe } from "./healthCheck";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Configure the Express application: security middleware first, then routes.
 *
 * Exported separately from startServer() (which listens and wires Vite/static
 * hosting) so integration tests can exercise the real HTTP stack — headers,
 * CORS, rate limiting, CSRF guard, authenticated file serving — via supertest.
 */
export function configureApp(app: express.Express): void {
  // Trust the first proxy hop (nginx / APISIX) so rate limiting keys on the
  // real client IP from X-Forwarded-For instead of the gateway address.
  app.set("trust proxy", 1);

  // Security headers: CSP, HSTS, frameguard, nosniff, referrer policy.
  app.use(helmetMiddleware());

  // Restrictive, credentialed CORS: same-origin + explicit allow-list only.
  app.use(corsMiddleware());

  // Global API rate limiting (health/metrics probes are exempt).
  app.use("/api/", rateLimiters.api);

  // Stricter throttling on authentication endpoints (brute-force protection).
  app.use(["/api/oauth/", "/api/auth/"], rateLimiters.auth);

  // Reject cross-site cookie-riding mutations (CSRF defense-in-depth).
  app.use("/api/", sameOriginGuard());

  // Request size guard, then body parsers. 50mb accommodates scanned land
  // documents uploaded as base64; tighten via MAX_REQUEST_SIZE at the edge.
  const maxBodySize = process.env.MAX_REQUEST_SIZE || "50mb";
  app.use(requestSizeLimiter(maxBodySize));
  app.use(express.json({ limit: maxBodySize }));
  app.use(express.urlencoded({ limit: maxBodySize, extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Local-storage file serving (self-hosted deployments): serves files written
  // by the filesystem storage backend in server/storage.ts. Keys are resolved
  // against the storage root with path-traversal protection. Uploaded land
  // documents (titles, surveys, identity documents) are sensitive, so a valid
  // session is required — these URLs must never be publicly guessable.
  app.get("/api/files/*", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    try {
      const { resolveLocalStoragePath } = await import("../storage");
      const relKey = (req.params as Record<string, string>)[0] ?? "";
      const filePath = resolveLocalStoragePath(relKey);
      res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) {
          res.status(404).json({ error: "File not found" });
        }
      });
    } catch {
      res.status(400).json({ error: "Invalid file key" });
    }
  });

  // Health, readiness, and startup probes for load balancers, nginx, and smoke tests
  app.get('/health', livenessProbe);
  app.get('/ready', readinessProbe);
  app.get('/startup', startupProbe);
  app.get('/api/health', healthCheck);
  app.get('/api/ready', readinessProbe);
  app.get('/api/startup', startupProbe);

  // External integrator API (x-api-key authenticated, read-only)
  app.use("/api/v1/external", externalApiRouter);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  configureApp(app);

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  const enableRealtimeServices = process.env.ENABLE_REALTIME_SERVICES === 'true' || process.env.NODE_ENV !== 'development';
  const enableBackgroundJobs = process.env.ENABLE_BACKGROUND_JOBS === 'true' || process.env.NODE_ENV !== 'development';

  if (enableRealtimeServices) {
    // All three WebSocket services authenticate the upgrade request against
    // the session pipeline before accepting the connection.
    notificationWS.initialize(server);
    dashboardWS.initialize(server);
    realtimeWebSocketService.initialize(server);
  } else {
    console.log('Realtime WebSocket services are disabled for the current runtime');
  }

  if (enableBackgroundJobs) {
    startEmailQueueProcessor();

    const { startAggregationScheduler } = await import('../dataAggregationScheduler');
    startAggregationScheduler();
  } else {
    console.log('Background processors are disabled for the current runtime');
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

// Auto-start only when running the server directly — never under the test
// runner, which imports configureApp to build its own in-process instance.
if (!process.env.VITEST) {
  startServer().catch(console.error);
}
