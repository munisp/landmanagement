# Apache Kafka Deployment and Integration Guide

**IDLR-PTS Platform - Event Streaming Architecture**

**Author**: Manus AI  
**Date**: February 2026  
**Version**: 1.0

---

## Executive Summary

This document provides comprehensive guidance for deploying and integrating Apache Kafka as the event streaming backbone of the Integrated Digital Land Registry & Property Title System (IDLR-PTS). Kafka enables real-time event processing and reconciliation between Mojaloop payments, Polygon blockchain transactions, and TigerBeetle financial ledger entries.

The implementation follows cloud-agnostic, open-source principles and provides high-throughput, fault-tolerant event streaming with exactly-once semantics for financial transactions.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Kafka Cluster Deployment](#kafka-cluster-deployment)
4. [Topic Configuration](#topic-configuration)
5. [Producer Integration](#producer-integration)
6. [Consumer Integration](#consumer-integration)
7. [Event Schema Design](#event-schema-design)
8. [Reconciliation Workflows](#reconciliation-workflows)
9. [Monitoring and Operations](#monitoring-and-operations)
10. [Security Configuration](#security-configuration)
11. [Performance Tuning](#performance-tuning)
12. [Disaster Recovery](#disaster-recovery)
13. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Event-Driven Architecture

The IDLR-PTS platform implements an event-driven architecture where Kafka serves as the central nervous system, coordinating events across three critical subsystems:

| Subsystem | Role | Event Types |
|-----------|------|-------------|
| **Mojaloop Payment Gateway** | Processes property transaction payments | Payment initiated, quote received, approved, executing, completed, failed, cancelled |
| **Polygon Blockchain** | Records immutable property ownership and escrow | Transaction submitted, confirmed, failed, escrow created/released/refunded |
| **TigerBeetle Ledger** | Maintains double-entry financial accounting | Account created, transfer created/posted/voided, reconciliation completed |

### Event Flow Diagram

```
┌─────────────────┐
│  Mojaloop       │
│  Payment        │──────┐
│  Gateway        │      │
└─────────────────┘      │
                         │  Payment Events
                         ▼
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐
│  Polygon        │──▶│  Apache Kafka    │◀──│  TigerBeetle    │
│  Blockchain     │   │  Event Streaming │   │  Ledger         │
└─────────────────┘   └──────────────────┘   └─────────────────┘
                         │                       ▲
                         │  Blockchain Events    │  Ledger Events
                         ▼                       │
                      ┌──────────────────────────┘
                      │  Reconciliation
                      │  Consumer
                      └──────────────────────────┐
                                                 ▼
                                          ┌─────────────┐
                                          │  Audit      │
                                          │  Trail DB   │
                                          └─────────────┘
```

### Key Benefits

**Real-Time Reconciliation**: Events are processed within milliseconds, ensuring payment, blockchain, and ledger states remain synchronized.

**Fault Tolerance**: Kafka's distributed architecture with replication ensures zero data loss even during node failures.

**Scalability**: Horizontal scaling through partitioning allows the system to handle millions of transactions per day.

**Audit Trail**: Every event is persisted in Kafka topics, providing an immutable audit log for regulatory compliance.

**Decoupling**: Producers and consumers operate independently, allowing each subsystem to evolve without impacting others.

---

## Prerequisites

### Infrastructure Requirements

| Component | Minimum | Recommended | Production |
|-----------|---------|-------------|------------|
| **Kafka Brokers** | 1 node | 3 nodes | 5+ nodes |
| **ZooKeeper Nodes** | 1 node | 3 nodes | 5 nodes |
| **CPU per Broker** | 4 cores | 8 cores | 16+ cores |
| **RAM per Broker** | 8 GB | 16 GB | 32+ GB |
| **Disk per Broker** | 100 GB SSD | 500 GB SSD | 1+ TB NVMe SSD |
| **Network** | 1 Gbps | 10 Gbps | 10+ Gbps |

### Software Dependencies

```bash
# Java Runtime (required for Kafka)
java -version  # OpenJDK 11 or 17

# Node.js (for IDLR-PTS application)
node --version  # v22.13.0

# KafkaJS client library (already installed)
pnpm list kafkajs  # 2.2.4
```

### Network Requirements

**Ports**:
- `9092`: Kafka broker (plaintext)
- `9093`: Kafka broker (SSL)
- `2181`: ZooKeeper client
- `2888`: ZooKeeper peer
- `3888`: ZooKeeper leader election

**Firewall Rules**: Ensure all Kafka brokers can communicate with each other and with ZooKeeper nodes. Application servers must reach Kafka brokers on port 9092/9093.

---

## Kafka Cluster Deployment

### Option 1: Docker Compose (Development/Testing)

Create `docker-compose.kafka.yml`:

```yaml
version: '3.8'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    hostname: zookeeper
    container_name: idlr-zookeeper
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    volumes:
      - zookeeper-data:/var/lib/zookeeper/data
      - zookeeper-logs:/var/lib/zookeeper/log
    networks:
      - idlr-network

  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    hostname: kafka-1
    container_name: idlr-kafka-1
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
      - "19092:19092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181'
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'
      KAFKA_LOG_RETENTION_HOURS: 168  # 7 days
      KAFKA_LOG_SEGMENT_BYTES: 1073741824  # 1 GB
      KAFKA_COMPRESSION_TYPE: snappy
    volumes:
      - kafka-1-data:/var/lib/kafka/data
    networks:
      - idlr-network

  kafka-2:
    image: confluentinc/cp-kafka:7.5.0
    hostname: kafka-2
    container_name: idlr-kafka-2
    depends_on:
      - zookeeper
    ports:
      - "9093:9093"
      - "19093:19093"
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181'
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:29093,PLAINTEXT_HOST://localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'
      KAFKA_LOG_RETENTION_HOURS: 168
      KAFKA_LOG_SEGMENT_BYTES: 1073741824
      KAFKA_COMPRESSION_TYPE: snappy
    volumes:
      - kafka-2-data:/var/lib/kafka/data
    networks:
      - idlr-network

  kafka-3:
    image: confluentinc/cp-kafka:7.5.0
    hostname: kafka-3
    container_name: idlr-kafka-3
    depends_on:
      - zookeeper
    ports:
      - "9094:9094"
      - "19094:19094"
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: 'zookeeper:2181'
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:29094,PLAINTEXT_HOST://localhost:9094
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'false'
      KAFKA_LOG_RETENTION_HOURS: 168
      KAFKA_LOG_SEGMENT_BYTES: 1073741824
      KAFKA_COMPRESSION_TYPE: snappy
    volumes:
      - kafka-3-data:/var/lib/kafka/data
    networks:
      - idlr-network

volumes:
  zookeeper-data:
  zookeeper-logs:
  kafka-1-data:
  kafka-2-data:
  kafka-3-data:

networks:
  idlr-network:
    driver: bridge
```

**Start the cluster**:

```bash
docker-compose -f docker-compose.kafka.yml up -d
```

**Verify cluster health**:

```bash
docker exec idlr-kafka-1 kafka-broker-api-versions --bootstrap-server localhost:9092
```

### Option 2: Kubernetes Deployment (Production)

Use the **Strimzi Kafka Operator** for production-grade Kubernetes deployment:

```bash
# Install Strimzi operator
kubectl create namespace kafka
kubectl create -f 'https://strimzi.io/install/latest?namespace=kafka' -n kafka

# Wait for operator to be ready
kubectl wait --for=condition=ready pod -l name=strimzi-cluster-operator -n kafka --timeout=300s
```

Create `kafka-cluster.yaml`:

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: idlr-kafka-cluster
  namespace: kafka
spec:
  kafka:
    version: 3.5.1
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
      - name: tls
        port: 9093
        type: internal
        tls: true
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
      inter.broker.protocol.version: "3.5"
      log.retention.hours: 168
      log.segment.bytes: 1073741824
      compression.type: snappy
      auto.create.topics.enable: false
    storage:
      type: persistent-claim
      size: 500Gi
      class: fast-ssd
    resources:
      requests:
        memory: 16Gi
        cpu: "4"
      limits:
        memory: 32Gi
        cpu: "8"
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 100Gi
      class: fast-ssd
    resources:
      requests:
        memory: 4Gi
        cpu: "2"
      limits:
        memory: 8Gi
        cpu: "4"
  entityOperator:
    topicOperator: {}
    userOperator: {}
```

**Deploy the cluster**:

```bash
kubectl apply -f kafka-cluster.yaml -n kafka

# Wait for cluster to be ready
kubectl wait kafka/idlr-kafka-cluster --for=condition=Ready --timeout=300s -n kafka
```

### Option 3: Cloud-Agnostic Managed Kafka

For production deployments without managing infrastructure, use cloud-agnostic Kafka services:

| Provider | Service | Pricing Model |
|----------|---------|---------------|
| **Aiven** | Aiven for Apache Kafka | Pay-as-you-go, starts at $100/month |
| **Instaclustr** | Managed Apache Kafka | Pay-as-you-go, starts at $150/month |
| **Confluent Cloud** | Fully managed Kafka | Pay-as-you-go, starts at $0.11/hour |

**Aiven Example**:

```bash
# Install Aiven CLI
pip3 install aiven-client

# Login
avn user login

# Create Kafka service
avn service create idlr-kafka \
  --service-type kafka \
  --cloud aws-us-east-1 \
  --plan business-4 \
  --project idlr-project

# Get connection details
avn service get idlr-kafka --format json
```

---

## Topic Configuration

### Topic Design

The IDLR-PTS platform uses five primary topics:

| Topic Name | Purpose | Partitions | Replication Factor | Retention |
|------------|---------|------------|-------------------|-----------|
| `idlr.payment.events` | Mojaloop payment lifecycle events | 6 | 3 | 7 days |
| `idlr.blockchain.events` | Polygon blockchain transaction events | 6 | 3 | 7 days |
| `idlr.ledger.events` | TigerBeetle ledger operation events | 6 | 3 | 7 days |
| `idlr.reconciliation.events` | Cross-system reconciliation results | 3 | 3 | 30 days |
| `idlr.dlq` | Dead letter queue for failed messages | 3 | 3 | 30 days |

### Create Topics

**Using Docker**:

```bash
docker exec idlr-kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic idlr.payment.events \
  --partitions 6 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config compression.type=snappy \
  --config min.insync.replicas=2

docker exec idlr-kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic idlr.blockchain.events \
  --partitions 6 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config compression.type=snappy \
  --config min.insync.replicas=2

docker exec idlr-kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic idlr.ledger.events \
  --partitions 6 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config compression.type=snappy \
  --config min.insync.replicas=2

docker exec idlr-kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic idlr.reconciliation.events \
  --partitions 3 \
  --replication-factor 3 \
  --config retention.ms=2592000000 \
  --config compression.type=snappy \
  --config min.insync.replicas=2

docker exec idlr-kafka-1 kafka-topics --create \
  --bootstrap-server localhost:9092 \
  --topic idlr.dlq \
  --partitions 3 \
  --replication-factor 3 \
  --config retention.ms=2592000000 \
  --config compression.type=snappy \
  --config min.insync.replicas=2
```

**Using Kubernetes**:

Create `kafka-topics.yaml`:

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: idlr.payment.events
  namespace: kafka
  labels:
    strimzi.io/cluster: idlr-kafka-cluster
spec:
  partitions: 6
  replicas: 3
  config:
    retention.ms: 604800000
    compression.type: snappy
    min.insync.replicas: 2
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: idlr.blockchain.events
  namespace: kafka
  labels:
    strimzi.io/cluster: idlr-kafka-cluster
spec:
  partitions: 6
  replicas: 3
  config:
    retention.ms: 604800000
    compression.type: snappy
    min.insync.replicas: 2
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: idlr.ledger.events
  namespace: kafka
  labels:
    strimzi.io/cluster: idlr-kafka-cluster
spec:
  partitions: 6
  replicas: 3
  config:
    retention.ms: 604800000
    compression.type: snappy
    min.insync.replicas: 2
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: idlr.reconciliation.events
  namespace: kafka
  labels:
    strimzi.io/cluster: idlr-kafka-cluster
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 2592000000
    compression.type: snappy
    min.insync.replicas: 2
---
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: idlr.dlq
  namespace: kafka
  labels:
    strimzi.io/cluster: idlr-kafka-cluster
spec:
  partitions: 3
  replicas: 3
  config:
    retention.ms: 2592000000
    compression.type: snappy
    min.insync.replicas: 2
```

```bash
kubectl apply -f kafka-topics.yaml -n kafka
```

### Verify Topics

```bash
docker exec idlr-kafka-1 kafka-topics --list --bootstrap-server localhost:9092
```

---

## Producer Integration

### Environment Configuration

Add Kafka configuration to `.env`:

```bash
# Kafka Connection
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_CLIENT_ID=idlr-pts-platform

# Security (optional, for production)
KAFKA_SSL_ENABLED=false
KAFKA_SASL_ENABLED=false
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=
KAFKA_SASL_PASSWORD=
```

### Initialize Kafka Client

In `server/index.ts`, initialize Kafka on startup:

```typescript
import { initializeKafka, shutdownKafka } from './kafkaClient';
import { startAllConsumers, stopAllConsumers } from './kafkaConsumers';

// Initialize Kafka
const kafkaReady = await initializeKafka();
if (kafkaReady) {
  console.log('✅ Kafka client initialized');
  
  // Start consumers
  await startAllConsumers();
  console.log('✅ Kafka consumers started');
} else {
  console.warn('⚠️  Kafka not available, event streaming disabled');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await stopAllConsumers();
  await shutdownKafka();
  process.exit(0);
});
```

### Publishing Events

**From Mojaloop Payment Service**:

```typescript
import { getKafkaClient, PaymentEventType } from './kafkaClient';

// In mojaloopPaymentService.ts
async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
  // ... existing payment initiation logic ...
  
  // Publish payment initiated event
  const kafkaClient = getKafkaClient();
  if (kafkaClient.isConnected()) {
    await kafkaClient.publishPaymentEvent({
      type: PaymentEventType.INITIATED,
      paymentId: result.paymentId,
      transactionId: result.transactionId,
      amount: params.amount,
      currency: params.currency,
      payerId: params.payerId,
      payeeId: params.payeeId,
      status: 'initiated',
      metadata: { propertyId: params.propertyId },
      timestamp: new Date().toISOString(),
    });
  }
  
  return result;
}
```

**From Smart Contract Integration**:

```typescript
import { getKafkaClient, BlockchainEventType } from './kafkaClient';

// In smartContractIntegration.ts
async createEscrow(params: CreateEscrowParams): Promise<CreateEscrowResult> {
  // ... existing escrow creation logic ...
  
  // Publish blockchain event
  const kafkaClient = getKafkaClient();
  if (kafkaClient.isConnected()) {
    await kafkaClient.publishBlockchainEvent({
      type: BlockchainEventType.ESCROW_CREATED,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      contractAddress: escrowContractAddress,
      from: params.buyer,
      to: params.seller,
      value: params.amount,
      gasUsed: receipt.gasUsed.toString(),
      status: 'confirmed',
      metadata: { escrowId: params.escrowId },
      timestamp: new Date().toISOString(),
    });
  }
  
  return result;
}
```

**From TigerBeetle Client**:

```typescript
import { getKafkaClient } from './kafkaClient';

// In tigerBeetleClient.ts
async createTransfer(params: CreateTransferParams): Promise<CreateTransferResult> {
  // ... existing transfer creation logic ...
  
  // Publish ledger event
  const kafkaClient = getKafkaClient();
  if (kafkaClient.isConnected()) {
    await kafkaClient.publishLedgerEvent({
      type: 'ledger.transfer_created' as any,
      transferId: result.transfer.transferId,
      debitAccountId: params.debitAccountId,
      creditAccountId: params.creditAccountId,
      amount: params.amount,
      ledgerId: params.ledgerId,
      code: params.code,
      status: 'posted',
      metadata: JSON.parse(params.userData128 || '{}'),
      timestamp: new Date().toISOString(),
    });
  }
  
  return result;
}
```

---

## Consumer Integration

### Consumer Groups

Each consumer type runs in its own consumer group for independent processing:

| Consumer Group | Topics Subscribed | Purpose |
|----------------|-------------------|---------|
| `payment-event-consumer` | `idlr.payment.events` | Process payment lifecycle and update ledger |
| `blockchain-event-consumer` | `idlr.blockchain.events` | Process blockchain events and update ledger |
| `reconciliation-consumer` | All three event topics | Cross-system reconciliation |

### Consumer Configuration

Consumers are automatically started when Kafka initializes. See `server/kafkaConsumers.ts` for implementation details.

**Key Features**:

- **Automatic Offset Management**: Consumers commit offsets after successful processing
- **Error Handling**: Failed messages are published to the dead letter queue
- **Idempotency**: Transfer IDs ensure duplicate events don't create duplicate ledger entries
- **Graceful Shutdown**: Consumers disconnect cleanly on SIGTERM/SIGINT

### Monitoring Consumer Lag

```bash
# Check consumer group status
docker exec idlr-kafka-1 kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group payment-event-consumer --describe

# Output shows lag per partition
GROUP                    TOPIC                PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
payment-event-consumer   idlr.payment.events  0          1523            1523            0
payment-event-consumer   idlr.payment.events  1          1489            1489            0
```

---

## Event Schema Design

### Payment Event Schema

```typescript
interface PaymentEvent {
  type: PaymentEventType;           // Event type enum
  paymentId: string;                 // Unique payment identifier
  transactionId: string;             // Mojaloop transaction ID
  amount: string;                    // Payment amount (decimal string)
  currency: string;                  // ISO 4217 currency code
  payerId: string;                   // Payer FSP participant ID
  payeeId: string;                   // Payee FSP participant ID
  status: string;                    // Payment status
  metadata?: Record<string, any>;    // Additional context
  timestamp: string;                 // ISO 8601 timestamp
}
```

### Blockchain Event Schema

```typescript
interface BlockchainEvent {
  type: BlockchainEventType;         // Event type enum
  transactionHash: string;           // Ethereum transaction hash
  blockNumber?: number;              // Block number (when confirmed)
  contractAddress?: string;          // Smart contract address
  from: string;                      // Sender address
  to: string;                        // Recipient address
  value: string;                     // Transaction value (wei)
  gasUsed?: string;                  // Gas consumed
  status: string;                    // Transaction status
  metadata?: Record<string, any>;    // Additional context
  timestamp: string;                 // ISO 8601 timestamp
}
```

### Ledger Event Schema

```typescript
interface LedgerEvent {
  type: LedgerEventType;             // Event type enum
  transferId: string;                // TigerBeetle transfer ID
  debitAccountId: string;            // Source account ID
  creditAccountId: string;           // Destination account ID
  amount: string;                    // Transfer amount
  ledgerId: number;                  // Ledger identifier
  code: number;                      // Transfer code
  status: string;                    // Transfer status
  metadata?: Record<string, any>;    // Additional context
  timestamp: string;                 // ISO 8601 timestamp
}
```

### Reconciliation Event Schema

```typescript
interface ReconciliationEvent {
  paymentId: string;                 // Payment identifier
  transactionHash: string;           // Blockchain transaction hash
  transferId: string;                // Ledger transfer ID
  amount: string;                    // Reconciled amount
  status: 'pending' | 'completed' | 'failed';
  errorMessage?: string;             // Error details (if failed)
  metadata?: Record<string, any>;    // Additional context
  timestamp: string;                 // ISO 8601 timestamp
}
```

---

## Reconciliation Workflows

### Payment-to-Ledger Reconciliation

**Flow**:

1. Payment initiated → Create pending transfer in TigerBeetle
2. Payment completed → Post pending transfer (commit)
3. Payment failed/cancelled → Void pending transfer (rollback)

**Timeline**: Real-time (< 100ms latency)

**Guarantees**: Exactly-once semantics through TigerBeetle's two-phase commit

### Blockchain-to-Ledger Reconciliation

**Flow**:

1. Escrow created on blockchain → Record in ledger
2. Escrow released → Transfer from escrow account to recipient
3. Escrow refunded → Transfer from escrow account back to sender

**Timeline**: Near real-time (< 5 seconds after blockchain confirmation)

**Guarantees**: At-least-once delivery with idempotent transfer IDs

### End-to-End Reconciliation

**Flow**:

1. Payment completed → Blockchain transaction submitted → Ledger updated
2. Reconciliation consumer verifies all three systems agree
3. Publish reconciliation event with success/failure status

**Timeline**: 30-60 seconds (depends on blockchain confirmation time)

**Monitoring**: Check `idlr.reconciliation.events` topic for failures

---

## Monitoring and Operations

### Metrics to Monitor

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Producer Throughput** | 1000+ msg/sec | < 100 msg/sec |
| **Consumer Lag** | < 1000 messages | > 10000 messages |
| **End-to-End Latency** | < 5 seconds | > 30 seconds |
| **Dead Letter Queue Size** | 0 messages | > 100 messages |
| **Broker CPU Usage** | < 70% | > 85% |
| **Broker Disk Usage** | < 80% | > 90% |

### Prometheus Metrics

Install Kafka Exporter for Prometheus:

```bash
docker run -d --name kafka-exporter \
  --network idlr-network \
  -p 9308:9308 \
  danielqsj/kafka-exporter:latest \
  --kafka.server=kafka-1:29092 \
  --kafka.server=kafka-2:29093 \
  --kafka.server=kafka-3:29094
```

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets: ['localhost:9308']
```

### Grafana Dashboards

Import pre-built Kafka dashboards:

- **Kafka Overview**: Dashboard ID `7589`
- **Kafka Consumer Lag**: Dashboard ID `10991`
- **Kafka Topics**: Dashboard ID `11962`

### Log Aggregation

Configure Kafka to send logs to your logging stack:

```yaml
# docker-compose.kafka.yml
services:
  kafka-1:
    logging:
      driver: "fluentd"
      options:
        fluentd-address: "localhost:24224"
        tag: "kafka.broker.1"
```

---

## Security Configuration

### SSL/TLS Encryption

**Generate certificates**:

```bash
# Create CA
openssl req -new -x509 -keyout ca-key -out ca-cert -days 365

# Create broker keystore
keytool -keystore kafka.broker1.keystore.jks -alias localhost -validity 365 -genkey

# Sign certificate
keytool -keystore kafka.broker1.keystore.jks -alias localhost -certreq -file cert-file
openssl x509 -req -CA ca-cert -CAkey ca-key -in cert-file -out cert-signed -days 365 -CAcreateserial

# Import certificates
keytool -keystore kafka.broker1.keystore.jks -alias CARoot -import -file ca-cert
keytool -keystore kafka.broker1.keystore.jks -alias localhost -import -file cert-signed
```

**Update broker configuration**:

```properties
listeners=SSL://kafka-1:9093
advertised.listeners=SSL://kafka-1:9093
ssl.keystore.location=/etc/kafka/secrets/kafka.broker1.keystore.jks
ssl.keystore.password=<keystore-password>
ssl.key.password=<key-password>
ssl.truststore.location=/etc/kafka/secrets/kafka.broker1.truststore.jks
ssl.truststore.password=<truststore-password>
ssl.client.auth=required
```

**Update application configuration**:

```bash
KAFKA_SSL_ENABLED=true
KAFKA_BROKERS=kafka-1:9093,kafka-2:9093,kafka-3:9093
```

### SASL Authentication

**Configure JAAS**:

Create `kafka_server_jaas.conf`:

```
KafkaServer {
   org.apache.kafka.common.security.plain.PlainLoginModule required
   username="admin"
   password="<admin-password>"
   user_admin="admin-secret"
   user_idlr="idlr-secret";
};
```

**Update broker configuration**:

```properties
listeners=SASL_SSL://kafka-1:9093
security.inter.broker.protocol=SASL_SSL
sasl.mechanism.inter.broker.protocol=PLAIN
sasl.enabled.mechanisms=PLAIN
```

**Update application configuration**:

```bash
KAFKA_SASL_ENABLED=true
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=idlr
KAFKA_SASL_PASSWORD=idlr-secret
```

---

## Performance Tuning

### Producer Tuning

```typescript
const producer = kafka.producer({
  allowAutoTopicCreation: false,
  transactionTimeout: 30000,
  idempotent: true,  // Enable exactly-once semantics
  maxInFlightRequests: 5,
  compression: CompressionTypes.Snappy,
});
```

### Consumer Tuning

```typescript
const consumer = kafka.consumer({
  groupId: 'payment-event-consumer',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
  maxBytesPerPartition: 1048576,  // 1 MB
  maxWaitTimeInMs: 5000,
});
```

### Broker Tuning

```properties
# Increase throughput
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# Optimize for latency
replica.lag.time.max.ms=10000
replica.socket.timeout.ms=30000
replica.socket.receive.buffer.bytes=65536

# Optimize for disk I/O
log.flush.interval.messages=10000
log.flush.interval.ms=1000
```

---

## Disaster Recovery

### Backup Strategy

**Topic Data Backup**:

```bash
# Use MirrorMaker 2 for cross-cluster replication
docker run -d --name kafka-mirrormaker \
  --network idlr-network \
  confluentinc/cp-kafka:7.5.0 \
  kafka-mirror-maker \
  --consumer.config /etc/kafka/consumer.properties \
  --producer.config /etc/kafka/producer.properties \
  --whitelist 'idlr.*'
```

**ZooKeeper Backup**:

```bash
# Backup ZooKeeper data directory
tar -czf zookeeper-backup-$(date +%Y%m%d).tar.gz /var/lib/zookeeper/
```

### Recovery Procedures

**Restore from Backup**:

```bash
# Stop Kafka cluster
docker-compose -f docker-compose.kafka.yml down

# Restore ZooKeeper data
tar -xzf zookeeper-backup-20260223.tar.gz -C /var/lib/zookeeper/

# Start cluster
docker-compose -f docker-compose.kafka.yml up -d
```

**Replay Events**:

```bash
# Reset consumer group to earliest offset
docker exec idlr-kafka-1 kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group payment-event-consumer --reset-offsets --to-earliest --execute --all-topics
```

---

## Troubleshooting

### Common Issues

**Issue**: Consumer lag increasing

**Diagnosis**:

```bash
docker exec idlr-kafka-1 kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group payment-event-consumer --describe
```

**Solution**: Scale consumers horizontally or optimize processing logic

---

**Issue**: Messages in dead letter queue

**Diagnosis**:

```bash
docker exec idlr-kafka-1 kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic idlr.dlq --from-beginning --max-messages 10
```

**Solution**: Investigate error messages, fix root cause, replay from DLQ

---

**Issue**: Broker out of disk space

**Diagnosis**:

```bash
docker exec idlr-kafka-1 df -h /var/lib/kafka/data
```

**Solution**: Reduce retention period or add more disk capacity

```bash
docker exec idlr-kafka-1 kafka-configs --bootstrap-server localhost:9092 \
  --entity-type topics --entity-name idlr.payment.events \
  --alter --add-config retention.ms=259200000  # 3 days
```

---

**Issue**: High end-to-end latency

**Diagnosis**: Check each component's latency:

```bash
# Producer latency
grep "request-latency-avg" /var/log/kafka/producer.log

# Consumer latency
grep "fetch-latency-avg" /var/log/kafka/consumer.log
```

**Solution**: Tune producer/consumer configuration, increase broker resources

---

## Conclusion

This guide provides a comprehensive foundation for deploying and operating Apache Kafka as the event streaming backbone of the IDLR-PTS platform. The implementation ensures real-time reconciliation between Mojaloop payments, Polygon blockchain transactions, and TigerBeetle ledger entries with high throughput, fault tolerance, and exactly-once semantics.

For production deployments, follow the security, monitoring, and disaster recovery best practices outlined in this document. Regularly review consumer lag, dead letter queue size, and end-to-end latency metrics to ensure optimal performance.

---

**Document Version**: 1.0  
**Last Updated**: February 2026  
**Author**: Manus AI  
**Contact**: For questions or support, refer to the IDLR-PTS platform documentation.
