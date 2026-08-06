import { createServer } from "node:http";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./stakeholderJourneyActivities";
import { stakeholderJourneyPrometheusMetrics } from "./stakeholderJourneyMetrics";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the stakeholder journey worker`);
  return value;
}

function metricsPort(): number {
  const value = Number.parseInt(process.env.STAKEHOLDER_JOURNEY_WORKER_METRICS_PORT ?? "9465", 10);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error("STAKEHOLDER_JOURNEY_WORKER_METRICS_PORT must be a valid unprivileged TCP port");
  return value;
}

function startWorkerHealthServer() {
  let ready = false;
  const server = createServer((request, response) => {
    if (request.url === "/health" || request.url === "/ready") {
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ status: ready ? "ready" : "starting", worker: "stakeholder-journeys" }));
      return;
    }
    if (request.url === "/metrics") {
      response.writeHead(200, { "content-type": "text/plain; version=0.0.4", "cache-control": "no-store" });
      response.end(`# HELP stakeholder_journey_temporal_worker_up Whether the dedicated stakeholder-journey Temporal worker is ready to poll its queue.\n# TYPE stakeholder_journey_temporal_worker_up gauge\nstakeholder_journey_temporal_worker_up ${ready ? 1 : 0}\n${stakeholderJourneyPrometheusMetrics()}`);
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(metricsPort(), "0.0.0.0");
  return { markReady: () => { ready = true; }, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

async function main() {
  const health = startWorkerHealthServer();
  const address = required("TEMPORAL_ADDRESS");
  const namespace = required("TEMPORAL_NAMESPACE");
  const taskQueue = required("TEMPORAL_STAKEHOLDER_JOURNEY_TASK_QUEUE");
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === "true";
  if (process.env.NODE_ENV === "production" && !tlsEnabled) {
    throw new Error("TEMPORAL_TLS_ENABLED=true is required for the stakeholder journey worker in production");
  }
  try {
    const connection = await NativeConnection.connect({
      address,
      tls: tlsEnabled
        ? { clientCertPair: { crt: Buffer.from(required("TEMPORAL_TLS_CERT")), key: Buffer.from(required("TEMPORAL_TLS_KEY")) } }
        : undefined,
    });
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: require.resolve("./workflows/stakeholderJourneyWorkflow"),
      activities,
      maxConcurrentActivityTaskExecutions: 12,
      maxConcurrentWorkflowTaskExecutions: 12,
    });
    health.markReady();
    console.info(`[StakeholderJourneyWorker] started for namespace ${namespace} on ${taskQueue}`);
    await worker.run();
  } finally {
    await health.close();
  }
}

main().catch((error) => {
  console.error("[StakeholderJourneyWorker] startup failed", error);
  process.exit(1);
});
