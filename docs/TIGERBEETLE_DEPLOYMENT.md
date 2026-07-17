# TigerBeetle Financial Ledger Deployment Guide

**Author**: Manus AI  
**Last Updated**: February 24, 2026  
**Version**: 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [TigerBeetle Server Installation](#tigerbeetle-server-installation)
5. [Golang gRPC Service Deployment](#golang-grpc-service-deployment)
6. [Node.js Integration](#nodejs-integration)
7. [Docker Deployment](#docker-deployment)
8. [Production Configuration](#production-configuration)
9. [Testing and Validation](#testing-and-validation)
10. [Monitoring and Operations](#monitoring-and-operations)
11. [Troubleshooting](#troubleshooting)

---

## Overview

TigerBeetle is a distributed financial accounting database designed for mission-critical safety and performance. It provides **strict serializability**, **double-entry accounting**, and **microsecond latency** for financial transactions.

### Key Features

- **High Performance**: 1 million transactions per second per core
- **Strict Serializability**: ACID guarantees with distributed consensus
- **Double-Entry Accounting**: Built-in accounting primitives
- **Two-Phase Commits**: Pending transfers for escrow and conditional payments
- **Crash Safety**: Durable storage with WAL (Write-Ahead Logging)
- **Horizontal Scalability**: Distributed cluster support

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    IDLR-PTS Platform                        │
│                                                               │
│  ┌──────────────┐        ┌──────────────┐                   │
│  │   Node.js    │◄──────►│  Mojaloop    │                   │
│  │   Backend    │        │   Payment    │                   │
│  └──────┬───────┘        └──────────────┘                   │
│         │                                                     │
│         │ gRPC                                                │
│         ▼                                                     │
│  ┌──────────────────────────────────────────┐               │
│  │   TigerBeetle Golang gRPC Service        │               │
│  │   (High-Performance Ledger Client)       │               │
│  └──────────────┬───────────────────────────┘               │
│                 │                                             │
│                 │ TigerBeetle Protocol                        │
│                 ▼                                             │
│  ┌──────────────────────────────────────────┐               │
│  │      TigerBeetle Cluster                 │               │
│  │  ┌────────┐  ┌────────┐  ┌────────┐     │               │
│  │  │ Node 1 │  │ Node 2 │  │ Node 3 │     │               │
│  │  └────────┘  └────────┘  └────────┘     │               │
│  │         (Replicated State Machine)       │               │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Component Layers

1. **TigerBeetle Cluster** (Storage Layer)
   - Distributed database with Raft consensus
   - Stores accounts and transfers
   - Provides strict serializability

2. **Golang gRPC Service** (Client Layer)
   - High-performance TigerBeetle client
   - gRPC API for Node.js backend
   - Connection pooling and error handling

3. **Node.js Backend** (Application Layer)
   - Business logic and API endpoints
   - Integration with Mojaloop and blockchain
   - tRPC procedures for frontend

### Data Model

#### Accounts

Accounts represent financial entities in the system:

```typescript
interface Account {
  id: UUID;              // Unique account identifier
  ledger: uint32;        // Ledger identifier (1 = main ledger)
  code: uint16;          // Account code (chart of accounts)
  flags: uint16;         // Account type flags
  debits_posted: uint64; // Total debits committed
  credits_posted: uint64; // Total credits committed
  debits_pending: uint64; // Pending debits
  credits_pending: uint64; // Pending credits
  user_data_128: uint128; // Custom metadata
  timestamp: uint64;     // Creation timestamp
}
```

#### Transfers

Transfers represent financial transactions:

```typescript
interface Transfer {
  id: UUID;                    // Unique transfer identifier
  debit_account_id: UUID;      // Source account
  credit_account_id: UUID;     // Destination account
  amount: uint128;             // Transfer amount
  ledger: uint32;              // Ledger identifier
  code: uint16;                // Transfer code (reason/category)
  flags: uint16;               // Transfer flags (pending, post, void)
  timeout: uint32;             // Timeout for pending transfers
  user_data_128: uint128;      // Custom metadata
  timestamp: uint64;           // Transaction timestamp
}
```

---

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 22.04+ recommended)
- **CPU**: 4+ cores (8+ recommended for production)
- **RAM**: 8GB minimum (16GB+ recommended)
- **Disk**: SSD with 100GB+ free space
- **Network**: Low-latency network (< 10ms between nodes)

### Software Dependencies

- **Golang**: 1.22+ (for gRPC service)
- **Node.js**: 22.x (for backend integration)
- **Docker**: 24.0+ (optional, for containerized deployment)
- **protoc**: 3.12+ (for gRPC code generation)

### Network Ports

- **3000**: TigerBeetle cluster port (default)
- **50051**: Golang gRPC service port (configurable)
- **3001, 3002, ...**: Additional TigerBeetle nodes (for cluster)

---

## TigerBeetle Server Installation

### Step 1: Download TigerBeetle

```bash
# Download latest TigerBeetle binary
cd /tmp
wget https://github.com/tigerbeetle/tigerbeetle/releases/download/0.16.74/tigerbeetle-x86_64-linux.zip
unzip tigerbeetle-x86_64-linux.zip
sudo mv tigerbeetle /usr/local/bin/
sudo chmod +x /usr/local/bin/tigerbeetle

# Verify installation
tigerbeetle version
```

Expected output:
```
TigerBeetle version 0.16.74
```

### Step 2: Initialize Data Directory

```bash
# Create data directory
sudo mkdir -p /var/lib/tigerbeetle
sudo chown $USER:$USER /var/lib/tigerbeetle

# Format cluster (3-node cluster example)
tigerbeetle format --cluster=0 --replica=0 --replica-count=3 /var/lib/tigerbeetle/0_0.tigerbeetle
tigerbeetle format --cluster=0 --replica=1 --replica-count=3 /var/lib/tigerbeetle/0_1.tigerbeetle
tigerbeetle format --cluster=0 --replica=2 --replica-count=3 /var/lib/tigerbeetle/0_2.tigerbeetle
```

**Note**: For single-node development, use `--replica-count=1`:

```bash
tigerbeetle format --cluster=0 --replica=0 --replica-count=1 /var/lib/tigerbeetle/0_0.tigerbeetle
```

### Step 3: Start TigerBeetle Server

#### Single Node (Development)

```bash
tigerbeetle start --addresses=3000 /var/lib/tigerbeetle/0_0.tigerbeetle
```

#### Multi-Node Cluster (Production)

```bash
# Node 1 (on server1.example.com)
tigerbeetle start --addresses=server1.example.com:3000,server2.example.com:3000,server3.example.com:3000 /var/lib/tigerbeetle/0_0.tigerbeetle

# Node 2 (on server2.example.com)
tigerbeetle start --addresses=server1.example.com:3000,server2.example.com:3000,server3.example.com:3000 /var/lib/tigerbeetle/0_1.tigerbeetle

# Node 3 (on server3.example.com)
tigerbeetle start --addresses=server1.example.com:3000,server2.example.com:3000,server3.example.com:3000 /var/lib/tigerbeetle/0_2.tigerbeetle
```

### Step 4: Create Systemd Service (Production)

```bash
# Create systemd service file
sudo tee /etc/systemd/system/tigerbeetle.service << 'EOF'
[Unit]
Description=TigerBeetle Financial Database
After=network.target

[Service]
Type=simple
User=tigerbeetle
Group=tigerbeetle
WorkingDirectory=/var/lib/tigerbeetle
ExecStart=/usr/local/bin/tigerbeetle start --addresses=3000 /var/lib/tigerbeetle/0_0.tigerbeetle
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

# Create tigerbeetle user
sudo useradd -r -s /bin/false tigerbeetle
sudo chown -R tigerbeetle:tigerbeetle /var/lib/tigerbeetle

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable tigerbeetle
sudo systemctl start tigerbeetle

# Check status
sudo systemctl status tigerbeetle
```

---

## Golang gRPC Service Deployment

### Step 1: Build the Service

```bash
cd /home/ubuntu/idlr-pts-platform/tigerbeetle-service

# Set Go path
export PATH=$PATH:/usr/local/go/bin:$(go env GOPATH)/bin

# Download dependencies
go mod download

# Build binary
go build -o tigerbeetle-grpc-service main.go

# Verify build
./tigerbeetle-grpc-service --help
```

### Step 2: Configure Environment

```bash
# Create environment file
cat > /etc/tigerbeetle-grpc.env << EOF
TIGERBEETLE_ADDRESS=3000
TIGERBEETLE_CLUSTER=0
GRPC_PORT=50051
EOF
```

### Step 3: Create Systemd Service

```bash
sudo tee /etc/systemd/system/tigerbeetle-grpc.service << 'EOF'
[Unit]
Description=TigerBeetle gRPC Service
After=tigerbeetle.service
Requires=tigerbeetle.service

[Service]
Type=simple
User=tigerbeetle
Group=tigerbeetle
WorkingDirectory=/home/ubuntu/idlr-pts-platform/tigerbeetle-service
EnvironmentFile=/etc/tigerbeetle-grpc.env
ExecStart=/home/ubuntu/idlr-pts-platform/tigerbeetle-service/tigerbeetle-grpc-service \
  --port=${GRPC_PORT} \
  --tigerbeetle-addr=${TIGERBEETLE_ADDRESS} \
  --tigerbeetle-cluster=${TIGERBEETLE_CLUSTER}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable tigerbeetle-grpc
sudo systemctl start tigerbeetle-grpc

# Check status
sudo systemctl status tigerbeetle-grpc
```

### Step 4: Test gRPC Service

```bash
# Install grpcurl for testing
go install github.com/fullstorydev/grpcurl/cmd/grpcurl@latest

# List services
grpcurl -plaintext localhost:50051 list

# Create test account
grpcurl -plaintext -d '{
  "account_id": "test-account-1",
  "ledger_id": 1,
  "code": 1000,
  "type": 1
}' localhost:50051 ledger.LedgerService/CreateAccount

# Get account balance
grpcurl -plaintext -d '{
  "account_id": "test-account-1"
}' localhost:50051 ledger.LedgerService/GetAccountBalance
```

---

## Node.js Integration

### Step 1: Configure Environment Variables

Add to your `.env` file:

```bash
# TigerBeetle gRPC Service
TIGERBEETLE_GRPC_URL=localhost:50051

# For production, use the actual server address
# TIGERBEETLE_GRPC_URL=tigerbeetle-grpc.example.com:50051
```

### Step 2: Initialize Client in Server

Update `server/index.ts` or your main server file:

```typescript
import { initializeTigerBeetle } from './tigerBeetleClient';

// Initialize TigerBeetle client on server startup
async function startServer() {
  try {
    // Test TigerBeetle connection
    const connected = await initializeTigerBeetle();
    if (connected) {
      console.log('✅ TigerBeetle service connected');
    } else {
      console.warn('⚠️  TigerBeetle service not available - ledger features disabled');
    }
  } catch (error) {
    console.error('❌ Failed to connect to TigerBeetle:', error);
  }

  // Continue with normal server startup
  // ...
}

startServer();
```

### Step 3: Create Ledger Accounts

Create system accounts for your platform:

```typescript
import { getTigerBeetleClient, AccountType } from './tigerBeetleClient';

async function initializeSystemAccounts() {
  const client = getTigerBeetleClient();

  // Create platform revenue account
  await client.createAccount({
    accountId: 'platform-revenue',
    ledgerId: 1,
    code: 4000, // Revenue account code
    type: AccountType.REVENUE,
    userData128: 'Platform transaction fees',
  });

  // Create escrow account
  await client.createAccount({
    accountId: 'platform-escrow',
    ledgerId: 1,
    code: 1100, // Asset account code
    type: AccountType.ASSET,
    userData128: 'Property transaction escrow',
  });

  // Create expense account (for blockchain gas fees)
  await client.createAccount({
    accountId: 'platform-expenses',
    ledgerId: 1,
    code: 5000, // Expense account code
    type: AccountType.EXPENSE,
    userData128: 'Blockchain gas fees and operational costs',
  });

  console.log('✅ System accounts initialized');
}
```

### Step 4: Integrate with Payment Flow

Update `server/mojaloopPaymentService.ts`:

```typescript
import { getTigerBeetleClient, AccountType } from './tigerBeetleClient';

export class MojaloopPaymentService {
  private tigerBeetle = getTigerBeetleClient();

  async initiatePayment(params: PaymentParams) {
    // 1. Create pending transfer in TigerBeetle
    const pendingTransfer = await this.tigerBeetle.createPendingTransfer({
      transferId: params.paymentId,
      debitAccountId: params.payerAccountId,
      creditAccountId: 'platform-escrow',
      amount: params.amount,
      ledgerId: 1,
      code: 2000, // Payment transfer code
      userData128: `payment:${params.paymentId}`,
      timeout: 3600000000000, // 1 hour timeout (nanoseconds)
    });

    if (!pendingTransfer.success) {
      throw new Error(`Failed to create pending transfer: ${pendingTransfer.error}`);
    }

    // 2. Continue with Mojaloop payment initiation
    // ...
  }

  async completePayment(paymentId: string, transactionHash: string) {
    // 1. Post pending transfer (commit)
    const result = await this.tigerBeetle.postPendingTransfer(paymentId);

    if (!result.success) {
      throw new Error(`Failed to post pending transfer: ${result.error}`);
    }

    // 2. Reconcile with blockchain
    await this.tigerBeetle.reconcilePayment({
      paymentId,
      transactionHash,
      debitAccountId: 'platform-escrow',
      creditAccountId: params.payeeAccountId,
      amount: params.amount,
      code: 2001, // Escrow release code
      metadata: JSON.stringify({ txHash: transactionHash }),
    });

    // 3. Continue with payment completion
    // ...
  }

  async cancelPayment(paymentId: string) {
    // Void pending transfer (rollback)
    const result = await this.tigerBeetle.voidPendingTransfer(paymentId);

    if (!result.success) {
      throw new Error(`Failed to void pending transfer: ${result.error}`);
    }

    // Continue with payment cancellation
    // ...
  }
}
```

---

## Docker Deployment

### Dockerfile for TigerBeetle

Create `tigerbeetle-service/Dockerfile`:

```dockerfile
# Stage 1: Build
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git protobuf-dev

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o tigerbeetle-grpc-service main.go

# Stage 2: Runtime
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

# Copy binary from builder
COPY --from=builder /app/tigerbeetle-grpc-service .

# Expose gRPC port
EXPOSE 50051

# Run service
CMD ["./tigerbeetle-grpc-service", "--port=50051", "--tigerbeetle-addr=tigerbeetle:3000", "--tigerbeetle-cluster=0"]
```

### Docker Compose

Create `docker-compose.tigerbeetle.yml`:

```yaml
version: '3.8'

services:
  tigerbeetle:
    image: ghcr.io/tigerbeetle/tigerbeetle:0.16.74
    container_name: tigerbeetle
    command: start --addresses=0.0.0.0:3000 /var/lib/tigerbeetle/0_0.tigerbeetle
    ports:
      - "3000:3000"
    volumes:
      - tigerbeetle-data:/var/lib/tigerbeetle
    networks:
      - idlr-network
    restart: unless-stopped

  tigerbeetle-grpc:
    build:
      context: ./tigerbeetle-service
      dockerfile: Dockerfile
    container_name: tigerbeetle-grpc
    ports:
      - "50051:50051"
    environment:
      - TIGERBEETLE_ADDRESS=tigerbeetle:3000
      - TIGERBEETLE_CLUSTER=0
      - GRPC_PORT=50051
    depends_on:
      - tigerbeetle
    networks:
      - idlr-network
    restart: unless-stopped

volumes:
  tigerbeetle-data:

networks:
  idlr-network:
    driver: bridge
```

### Deploy with Docker Compose

```bash
# Start services
docker-compose -f docker-compose.tigerbeetle.yml up -d

# Check logs
docker-compose -f docker-compose.tigerbeetle.yml logs -f

# Test connection
grpcurl -plaintext localhost:50051 list
```

---

## Production Configuration

### High Availability Setup

For production, deploy a 3-node or 5-node TigerBeetle cluster:

```bash
# 3-node cluster (tolerates 1 failure)
# 5-node cluster (tolerates 2 failures)

# Format replicas
for i in 0 1 2; do
  tigerbeetle format \
    --cluster=0 \
    --replica=$i \
    --replica-count=3 \
    /var/lib/tigerbeetle/0_$i.tigerbeetle
done

# Start nodes on separate servers
# Node 0
tigerbeetle start \
  --addresses=node0.example.com:3000,node1.example.com:3000,node2.example.com:3000 \
  /var/lib/tigerbeetle/0_0.tigerbeetle

# Node 1
tigerbeetle start \
  --addresses=node0.example.com:3000,node1.example.com:3000,node2.example.com:3000 \
  /var/lib/tigerbeetle/0_1.tigerbeetle

# Node 2
tigerbeetle start \
  --addresses=node0.example.com:3000,node1.example.com:3000,node2.example.com:3000 \
  /var/lib/tigerbeetle/0_2.tigerbeetle
```

### Load Balancing

Use a load balancer for the gRPC service:

```nginx
# nginx.conf
upstream tigerbeetle_grpc {
    server tigerbeetle-grpc-1:50051;
    server tigerbeetle-grpc-2:50051;
    server tigerbeetle-grpc-3:50051;
}

server {
    listen 50051 http2;
    
    location / {
        grpc_pass grpc://tigerbeetle_grpc;
    }
}
```

### Security

1. **TLS/SSL for gRPC**:

```go
// Update main.go to use TLS
creds, err := credentials.NewServerTLSFromFile("server.crt", "server.key")
if err != nil {
    log.Fatalf("Failed to load TLS keys: %v", err)
}

grpcServer := grpc.NewServer(grpc.Creds(creds))
```

2. **Authentication**:

```go
// Add API key authentication
func authInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
    md, ok := metadata.FromIncomingContext(ctx)
    if !ok {
        return nil, status.Error(codes.Unauthenticated, "missing metadata")
    }

    apiKey := md.Get("api-key")
    if len(apiKey) == 0 || apiKey[0] != os.Getenv("TIGERBEETLE_API_KEY") {
        return nil, status.Error(codes.Unauthenticated, "invalid API key")
    }

    return handler(ctx, req)
}

grpcServer := grpc.NewServer(grpc.UnaryInterceptor(authInterceptor))
```

3. **Network Isolation**:

```bash
# Use firewall rules to restrict access
sudo ufw allow from 10.0.0.0/8 to any port 3000
sudo ufw allow from 10.0.0.0/8 to any port 50051
```

---

## Testing and Validation

### Unit Tests

Create `tigerbeetle-service/main_test.go`:

```go
package main

import (
    "context"
    "testing"
    pb "github.com/idlr-pts/tigerbeetle-service/proto"
)

func TestCreateAccount(t *testing.T) {
    // Setup test client
    client := setupTestClient(t)
    defer client.Close()

    // Create account
    resp, err := client.CreateAccount(context.Background(), &pb.CreateAccountRequest{
        AccountId: "test-account",
        LedgerId:  1,
        Code:      1000,
        Type:      pb.AccountType_ACCOUNT_TYPE_ASSET,
    })

    if err != nil {
        t.Fatalf("CreateAccount failed: %v", err)
    }

    if !resp.Success {
        t.Fatalf("CreateAccount returned error: %s", resp.Error)
    }
}

func TestCreateTransfer(t *testing.T) {
    // Setup test accounts
    client := setupTestClient(t)
    defer client.Close()

    // Create debit and credit accounts
    // ...

    // Create transfer
    resp, err := client.CreateTransfer(context.Background(), &pb.CreateTransferRequest{
        TransferId:       "test-transfer",
        DebitAccountId:   "account-1",
        CreditAccountId:  "account-2",
        Amount:           1000,
        LedgerId:         1,
        Code:             2000,
    })

    if err != nil {
        t.Fatalf("CreateTransfer failed: %v", err)
    }

    if !resp.Success {
        t.Fatalf("CreateTransfer returned error: %s", resp.Error)
    }
}
```

Run tests:

```bash
cd tigerbeetle-service
go test -v ./...
```

### Integration Tests

Create `server/tigerBeetle.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { getTigerBeetleClient, AccountType } from './tigerBeetleClient';

describe('TigerBeetle Integration', () => {
  let client: ReturnType<typeof getTigerBeetleClient>;

  beforeAll(async () => {
    client = getTigerBeetleClient();
    const connected = await client.testConnection();
    if (!connected) {
      throw new Error('TigerBeetle service not available');
    }
  });

  it('should create an account', async () => {
    const result = await client.createAccount({
      ledgerId: 1,
      code: 1000,
      type: AccountType.ASSET,
    });

    expect(result.success).toBe(true);
    expect(result.account).toBeDefined();
  });

  it('should create a transfer', async () => {
    // Create two accounts
    const account1 = await client.createAccount({
      ledgerId: 1,
      code: 1000,
      type: AccountType.ASSET,
    });

    const account2 = await client.createAccount({
      ledgerId: 1,
      code: 1000,
      type: AccountType.ASSET,
    });

    // Create transfer
    const result = await client.createTransfer({
      debitAccountId: account1.account!.accountId,
      creditAccountId: account2.account!.accountId,
      amount: 1000,
      ledgerId: 1,
      code: 2000,
    });

    expect(result.success).toBe(true);
    expect(result.transfer).toBeDefined();
  });

  it('should handle two-phase commit', async () => {
    // Create accounts
    const account1 = await client.createAccount({
      ledgerId: 1,
      code: 1000,
      type: AccountType.ASSET,
    });

    const account2 = await client.createAccount({
      ledgerId: 1,
      code: 1000,
      type: AccountType.ASSET,
    });

    // Create pending transfer
    const pending = await client.createPendingTransfer({
      debitAccountId: account1.account!.accountId,
      creditAccountId: account2.account!.accountId,
      amount: 1000,
      ledgerId: 1,
      code: 2000,
      timeout: 60000000000, // 60 seconds
    });

    expect(pending.success).toBe(true);

    // Post pending transfer
    const posted = await client.postPendingTransfer(pending.transfer!.transferId);
    expect(posted.success).toBe(true);
  });
});
```

---

## Monitoring and Operations

### Metrics Collection

TigerBeetle exposes metrics via its client library. Create a monitoring service:

```typescript
import { getTigerBeetleClient } from './tigerBeetleClient';

export async function collectLedgerMetrics() {
  const client = getTigerBeetleClient();

  // Get system account balances
  const platformRevenue = await client.getAccountBalance('platform-revenue');
  const platformEscrow = await client.getAccountBalance('platform-escrow');
  const platformExpenses = await client.getAccountBalance('platform-expenses');

  return {
    revenue: platformRevenue.balance?.balance || '0',
    escrow: platformEscrow.balance?.balance || '0',
    expenses: platformExpenses.balance?.balance || '0',
    timestamp: new Date().toISOString(),
  };
}

// Schedule metrics collection
setInterval(async () => {
  const metrics = await collectLedgerMetrics();
  console.log('Ledger metrics:', metrics);
  // Send to monitoring system (Prometheus, Grafana, etc.)
}, 60000); // Every minute
```

### Health Checks

```typescript
import { getTigerBeetleClient } from './tigerBeetleClient';

export async function checkLedgerHealth(): Promise<boolean> {
  try {
    const client = getTigerBeetleClient();
    return await client.testConnection();
  } catch (error) {
    console.error('Ledger health check failed:', error);
    return false;
  }
}
```

### Backup and Recovery

```bash
# Backup TigerBeetle data
sudo systemctl stop tigerbeetle
sudo tar -czf tigerbeetle-backup-$(date +%Y%m%d).tar.gz /var/lib/tigerbeetle/
sudo systemctl start tigerbeetle

# Restore from backup
sudo systemctl stop tigerbeetle
sudo rm -rf /var/lib/tigerbeetle/*
sudo tar -xzf tigerbeetle-backup-20260224.tar.gz -C /
sudo systemctl start tigerbeetle
```

---

## Troubleshooting

### Common Issues

#### 1. "Connection refused" error

**Cause**: TigerBeetle server not running or wrong address

**Solution**:
```bash
# Check if TigerBeetle is running
sudo systemctl status tigerbeetle

# Check if port is open
sudo netstat -tulpn | grep 3000

# Restart service
sudo systemctl restart tigerbeetle
```

#### 2. "Account already exists" error

**Cause**: Attempting to create an account with duplicate ID

**Solution**:
```typescript
// Check if account exists before creating
const existing = await client.getAccount(accountId);
if (!existing.success) {
  // Account doesn't exist, safe to create
  await client.createAccount({ accountId, ... });
}
```

#### 3. "Insufficient funds" error

**Cause**: Attempting to debit more than available balance

**Solution**:
```typescript
// Check balance before transfer
const balance = await client.getAccountBalance(debitAccountId);
if (BigInt(balance.balance?.balance || '0') >= BigInt(amount)) {
  await client.createTransfer({ ... });
} else {
  throw new Error('Insufficient funds');
}
```

#### 4. gRPC service crashes

**Cause**: TigerBeetle client connection issues

**Solution**:
```bash
# Check logs
sudo journalctl -u tigerbeetle-grpc -n 100

# Increase connection timeout
export TIGERBEETLE_TIMEOUT=30000

# Restart service
sudo systemctl restart tigerbeetle-grpc
```

### Performance Tuning

1. **Increase file descriptors**:

```bash
# Add to /etc/security/limits.conf
tigerbeetle soft nofile 65536
tigerbeetle hard nofile 65536
```

2. **Optimize disk I/O**:

```bash
# Use SSD with direct I/O
# Mount with noatime option
sudo mount -o remount,noatime /var/lib/tigerbeetle
```

3. **Tune network settings**:

```bash
# Increase TCP buffer sizes
sudo sysctl -w net.core.rmem_max=16777216
sudo sysctl -w net.core.wmem_max=16777216
sudo sysctl -w net.ipv4.tcp_rmem="4096 87380 16777216"
sudo sysctl -w net.ipv4.tcp_wmem="4096 65536 16777216"
```

---

## Conclusion

You now have a complete TigerBeetle financial ledger integration for the IDLR-PTS platform. The system provides:

- **High-performance double-entry accounting** (1M+ TPS)
- **Strict serializability** with ACID guarantees
- **Two-phase commits** for escrow and conditional payments
- **Seamless integration** with Mojaloop and blockchain

### Next Steps

1. Deploy TigerBeetle cluster in production environment
2. Initialize system accounts (revenue, escrow, expenses)
3. Integrate with existing payment flows
4. Set up monitoring and alerting
5. Perform load testing and optimization
6. Configure backup and disaster recovery

### Resources

- [TigerBeetle Documentation](https://docs.tigerbeetle.com/)
- [TigerBeetle GitHub](https://github.com/tigerbeetle/tigerbeetle)
- [gRPC Documentation](https://grpc.io/docs/)
- [Golang gRPC Tutorial](https://grpc.io/docs/languages/go/quickstart/)

---

**For support, contact the IDLR-PTS development team or refer to the TigerBeetle community forums.**
