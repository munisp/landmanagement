import { Connection, WorkflowClient } from "@temporalio/client";

function requiredConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for the Context Globe Temporal scheduler`);
  return value;
}

function integerConfig(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
}

async function run() {
  const address = requiredConfig("TEMPORAL_ADDRESS");
  const namespace = requiredConfig("TEMPORAL_NAMESPACE");
  const taskQueue = requiredConfig("TEMPORAL_CONTEXT_GLOBE_TASK_QUEUE");
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === "true";
  if (process.env.NODE_ENV === "production" && !tlsEnabled) throw new Error("TEMPORAL_TLS_ENABLED=true is required in production");
  const tls = tlsEnabled ? { clientCertPair: { crt: Buffer.from(requiredConfig("TEMPORAL_TLS_CERT"), "utf-8"), key: Buffer.from(requiredConfig("TEMPORAL_TLS_KEY"), "utf-8") } } : undefined;
  const pollIntervalSeconds = integerConfig("CONTEXT_TEMPORAL_RECONCILE_SECONDS", 300, 60, 3600);
  const workflowId = process.env.CONTEXT_TEMPORAL_WORKFLOW_ID?.trim() || "context-globe-reconciliation-v1";
  const connection = await Connection.connect({ address, tls });
  const client = new WorkflowClient({ connection, namespace });
  try {
    const handle = await client.start("contextGlobeReconciliationWorkflow", { taskQueue, workflowId, args: [{ pollIntervalSeconds }] });
    console.info(`Started Context Globe reconciliation workflow ${handle.workflowId} on ${taskQueue}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already started|already exists|workflow execution already started/i.test(message)) {
      console.info(`Context Globe reconciliation workflow ${workflowId} is already running`);
      return;
    }
    throw error;
  }
}

run().catch((error) => {
  console.error("Context Globe Temporal scheduler failed:", error);
  process.exit(1);
});
