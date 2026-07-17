# Temporal Workflow Orchestration - Deployment & Integration Guide

## Overview

This guide provides comprehensive instructions for deploying and integrating Temporal workflow orchestration for the IDLR-PTS platform. Temporal enables durable, fault-tolerant execution of complex multi-step property transaction workflows with automatic retry, compensation (saga pattern), and long-running state management.

**Key Benefits:**
- **Durable Execution**: Workflows survive process restarts and infrastructure failures
- **Automatic Retry**: Failed activities are automatically retried with exponential backoff
- **Saga Pattern**: Built-in compensation logic for rolling back failed transactions
- **Visibility**: Complete audit trail and real-time monitoring of workflow state
- **Scalability**: Horizontal scaling of workers for high throughput

---

## Architecture

### Workflow Overview

The property transaction workflow orchestrates the complete lifecycle:

```
1. Payment Processing (Mojaloop)
   ↓
2. Blockchain Escrow Creation (Polygon)
   ↓
3. Ledger Reconciliation (TigerBeetle)
   ↓
4. Property Title Transfer (Database)
   ↓
5. Transaction Complete
```

**Saga Pattern**: If any step fails, the workflow automatically compensates (rolls back) previous steps in reverse order.

### Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **Workflow Definition** | Defines the transaction flow and compensation logic | `temporal/workflows/propertyTransactionWorkflow.ts` |
| **Activity Implementations** | Individual task implementations (payment, blockchain, ledger, title) | `temporal/activities/index.ts` |
| **Temporal Worker** | Polls for tasks and executes workflows/activities | `temporal/worker.ts` |
| **Temporal Client** | Starts workflows and queries state | `server/temporalClient.ts` |
| **Temporal Server** | Manages workflow state and task queues | External service (deployed separately) |

---

## Deployment

### Option 1: Docker Compose (Development)

**Prerequisites:**
- Docker 20.10+
- Docker Compose 2.0+

**Step 1: Create Docker Compose File**

Create `docker-compose.temporal.yml`:

```yaml
version: '3.8'

services:
  postgresql:
    image: postgres:15-alpine
    environment:
      POSTGRES_PASSWORD: temporal
      POSTGRES_USER: temporal
      POSTGRES_DB: temporal
    ports:
      - "5432:5432"
    volumes:
      - temporal-postgres-data:/var/lib/postgresql/data

  temporal:
    image: temporalio/auto-setup:1.22.4
    depends_on:
      - postgresql
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=temporal
      - POSTGRES_PWD=temporal
      - POSTGRES_SEEDS=postgresql
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development-sql.yaml
    ports:
      - "7233:7233"
    volumes:
      - ./temporal-dynamicconfig:/etc/temporal/config/dynamicconfig

  temporal-admin-tools:
    image: temporalio/admin-tools:1.22.4
    depends_on:
      - temporal
    environment:
      - TEMPORAL_CLI_ADDRESS=temporal:7233
    stdin_open: true
    tty: true

  temporal-ui:
    image: temporalio/ui:2.21.3
    depends_on:
      - temporal
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3000
    ports:
      - "8080:8080"

volumes:
  temporal-postgres-data:
```

**Step 2: Start Temporal Server**

```bash
docker-compose -f docker-compose.temporal.yml up -d
```

**Step 3: Verify Deployment**

```bash
# Check service health
docker-compose -f docker-compose.temporal.yml ps

# Access Temporal UI
open http://localhost:8080
```

### Option 2: Kubernetes with Helm (Production)

**Prerequisites:**
- Kubernetes 1.23+
- Helm 3.10+
- kubectl configured

**Step 1: Add Temporal Helm Repository**

```bash
helm repo add temporalio https://go.temporal.io/helm-charts
helm repo update
```

**Step 2: Create Values File**

Create `temporal-values.yaml`:

```yaml
server:
  replicaCount: 3
  resources:
    requests:
      cpu: "1"
      memory: "2Gi"
    limits:
      cpu: "2"
      memory: "4Gi"
  
  config:
    persistence:
      default:
        driver: "sql"
        sql:
          driver: "postgres"
          host: "postgresql.default.svc.cluster.local"
          port: 5432
          database: "temporal"
          user: "temporal"
          password: "temporal"
          maxConns: 20
          maxConnLifetime: "1h"
      
      visibility:
        driver: "sql"
        sql:
          driver: "postgres"
          host: "postgresql.default.svc.cluster.local"
          port: 5432
          database: "temporal_visibility"
          user: "temporal"
          password: "temporal"
          maxConns: 10
          maxConnLifetime: "1h"

web:
  enabled: true
  replicaCount: 2
  service:
    type: LoadBalancer
    port: 8080

cassandra:
  enabled: false

postgresql:
  enabled: true
  auth:
    username: temporal
    password: temporal
    database: temporal
  primary:
    persistence:
      size: 100Gi
```

**Step 3: Deploy Temporal**

```bash
# Create namespace
kubectl create namespace temporal

# Install Temporal
helm install temporal temporalio/temporal \
  --namespace temporal \
  --values temporal-values.yaml \
  --wait

# Verify deployment
kubectl get pods -n temporal
```

**Step 4: Expose Temporal UI**

```bash
# Port forward for local access
kubectl port-forward -n temporal svc/temporal-web 8080:8080

# Or create Ingress
kubectl apply -f - <<EOF
apiVersion: networking.k8.io/v1
kind: Ingress
metadata:
  name: temporal-ui
  namespace: temporal
spec:
  rules:
  - host: temporal.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: temporal-web
            port:
              number: 8080
EOF
```

### Option 3: Temporal Cloud (Managed Service)

**Prerequisites:**
- Temporal Cloud account
- Temporal CLI installed

**Step 1: Create Namespace**

```bash
temporal cloud namespace create \
  --namespace idlr-pts-production \
  --region us-west-2 \
  --retention-days 30
```

**Step 2: Generate mTLS Certificates**

```bash
# Generate private key
openssl genrsa -out temporal-client.key 2048

# Generate certificate signing request
openssl req -new -key temporal-client.key \
  -out temporal-client.csr \
  -subj "/CN=idlr-pts-client"

# Generate self-signed certificate (or use CA)
openssl x509 -req -days 365 \
  -in temporal-client.csr \
  -signkey temporal-client.key \
  -out temporal-client.crt
```

**Step 3: Upload Certificate to Temporal Cloud**

```bash
temporal cloud namespace certificate add \
  --namespace idlr-pts-production \
  --certificate-file temporal-client.crt
```

**Step 4: Configure Environment Variables**

```bash
export TEMPORAL_ADDRESS="idlr-pts-production.tmprl.cloud:7233"
export TEMPORAL_NAMESPACE="idlr-pts-production"
export TEMPORAL_TLS_ENABLED="true"
export TEMPORAL_TLS_CERT="$(cat temporal-client.crt)"
export TEMPORAL_TLS_KEY="$(cat temporal-client.key)"
```

---

## Worker Deployment

### Development (Local)

**Step 1: Build Worker**

```bash
cd /home/ubuntu/idlr-pts-platform
pnpm build:worker
```

**Step 2: Start Worker**

```bash
# Set environment variables
export TEMPORAL_ADDRESS="localhost:7233"
export TEMPORAL_NAMESPACE="default"

# Start worker
npx tsx temporal/worker.ts
```

### Production (Docker)

**Step 1: Create Dockerfile**

Create `Dockerfile.worker`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY .npmrc ./

# Install dependencies
RUN npm install -g pnpm@10.4.1
RUN pnpm install --frozen-lockfile --prod

# Copy source code
COPY temporal ./temporal
COPY server ./server
COPY drizzle ./drizzle
COPY shared ./shared

# Build TypeScript
RUN pnpm tsc

# Start worker
CMD ["node", "dist/temporal/worker.js"]
```

**Step 2: Build and Push Image**

```bash
# Build image
docker build -f Dockerfile.worker -t idlr-pts-worker:latest .

# Tag for registry
docker tag idlr-pts-worker:latest your-registry.com/idlr-pts-worker:latest

# Push to registry
docker push your-registry.com/idlr-pts-worker:latest
```

**Step 3: Deploy to Kubernetes**

Create `worker-deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: temporal-worker
  namespace: idlr-pts
spec:
  replicas: 3
  selector:
    matchLabels:
      app: temporal-worker
  template:
    metadata:
      labels:
        app: temporal-worker
    spec:
      containers:
      - name: worker
        image: your-registry.com/idlr-pts-worker:latest
        env:
        - name: TEMPORAL_ADDRESS
          value: "temporal.temporal.svc.cluster.local:7233"
        - name: TEMPORAL_NAMESPACE
          value: "default"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: database-credentials
              key: url
        - name: MOJALOOP_API_URL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: mojaloop-api-url
        resources:
          requests:
            cpu: "500m"
            memory: "1Gi"
          limits:
            cpu: "1"
            memory: "2Gi"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: temporal-worker-hpa
  namespace: idlr-pts
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: temporal-worker
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

Deploy:

```bash
kubectl apply -f worker-deployment.yaml
```

---

## Application Integration

### Step 1: Initialize Temporal Client

In `server/index.ts`, add:

```typescript
import { initializeTemporalClient, shutdownTemporalClient } from './temporalClient';

// Initialize on startup
async function startServer() {
  // ... existing code ...
  
  // Initialize Temporal client
  const temporalReady = await initializeTemporalClient();
  if (!temporalReady) {
    console.error('Failed to initialize Temporal client');
    process.exit(1);
  }
  
  // ... rest of server setup ...
}

// Shutdown on exit
process.on('SIGTERM', async () => {
  await shutdownTemporalClient();
  process.exit(0);
});
```

### Step 2: Create tRPC Procedures

Add to `server/routers.ts`:

```typescript
import {
  startPropertyTransactionWorkflow,
  approvePaymentForWorkflow,
  cancelWorkflow,
  getWorkflowState,
  getWorkflowProgress,
  waitForWorkflowCompletion,
  listPropertyWorkflows,
} from './temporalClient';

// In appRouter:
workflows: t.router({
  // Start a new property transaction workflow
  startTransaction: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      buyerId: z.string(),
      sellerId: z.string(),
      amount: z.string(),
      currency: z.string(),
      paymentMethod: z.enum(['mojaloop', 'card', 'bank_transfer']),
    }))
    .mutation(async ({ input }) => {
      const result = await startPropertyTransactionWorkflow(input);
      return result;
    }),

  // Approve payment for a workflow
  approvePayment: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
      approvalCode: z.string(),
    }))
    .mutation(async ({ input }) => {
      await approvePaymentForWorkflow(input.workflowId, input.approvalCode);
      return { success: true };
    }),

  // Cancel a workflow
  cancel: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await cancelWorkflow(input.workflowId);
      return { success: true };
    }),

  // Get workflow state
  getState: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
    }))
    .query(async ({ input }) => {
      const state = await getWorkflowState(input.workflowId);
      return state;
    }),

  // Get workflow progress (0-100%)
  getProgress: protectedProcedure
    .input(z.object({
      workflowId: z.string(),
    }))
    .query(async ({ input }) => {
      const progress = await getWorkflowProgress(input.workflowId);
      return { progress };
    }),

  // List all workflows for a property
  listByProperty: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
    }))
    .query(async ({ input }) => {
      const workflows = await listPropertyWorkflows(input.propertyId);
      return workflows;
    }),
}),
```

### Step 3: Create Frontend UI

Create `client/src/pages/PropertyTransactionWorkflow.tsx`:

```typescript
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export function PropertyTransactionWorkflow({ propertyId }: { propertyId: string }) {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  
  const startMutation = trpc.workflows.startTransaction.useMutation();
  const approveMutation = trpc.workflows.approvePayment.useMutation();
  const { data: state } = trpc.workflows.getState.useQuery(
    { workflowId: workflowId! },
    { enabled: !!workflowId, refetchInterval: 2000 }
  );
  const { data: progressData } = trpc.workflows.getProgress.useQuery(
    { workflowId: workflowId! },
    { enabled: !!workflowId, refetchInterval: 2000 }
  );

  const handleStart = async () => {
    const result = await startMutation.mutateAsync({
      propertyId,
      buyerId: 'buyer-123',
      sellerId: 'seller-456',
      amount: '1000000',
      currency: 'NGN',
      paymentMethod: 'mojaloop',
    });
    setWorkflowId(result.workflowId);
  };

  const handleApprove = async () => {
    if (!workflowId) return;
    await approveMutation.mutateAsync({
      workflowId,
      approvalCode: '123456',
    });
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Property Transaction</h2>
      
      {!workflowId ? (
        <Button onClick={handleStart}>Start Transaction</Button>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Workflow ID</p>
            <p className="font-mono text-sm">{workflowId}</p>
          </div>

          {state && (
            <>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-semibold">{state.status}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Current Step</p>
                <p>{state.currentStep}</p>
              </div>

              {progressData && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Progress</p>
                  <Progress value={progressData.progress} />
                  <p className="text-sm text-right mt-1">{progressData.progress.toFixed(0)}%</p>
                </div>
              )}

              {state.status === 'payment_processing' && (
                <Button onClick={handleApprove}>Approve Payment</Button>
              )}

              {state.completedSteps.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Completed Steps</p>
                  <ul className="list-disc list-inside space-y-1">
                    {state.completedSteps.map((step, i) => (
                      <li key={i} className="text-sm">{step}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
```

---

## Monitoring & Operations

### Temporal UI

Access the Temporal UI at `http://localhost:8080` (or your configured URL).

**Key Features:**
- View all running and completed workflows
- Inspect workflow execution history
- Retry failed workflows
- Cancel running workflows
- View activity logs and errors

### Metrics & Alerting

**Prometheus Integration:**

Temporal exposes Prometheus metrics at `/metrics` endpoint.

Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: 'temporal'
    static_configs:
      - targets: ['temporal:7233']
```

**Key Metrics:**
- `temporal_workflow_completed_total` - Total completed workflows
- `temporal_workflow_failed_total` - Total failed workflows
- `temporal_activity_execution_latency` - Activity execution time
- `temporal_worker_task_slots_available` - Available worker capacity

**Grafana Dashboard:**

Import the official Temporal dashboard:
- Dashboard ID: 14074
- URL: https://grafana.com/grafana/dashboards/14074

### Logging

**Structured Logging:**

Configure structured logging in `temporal/worker.ts`:

```typescript
import { DefaultLogger, LogLevel } from '@temporalio/worker';

const logger = new DefaultLogger(LogLevel.INFO, (entry) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: entry.level,
    message: entry.message,
    meta: entry.meta,
  }));
});

const worker = await Worker.create({
  // ... other config ...
  logger,
});
```

**Log Aggregation:**

Forward logs to centralized logging system (ELK, Loki, etc.):

```bash
# Example: Forward to Loki
docker run -d \
  --name promtail \
  -v /var/log:/var/log \
  -v /path/to/promtail-config.yaml:/etc/promtail/config.yaml \
  grafana/promtail:latest \
  -config.file=/etc/promtail/config.yaml
```

---

## Testing

### Unit Tests

Test individual activities:

```typescript
// temporal/activities/__tests__/payment.test.ts
import { describe, it, expect, vi } from 'vitest';
import { initiatePayment } from '../index';

describe('Payment Activities', () => {
  it('should initiate payment successfully', async () => {
    const result = await initiatePayment({
      amount: '1000',
      currency: 'NGN',
      payerId: 'payer-123',
      payeeId: 'payee-456',
      propertyId: 'prop-789',
      paymentMethod: 'mojaloop',
    });

    expect(result.paymentId).toBeDefined();
    expect(result.status).toBe('initiated');
  });
});
```

### Integration Tests

Test complete workflows:

```typescript
// temporal/__tests__/workflow.test.ts
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { propertyTransactionWorkflow } from '../workflows/propertyTransactionWorkflow';
import * as activities from '../activities';

describe('Property Transaction Workflow', () => {
  let testEnv: TestWorkflowEnvironment;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('should complete transaction successfully', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      taskQueue: 'test',
      workflowsPath: require.resolve('../workflows/propertyTransactionWorkflow'),
      activities,
    });

    await worker.runUntil(async () => {
      const result = await testEnv.client.workflow.execute(propertyTransactionWorkflow, {
        taskQueue: 'test',
        workflowId: 'test-workflow',
        args: [{
          propertyId: 'prop-123',
          buyerId: 'buyer-456',
          sellerId: 'seller-789',
          amount: '1000000',
          currency: 'NGN',
          paymentMethod: 'mojaloop',
        }],
      });

      expect(result.status).toBe('completed');
      expect(result.completedSteps).toHaveLength(5);
    });
  });
});
```

---

## Troubleshooting

### Common Issues

**Issue: Worker not connecting to Temporal server**

```
Error: Failed to connect to Temporal server at localhost:7233
```

**Solution:**
- Verify Temporal server is running: `docker ps | grep temporal`
- Check network connectivity: `telnet localhost 7233`
- Verify environment variables: `echo $TEMPORAL_ADDRESS`

**Issue: Workflow stuck in "Running" state**

**Solution:**
- Check worker logs for errors: `kubectl logs -n idlr-pts temporal-worker-xxx`
- Verify worker is polling the correct task queue
- Check activity timeouts in workflow definition
- Use Temporal UI to inspect workflow history

**Issue: Activities timing out**

**Solution:**
- Increase `startToCloseTimeout` in activity configuration
- Check external service availability (Mojaloop, Blockchain, TigerBeetle)
- Review activity logs for slow operations
- Consider breaking long-running activities into smaller steps

**Issue: Compensation (rollback) failing**

**Solution:**
- Ensure compensation activities are idempotent
- Add retry logic to compensation activities
- Log compensation failures for manual intervention
- Implement dead letter queue for failed compensations

---

## Security

### mTLS Authentication

For production deployments, enable mTLS:

```typescript
// temporal/worker.ts
import { NativeConnection, Worker } from '@temporalio/worker';
import fs from 'fs';

const connection = await NativeConnection.connect({
  address: process.env.TEMPORAL_ADDRESS!,
  tls: {
    clientCertPair: {
      crt: fs.readFileSync(process.env.TEMPORAL_TLS_CERT_PATH!),
      key: fs.readFileSync(process.env.TEMPORAL_TLS_KEY_PATH!),
    },
    serverRootCACertificate: fs.readFileSync(process.env.TEMPORAL_TLS_CA_PATH!),
    serverNameOverride: process.env.TEMPORAL_TLS_SERVER_NAME,
  },
});
```

### Data Encryption

Encrypt sensitive workflow data:

```typescript
import { DataConverter } from '@temporalio/common';
import { encrypt, decrypt } from './encryption';

const dataConverter: DataConverter = {
  toPayload: async (value) => {
    const json = JSON.stringify(value);
    const encrypted = await encrypt(json);
    return {
      metadata: { encoding: 'json/encrypted' },
      data: Buffer.from(encrypted),
    };
  },
  fromPayload: async (payload) => {
    const encrypted = payload.data.toString();
    const json = await decrypt(encrypted);
    return JSON.parse(json);
  },
};

const worker = await Worker.create({
  // ... other config ...
  dataConverter,
});
```

---

## Performance Tuning

### Worker Configuration

Optimize worker performance:

```typescript
const worker = await Worker.create({
  connection,
  taskQueue: 'property-transactions',
  workflowsPath: require.resolve('./workflows/propertyTransactionWorkflow'),
  activities,
  
  // Increase concurrency for high throughput
  maxConcurrentActivityTaskExecutions: 100,
  maxConcurrentWorkflowTaskExecutions: 50,
  
  // Adjust polling intervals
  maxTaskQueueActivitiesPerSecond: 100,
  
  // Configure resource limits
  maxCachedWorkflows: 1000,
});
```

### Workflow Optimization

**Batch Operations:**

Instead of processing items one-by-one, batch them:

```typescript
// Instead of:
for (const item of items) {
  await processItem(item);
}

// Use:
await Promise.all(items.map(item => processItem(item)));
```

**Activity Caching:**

Cache frequently accessed data:

```typescript
let cachedData: any = null;

export async function getPropertyData(propertyId: string) {
  if (cachedData && cachedData.propertyId === propertyId) {
    return cachedData;
  }
  
  cachedData = await fetchPropertyData(propertyId);
  return cachedData;
}
```

---

## Best Practices

### Workflow Design

**Keep workflows deterministic:**
- ✅ Use `Date.now()` wrapped in activities
- ❌ Don't use `Date.now()` directly in workflows
- ✅ Use `sleep()` for delays
- ❌ Don't use `setTimeout()` or `setInterval()`

**Handle failures gracefully:**
- Set appropriate retry policies
- Implement compensation logic for all state-changing operations
- Log errors with sufficient context
- Use dead letter queues for unrecoverable failures

**Design for idempotency:**
- Activities should be safe to retry
- Use unique IDs to prevent duplicate operations
- Check state before making changes

### Activity Design

**Keep activities focused:**
- Each activity should do one thing well
- Break complex operations into multiple activities
- Use activity chaining for sequential operations

**Set appropriate timeouts:**
- `startToCloseTimeout`: Maximum execution time
- `scheduleToCloseTimeout`: Maximum time from scheduling to completion
- `scheduleToStartTimeout`: Maximum time waiting for worker

**Handle transient failures:**
- Use exponential backoff for retries
- Set maximum retry attempts
- Log retry attempts for debugging

---

## Migration & Rollback

### Workflow Versioning

When updating workflow logic, use versioning:

```typescript
import { patched, deprecatePatch } from '@temporalio/workflow';

export async function propertyTransactionWorkflow(input: PropertyTransactionInput) {
  // Version 1: Original implementation
  const version = patched('add-ledger-reconciliation');
  
  if (version) {
    // Version 2: New implementation with ledger reconciliation
    await createLedgerTransfer(...);
  }
  
  // Rest of workflow...
}
```

### Rollback Procedure

If a deployment causes issues:

**Step 1: Stop new workflows**

```bash
# Scale workers to 0
kubectl scale deployment temporal-worker --replicas=0 -n idlr-pts
```

**Step 2: Wait for in-flight workflows**

```bash
# Monitor running workflows in Temporal UI
# Wait for completion or manually terminate if necessary
```

**Step 3: Rollback code**

```bash
# Rollback to previous version
kubectl rollout undo deployment/temporal-worker -n idlr-pts
```

**Step 4: Resume workers**

```bash
# Scale workers back up
kubectl scale deployment temporal-worker --replicas=3 -n idlr-pts
```

---

## Appendix

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TEMPORAL_ADDRESS` | Temporal server address | `localhost:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `default` |
| `TEMPORAL_TLS_ENABLED` | Enable TLS | `true` |
| `TEMPORAL_TLS_CERT` | Client certificate (PEM) | `$(cat client.crt)` |
| `TEMPORAL_TLS_KEY` | Client private key (PEM) | `$(cat client.key)` |
| `TEMPORAL_TLS_CA` | CA certificate (PEM) | `$(cat ca.crt)` |
| `TEMPORAL_TLS_SERVER_NAME` | Server name for TLS | `temporal.example.com` |

### Useful Commands

```bash
# List all workflows
temporal workflow list

# Describe a workflow
temporal workflow describe --workflow-id=<workflow-id>

# Show workflow history
temporal workflow show --workflow-id=<workflow-id>

# Terminate a workflow
temporal workflow terminate --workflow-id=<workflow-id> --reason="Manual termination"

# Retry a failed workflow
temporal workflow reset --workflow-id=<workflow-id> --event-id=<event-id>

# Query workflow state
temporal workflow query --workflow-id=<workflow-id> --query-type=getState
```

### Resources

- **Temporal Documentation**: https://docs.temporal.io
- **TypeScript SDK**: https://typescript.temporal.io
- **Community Forum**: https://community.temporal.io
- **GitHub**: https://github.com/temporalio/temporal

---

**Author**: Manus AI  
**Last Updated**: February 2026  
**Version**: 1.0
