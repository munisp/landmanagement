import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./onboardingActivationActivities";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const address = required("TEMPORAL_ADDRESS");
  const namespace = required("TEMPORAL_NAMESPACE");
  const taskQueue = required("TEMPORAL_ONBOARDING_ACTIVATION_TASK_QUEUE");
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === "true";
  if (process.env.NODE_ENV === "production" && !tlsEnabled) throw new Error("TEMPORAL_TLS_ENABLED=true is required in production");
  const connection = await NativeConnection.connect({
    address,
    tls: tlsEnabled ? { clientCertPair: { crt: Buffer.from(required("TEMPORAL_TLS_CERT")), key: Buffer.from(required("TEMPORAL_TLS_KEY")) } } : undefined,
  });
  const worker = await Worker.create({ connection, namespace, taskQueue, workflowsPath: require.resolve("./workflows/onboardingActivationWorkflow"), activities });
  await worker.run();
}

main().catch((error) => {
  console.error("[OnboardingActivationWorker] startup failed", error);
  process.exit(1);
});
