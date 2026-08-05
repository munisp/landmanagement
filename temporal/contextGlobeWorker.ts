import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./contextGlobeActivities";

function requiredConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for the Context Globe Temporal worker`);
  return value;
}

async function run() {
  const address = requiredConfig("TEMPORAL_ADDRESS");
  const namespace = requiredConfig("TEMPORAL_NAMESPACE");
  const taskQueue = requiredConfig("TEMPORAL_CONTEXT_GLOBE_TASK_QUEUE");
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === "true";
  if (process.env.NODE_ENV === "production" && !tlsEnabled) throw new Error("TEMPORAL_TLS_ENABLED=true is required in production");
  const tls = tlsEnabled ? { clientCertPair: { crt: Buffer.from(requiredConfig("TEMPORAL_TLS_CERT"), "utf-8"), key: Buffer.from(requiredConfig("TEMPORAL_TLS_KEY"), "utf-8") } } : undefined;
  const connection = await NativeConnection.connect({ address, tls });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: require.resolve("./workflows/contextGlobeWorkflow"),
    activities,
    maxConcurrentActivityTaskExecutions: 2,
    maxConcurrentWorkflowTaskExecutions: 2,
  });
  console.info(`Context Globe Temporal worker started for namespace ${namespace}, task queue ${taskQueue}, address ${address}`);
  await worker.run();
}

run().catch((error) => {
  console.error("Context Globe Temporal worker failed:", error);
  process.exit(1);
});
