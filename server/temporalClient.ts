/**
 * Temporal Client
 * 
 * Client for starting, querying, and managing Temporal workflows
 */

import { Client, Connection } from '@temporalio/client';
import {
  propertyTransactionWorkflow,
  type PropertyTransactionInput,
  type PropertyTransactionState,
  approvePaymentSignal,
  cancelTransactionSignal,
  getStateQuery,
  getProgressQuery,
} from '../temporal/workflows/propertyTransactionWorkflow';
import { geoAiAnalysisWorkflow, type GeoAiAnalysisWorkflowInput } from '../temporal/workflows/geoaiAnalysisWorkflow';
import { onboardingActivationWorkflow } from '../temporal/workflows/onboardingActivationWorkflow';
import { stakeholderJourneyWorkflow, journeyCancellationSignal, journeyInterventionSignal, type StakeholderJourneyWorkflowInput, type StakeholderJourneyWorkflowState, getStakeholderJourneyStateQuery } from '../temporal/workflows/stakeholderJourneyWorkflow';

let client: Client | null = null;

function requiredTemporalConfig(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for Temporal orchestration`);
  return value;
}

function temporalTaskQueue(): string {
  return requiredTemporalConfig('TEMPORAL_PROPERTY_TRANSACTION_TASK_QUEUE');
}

function geoAiTemporalTaskQueue(): string {
  return requiredTemporalConfig('TEMPORAL_GEOAI_TASK_QUEUE');
}

function onboardingActivationTaskQueue(): string {
  return requiredTemporalConfig('TEMPORAL_ONBOARDING_ACTIVATION_TASK_QUEUE');
}

function stakeholderJourneyTaskQueue(): string {
  return requiredTemporalConfig('TEMPORAL_STAKEHOLDER_JOURNEY_TASK_QUEUE');
}

/** Initialize Temporal client connection. */
export async function initializeTemporalClient(): Promise<true> {
  const address = requiredTemporalConfig('TEMPORAL_ADDRESS');
  const namespace = requiredTemporalConfig('TEMPORAL_NAMESPACE');
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === 'true';
  if (process.env.NODE_ENV === 'production' && !tlsEnabled) {
    throw new Error('TEMPORAL_TLS_ENABLED=true is required for Temporal orchestration in production');
  }
  const tls = tlsEnabled
    ? {
        clientCertPair: {
          crt: Buffer.from(requiredTemporalConfig('TEMPORAL_TLS_CERT'), 'utf-8'),
          key: Buffer.from(requiredTemporalConfig('TEMPORAL_TLS_KEY'), 'utf-8'),
        },
      }
    : undefined;
  const connection = await Connection.connect({ address, tls });
  client = new Client({ connection, namespace });
  console.info('Temporal client initialized');
  return true;
}

/**
 * Get Temporal client instance
 */
export function getTemporalClient(): Client {
  if (!client) {
    throw new Error('Temporal client not initialized. Call initializeTemporalClient() first.');
  }
  return client;
}

/**
 * Start a new property transaction workflow
 */
export async function startPropertyTransactionWorkflow(
  input: PropertyTransactionInput
): Promise<{ workflowId: string; runId: string }> {
  const temporalClient = getTemporalClient();

  const workflowId = `property-transaction-${input.propertyId}-${Date.now()}`;

  const handle = await temporalClient.workflow.start(propertyTransactionWorkflow, {
    taskQueue: temporalTaskQueue(),
    workflowId,
    args: [input],
    // Workflow timeout (max 7 days for long-running transactions)
    workflowExecutionTimeout: '7 days',
    // Workflow run timeout (max 24 hours per run)
    workflowRunTimeout: '24 hours',
    // Task timeout (max 1 minute per task)
    workflowTaskTimeout: '1 minute',
  });

  return {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  };
}

/** Start a durable, evidence-gated GeoAI workflow. */
export async function startGeoAiAnalysisWorkflow(input: GeoAiAnalysisWorkflowInput): Promise<{ workflowId: string; runId: string }> {
  if (!client) await initializeTemporalClient();
  const temporalClient = getTemporalClient();
  const workflowId = `geoai-analysis-${input.runId}-${Date.now()}`;
  const handle = await temporalClient.workflow.start(geoAiAnalysisWorkflow, {
    taskQueue: geoAiTemporalTaskQueue(),
    workflowId,
    args: [input],
    workflowExecutionTimeout: '24 hours',
    workflowRunTimeout: '12 hours',
    workflowTaskTimeout: '1 minute',
  });
  return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
}

/** Start one idempotent activation reconciliation per Dapr CloudEvent. */
export async function startOnboardingActivationWorkflow(input: { onboardingId: number; eventId: string }): Promise<{ workflowId: string; runId: string }> {
  if (!client) await initializeTemporalClient();
  const temporalClient = getTemporalClient();
  const workflowId = `onboarding-activation-${input.eventId}`;
  try {
    const handle = await temporalClient.workflow.start(onboardingActivationWorkflow, {
      taskQueue: onboardingActivationTaskQueue(),
      workflowId,
      args: [input],
      workflowExecutionTimeout: '5 minutes',
      workflowRunTimeout: '2 minutes',
      workflowTaskTimeout: '30 seconds',
    });
    return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
  } catch (error) {
    if (error instanceof Error && /already started|already exists/i.test(error.message)) return { workflowId, runId: 'existing' };
    throw error;
  }
}

/**
 * Approve payment for a workflow
 */
export async function approvePaymentForWorkflow(
  workflowId: string,
  approvalCode: string
): Promise<void> {
  const temporalClient = getTemporalClient();

  const handle = temporalClient.workflow.getHandle(workflowId);
  await handle.signal(approvePaymentSignal, approvalCode);
}

/**
 * Cancel a workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const temporalClient = getTemporalClient();

  const handle = temporalClient.workflow.getHandle(workflowId);
  await handle.signal(cancelTransactionSignal);
}

/**
 * Get workflow state
 */
export async function getWorkflowState(workflowId: string): Promise<PropertyTransactionState> {
  const temporalClient = getTemporalClient();

  const handle = temporalClient.workflow.getHandle(workflowId);
  return await handle.query(getStateQuery);
}

/**
 * Get workflow progress (0-100%)
 */
export async function getWorkflowProgress(workflowId: string): Promise<number> {
  const temporalClient = getTemporalClient();

  const handle = temporalClient.workflow.getHandle(workflowId);
  return await handle.query(getProgressQuery);
}

/**
 * Wait for workflow completion
 */
export async function waitForWorkflowCompletion(
  workflowId: string
): Promise<PropertyTransactionState> {
  const temporalClient = getTemporalClient();

  const handle = temporalClient.workflow.getHandle(workflowId);
  return await handle.result();
}

/**
 * List all workflows for a property
 */
export async function listPropertyWorkflows(propertyId: string): Promise<any[]> {
  const temporalClient = getTemporalClient();

  const workflows = [];
  
  for await (const workflow of temporalClient.workflow.list({
    query: `WorkflowId STARTS_WITH "property-transaction-${propertyId}-"`,
  })) {
    workflows.push({
      workflowId: workflow.workflowId,
      runId: workflow.runId,
      status: workflow.status.name,
      startTime: workflow.startTime,
      closeTime: workflow.closeTime,
    });
  }

  return workflows;
}

/**
 * Terminate a workflow (force stop)
 */
export async function terminateWorkflow(
  workflowId: string,
  reason: string
): Promise<void> {
  const temporalClient = getTemporalClient();

  const handle = temporalClient.workflow.getHandle(workflowId);
  await handle.terminate(reason);
}

/**
 * Shutdown Temporal client
 */
export async function shutdownTemporalClient(): Promise<void> {
  if (client) {
    client.connection.close();
    client = null;
    console.info('Temporal client shut down');
  }
}


/** Start a durable, idempotent reusable stakeholder journey workflow. */
export async function startStakeholderJourneyWorkflow(input: StakeholderJourneyWorkflowInput): Promise<{ workflowId: string; runId: string }> {
  if (!client) await initializeTemporalClient();
  const temporalClient = getTemporalClient();
  const workflowId = `stakeholder-journey-${input.runKey}`;
  try {
    const handle = await temporalClient.workflow.start(stakeholderJourneyWorkflow, {
      taskQueue: stakeholderJourneyTaskQueue(),
      workflowId,
      args: [input],
      workflowExecutionTimeout: '31 days',
      workflowRunTimeout: '31 days',
      workflowTaskTimeout: '1 minute',
    });
    return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
  } catch (error) {
    if (error instanceof Error && /already started|already exists/i.test(error.message)) {
      return { workflowId, runId: 'existing' };
    }
    throw error;
  }
}

/** Signal a resolved, already-authorized intervention to a journey workflow. */
export async function signalStakeholderJourneyIntervention(input: { workflowId: string; interventionKey: string }): Promise<void> {
  if (!client) await initializeTemporalClient();
  const handle = getTemporalClient().workflow.getHandle(input.workflowId);
  await handle.signal(journeyInterventionSignal, { interventionKey: input.interventionKey });
}

export async function signalStakeholderJourneyCancellation(workflowId: string): Promise<void> {
  if (!client) await initializeTemporalClient();
  await getTemporalClient().workflow.getHandle(workflowId).signal(journeyCancellationSignal);
}

export async function getStakeholderJourneyWorkflowState(workflowId: string): Promise<StakeholderJourneyWorkflowState> {
  if (!client) await initializeTemporalClient();
  return getTemporalClient().workflow.getHandle(workflowId).query(getStakeholderJourneyStateQuery);
}

export async function getTemporalOrchestrationReadiness(): Promise<{
  ready: true;
  namespace: string;
  taskQueues: string[];
  tlsEnabled: boolean;
}> {
  const namespace = requiredTemporalConfig('TEMPORAL_NAMESPACE');
  const propertyQueue = temporalTaskQueue();
  const geoAiQueue = geoAiTemporalTaskQueue();
  const tlsEnabled = process.env.TEMPORAL_TLS_ENABLED === 'true';
  if (process.env.NODE_ENV === 'production' && !tlsEnabled) {
    throw new Error('TEMPORAL_TLS_ENABLED=true is required for production readiness');
  }
  const initializedHere = !client;
  if (initializedHere) await initializeTemporalClient();
  try {
    return { ready: true, namespace, taskQueues: [propertyQueue, geoAiQueue, stakeholderJourneyTaskQueue()], tlsEnabled };
  } finally {
    if (initializedHere) await shutdownTemporalClient();
  }
}
