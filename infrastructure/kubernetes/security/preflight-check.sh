#!/bin/bash

# IDLR Security Infrastructure - Pre-flight Check Script
# This script validates that all prerequisites are met before deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo "======================================"
echo "IDLR Security Infrastructure"
echo "Pre-flight Validation Check"
echo "======================================"
echo ""

# Function to print success
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
print_error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# Function to print info
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

echo "Checking prerequisites..."
echo ""

# 1. Check kubectl
echo "1. Checking kubectl installation..."
if command -v kubectl &> /dev/null; then
    KUBECTL_VERSION=$(kubectl version --client --short 2>/dev/null | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown")
    print_success "kubectl is installed (version: $KUBECTL_VERSION)"
else
    print_error "kubectl is not installed"
    print_info "Install kubectl: https://kubernetes.io/docs/tasks/tools/"
fi
echo ""

# 2. Check cluster connectivity
echo "2. Checking Kubernetes cluster connectivity..."
if kubectl cluster-info &> /dev/null; then
    CLUSTER_VERSION=$(kubectl version --short 2>/dev/null | grep "Server Version" | grep -oP 'v\d+\.\d+\.\d+' || echo "unknown")
    print_success "Connected to Kubernetes cluster (version: $CLUSTER_VERSION)"
    
    # Check if cluster version is supported
    MAJOR_VERSION=$(echo $CLUSTER_VERSION | cut -d'.' -f2)
    if [ "$MAJOR_VERSION" -ge 24 ]; then
        print_success "Cluster version is supported (v1.24+)"
    else
        print_warning "Cluster version may not be fully supported. Recommended: v1.24+"
    fi
else
    print_error "Cannot connect to Kubernetes cluster"
    print_info "Configure kubectl: kubectl config use-context <context-name>"
fi
echo ""

# 3. Check NGINX Ingress Controller
echo "3. Checking NGINX Ingress Controller..."
if kubectl get deployment -n ingress-nginx ingress-nginx-controller &> /dev/null; then
    print_success "NGINX Ingress Controller is installed"
    
    # Check if ingress controller is ready
    READY_REPLICAS=$(kubectl get deployment -n ingress-nginx ingress-nginx-controller -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
    DESIRED_REPLICAS=$(kubectl get deployment -n ingress-nginx ingress-nginx-controller -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "0")
    
    if [ "$READY_REPLICAS" -eq "$DESIRED_REPLICAS" ] && [ "$READY_REPLICAS" -gt 0 ]; then
        print_success "NGINX Ingress Controller is ready ($READY_REPLICAS/$DESIRED_REPLICAS replicas)"
    else
        print_warning "NGINX Ingress Controller is not ready ($READY_REPLICAS/$DESIRED_REPLICAS replicas)"
    fi
else
    print_warning "NGINX Ingress Controller is not installed"
    print_info "Install: kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml"
fi
echo ""

# 4. Check available resources
echo "4. Checking cluster resources..."
TOTAL_CPU=$(kubectl top nodes 2>/dev/null | awk 'NR>1 {sum+=$3} END {print sum}' || echo "0")
TOTAL_MEMORY=$(kubectl top nodes 2>/dev/null | awk 'NR>1 {sum+=$5} END {print sum}' || echo "0")

if command -v kubectl top &> /dev/null && kubectl top nodes &> /dev/null; then
    print_success "Metrics server is available"
    
    # Get node count
    NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
    print_info "Cluster has $NODE_COUNT node(s)"
    
    # Check if we have enough resources
    # Required: 12 CPU cores, 30GB RAM
    print_info "Checking resource availability..."
    
    # Get allocatable resources
    ALLOCATABLE_CPU=$(kubectl get nodes -o jsonpath='{.items[*].status.allocatable.cpu}' | tr ' ' '\n' | awk '{sum+=$1} END {print sum}')
    ALLOCATABLE_MEMORY=$(kubectl get nodes -o jsonpath='{.items[*].status.allocatable.memory}' | tr ' ' '\n' | sed 's/Ki$//' | awk '{sum+=$1/1024/1024} END {printf "%.0f", sum}')
    
    print_info "Allocatable CPU: ${ALLOCATABLE_CPU} cores"
    print_info "Allocatable Memory: ${ALLOCATABLE_MEMORY}GB"
    
    if [ "$ALLOCATABLE_CPU" -ge 12 ]; then
        print_success "Sufficient CPU resources available (${ALLOCATABLE_CPU} cores >= 12 cores required)"
    else
        print_warning "Insufficient CPU resources (${ALLOCATABLE_CPU} cores < 12 cores required)"
    fi
    
    if [ "$ALLOCATABLE_MEMORY" -ge 30 ]; then
        print_success "Sufficient memory available (${ALLOCATABLE_MEMORY}GB >= 30GB required)"
    else
        print_warning "Insufficient memory (${ALLOCATABLE_MEMORY}GB < 30GB required)"
    fi
else
    print_warning "Metrics server is not available - cannot check resource usage"
    print_info "Install metrics server: kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
fi
echo ""

# 5. Check storage class
echo "5. Checking storage provisioner..."
if kubectl get storageclass &> /dev/null; then
    STORAGE_CLASSES=$(kubectl get storageclass --no-headers 2>/dev/null | wc -l)
    if [ "$STORAGE_CLASSES" -gt 0 ]; then
        print_success "Storage provisioner is available ($STORAGE_CLASSES storage class(es) found)"
        DEFAULT_SC=$(kubectl get storageclass -o jsonpath='{.items[?(@.metadata.annotations.storageclass\.kubernetes\.io/is-default-class=="true")].metadata.name}' 2>/dev/null)
        if [ -n "$DEFAULT_SC" ]; then
            print_success "Default storage class: $DEFAULT_SC"
        else
            print_warning "No default storage class configured"
        fi
    else
        print_warning "No storage classes found"
    fi
else
    print_error "Cannot check storage classes"
fi
echo ""

# 6. Check namespace
echo "6. Checking security namespace..."
if kubectl get namespace security &> /dev/null; then
    print_warning "Namespace 'security' already exists"
    print_info "Existing resources will be updated during deployment"
else
    print_success "Namespace 'security' does not exist (will be created)"
fi
echo ""

# 7. Check DNS resolution
echo "7. Checking DNS configuration..."
if kubectl get configmap coredns -n kube-system &> /dev/null; then
    print_success "CoreDNS is configured"
else
    print_warning "CoreDNS configuration not found"
fi
echo ""

# 8. Check network policies support
echo "8. Checking network policies support..."
if kubectl api-resources | grep -q "networkpolicies"; then
    print_success "Network policies are supported"
else
    print_warning "Network policies may not be supported"
fi
echo ""

# 9. Check RBAC
echo "9. Checking RBAC configuration..."
if kubectl auth can-i create deployments --all-namespaces &> /dev/null; then
    print_success "Current user has sufficient RBAC permissions"
else
    print_error "Current user does not have sufficient RBAC permissions"
    print_info "Required permissions: create/update/delete deployments, services, secrets, configmaps, ingresses"
fi
echo ""

# 10. Check existing deployments
echo "10. Checking for existing security deployments..."
EXISTING_DEPLOYMENTS=$(kubectl get deployments -n security --no-headers 2>/dev/null | wc -l || echo "0")
if [ "$EXISTING_DEPLOYMENTS" -gt 0 ]; then
    print_warning "Found $EXISTING_DEPLOYMENTS existing deployment(s) in security namespace"
    kubectl get deployments -n security --no-headers 2>/dev/null | awk '{print "  - " $1}'
    print_info "These will be updated during deployment"
else
    print_success "No existing deployments found (clean installation)"
fi
echo ""

# 11. Check Docker/containerd
echo "11. Checking container runtime..."
CONTAINER_RUNTIME=$(kubectl get nodes -o jsonpath='{.items[0].status.nodeInfo.containerRuntimeVersion}' 2>/dev/null | cut -d':' -f1 || echo "unknown")
if [ "$CONTAINER_RUNTIME" != "unknown" ]; then
    print_success "Container runtime: $CONTAINER_RUNTIME"
else
    print_warning "Cannot determine container runtime"
fi
echo ""

# 12. Check internet connectivity
echo "12. Checking internet connectivity..."
if curl -s --connect-timeout 5 https://registry.hub.docker.com &> /dev/null; then
    print_success "Internet connectivity is available (can reach Docker Hub)"
else
    print_warning "Cannot reach Docker Hub - may need to configure image registry mirrors"
fi
echo ""

# Summary
echo "======================================"
echo "Pre-flight Check Summary"
echo "======================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Your cluster is ready for IDLR security infrastructure deployment."
    echo ""
    echo "Next steps:"
    echo "  1. Review the deployment configuration files"
    echo "  2. Run: ./deploy-security-services.sh"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ Checks completed with $WARNINGS warning(s)${NC}"
    echo ""
    echo "Your cluster meets minimum requirements but has some warnings."
    echo "Review the warnings above before proceeding with deployment."
    echo ""
    echo "To proceed anyway:"
    echo "  ./deploy-security-services.sh"
    exit 0
else
    echo -e "${RED}✗ Checks failed with $ERRORS error(s) and $WARNINGS warning(s)${NC}"
    echo ""
    echo "Please resolve the errors above before deploying."
    echo "Refer to the IDLR security infrastructure documentation for help."
    exit 1
fi
