/**
 * Temporal Worker
 *
 * The worker polls the configured Temporal service for workflow and activity
 * tasks. Configuration is deliberately explicit: a worker must not attach to
 * an undeclared local cluster or a default namespace in production.
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';

function requiredConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for the Temporal worker`);
  return value;
}

async function run() {
  const address = requiredConfig('TEMPORAL_ADDRESS');
  const namespace = requiredConfig('TEMPORAL_NAMESPACE');
  const taskQueue = requiredConfig('TEMPORAL_PROPERTY_TRANSACTION_TASK_QUEUE');
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === 'true';
  if (process.env.NODE_ENV === 'production' && !tlsEnabled) {
    throw new Error('TEMPORAL_TLS_ENABLED=true is required for the Temporal worker in production');
  }
  const tls = tlsEnabled
    ? {
        clientCertPair: {
          crt: Buffer.from(requiredConfig('TEMPORAL_TLS_CERT'), 'utf-8'),
          key: Buffer.from(requiredConfig('TEMPORAL_TLS_KEY'), 'utf-8'),
        },
      }
    : undefined;

  const connection = await NativeConnection.connect({ address, tls });
  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    workflowsPath: require.resolve('./workflows/propertyTransactionWorkflow'),
    activities,
    maxConcurrentActivityTaskExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 10,
  });

  console.info(`Temporal worker started for namespace ${namespace}, task queue ${taskQueue}, address ${address}`);
  await worker.run();
}

run().catch((error) => {
  console.error('Temporal worker failed:', error);
  process.exit(1);
});
