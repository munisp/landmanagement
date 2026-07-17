#!/bin/bash

# IDLR Security Infrastructure - Health Check Script
# This script monitors the health of all security services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="security"
CHECK_INTERVAL=60  # seconds
CONTINUOUS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --continuous)
            CONTINUOUS=true
            shift
            ;;
        --interval)
            CHECK_INTERVAL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--continuous] [--interval SECONDS]"
            exit 1
            ;;
    esac
done

# Function to print section header
print_header() {
    echo ""
    echo -e "${CYAN}======================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}======================================${NC}"
}

# Function to check pod health
check_pod_health() {
    local app_label=$1
    local service_name=$2
    
    echo -e "\n${BLUE}Checking $service_name...${NC}"
    
    # Get pods
    local pods=$(kubectl get pods -n $NAMESPACE -l app=$app_label --no-headers 2>/dev/null)
    
    if [ -z "$pods" ]; then
        echo -e "${RED}✗ No pods found${NC}"
        return 1
    fi
    
    # Count pods by status
    local total=$(echo "$pods" | wc -l)
    local running=$(echo "$pods" | grep -c "Running" || echo "0")
    local pending=$(echo "$pods" | grep -c "Pending" || echo "0")
    local failed=$(echo "$pods" | grep -c "Error\|CrashLoopBackOff\|ImagePullBackOff" || echo "0")
    
    echo "  Pods: $running/$total running"
    
    if [ "$running" -eq "$total" ]; then
        echo -e "  ${GREEN}✓ All pods are running${NC}"
    elif [ "$running" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠ Some pods are not running${NC}"
        if [ "$pending" -gt 0 ]; then
            echo "    $pending pending"
        fi
        if [ "$failed" -gt 0 ]; then
            echo "    $failed failed"
        fi
    else
        echo -e "  ${RED}✗ No pods are running${NC}"
        return 1
    fi
    
    # Check pod restarts
    local restarts=$(kubectl get pods -n $NAMESPACE -l app=$app_label -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}' 2>/dev/null | tr ' ' '\n' | awk '{sum+=$1} END {print sum}')
    if [ -n "$restarts" ] && [ "$restarts" -gt 0 ]; then
        echo -e "  ${YELLOW}⚠ Total restarts: $restarts${NC}"
    fi
    
    # Check resource usage
    local cpu=$(kubectl top pods -n $NAMESPACE -l app=$app_label --no-headers 2>/dev/null | awk '{sum+=$2} END {print sum}' || echo "N/A")
    local memory=$(kubectl top pods -n $NAMESPACE -l app=$app_label --no-headers 2>/dev/null | awk '{sum+=$3} END {print sum}' || echo "N/A")
    
    if [ "$cpu" != "N/A" ]; then
        echo "  Resource usage: CPU=$cpu, Memory=$memory"
    fi
    
    return 0
}

# Function to check service health
check_service_health() {
    local service_name=$1
    
    # Check if service exists
    if ! kubectl get service $service_name -n $NAMESPACE &>/dev/null; then
        echo -e "  ${RED}✗ Service not found${NC}"
        return 1
    fi
    
    # Get service details
    local cluster_ip=$(kubectl get service $service_name -n $NAMESPACE -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
    local ports=$(kubectl get service $service_name -n $NAMESPACE -o jsonpath='{.spec.ports[*].port}' 2>/dev/null)
    
    echo "  Service IP: $cluster_ip"
    echo "  Ports: $ports"
    echo -e "  ${GREEN}✓ Service is configured${NC}"
    
    return 0
}

# Function to check ingress health
check_ingress_health() {
    local ingress_name=$1
    local service_name=$2
    
    # Check if ingress exists
    if ! kubectl get ingress $ingress_name -n $NAMESPACE &>/dev/null; then
        echo -e "  ${YELLOW}⚠ Ingress not configured${NC}"
        return 0
    fi
    
    # Get ingress details
    local host=$(kubectl get ingress $ingress_name -n $NAMESPACE -o jsonpath='{.spec.rules[0].host}' 2>/dev/null)
    local backend=$(kubectl get ingress $ingress_name -n $NAMESPACE -o jsonpath='{.spec.rules[0].http.paths[0].backend.service.name}' 2>/dev/null)
    
    echo "  Ingress host: $host"
    echo "  Backend: $backend"
    echo -e "  ${GREEN}✓ Ingress is configured${NC}"
    
    return 0
}

# Function to check API endpoint
check_api_endpoint() {
    local service_name=$1
    local port=$2
    local path=$3
    
    # Get service cluster IP
    local cluster_ip=$(kubectl get service $service_name -n $NAMESPACE -o jsonpath='{.spec.clusterIP}' 2>/dev/null)
    
    if [ -z "$cluster_ip" ]; then
        echo -e "  ${YELLOW}⚠ Cannot check API endpoint (service not found)${NC}"
        return 0
    fi
    
    # Try to reach the endpoint from within the cluster
    local response=$(kubectl run test-curl --image=curlimages/curl:latest --rm -i --restart=Never -n $NAMESPACE -- \
        curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$cluster_ip:$port$path" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ] || [ "$response" = "401" ] || [ "$response" = "403" ]; then
        echo -e "  ${GREEN}✓ API endpoint is reachable (HTTP $response)${NC}"
    else
        echo -e "  ${YELLOW}⚠ API endpoint returned HTTP $response${NC}"
    fi
    
    return 0
}

# Main health check function
run_health_check() {
    clear
    print_header "IDLR Security Infrastructure Health Check"
    echo "Timestamp: $(date)"
    echo "Namespace: $NAMESPACE"
    
    # Overall cluster health
    print_header "Cluster Health"
    
    # Check if namespace exists
    if kubectl get namespace $NAMESPACE &>/dev/null; then
        echo -e "${GREEN}✓ Security namespace exists${NC}"
    else
        echo -e "${RED}✗ Security namespace not found${NC}"
        echo "Run ./deploy-security-services.sh to deploy the infrastructure"
        return 1
    fi
    
    # Check node health
    local node_count=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
    local ready_nodes=$(kubectl get nodes --no-headers 2>/dev/null | grep -c " Ready" || echo "0")
    echo "Cluster nodes: $ready_nodes/$node_count ready"
    
    # OpenCTI Health
    print_header "OpenCTI Threat Intelligence"
    check_pod_health "opencti" "OpenCTI"
    check_service_health "opencti"
    check_ingress_health "opencti-ingress" "OpenCTI"
    
    # Check OpenCTI dependencies
    echo -e "\n${BLUE}Checking OpenCTI dependencies...${NC}"
    check_pod_health "opencti-elasticsearch" "Elasticsearch"
    check_pod_health "opencti-redis" "Redis"
    check_pod_health "opencti-rabbitmq" "RabbitMQ"
    check_pod_health "opencti-minio" "MinIO"
    
    # Wazuh Health
    print_header "Wazuh SIEM"
    check_pod_health "wazuh-manager" "Wazuh Manager"
    check_service_health "wazuh-manager"
    check_ingress_health "wazuh-ingress" "Wazuh"
    
    # Check Wazuh dependencies
    echo -e "\n${BLUE}Checking Wazuh dependencies...${NC}"
    check_pod_health "wazuh-indexer" "Wazuh Indexer"
    check_pod_health "wazuh-dashboard" "Wazuh Dashboard"
    
    # Check Wazuh agents
    echo -e "\n${BLUE}Checking Wazuh agents...${NC}"
    local agent_count=$(kubectl exec -n $NAMESPACE deployment/wazuh-manager -- /var/ossec/bin/agent_control -l 2>/dev/null | grep -c "ID:" || echo "0")
    local active_agents=$(kubectl exec -n $NAMESPACE deployment/wazuh-manager -- /var/ossec/bin/agent_control -l 2>/dev/null | grep -c "Active" || echo "0")
    echo "  Registered agents: $agent_count"
    echo "  Active agents: $active_agents"
    
    # OPA Health
    print_header "Open Policy Agent"
    check_pod_health "opa" "OPA"
    check_service_health "opa"
    
    # Kubecost Health
    print_header "Kubecost"
    check_pod_health "kubecost" "Kubecost"
    check_service_health "kubecost"
    check_ingress_health "kubecost-ingress" "Kubecost"
    
    # Storage Health
    print_header "Storage"
    
    # Check PVCs
    local pvcs=$(kubectl get pvc -n $NAMESPACE --no-headers 2>/dev/null)
    if [ -n "$pvcs" ]; then
        local total_pvcs=$(echo "$pvcs" | wc -l)
        local bound_pvcs=$(echo "$pvcs" | grep -c "Bound" || echo "0")
        echo "Persistent Volume Claims: $bound_pvcs/$total_pvcs bound"
        
        if [ "$bound_pvcs" -eq "$total_pvcs" ]; then
            echo -e "${GREEN}✓ All PVCs are bound${NC}"
        else
            echo -e "${YELLOW}⚠ Some PVCs are not bound${NC}"
            echo "$pvcs" | grep -v "Bound" | awk '{print "  - " $1 " (" $2 ")"}'
        fi
    else
        echo -e "${YELLOW}⚠ No PVCs found (using emptyDir or hostPath)${NC}"
    fi
    
    # Resource Summary
    print_header "Resource Usage Summary"
    
    # Get total resource usage
    if command -v kubectl top &>/dev/null && kubectl top nodes &>/dev/null 2>&1; then
        echo "Namespace resource usage:"
        kubectl top pods -n $NAMESPACE --no-headers 2>/dev/null | awk '{cpu+=$2; mem+=$3} END {print "  Total CPU: " cpu ", Total Memory: " mem}'
        
        echo ""
        echo "Top 5 pods by CPU:"
        kubectl top pods -n $NAMESPACE --no-headers 2>/dev/null | sort -k2 -rn | head -5 | awk '{print "  " $1 ": " $2}'
        
        echo ""
        echo "Top 5 pods by Memory:"
        kubectl top pods -n $NAMESPACE --no-headers 2>/dev/null | sort -k3 -rn | head -5 | awk '{print "  " $1 ": " $3}'
    else
        echo -e "${YELLOW}⚠ Metrics server not available${NC}"
    fi
    
    # Summary
    print_header "Health Check Summary"
    
    local total_deployments=$(kubectl get deployments -n $NAMESPACE --no-headers 2>/dev/null | wc -l)
    local ready_deployments=$(kubectl get deployments -n $NAMESPACE --no-headers 2>/dev/null | awk '$2==$3 {print}' | wc -l)
    
    echo "Deployments: $ready_deployments/$total_deployments ready"
    
    if [ "$ready_deployments" -eq "$total_deployments" ] && [ "$total_deployments" -gt 0 ]; then
        echo -e "\n${GREEN}✓ All security services are healthy${NC}"
    elif [ "$ready_deployments" -gt 0 ]; then
        echo -e "\n${YELLOW}⚠ Some security services need attention${NC}"
    else
        echo -e "\n${RED}✗ Security services are not healthy${NC}"
    fi
    
    echo ""
    echo "For detailed logs, run:"
    echo "  kubectl logs -n $NAMESPACE -l app=<service-name> --tail=100"
    echo ""
    echo "To restart a service:"
    echo "  kubectl rollout restart deployment/<deployment-name> -n $NAMESPACE"
    echo ""
}

# Main execution
if [ "$CONTINUOUS" = true ]; then
    echo "Running continuous health checks (interval: ${CHECK_INTERVAL}s)"
    echo "Press Ctrl+C to stop"
    echo ""
    
    while true; do
        run_health_check
        sleep $CHECK_INTERVAL
    done
else
    run_health_check
fi
