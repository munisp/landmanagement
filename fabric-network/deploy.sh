#!/bin/bash
#
# Hyperledger Fabric Network Deployment Script
# Integrated Digital Land Registry (IDLR) Platform
#

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CHANNEL_NAME="idlr-channel"
CHAINCODE_NAME="title-transfer"
CHAINCODE_VERSION="1.0"
CHAINCODE_SEQUENCE="1"
CC_SRC_PATH="../chaincode/title-transfer"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}IDLR Fabric Network Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Function to print status
print_status() {
    echo -e "${YELLOW}>>> $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Step 1: Generate crypto material
print_status "Step 1: Generating crypto material for organizations..."
if [ ! -d "organizations" ]; then
    mkdir -p organizations/peerOrganizations
    mkdir -p organizations/ordererOrganizations
    
    # Generate crypto material using cryptogen
    cryptogen generate --config=./crypto-config.yaml --output="organizations"
    
    if [ $? -eq 0 ]; then
        print_success "Crypto material generated successfully"
    else
        print_error "Failed to generate crypto material"
        exit 1
    fi
else
    print_success "Crypto material already exists"
fi

# Step 2: Generate genesis block and channel configuration
print_status "Step 2: Generating genesis block and channel artifacts..."
mkdir -p channel-artifacts

# Generate genesis block
configtxgen -profile ThreeOrgsOrdererGenesis -channelID system-channel -outputBlock ./channel-artifacts/genesis.block

if [ $? -eq 0 ]; then
    print_success "Genesis block generated"
else
    print_error "Failed to generate genesis block"
    exit 1
fi

# Generate channel configuration transaction
configtxgen -profile ThreeOrgsChannel -outputCreateChannelTx ./channel-artifacts/${CHANNEL_NAME}.tx -channelID $CHANNEL_NAME

if [ $? -eq 0 ]; then
    print_success "Channel configuration transaction generated"
else
    print_error "Failed to generate channel configuration"
    exit 1
fi

# Generate anchor peer updates
configtxgen -profile ThreeOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/GovernmentMSPanchors.tx -channelID $CHANNEL_NAME -asOrg GovernmentMSP
configtxgen -profile ThreeOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/BankMSPanchors.tx -channelID $CHANNEL_NAME -asOrg BankMSP
configtxgen -profile ThreeOrgsChannel -outputAnchorPeersUpdate ./channel-artifacts/NotaryMSPanchors.tx -channelID $CHANNEL_NAME -asOrg NotaryMSP

print_success "Anchor peer updates generated"

# Step 3: Start the network
print_status "Step 3: Starting Fabric network..."
docker-compose up -d

if [ $? -eq 0 ]; then
    print_success "Network started successfully"
    sleep 10  # Wait for containers to be ready
else
    print_error "Failed to start network"
    exit 1
fi

# Step 4: Create channel
print_status "Step 4: Creating channel..."
docker exec cli peer channel create -o orderer.idlr.gov.ng:7050 -c $CHANNEL_NAME -f ./channel-artifacts/${CHANNEL_NAME}.tx --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem

if [ $? -eq 0 ]; then
    print_success "Channel created successfully"
else
    print_error "Failed to create channel"
    exit 1
fi

# Step 5: Join peers to channel
print_status "Step 5: Joining peers to channel..."

# Join Government peer
docker exec cli peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
print_success "Government peer joined channel"

# Join Bank peer
docker exec -e CORE_PEER_LOCALMSPID=BankMSP -e CORE_PEER_ADDRESS=peer0.bank.idlr.gov.ng:8051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/users/Admin@bank.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/peers/peer0.bank.idlr.gov.ng/tls/ca.crt cli peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
print_success "Bank peer joined channel"

# Join Notary peer
docker exec -e CORE_PEER_LOCALMSPID=NotaryMSP -e CORE_PEER_ADDRESS=peer0.notary.idlr.gov.ng:9051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/users/Admin@notary.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/peers/peer0.notary.idlr.gov.ng/tls/ca.crt cli peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
print_success "Notary peer joined channel"

# Step 6: Update anchor peers
print_status "Step 6: Updating anchor peers..."

docker exec cli peer channel update -o orderer.idlr.gov.ng:7050 -c $CHANNEL_NAME -f ./channel-artifacts/GovernmentMSPanchors.tx --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem
print_success "Government anchor peer updated"

docker exec -e CORE_PEER_LOCALMSPID=BankMSP -e CORE_PEER_ADDRESS=peer0.bank.idlr.gov.ng:8051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/users/Admin@bank.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/peers/peer0.bank.idlr.gov.ng/tls/ca.crt cli peer channel update -o orderer.idlr.gov.ng:7050 -c $CHANNEL_NAME -f ./channel-artifacts/BankMSPanchors.tx --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem
print_success "Bank anchor peer updated"

docker exec -e CORE_PEER_LOCALMSPID=NotaryMSP -e CORE_PEER_ADDRESS=peer0.notary.idlr.gov.ng:9051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/users/Admin@notary.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/peers/peer0.notary.idlr.gov.ng/tls/ca.crt cli peer channel update -o orderer.idlr.gov.ng:7050 -c $CHANNEL_NAME -f ./channel-artifacts/NotaryMSPanchors.tx --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem
print_success "Notary anchor peer updated"

# Step 7: Package chaincode
print_status "Step 7: Packaging chaincode..."
docker exec cli peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz --path /opt/gopath/src/github.com/chaincode/title-transfer --lang golang --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

if [ $? -eq 0 ]; then
    print_success "Chaincode packaged successfully"
else
    print_error "Failed to package chaincode"
    exit 1
fi

# Step 8: Install chaincode on all peers
print_status "Step 8: Installing chaincode on all peers..."

# Install on Government peer
docker exec cli peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz
print_success "Chaincode installed on Government peer"

# Install on Bank peer
docker exec -e CORE_PEER_LOCALMSPID=BankMSP -e CORE_PEER_ADDRESS=peer0.bank.idlr.gov.ng:8051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/users/Admin@bank.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/peers/peer0.bank.idlr.gov.ng/tls/ca.crt cli peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz
print_success "Chaincode installed on Bank peer"

# Install on Notary peer
docker exec -e CORE_PEER_LOCALMSPID=NotaryMSP -e CORE_PEER_ADDRESS=peer0.notary.idlr.gov.ng:9051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/users/Admin@notary.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/peers/peer0.notary.idlr.gov.ng/tls/ca.crt cli peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz
print_success "Chaincode installed on Notary peer"

# Step 9: Get chaincode package ID
print_status "Step 9: Querying installed chaincode..."
CC_PACKAGE_ID=$(docker exec cli peer lifecycle chaincode queryinstalled | grep ${CHAINCODE_NAME}_${CHAINCODE_VERSION} | awk '{print $3}' | sed 's/,$//')
print_success "Chaincode package ID: $CC_PACKAGE_ID"

# Step 10: Approve chaincode for all organizations
print_status "Step 10: Approving chaincode for all organizations..."

# Approve for Government
docker exec cli peer lifecycle chaincode approveformyorg -o orderer.idlr.gov.ng:7050 --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --package-id $CC_PACKAGE_ID --sequence $CHAINCODE_SEQUENCE --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem
print_success "Chaincode approved for Government"

# Approve for Bank
docker exec -e CORE_PEER_LOCALMSPID=BankMSP -e CORE_PEER_ADDRESS=peer0.bank.idlr.gov.ng:8051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/users/Admin@bank.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/peers/peer0.bank.idlr.gov.ng/tls/ca.crt cli peer lifecycle chaincode approveformyorg -o orderer.idlr.gov.ng:7050 --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --package-id $CC_PACKAGE_ID --sequence $CHAINCODE_SEQUENCE --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem
print_success "Chaincode approved for Bank"

# Approve for Notary
docker exec -e CORE_PEER_LOCALMSPID=NotaryMSP -e CORE_PEER_ADDRESS=peer0.notary.idlr.gov.ng:9051 -e CORE_PEER_MSPCONFIGPATH=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/users/Admin@notary.idlr.gov.ng/msp -e CORE_PEER_TLS_ROOTCERT_FILE=/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/peers/peer0.notary.idlr.gov.ng/tls/ca.crt cli peer lifecycle chaincode approveformyorg -o orderer.idlr.gov.ng:7050 --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --package-id $CC_PACKAGE_ID --sequence $CHAINCODE_SEQUENCE --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem
print_success "Chaincode approved for Notary"

# Step 11: Check commit readiness
print_status "Step 11: Checking commit readiness..."
docker exec cli peer lifecycle chaincode checkcommitreadiness --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --sequence $CHAINCODE_SEQUENCE --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem --output json

# Step 12: Commit chaincode
print_status "Step 12: Committing chaincode..."
docker exec cli peer lifecycle chaincode commit -o orderer.idlr.gov.ng:7050 --channelID $CHANNEL_NAME --name $CHAINCODE_NAME --version $CHAINCODE_VERSION --sequence $CHAINCODE_SEQUENCE --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem --peerAddresses peer0.government.idlr.gov.ng:7051 --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/government.idlr.gov.ng/peers/peer0.government.idlr.gov.ng/tls/ca.crt --peerAddresses peer0.bank.idlr.gov.ng:8051 --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/bank.idlr.gov.ng/peers/peer0.bank.idlr.gov.ng/tls/ca.crt --peerAddresses peer0.notary.idlr.gov.ng:9051 --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/notary.idlr.gov.ng/peers/peer0.notary.idlr.gov.ng/tls/ca.crt

if [ $? -eq 0 ]; then
    print_success "Chaincode committed successfully"
else
    print_error "Failed to commit chaincode"
    exit 1
fi

# Step 13: Initialize chaincode
print_status "Step 13: Initializing chaincode ledger..."
docker exec cli peer chaincode invoke -o orderer.idlr.gov.ng:7050 --tls --cafile /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/idlr.gov.ng/orderers/orderer.idlr.gov.ng/msp/tlscacerts/tlsca.idlr.gov.ng-cert.pem -C $CHANNEL_NAME -n $CHAINCODE_NAME --peerAddresses peer0.government.idlr.gov.ng:7051 --tlsRootCertFiles /opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/government.idlr.gov.ng/peers/peer0.government.idlr.gov.ng/tls/ca.crt -c '{"function":"InitLedger","Args":[]}'

if [ $? -eq 0 ]; then
    print_success "Chaincode initialized successfully"
else
    print_error "Failed to initialize chaincode"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Network Details:"
echo "  Channel: $CHANNEL_NAME"
echo "  Chaincode: $CHAINCODE_NAME v$CHAINCODE_VERSION"
echo "  Organizations: Government, Bank, Notary"
echo ""
echo "Endpoints:"
echo "  Orderer: localhost:7050"
echo "  Government Peer: localhost:7051"
echo "  Bank Peer: localhost:8051"
echo "  Notary Peer: localhost:9051"
echo ""
echo "CouchDB Interfaces:"
echo "  Government: http://localhost:5984/_utils"
echo "  Bank: http://localhost:6984/_utils"
echo "  Notary: http://localhost:7984/_utils"
echo "  Credentials: admin/adminpw"
echo ""
print_success "Fabric network is ready for use!"
