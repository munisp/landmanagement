import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./commercialBillingActivities";

function requiredConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for the commercial billing Temporal worker`);
  return value;
}

async function run() {
  const address = requiredConfig("TEMPORAL_ADDRESS");
  const namespace = requiredConfig("TEMPORAL_NAMESPACE");
  const taskQueue = requiredConfig("TEMPORAL_COMMERCIAL_BILLING_TASK_QUEUE");
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === "true";
  if (process.env.NODE_ENV === "production" && !tlsEnabled) throw new Error("TEMPORAL_TLS_ENABLED=true is required in production");
  const tls = tlsEnabled ? { clientCertPair: { crt: Buffer.from(requiredConfig("TEMPORAL_TLS_CERT"), "utf-8"), key: Buffer.from(requiredConfig("TEMPORAL_TLS_KEY"), "utf-8") } } : undefined;
  const connection = await NativeConnection.connect({ address, tls });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: require.resolve("./workflows/commercialBillingWorkflow"),
    activities,
    maxConcurrentActivityTaskExecutions: 1,
    maxConcurrentWorkflowTaskExecutions: 1,
  });
  console.info(`Commercial billing Temporal worker started for namespace ${namespace}, task queue ${taskQueue}, address ${address}`);
  await worker.run();
}

run().catch((error) => {
  console.error("Commercial billing Temporal worker failed:", error);
  process.exit(1);
});
