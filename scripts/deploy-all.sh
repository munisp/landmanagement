#!/bin/bash

#######################################################################
# IDLR-PTS Platform - Master Deployment Script
# 
# This script deploys the complete infrastructure stack including:
# - Hyperledger Fabric network
# - 3D Visualization service
# - TigerBeetle gRPC service
# - Kafka cluster
# - Temporal server
# - Apache Iceberg lakehouse
# - PostgreSQL catalog
# - All supporting services
#
# Usage: ./deploy-all.sh [environment]
# Environment: dev|staging|production (default: dev)
#######################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Configuration
ENVIRONMENT="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs/deployment"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/deploy_${ENVIRONMENT}_${TIMESTAMP}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create log directory
mkdir -p "$LOG_DIR"

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠${NC} $1" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error_exit "Docker is not installed. Please install Docker first."
    fi
    log_success "Docker found: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error_exit "Docker Compose is not installed. Please install Docker Compose first."
    fi
    log_success "Docker Compose found: $(docker-compose --version)"
    
    # Check Go
    if ! command -v go &> /dev/null; then
        error_exit "Go is not installed. Please install Go 1.22+ first."
    fi
    log_success "Go found: $(go version)"
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        error_exit "Python 3 is not installed. Please install Python 3.9+ first."
    fi
    log_success "Python found: $(python3 --version)"
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is not installed. Please install Node.js 18+ first."
    fi
    log_success "Node.js found: $(node --version)"
    
    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        error_exit "pnpm is not installed. Please install pnpm first."
    fi
    log_success "pnpm found: $(pnpm --version)"
}

# Load environment variables
load_environment() {
    log "Loading environment configuration for: $ENVIRONMENT"
    
    ENV_FILE="$PROJECT_ROOT/.env.$ENVIRONMENT"
    if [ ! -f "$ENV_FILE" ]; then
        error_exit "Environment file not found: $ENV_FILE"
    fi
    
    set -a  # Automatically export all variables
    source "$ENV_FILE"
    set +a
    
    log_success "Environment variables loaded"
}

# Deploy Hyperledger Fabric network
deploy_fabric() {
    log "Deploying Hyperledger Fabric network..."
    
    cd "$PROJECT_ROOT/fabric-network"
    
    # Generate crypto materials
    log "Generating crypto materials..."
    ./scripts/generate-crypto.sh || error_exit "Failed to generate crypto materials"
    log_success "Crypto materials generated"
    
    # Generate genesis block and channel artifacts
    log "Generating genesis block and channel artifacts..."
    ./scripts/generate-artifacts.sh || error_exit "Failed to generate artifacts"
    log_success "Artifacts generated"
    
    # Start Fabric network
    log "Starting Fabric network..."
    docker-compose -f docker-compose-fabric.yml up -d || error_exit "Failed to start Fabric network"
    log_success "Fabric network started"
    
    # Wait for network to be ready
    log "Waiting for Fabric network to be ready..."
    sleep 30
    
    # Create channel
    log "Creating channel..."
    ./scripts/create-channel.sh || error_exit "Failed to create channel"
    log_success "Channel created"
    
    # Join peers to channel
    log "Joining peers to channel..."
    ./scripts/join-channel.sh || error_exit "Failed to join peers to channel"
    log_success "Peers joined to channel"
    
    # Install chaincodes
    log "Installing title transfer chaincode..."
    ./scripts/install-chaincode.sh title-transfer || error_exit "Failed to install title transfer chaincode"
    log_success "Title transfer chaincode installed"
    
    log "Installing escrow chaincode..."
    ./scripts/install-chaincode.sh escrow || error_exit "Failed to install escrow chaincode"
    log_success "Escrow chaincode installed"
    
    cd "$PROJECT_ROOT"
    log_success "Hyperledger Fabric deployment complete"
}

# Deploy 3D Visualization service
deploy_3d_visualization() {
    log "Deploying 3D Visualization service..."
    
    cd "$PROJECT_ROOT/idlr_pts_3d_service"
    
    # Install Python dependencies
    log "Installing Python dependencies..."
    pip3 install -r requirements.txt || error_exit "Failed to install Python dependencies"
    log_success "Python dependencies installed"
    
    # Build Docker image
    log "Building Docker image..."
    docker build -t idlr-pts-3d-service:latest . || error_exit "Failed to build Docker image"
    log_success "Docker image built"
    
    # Start service
    log "Starting 3D Visualization service..."
    docker-compose up -d || error_exit "Failed to start 3D Visualization service"
    log_success "3D Visualization service started"
    
    cd "$PROJECT_ROOT"
    log_success "3D Visualization deployment complete"
}

# Deploy TigerBeetle gRPC service
deploy_tigerbeetle() {
    log "Deploying TigerBeetle gRPC service..."
    
    cd "$PROJECT_ROOT/tigerbeetle-service"
    
    # Build Go service
    log "Building TigerBeetle gRPC service..."
    go build -o tigerbeetle-grpc main.go || error_exit "Failed to build TigerBeetle service"
    log_success "TigerBeetle service built"
    
    # Start TigerBeetle server
    log "Starting TigerBeetle server..."
    docker run -d --name tigerbeetle-server \
        -p 3001:3001 \
        -v tigerbeetle-data:/var/lib/tigerbeetle \
        ghcr.io/tigerbeetle/tigerbeetle:latest \
        start --addresses=0.0.0.0:3001 /var/lib/tigerbeetle/cluster_0_replica_0.tigerbeetle || \
        error_exit "Failed to start TigerBeetle server"
    log_success "TigerBeetle server started"
    
    # Wait for TigerBeetle to be ready
    sleep 10
    
    # Start gRPC service
    log "Starting TigerBeetle gRPC service..."
    nohup ./tigerbeetle-grpc > "$LOG_DIR/tigerbeetle-grpc.log" 2>&1 &
    echo $! > "$LOG_DIR/tigerbeetle-grpc.pid"
    log_success "TigerBeetle gRPC service started (PID: $(cat $LOG_DIR/tigerbeetle-grpc.pid))"
    
    cd "$PROJECT_ROOT"
    log_success "TigerBeetle deployment complete"
}

# Deploy Kafka cluster
deploy_kafka() {
    log "Deploying Kafka cluster..."
    
    cd "$PROJECT_ROOT"
    
    # Start Kafka cluster
    log "Starting Kafka cluster..."
    docker-compose -f docker-compose-kafka.yml up -d || error_exit "Failed to start Kafka cluster"
    log_success "Kafka cluster started"
    
    # Wait for Kafka to be ready
    log "Waiting for Kafka to be ready..."
    sleep 30
    
    # Create topics
    log "Creating Kafka topics..."
    docker exec kafka-broker-1 kafka-topics --create \
        --bootstrap-server localhost:9092 \
        --topic payment-events \
        --partitions 3 \
        --replication-factor 3 || log_warning "Topic payment-events may already exist"
    
    docker exec kafka-broker-1 kafka-topics --create \
        --bootstrap-server localhost:9092 \
        --topic blockchain-events \
        --partitions 3 \
        --replication-factor 3 || log_warning "Topic blockchain-events may already exist"
    
    docker exec kafka-broker-1 kafka-topics --create \
        --bootstrap-server localhost:9092 \
        --topic ledger-events \
        --partitions 3 \
        --replication-factor 3 || log_warning "Topic ledger-events may already exist"
    
    docker exec kafka-broker-1 kafka-topics --create \
        --bootstrap-server localhost:9092 \
        --topic reconciliation-events \
        --partitions 3 \
        --replication-factor 3 || log_warning "Topic reconciliation-events may already exist"
    
    docker exec kafka-broker-1 kafka-topics --create \
        --bootstrap-server localhost:9092 \
        --topic dead-letter-queue \
        --partitions 3 \
        --replication-factor 3 || log_warning "Topic dead-letter-queue may already exist"
    
    log_success "Kafka topics created"
    
    # Start Kafka consumers
    log "Starting Kafka consumers..."
    cd "$PROJECT_ROOT"
    pnpm run start:kafka-consumers &
    echo $! > "$LOG_DIR/kafka-consumers.pid"
    log_success "Kafka consumers started (PID: $(cat $LOG_DIR/kafka-consumers.pid))"
    
    log_success "Kafka deployment complete"
}

# Deploy Temporal server
deploy_temporal() {
    log "Deploying Temporal server..."
    
    cd "$PROJECT_ROOT"
    
    # Start Temporal server
    log "Starting Temporal server..."
    docker-compose -f docker-compose-temporal.yml up -d || error_exit "Failed to start Temporal server"
    log_success "Temporal server started"
    
    # Wait for Temporal to be ready
    log "Waiting for Temporal to be ready..."
    sleep 30
    
    # Start Temporal workers
    log "Starting Temporal workers..."
    cd "$PROJECT_ROOT/temporal"
    pnpm run start:worker &
    echo $! > "$LOG_DIR/temporal-worker.pid"
    log_success "Temporal workers started (PID: $(cat $LOG_DIR/temporal-worker.pid))"
    
    cd "$PROJECT_ROOT"
    log_success "Temporal deployment complete"
}

# Deploy Apache Iceberg lakehouse
deploy_iceberg() {
    log "Deploying Apache Iceberg lakehouse..."
    
    cd "$PROJECT_ROOT/lakehouse"
    
    # Install Python dependencies
    log "Installing Python dependencies..."
    pip3 install -r requirements.txt || error_exit "Failed to install Python dependencies"
    log_success "Python dependencies installed"
    
    # Start MinIO (S3-compatible storage)
    log "Starting MinIO..."
    docker run -d --name minio \
        -p 9000:9000 \
        -p 9001:9001 \
        -e MINIO_ROOT_USER=admin \
        -e MINIO_ROOT_PASSWORD=password123 \
        -v minio-data:/data \
        minio/minio server /data --console-address ":9001" || \
        error_exit "Failed to start MinIO"
    log_success "MinIO started"
    
    # Wait for MinIO to be ready
    sleep 10
    
    # Create Iceberg catalog
    log "Creating Iceberg catalog..."
    python3 catalog/iceberg_catalog.py || error_exit "Failed to create Iceberg catalog"
    log_success "Iceberg catalog created"
    
    # Create Iceberg tables
    log "Creating Iceberg tables..."
    python3 schemas/table_schemas.py || error_exit "Failed to create Iceberg tables"
    log_success "Iceberg tables created"
    
    cd "$PROJECT_ROOT"
    log_success "Iceberg lakehouse deployment complete"
}

# Deploy PostgreSQL catalog
deploy_postgresql() {
    log "Deploying PostgreSQL catalog..."
    
    cd "$PROJECT_ROOT"
    
    # Start PostgreSQL
    log "Starting PostgreSQL..."
    docker run -d --name postgres-catalog \
        -p 5432:5432 \
        -e POSTGRES_USER=iceberg \
        -e POSTGRES_PASSWORD=iceberg123 \
        -e POSTGRES_DB=iceberg_catalog \
        -v postgres-data:/var/lib/postgresql/data \
        postgres:15 || error_exit "Failed to start PostgreSQL"
    log_success "PostgreSQL started"
    
    # Wait for PostgreSQL to be ready
    log "Waiting for PostgreSQL to be ready..."
    sleep 15
    
    log_success "PostgreSQL deployment complete"
}

# Deploy monitoring stack
deploy_monitoring() {
    log "Deploying monitoring stack..."
    
    cd "$PROJECT_ROOT"
    
    # Start Prometheus
    log "Starting Prometheus..."
    docker-compose -f docker-compose-monitoring.yml up -d prometheus || error_exit "Failed to start Prometheus"
    log_success "Prometheus started"
    
    # Start Grafana
    log "Starting Grafana..."
    docker-compose -f docker-compose-monitoring.yml up -d grafana || error_exit "Failed to start Grafana"
    log_success "Grafana started"
    
    # Start Jaeger
    log "Starting Jaeger..."
    docker-compose -f docker-compose-monitoring.yml up -d jaeger || error_exit "Failed to start Jaeger"
    log_success "Jaeger started"
    
    log_success "Monitoring stack deployment complete"
}

# Health check
health_check() {
    log "Performing health checks..."
    
    # Check Fabric network
    log "Checking Fabric network..."
    docker ps | grep hyperledger || log_warning "Fabric network may not be running"
    
    # Check 3D Visualization service
    log "Checking 3D Visualization service..."
    curl -f http://localhost:5000/health || log_warning "3D Visualization service may not be responding"
    
    # Check TigerBeetle
    log "Checking TigerBeetle..."
    docker ps | grep tigerbeetle || log_warning "TigerBeetle may not be running"
    
    # Check Kafka
    log "Checking Kafka..."
    docker ps | grep kafka || log_warning "Kafka may not be running"
    
    # Check Temporal
    log "Checking Temporal..."
    curl -f http://localhost:7233/health || log_warning "Temporal may not be responding"
    
    # Check PostgreSQL
    log "Checking PostgreSQL..."
    docker ps | grep postgres-catalog || log_warning "PostgreSQL may not be running"
    
    # Check MinIO
    log "Checking MinIO..."
    curl -f http://localhost:9000/minio/health/live || log_warning "MinIO may not be responding"
    
    # Check Prometheus
    log "Checking Prometheus..."
    curl -f http://localhost:9090/-/healthy || log_warning "Prometheus may not be responding"
    
    # Check Grafana
    log "Checking Grafana..."
    curl -f http://localhost:3001/api/health || log_warning "Grafana may not be responding"
    
    log_success "Health checks complete"
}

# Print deployment summary
print_summary() {
    log ""
    log "========================================="
    log "  IDLR-PTS Platform Deployment Summary"
    log "========================================="
    log ""
    log "Environment: $ENVIRONMENT"
    log "Deployment Time: $(date)"
    log "Log File: $LOG_FILE"
    log ""
    log "Services Deployed:"
    log "  ✓ Hyperledger Fabric Network"
    log "  ✓ 3D Visualization Service (http://localhost:5000)"
    log "  ✓ TigerBeetle gRPC Service (localhost:50051)"
    log "  ✓ Kafka Cluster (localhost:9092)"
    log "  ✓ Temporal Server (http://localhost:7233)"
    log "  ✓ Apache Iceberg Lakehouse"
    log "  ✓ PostgreSQL Catalog (localhost:5432)"
    log "  ✓ MinIO (http://localhost:9000)"
    log "  ✓ Prometheus (http://localhost:9090)"
    log "  ✓ Grafana (http://localhost:3001)"
    log "  ✓ Jaeger (http://localhost:16686)"
    log ""
    log "Next Steps:"
    log "  1. Verify all services are running: docker ps"
    log "  2. Check service logs: docker-compose logs -f"
    log "  3. Access Grafana dashboard: http://localhost:3001 (admin/admin)"
    log "  4. Access Temporal UI: http://localhost:8080"
    log "  5. Run integration tests: pnpm test:integration"
    log ""
    log "========================================="
}

# Main deployment flow
main() {
    log "Starting IDLR-PTS Platform deployment for environment: $ENVIRONMENT"
    log "Log file: $LOG_FILE"
    log ""
    
    check_prerequisites
    load_environment
    
    deploy_postgresql
    deploy_fabric
    deploy_3d_visualization
    deploy_tigerbeetle
    deploy_kafka
    deploy_temporal
    deploy_iceberg
    deploy_monitoring
    
    health_check
    print_summary
    
    log_success "Deployment complete!"
}

# Run main function
main "$@"
