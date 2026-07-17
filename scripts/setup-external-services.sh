#!/bin/bash

# IDLR-PTS Platform - External Services Setup Script
# Usage: ./scripts/setup-external-services.sh [all|fabric|mojaloop|tigerbeetle|kafka|temporal|elasticsearch]

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE=${1:-all}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
EXTERNAL_SERVICES_DIR="$PROJECT_DIR/external-services"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        missing_tools+=("docker-compose")
    fi
    
    if ! command -v kubectl &> /dev/null; then
        log_warning "kubectl not found - Kubernetes deployment will not be available"
    fi
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

setup_hyperledger_fabric() {
    log_info "========================================="
    log_info "Setting up Hyperledger Fabric"
    log_info "========================================="
    
    mkdir -p "$EXTERNAL_SERVICES_DIR/fabric"
    cd "$EXTERNAL_SERVICES_DIR/fabric"
    
    # Download Fabric binaries and Docker images
    log_info "Downloading Fabric binaries and images..."
    curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.5
    
    # Create network configuration
    log_info "Creating network configuration..."
    cat > network-config.yaml <<EOF
name: "idlr-pts-network"
version: "1.0"

channels:
  idlr-channel:
    orderers:
      - orderer.example.com
    peers:
      peer0.org1.example.com:
        endorsingPeer: true
        chaincodeQuery: true
        ledgerQuery: true
        eventSource: true

organizations:
  Org1:
    mspid: Org1MSP
    peers:
      - peer0.org1.example.com
    certificateAuthorities:
      - ca.org1.example.com

orderers:
  orderer.example.com:
    url: grpcs://localhost:7050
    grpcOptions:
      ssl-target-name-override: orderer.example.com

peers:
  peer0.org1.example.com:
    url: grpcs://localhost:7051
    grpcOptions:
      ssl-target-name-override: peer0.org1.example.com

certificateAuthorities:
  ca.org1.example.com:
    url: https://localhost:7054
    caName: ca-org1
EOF
    
    # Create Docker Compose file for Fabric network
    log_info "Creating Docker Compose configuration..."
    cat > docker-compose-fabric.yml <<EOF
version: '3.7'

networks:
  fabric-network:
    name: fabric-network

services:
  orderer.example.com:
    container_name: orderer.example.com
    image: hyperledger/fabric-orderer:2.5
    environment:
      - FABRIC_LOGGING_SPEC=INFO
      - ORDERER_GENERAL_LISTENADDRESS=0.0.0.0
      - ORDERER_GENERAL_LISTENPORT=7050
      - ORDERER_GENERAL_LOCALMSPID=OrdererMSP
      - ORDERER_GENERAL_LOCALMSPDIR=/var/hyperledger/orderer/msp
      - ORDERER_GENERAL_TLS_ENABLED=true
      - ORDERER_GENERAL_TLS_PRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_GENERAL_TLS_CERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_GENERAL_TLS_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric
    command: orderer
    ports:
      - 7050:7050
    networks:
      - fabric-network

  peer0.org1.example.com:
    container_name: peer0.org1.example.com
    image: hyperledger/fabric-peer:2.5
    environment:
      - CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock
      - CORE_PEER_ID=peer0.org1.example.com
      - CORE_PEER_ADDRESS=peer0.org1.example.com:7051
      - CORE_PEER_LISTENADDRESS=0.0.0.0:7051
      - CORE_PEER_CHAINCODEADDRESS=peer0.org1.example.com:7052
      - CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:7052
      - CORE_PEER_GOSSIP_BOOTSTRAP=peer0.org1.example.com:7051
      - CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0.org1.example.com:7051
      - CORE_PEER_LOCALMSPID=Org1MSP
      - CORE_PEER_TLS_ENABLED=true
      - CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt
      - CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key
      - CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric/peer
    command: peer node start
    ports:
      - 7051:7051
    volumes:
      - /var/run/:/host/var/run/
    networks:
      - fabric-network

  ca.org1.example.com:
    image: hyperledger/fabric-ca:1.5
    environment:
      - FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server
      - FABRIC_CA_SERVER_CA_NAME=ca-org1
      - FABRIC_CA_SERVER_TLS_ENABLED=true
      - FABRIC_CA_SERVER_PORT=7054
    ports:
      - "7054:7054"
    command: sh -c 'fabric-ca-server start -b admin:adminpw -d'
    networks:
      - fabric-network
EOF
    
    log_success "Hyperledger Fabric setup completed"
    log_info "To start Fabric network: cd $EXTERNAL_SERVICES_DIR/fabric && docker-compose -f docker-compose-fabric.yml up -d"
}

setup_mojaloop() {
    log_info "========================================="
    log_info "Setting up Mojaloop"
    log_info "========================================="
    
    mkdir -p "$EXTERNAL_SERVICES_DIR/mojaloop"
    cd "$EXTERNAL_SERVICES_DIR/mojaloop"
    
    # Clone Mojaloop deployment repository
    log_info "Cloning Mojaloop deployment repository..."
    if [ ! -d "helm" ]; then
        git clone https://github.com/mojaloop/helm.git
    fi
    
    # Create Mojaloop configuration
    log_info "Creating Mojaloop configuration..."
    cat > mojaloop-values.yaml <<EOF
global:
  adminApiSvc:
    enabled: true
  centralLedgerAdminApiSvc:
    enabled: true

mojaloop:
  enabled: true

ml-api-adapter:
  enabled: true
  ml-api-adapter-service:
    config:
      log_level: info

central-ledger:
  enabled: true
  central-ledger-service:
    config:
      log_level: info

account-lookup-service:
  enabled: true

quoting-service:
  enabled: true

central-settlement:
  enabled: true

transaction-requests-service:
  enabled: true

bulk-api-adapter:
  enabled: true

mysql:
  enabled: true
  auth:
    rootPassword: "mojaloop"
    database: "central_ledger"

kafka:
  enabled: true
  replicaCount: 1
EOF
    
    log_success "Mojaloop setup completed"
    log_info "To deploy Mojaloop with Helm:"
    log_info "  helm install mojaloop ./helm/mojaloop -f mojaloop-values.yaml"
}

setup_tigerbeetle() {
    log_info "========================================="
    log_info "Setting up TigerBeetle"
    log_info "========================================="
    
    mkdir -p "$EXTERNAL_SERVICES_DIR/tigerbeetle"
    cd "$EXTERNAL_SERVICES_DIR/tigerbeetle"
    
    # Download TigerBeetle binary
    log_info "Downloading TigerBeetle binary..."
    TIGERBEETLE_VERSION="0.15.3"
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -L "https://github.com/tigerbeetle/tigerbeetle/releases/download/${TIGERBEETLE_VERSION}/tigerbeetle-x86_64-linux.zip" -o tigerbeetle.zip
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        curl -L "https://github.com/tigerbeetle/tigerbeetle/releases/download/${TIGERBEETLE_VERSION}/tigerbeetle-universal-macos.zip" -o tigerbeetle.zip
    fi
    
    unzip -o tigerbeetle.zip
    chmod +x tigerbeetle
    
    # Create TigerBeetle data file
    log_info "Creating TigerBeetle cluster..."
    ./tigerbeetle format --cluster=0 --replica=0 --replica-count=1 0_0.tigerbeetle
    
    # Create systemd service file
    log_info "Creating systemd service..."
    cat > tigerbeetle.service <<EOF
[Unit]
Description=TigerBeetle Database
After=network.target

[Service]
Type=simple
User=tigerbeetle
WorkingDirectory=$EXTERNAL_SERVICES_DIR/tigerbeetle
ExecStart=$EXTERNAL_SERVICES_DIR/tigerbeetle/tigerbeetle start --addresses=0.0.0.0:3000 0_0.tigerbeetle
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    # Create Docker Compose file
    cat > docker-compose-tigerbeetle.yml <<EOF
version: '3.7'

services:
  tigerbeetle:
    image: ghcr.io/tigerbeetle/tigerbeetle:${TIGERBEETLE_VERSION}
    container_name: tigerbeetle
    command: start --addresses=0.0.0.0:3000 /data/0_0.tigerbeetle
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    restart: unless-stopped
EOF
    
    log_success "TigerBeetle setup completed"
    log_info "To start TigerBeetle:"
    log_info "  Option 1 (Docker): docker-compose -f docker-compose-tigerbeetle.yml up -d"
    log_info "  Option 2 (Binary): ./tigerbeetle start --addresses=0.0.0.0:3000 0_0.tigerbeetle"
}

setup_kafka() {
    log_info "========================================="
    log_info "Setting up Kafka"
    log_info "========================================="
    
    mkdir -p "$EXTERNAL_SERVICES_DIR/kafka"
    cd "$EXTERNAL_SERVICES_DIR/kafka"
    
    # Create Kafka Docker Compose file
    log_info "Creating Kafka cluster configuration..."
    cat > docker-compose-kafka.yml <<EOF
version: '3.7'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    container_name: zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    ports:
      - "2181:2181"
    volumes:
      - zookeeper_data:/var/lib/zookeeper/data
      - zookeeper_logs:/var/lib/zookeeper/log

  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    container_name: kafka-1
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
      - "19092:19092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:9092,CONNECTIONS_FROM_HOST://localhost:19092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONNECTIONS_FROM_HOST:PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_JMX_PORT: 9101
      KAFKA_JMX_HOSTNAME: localhost
    volumes:
      - kafka_1_data:/var/lib/kafka/data

  kafka-2:
    image: confluentinc/cp-kafka:7.5.0
    container_name: kafka-2
    depends_on:
      - zookeeper
    ports:
      - "9093:9093"
      - "19093:19093"
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:9093,CONNECTIONS_FROM_HOST://localhost:19093
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONNECTIONS_FROM_HOST:PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_JMX_PORT: 9101
      KAFKA_JMX_HOSTNAME: localhost
    volumes:
      - kafka_2_data:/var/lib/kafka/data

  kafka-3:
    image: confluentinc/cp-kafka:7.5.0
    container_name: kafka-3
    depends_on:
      - zookeeper
    ports:
      - "9094:9094"
      - "19094:19094"
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:9094,CONNECTIONS_FROM_HOST://localhost:19094
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONNECTIONS_FROM_HOST:PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_JMX_PORT: 9101
      KAFKA_JMX_HOSTNAME: localhost
    volumes:
      - kafka_3_data:/var/lib/kafka/data

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: kafka-ui
    depends_on:
      - kafka-1
      - kafka-2
      - kafka-3
    ports:
      - "8080:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: idlr-pts-cluster
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-1:9092,kafka-2:9093,kafka-3:9094
      KAFKA_CLUSTERS_0_ZOOKEEPER: zookeeper:2181

volumes:
  zookeeper_data:
  zookeeper_logs:
  kafka_1_data:
  kafka_2_data:
  kafka_3_data:
EOF
    
    # Create topic initialization script
    cat > init-topics.sh <<'EOF'
#!/bin/bash
echo "Waiting for Kafka to be ready..."
sleep 30

echo "Creating topics..."
docker exec kafka-1 kafka-topics --create --topic property-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 3
docker exec kafka-1 kafka-topics --create --topic transaction-events --bootstrap-server localhost:9092 --partitions 3 --replication-factor 3
docker exec kafka-1 kafka-topics --create --topic audit-logs --bootstrap-server localhost:9092 --partitions 3 --replication-factor 3
docker exec kafka-1 kafka-topics --create --topic notifications --bootstrap-server localhost:9092 --partitions 3 --replication-factor 3

echo "Topics created successfully"
EOF
    chmod +x init-topics.sh
    
    log_success "Kafka setup completed"
    log_info "To start Kafka cluster: docker-compose -f docker-compose-kafka.yml up -d"
    log_info "To create topics: ./init-topics.sh"
    log_info "Kafka UI available at: http://localhost:8080"
}

setup_temporal() {
    log_info "========================================="
    log_info "Setting up Temporal"
    log_info "========================================="
    
    mkdir -p "$EXTERNAL_SERVICES_DIR/temporal"
    cd "$EXTERNAL_SERVICES_DIR/temporal"
    
    # Download Temporal Docker Compose
    log_info "Downloading Temporal Docker Compose configuration..."
    curl -L https://github.com/temporalio/docker-compose/archive/refs/heads/main.zip -o temporal-docker-compose.zip
    unzip -o temporal-docker-compose.zip
    mv docker-compose-main/* .
    rm -rf docker-compose-main temporal-docker-compose.zip
    
    # Create custom configuration
    log_info "Creating custom Temporal configuration..."
    cat > docker-compose.override.yml <<EOF
version: '3.7'

services:
  temporal:
    environment:
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development.yaml
      - ENABLE_ES=true
      - ES_SEEDS=elasticsearch:9200
      - ES_VERSION=v7
    ports:
      - "7233:7233"

  temporal-ui:
    ports:
      - "8088:8088"

  temporal-admin-tools:
    environment:
      - TEMPORAL_CLI_ADDRESS=temporal:7233
EOF
    
    log_success "Temporal setup completed"
    log_info "To start Temporal: docker-compose up -d"
    log_info "Temporal UI available at: http://localhost:8088"
}

setup_elasticsearch() {
    log_info "========================================="
    log_info "Setting up Elasticsearch"
    log_info "========================================="
    
    mkdir -p "$EXTERNAL_SERVICES_DIR/elasticsearch"
    cd "$EXTERNAL_SERVICES_DIR/elasticsearch"
    
    # Create Elasticsearch Docker Compose file
    log_info "Creating Elasticsearch cluster configuration..."
    cat > docker-compose-elasticsearch.yml <<EOF
version: '3.7'

services:
  elasticsearch-1:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: elasticsearch-1
    environment:
      - node.name=elasticsearch-1
      - cluster.name=idlr-pts-cluster
      - discovery.seed_hosts=elasticsearch-2,elasticsearch-3
      - cluster.initial_master_nodes=elasticsearch-1,elasticsearch-2,elasticsearch-3
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
      - xpack.security.enabled=false
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - es_1_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    networks:
      - elastic

  elasticsearch-2:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: elasticsearch-2
    environment:
      - node.name=elasticsearch-2
      - cluster.name=idlr-pts-cluster
      - discovery.seed_hosts=elasticsearch-1,elasticsearch-3
      - cluster.initial_master_nodes=elasticsearch-1,elasticsearch-2,elasticsearch-3
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
      - xpack.security.enabled=false
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - es_2_data:/usr/share/elasticsearch/data
    networks:
      - elastic

  elasticsearch-3:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: elasticsearch-3
    environment:
      - node.name=elasticsearch-3
      - cluster.name=idlr-pts-cluster
      - discovery.seed_hosts=elasticsearch-1,elasticsearch-2
      - cluster.initial_master_nodes=elasticsearch-1,elasticsearch-2,elasticsearch-3
      - bootstrap.memory_lock=true
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
      - xpack.security.enabled=false
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - es_3_data:/usr/share/elasticsearch/data
    networks:
      - elastic

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    container_name: kibana
    ports:
      - "5601:5601"
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch-1:9200
    depends_on:
      - elasticsearch-1
    networks:
      - elastic

volumes:
  es_1_data:
  es_2_data:
  es_3_data:

networks:
  elastic:
    driver: bridge
EOF
    
    # Create index initialization script
    cat > init-indices.sh <<'EOF'
#!/bin/bash
echo "Waiting for Elasticsearch to be ready..."
sleep 60

echo "Creating indices..."

# Properties index
curl -X PUT "localhost:9200/properties" -H 'Content-Type: application/json' -d'
{
  "mappings": {
    "properties": {
      "parcel_id": {"type": "keyword"},
      "location": {"type": "geo_point"},
      "geometry": {"type": "geo_shape"},
      "owner": {"type": "text"},
      "area": {"type": "float"},
      "created_at": {"type": "date"}
    }
  }
}'

# Transactions index
curl -X PUT "localhost:9200/transactions" -H 'Content-Type: application/json' -d'
{
  "mappings": {
    "properties": {
      "transaction_id": {"type": "keyword"},
      "parcel_id": {"type": "keyword"},
      "type": {"type": "keyword"},
      "amount": {"type": "float"},
      "timestamp": {"type": "date"}
    }
  }
}'

# Audit logs index
curl -X PUT "localhost:9200/audit-logs" -H 'Content-Type: application/json' -d'
{
  "mappings": {
    "properties": {
      "user_id": {"type": "keyword"},
      "action": {"type": "keyword"},
      "resource": {"type": "keyword"},
      "timestamp": {"type": "date"},
      "ip_address": {"type": "ip"}
    }
  }
}'

echo "Indices created successfully"
EOF
    chmod +x init-indices.sh
    
    log_success "Elasticsearch setup completed"
    log_info "To start Elasticsearch cluster: docker-compose -f docker-compose-elasticsearch.yml up -d"
    log_info "To create indices: ./init-indices.sh"
    log_info "Kibana available at: http://localhost:5601"
}

# Main setup flow
main() {
    echo ""
    log_info "========================================="
    log_info "IDLR-PTS External Services Setup"
    log_info "========================================="
    echo ""
    
    check_prerequisites
    
    mkdir -p "$EXTERNAL_SERVICES_DIR"
    
    case "$SERVICE" in
        all)
            setup_hyperledger_fabric
            setup_mojaloop
            setup_tigerbeetle
            setup_kafka
            setup_temporal
            setup_elasticsearch
            ;;
        fabric)
            setup_hyperledger_fabric
            ;;
        mojaloop)
            setup_mojaloop
            ;;
        tigerbeetle)
            setup_tigerbeetle
            ;;
        kafka)
            setup_kafka
            ;;
        temporal)
            setup_temporal
            ;;
        elasticsearch)
            setup_elasticsearch
            ;;
        *)
            log_error "Unknown service: $SERVICE"
            log_info "Usage: $0 [all|fabric|mojaloop|tigerbeetle|kafka|temporal|elasticsearch]"
            exit 1
            ;;
    esac
    
    echo ""
    log_success "========================================="
    log_success "External services setup completed!"
    log_success "========================================="
    echo ""
    log_info "Next steps:"
    log_info "1. Review the generated configurations in $EXTERNAL_SERVICES_DIR"
    log_info "2. Start the services using the provided Docker Compose files"
    log_info "3. Update your .env file with the service endpoints"
    log_info "4. Run integration tests to verify connectivity"
    echo ""
}

# Run main function
main
