/**
 * Temporal Worker
 * 
 * The worker polls the Temporal server for workflow and activity tasks,
 * executes them, and reports the results back to the server.
 */

import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { propertyTransactionWorkflow } from './workflows/propertyTransactionWorkflow';

async function run() {
  // Connect to Temporal server
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    // TLS configuration for production
    tls: process.env.TEMPORAL_TLS_ENABLED === 'true' ? {
      clientCertPair: {
        crt: Buffer.from(process.env.TEMPORAL_TLS_CERT || '', 'utf-8'),
        key: Buffer.from(process.env.TEMPORAL_TLS_KEY || '', 'utf-8'),
      },
    } : undefined,
  });

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
    taskQueue: 'property-transactions',
    workflowsPath: require.resolve('./workflows/propertyTransactionWorkflow'),
    activities,
    maxConcurrentActivityTaskExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 10,
  });

  console.log('✅ Temporal worker started');
  console.log(`   Namespace: ${process.env.TEMPORAL_NAMESPACE || 'default'}`);
  console.log(`   Task Queue: property-transactions`);
  console.log(`   Address: ${process.env.TEMPORAL_ADDRESS || 'localhost:7233'}`);

  // Run the worker
  await worker.run();
}

run().catch((err) => {
  console.error('❌ Temporal worker failed:', err);
  process.exit(1);
});
