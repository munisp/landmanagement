import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { notificationWS } from "../notificationWebSocketService";
import { dashboardWS } from "../dashboardWebSocketService";
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

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Local-storage file serving (self-hosted deployments): serves files written
  // by the filesystem storage backend in server/storage.ts. Keys are resolved
  // against the storage root with path-traversal protection.
  app.get("/api/files/*", async (req, res) => {
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

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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
    notificationWS.initialize(server);
    dashboardWS.initialize(server);
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

startServer().catch(console.error);
