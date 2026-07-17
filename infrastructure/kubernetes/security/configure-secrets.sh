#!/bin/bash

# IDLR Security Infrastructure - Secrets Configuration Script
# This script configures environment variables and Kubernetes secrets for security services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "======================================"
echo "IDLR Security Infrastructure"
echo "Secrets Configuration"
echo "======================================"
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    exit 1
fi

# Check if security namespace exists
if ! kubectl get namespace security &> /dev/null; then
    echo -e "${YELLOW}Warning: security namespace does not exist${NC}"
    echo "Creating security namespace..."
    kubectl create namespace security
    echo -e "${GREEN}✓ Security namespace created${NC}"
    echo ""
fi

# Function to generate random password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

# Function to generate random token
generate_token() {
    openssl rand -hex 32
}

echo "Configuring security service secrets..."
echo ""

# 1. OpenCTI Secrets
echo "1. Configuring OpenCTI secrets..."

# Check if secrets already exist
if kubectl get secret opencti-secrets -n security &> /dev/null; then
    echo -e "${YELLOW}OpenCTI secrets already exist${NC}"
    read -p "Do you want to regenerate them? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping OpenCTI secrets..."
    else
        kubectl delete secret opencti-secrets -n security
        echo "Generating new OpenCTI secrets..."
        
        OPENCTI_ADMIN_EMAIL="${OPENCTI_ADMIN_EMAIL:-admin@idlr.gov.ng}"
        OPENCTI_ADMIN_PASSWORD=$(generate_password)
        OPENCTI_ADMIN_TOKEN=$(generate_token)
        OPENCTI_BASE_URL="${OPENCTI_BASE_URL:-http://opencti.security.svc.cluster.local:8080}"
        MINIO_ROOT_USER="opencti"
        MINIO_ROOT_PASSWORD=$(generate_password)
        RABBITMQ_DEFAULT_USER="opencti"
        RABBITMQ_DEFAULT_PASS=$(generate_password)
        ELASTICSEARCH_PASSWORD=$(generate_password)
        
        kubectl create secret generic opencti-secrets -n security \
          --from-literal=OPENCTI_ADMIN_EMAIL="$OPENCTI_ADMIN_EMAIL" \
          --from-literal=OPENCTI_ADMIN_PASSWORD="$OPENCTI_ADMIN_PASSWORD" \
          --from-literal=OPENCTI_ADMIN_TOKEN="$OPENCTI_ADMIN_TOKEN" \
          --from-literal=OPENCTI_BASE_URL="$OPENCTI_BASE_URL" \
          --from-literal=MINIO_ROOT_USER="$MINIO_ROOT_USER" \
          --from-literal=MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
          --from-literal=RABBITMQ_DEFAULT_USER="$RABBITMQ_DEFAULT_USER" \
          --from-literal=RABBITMQ_DEFAULT_PASS="$RABBITMQ_DEFAULT_PASS" \
          --from-literal=ELASTICSEARCH_PASSWORD="$ELASTICSEARCH_PASSWORD"
        
        echo -e "${GREEN}✓ OpenCTI secrets created${NC}"
    fi
else
    echo "Generating OpenCTI secrets..."
    
    OPENCTI_ADMIN_EMAIL="${OPENCTI_ADMIN_EMAIL:-admin@idlr.gov.ng}"
    OPENCTI_ADMIN_PASSWORD=$(generate_password)
    OPENCTI_ADMIN_TOKEN=$(generate_token)
    OPENCTI_BASE_URL="${OPENCTI_BASE_URL:-http://opencti.security.svc.cluster.local:8080}"
    MINIO_ROOT_USER="opencti"
    MINIO_ROOT_PASSWORD=$(generate_password)
    RABBITMQ_DEFAULT_USER="opencti"
    RABBITMQ_DEFAULT_PASS=$(generate_password)
    ELASTICSEARCH_PASSWORD=$(generate_password)
    
    kubectl create secret generic opencti-secrets -n security \
      --from-literal=OPENCTI_ADMIN_EMAIL="$OPENCTI_ADMIN_EMAIL" \
      --from-literal=OPENCTI_ADMIN_PASSWORD="$OPENCTI_ADMIN_PASSWORD" \
      --from-literal=OPENCTI_ADMIN_TOKEN="$OPENCTI_ADMIN_TOKEN" \
      --from-literal=OPENCTI_BASE_URL="$OPENCTI_BASE_URL" \
      --from-literal=MINIO_ROOT_USER="$MINIO_ROOT_USER" \
      --from-literal=MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
      --from-literal=RABBITMQ_DEFAULT_USER="$RABBITMQ_DEFAULT_USER" \
      --from-literal=RABBITMQ_DEFAULT_PASS="$RABBITMQ_DEFAULT_PASS" \
      --from-literal=ELASTICSEARCH_PASSWORD="$ELASTICSEARCH_PASSWORD"
    
    echo -e "${GREEN}✓ OpenCTI secrets created${NC}"
fi
echo ""

# 2. Wazuh Secrets
echo "2. Configuring Wazuh secrets..."

if kubectl get secret wazuh-secrets -n security &> /dev/null; then
    echo -e "${YELLOW}Wazuh secrets already exist${NC}"
    read -p "Do you want to regenerate them? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Skipping Wazuh secrets..."
    else
        kubectl delete secret wazuh-secrets -n security
        echo "Generating new Wazuh secrets..."
        
        WAZUH_API_USER="wazuh"
        WAZUH_API_PASSWORD=$(generate_password)
        INDEXER_PASSWORD=$(generate_password)
        FILEBEAT_PASSWORD=$(generate_password)
        
        kubectl create secret generic wazuh-secrets -n security \
          --from-literal=WAZUH_API_USER="$WAZUH_API_USER" \
          --from-literal=WAZUH_API_PASSWORD="$WAZUH_API_PASSWORD" \
          --from-literal=INDEXER_PASSWORD="$INDEXER_PASSWORD" \
          --from-literal=FILEBEAT_PASSWORD="$FILEBEAT_PASSWORD"
        
        echo -e "${GREEN}✓ Wazuh secrets created${NC}"
    fi
else
    echo "Generating Wazuh secrets..."
    
    WAZUH_API_USER="wazuh"
    WAZUH_API_PASSWORD=$(generate_password)
    INDEXER_PASSWORD=$(generate_password)
    FILEBEAT_PASSWORD=$(generate_password)
    
    kubectl create secret generic wazuh-secrets -n security \
      --from-literal=WAZUH_API_USER="$WAZUH_API_USER" \
      --from-literal=WAZUH_API_PASSWORD="$WAZUH_API_PASSWORD" \
      --from-literal=INDEXER_PASSWORD="$INDEXER_PASSWORD" \
      --from-literal=FILEBEAT_PASSWORD="$FILEBEAT_PASSWORD"
    
    echo -e "${GREEN}✓ Wazuh secrets created${NC}"
fi
echo ""

# 3. Generate environment file for IDLR application
echo "3. Generating environment configuration for IDLR application..."

# Extract secrets from Kubernetes
OPENCTI_TOKEN=$(kubectl get secret opencti-secrets -n security -o jsonpath='{.data.OPENCTI_ADMIN_TOKEN}' 2>/dev/null | base64 -d || echo "")
WAZUH_USER=$(kubectl get secret wazuh-secrets -n security -o jsonpath='{.data.WAZUH_API_USER}' 2>/dev/null | base64 -d || echo "")
WAZUH_PASSWORD=$(kubectl get secret wazuh-secrets -n security -o jsonpath='{.data.WAZUH_API_PASSWORD}' 2>/dev/null | base64 -d || echo "")

# Create .env.security file
cat > ../../../.env.security << EOF
# IDLR Security Infrastructure Environment Variables
# Generated on $(date)

# OpenCTI Configuration
OPENCTI_URL=http://opencti.security.svc.cluster.local:8080
OPENCTI_TOKEN=$OPENCTI_TOKEN

# Wazuh Configuration
WAZUH_URL=http://wazuh-manager.security.svc.cluster.local:55000
WAZUH_USER=$WAZUH_USER
WAZUH_PASSWORD=$WAZUH_PASSWORD

# OPA Configuration
OPA_URL=http://opa.security.svc.cluster.local:8181

# Kubecost Configuration
KUBECOST_URL=http://kubecost.security.svc.cluster.local:9090
EOF

echo -e "${GREEN}✓ Environment file created: .env.security${NC}"
echo ""

# 4. Create Kubernetes secret for IDLR application
echo "4. Creating Kubernetes secret for IDLR application..."

# Prompt for namespace
read -p "Enter IDLR application namespace (default: idlr-production): " IDLR_NAMESPACE
IDLR_NAMESPACE=${IDLR_NAMESPACE:-idlr-production}

# Check if namespace exists
if ! kubectl get namespace "$IDLR_NAMESPACE" &> /dev/null; then
    echo -e "${YELLOW}Namespace '$IDLR_NAMESPACE' does not exist${NC}"
    read -p "Do you want to create it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl create namespace "$IDLR_NAMESPACE"
        echo -e "${GREEN}✓ Namespace created${NC}"
    else
        echo "Skipping Kubernetes secret creation..."
        echo ""
        echo "You can manually create the secret later with:"
        echo "  kubectl create secret generic security-config --from-env-file=.env.security -n $IDLR_NAMESPACE"
        echo ""
        exit 0
    fi
fi

# Check if secret already exists
if kubectl get secret security-config -n "$IDLR_NAMESPACE" &> /dev/null; then
    echo -e "${YELLOW}Secret 'security-config' already exists in namespace '$IDLR_NAMESPACE'${NC}"
    read -p "Do you want to update it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl delete secret security-config -n "$IDLR_NAMESPACE"
        kubectl create secret generic security-config --from-env-file=../../../.env.security -n "$IDLR_NAMESPACE"
        echo -e "${GREEN}✓ Secret updated${NC}"
    else
        echo "Skipping secret update..."
    fi
else
    kubectl create secret generic security-config --from-env-file=../../../.env.security -n "$IDLR_NAMESPACE"
    echo -e "${GREEN}✓ Secret created${NC}"
fi
echo ""

# 5. Display credentials
echo "======================================"
echo "Security Service Credentials"
echo "======================================"
echo ""

OPENCTI_EMAIL=$(kubectl get secret opencti-secrets -n security -o jsonpath='{.data.OPENCTI_ADMIN_EMAIL}' 2>/dev/null | base64 -d || echo "Not found")
OPENCTI_PASSWORD=$(kubectl get secret opencti-secrets -n security -o jsonpath='{.data.OPENCTI_ADMIN_PASSWORD}' 2>/dev/null | base64 -d || echo "Not found")

echo -e "${BLUE}OpenCTI:${NC}"
echo "  Email: $OPENCTI_EMAIL"
echo "  Password: $OPENCTI_PASSWORD"
echo "  API Token: ${OPENCTI_TOKEN:0:20}..."
echo ""

echo -e "${BLUE}Wazuh:${NC}"
echo "  User: $WAZUH_USER"
echo "  Password: $WAZUH_PASSWORD"
echo ""

echo -e "${YELLOW}⚠ IMPORTANT: Save these credentials securely!${NC}"
echo ""

# 6. Save credentials to file
read -p "Do you want to save credentials to a file? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    CREDS_FILE="../../../security-credentials-$(date +%Y%m%d-%H%M%S).txt"
    cat > "$CREDS_FILE" << EOF
IDLR Security Infrastructure Credentials
Generated on $(date)

OpenCTI:
  Email: $OPENCTI_EMAIL
  Password: $OPENCTI_PASSWORD
  API Token: $OPENCTI_TOKEN

Wazuh:
  User: $WAZUH_USER
  Password: $WAZUH_PASSWORD

IMPORTANT: Store this file securely and delete it after saving to a password manager.
EOF
    echo -e "${GREEN}✓ Credentials saved to: $CREDS_FILE${NC}"
    echo -e "${RED}⚠ Remember to delete this file after saving to a secure location!${NC}"
    echo ""
fi

# Summary
echo "======================================"
echo "Configuration Complete!"
echo "======================================"
echo ""
echo -e "${GREEN}All secrets have been configured successfully.${NC}"
echo ""
echo "Next steps:"
echo "  1. Deploy security services: ./deploy-security-services.sh"
echo "  2. Configure your IDLR application to use the environment variables"
echo "  3. Update your deployment manifests to mount the 'security-config' secret"
echo ""
echo "To use the secret in your deployment:"
echo "  envFrom:"
echo "  - secretRef:"
echo "      name: security-config"
echo ""
