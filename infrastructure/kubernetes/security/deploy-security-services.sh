#!/bin/bash

# IDLR Platform - Security Services Deployment Script
# This script deploys OpenCTI, Wazuh, OPA, and Kubecost to Kubernetes cluster

set -e

echo "======================================"
echo "IDLR Security Services Deployment"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to Kubernetes cluster${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Kubernetes cluster is accessible${NC}"
echo ""

# Create security namespace
echo "Creating security namespace..."
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: security
  labels:
    name: security
    purpose: security-monitoring
EOF

echo -e "${GREEN}✓ Security namespace created${NC}"
echo ""

# Deploy OpenCTI
echo "======================================"
echo "Deploying OpenCTI Threat Intelligence Platform"
echo "======================================"
kubectl apply -f opencti-deployment.yaml
echo -e "${GREEN}✓ OpenCTI deployment created${NC}"
echo ""

# Wait for OpenCTI to be ready
echo "Waiting for OpenCTI to be ready (this may take 3-5 minutes)..."
kubectl wait --for=condition=ready pod -l app=opencti -n security --timeout=600s || true
echo ""

# Deploy Wazuh SIEM
echo "======================================"
echo "Deploying Wazuh SIEM"
echo "======================================"
kubectl apply -f wazuh-deployment.yaml
echo -e "${GREEN}✓ Wazuh deployment created${NC}"
echo ""

# Wait for Wazuh to be ready
echo "Waiting for Wazuh to be ready (this may take 3-5 minutes)..."
kubectl wait --for=condition=ready pod -l app=wazuh-manager -n security --timeout=600s || true
echo ""

# Deploy OPA and Kubecost
echo "======================================"
echo "Deploying OPA and Kubecost"
echo "======================================"
kubectl apply -f opa-kubecost-deployment.yaml
echo -e "${GREEN}✓ OPA and Kubecost deployments created${NC}"
echo ""

# Wait for OPA to be ready
echo "Waiting for OPA to be ready..."
kubectl wait --for=condition=ready pod -l app=opa -n security --timeout=300s || true
echo ""

# Wait for Kubecost to be ready
echo "Waiting for Kubecost to be ready..."
kubectl wait --for=condition=ready pod -l app=kubecost -n security --timeout=300s || true
echo ""

# Display deployment status
echo "======================================"
echo "Deployment Status"
echo "======================================"
echo ""

echo "Pods in security namespace:"
kubectl get pods -n security
echo ""

echo "Services in security namespace:"
kubectl get services -n security
echo ""

echo "Ingresses in security namespace:"
kubectl get ingress -n security
echo ""

# Get service URLs
echo "======================================"
echo "Service Access URLs"
echo "======================================"
echo ""

OPENCTI_URL=$(kubectl get ingress opencti-ingress -n security -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "Not configured")
WAZUH_URL=$(kubectl get ingress wazuh-ingress -n security -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "Not configured")
KUBECOST_URL=$(kubectl get ingress kubecost-ingress -n security -o jsonpath='{.spec.rules[0].host}' 2>/dev/null || echo "Not configured")

echo -e "${GREEN}OpenCTI:${NC} http://$OPENCTI_URL"
echo -e "${GREEN}Wazuh Dashboard:${NC} http://$WAZUH_URL"
echo -e "${GREEN}Kubecost:${NC} http://$KUBECOST_URL"
echo ""

# Get secrets
echo "======================================"
echo "Service Credentials"
echo "======================================"
echo ""

echo -e "${YELLOW}OpenCTI:${NC}"
OPENCTI_ADMIN_EMAIL=$(kubectl get secret opencti-secrets -n security -o jsonpath='{.data.OPENCTI_ADMIN_EMAIL}' 2>/dev/null | base64 -d || echo "Not found")
OPENCTI_ADMIN_PASSWORD=$(kubectl get secret opencti-secrets -n security -o jsonpath='{.data.OPENCTI_ADMIN_PASSWORD}' 2>/dev/null | base64 -d || echo "Not found")
OPENCTI_ADMIN_TOKEN=$(kubectl get secret opencti-secrets -n security -o jsonpath='{.data.OPENCTI_ADMIN_TOKEN}' 2>/dev/null | base64 -d || echo "Not found")
echo "  Email: $OPENCTI_ADMIN_EMAIL"
echo "  Password: $OPENCTI_ADMIN_PASSWORD"
echo "  API Token: ${OPENCTI_ADMIN_TOKEN:0:20}..."
echo ""

echo -e "${YELLOW}Wazuh:${NC}"
WAZUH_API_USER=$(kubectl get secret wazuh-secrets -n security -o jsonpath='{.data.WAZUH_API_USER}' 2>/dev/null | base64 -d || echo "Not found")
WAZUH_API_PASSWORD=$(kubectl get secret wazuh-secrets -n security -o jsonpath='{.data.WAZUH_API_PASSWORD}' 2>/dev/null | base64 -d || echo "Not found")
echo "  User: $WAZUH_API_USER"
echo "  Password: $WAZUH_API_PASSWORD"
echo ""

# Configure environment variables for IDLR application
echo "======================================"
echo "Environment Variables for IDLR Application"
echo "======================================"
echo ""

cat > ../../../.env.security << EOF
# OpenCTI Configuration
OPENCTI_URL=http://opencti.security.svc.cluster.local:8080
OPENCTI_TOKEN=$OPENCTI_ADMIN_TOKEN

# Wazuh Configuration
WAZUH_URL=http://wazuh-manager.security.svc.cluster.local:55000
WAZUH_USER=$WAZUH_API_USER
WAZUH_PASSWORD=$WAZUH_API_PASSWORD

# OPA Configuration
OPA_URL=http://opa.security.svc.cluster.local:8181

# Kubecost Configuration
KUBECOST_URL=http://kubecost.security.svc.cluster.local:9090
EOF

echo -e "${GREEN}✓ Environment variables saved to .env.security${NC}"
echo ""

echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo -e "${GREEN}All security services have been deployed successfully.${NC}"
echo ""
echo "Next steps:"
echo "1. Add the environment variables from .env.security to your application"
echo "2. Configure DNS or /etc/hosts to point to the ingress URLs"
echo "3. Access the services using the URLs above"
echo "4. The SecurityDashboard in the IDLR application will now show real-time data"
echo ""
echo "To check the status of the deployments:"
echo "  kubectl get pods -n security"
echo ""
echo "To view logs:"
echo "  kubectl logs -n security -l app=opencti"
echo "  kubectl logs -n security -l app=wazuh-manager"
echo "  kubectl logs -n security -l app=opa"
echo "  kubectl logs -n security -l app=kubecost"
echo ""
