#!/bin/bash

# IDLR Security Infrastructure - Resource Sizing Calculator
# This script helps calculate required cluster resources based on deployment scale

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================${NC}"
echo -e "${CYAN}IDLR Security Infrastructure${NC}"
echo -e "${CYAN}Resource Sizing Calculator${NC}"
echo -e "${CYAN}======================================${NC}"
echo ""

# Function to calculate resources
calculate_resources() {
    local deployment_size=$1
    local ha_enabled=$2
    local monitoring_level=$3
    
    # Base resources (minimum deployment)
    local base_cpu=15
    local base_memory=35
    local base_storage=200
    
    # Scaling factors
    local cpu_multiplier=1.0
    local memory_multiplier=1.0
    local storage_multiplier=1.0
    
    # Adjust based on deployment size
    case $deployment_size in
        "small")
            cpu_multiplier=1.0
            memory_multiplier=1.0
            storage_multiplier=1.0
            ;;
        "medium")
            cpu_multiplier=1.5
            memory_multiplier=1.5
            storage_multiplier=1.5
            ;;
        "large")
            cpu_multiplier=2.5
            memory_multiplier=2.5
            storage_multiplier=2.0
            ;;
        "xlarge")
            cpu_multiplier=4.0
            memory_multiplier=4.0
            storage_multiplier=3.0
            ;;
    esac
    
    # Adjust for HA
    if [ "$ha_enabled" = "yes" ]; then
        cpu_multiplier=$(echo "$cpu_multiplier * 1.8" | bc)
        memory_multiplier=$(echo "$memory_multiplier * 1.8" | bc)
        storage_multiplier=$(echo "$storage_multiplier * 1.5" | bc)
    fi
    
    # Adjust for monitoring level
    case $monitoring_level in
        "basic")
            cpu_multiplier=$(echo "$cpu_multiplier * 1.0" | bc)
            memory_multiplier=$(echo "$memory_multiplier * 1.0" | bc)
            ;;
        "standard")
            cpu_multiplier=$(echo "$cpu_multiplier * 1.2" | bc)
            memory_multiplier=$(echo "$memory_multiplier * 1.2" | bc)
            ;;
        "advanced")
            cpu_multiplier=$(echo "$cpu_multiplier * 1.5" | bc)
            memory_multiplier=$(echo "$memory_multiplier * 1.5" | bc)
            ;;
    esac
    
    # Calculate final resources
    local total_cpu=$(echo "$base_cpu * $cpu_multiplier" | bc | awk '{print int($1+0.5)}')
    local total_memory=$(echo "$base_memory * $memory_multiplier" | bc | awk '{print int($1+0.5)}')
    local total_storage=$(echo "$base_storage * $storage_multiplier" | bc | awk '{print int($1+0.5)}')
    
    # Add 30% buffer for production
    local buffer_cpu=$(echo "$total_cpu * 1.3" | bc | awk '{print int($1+0.5)}')
    local buffer_memory=$(echo "$total_memory * 1.3" | bc | awk '{print int($1+0.5)}')
    local buffer_storage=$(echo "$total_storage * 1.2" | bc | awk '{print int($1+0.5)}')
    
    echo "$total_cpu $total_memory $total_storage $buffer_cpu $buffer_memory $buffer_storage"
}

# Function to recommend node configuration
recommend_nodes() {
    local total_cpu=$1
    local total_memory=$2
    
    # Common node types (AWS, Azure, GCP equivalent)
    declare -A node_types
    node_types["small"]="4 cores, 16 GB RAM (t3.xlarge / Standard_D4s_v3 / n1-standard-4)"
    node_types["medium"]="8 cores, 32 GB RAM (t3.2xlarge / Standard_D8s_v3 / n1-standard-8)"
    node_types["large"]="16 cores, 64 GB RAM (m5.4xlarge / Standard_D16s_v3 / n1-standard-16)"
    node_types["xlarge"]="32 cores, 128 GB RAM (m5.8xlarge / Standard_D32s_v3 / n1-standard-32)"
    
    echo ""
    echo -e "${BLUE}Recommended Node Configurations:${NC}"
    echo ""
    
    # Calculate number of nodes needed for each type
    for type in small medium large xlarge; do
        case $type in
            "small")
                node_cpu=4
                node_memory=16
                ;;
            "medium")
                node_cpu=8
                node_memory=32
                ;;
            "large")
                node_cpu=16
                node_memory=64
                ;;
            "xlarge")
                node_cpu=32
                node_memory=128
                ;;
        esac
        
        # Calculate nodes needed (accounting for system overhead: 10% CPU, 20% memory)
        local usable_cpu=$(echo "$node_cpu * 0.9" | bc | awk '{print int($1)}')
        local usable_memory=$(echo "$node_memory * 0.8" | bc | awk '{print int($1)}')
        
        local nodes_for_cpu=$(echo "scale=0; ($total_cpu + $usable_cpu - 1) / $usable_cpu" | bc)
        local nodes_for_memory=$(echo "scale=0; ($total_memory + $usable_memory - 1) / $usable_memory" | bc)
        
        # Take the maximum
        local nodes_needed=$nodes_for_cpu
        if [ $nodes_for_memory -gt $nodes_for_cpu ]; then
            nodes_needed=$nodes_for_memory
        fi
        
        # Add 1 for HA
        nodes_needed=$((nodes_needed + 1))
        
        echo -e "${CYAN}Option $type:${NC} ${node_types[$type]}"
        echo "  Nodes needed: $nodes_needed"
        echo "  Total capacity: $((node_cpu * nodes_needed)) cores, $((node_memory * nodes_needed)) GB RAM"
        echo "  Usable capacity: $((usable_cpu * nodes_needed)) cores, $((usable_memory * nodes_needed)) GB RAM"
        echo ""
    done
}

# Main interactive flow
echo "This calculator helps you determine the required cluster resources"
echo "for deploying the IDLR security infrastructure."
echo ""

# Question 1: Deployment size
echo -e "${YELLOW}1. What is your expected deployment size?${NC}"
echo ""
echo "  ${CYAN}small${NC}    - Up to 50 Wazuh agents, low threat intelligence volume"
echo "  ${CYAN}medium${NC}   - Up to 200 Wazuh agents, moderate threat intelligence volume"
echo "  ${CYAN}large${NC}    - Up to 500 Wazuh agents, high threat intelligence volume"
echo "  ${CYAN}xlarge${NC}   - 500+ Wazuh agents, very high threat intelligence volume"
echo ""
read -p "Enter deployment size [small/medium/large/xlarge] (default: medium): " deployment_size
deployment_size=${deployment_size:-medium}

# Validate input
if [[ ! "$deployment_size" =~ ^(small|medium|large|xlarge)$ ]]; then
    echo -e "${RED}Invalid input. Using default: medium${NC}"
    deployment_size="medium"
fi

echo ""

# Question 2: High Availability
echo -e "${YELLOW}2. Do you require High Availability (HA)?${NC}"
echo ""
echo "  ${CYAN}yes${NC} - Multiple replicas, automatic failover (recommended for production)"
echo "  ${CYAN}no${NC}  - Single instance, manual recovery"
echo ""
read -p "Enable HA? [yes/no] (default: yes): " ha_enabled
ha_enabled=${ha_enabled:-yes}

# Validate input
if [[ ! "$ha_enabled" =~ ^(yes|no)$ ]]; then
    echo -e "${RED}Invalid input. Using default: yes${NC}"
    ha_enabled="yes"
fi

echo ""

# Question 3: Monitoring level
echo -e "${YELLOW}3. What level of monitoring do you need?${NC}"
echo ""
echo "  ${CYAN}basic${NC}    - Essential metrics only"
echo "  ${CYAN}standard${NC} - Standard metrics + logs (recommended)"
echo "  ${CYAN}advanced${NC} - Full observability (metrics, logs, traces, profiling)"
echo ""
read -p "Enter monitoring level [basic/standard/advanced] (default: standard): " monitoring_level
monitoring_level=${monitoring_level:-standard}

# Validate input
if [[ ! "$monitoring_level" =~ ^(basic|standard|advanced)$ ]]; then
    echo -e "${RED}Invalid input. Using default: standard${NC}"
    monitoring_level="standard"
fi

echo ""
echo -e "${CYAN}======================================${NC}"
echo -e "${CYAN}Calculating Resources...${NC}"
echo -e "${CYAN}======================================${NC}"
echo ""

# Calculate resources
read total_cpu total_memory total_storage buffer_cpu buffer_memory buffer_storage <<< $(calculate_resources "$deployment_size" "$ha_enabled" "$monitoring_level")

# Display configuration
echo -e "${MAGENTA}Configuration Summary:${NC}"
echo "  Deployment Size: $deployment_size"
echo "  High Availability: $ha_enabled"
echo "  Monitoring Level: $monitoring_level"
echo ""

# Display resource requirements
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Resource Requirements${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

echo -e "${GREEN}Minimum Requirements (without buffer):${NC}"
echo "  CPU: $total_cpu cores"
echo "  Memory: $total_memory GB"
echo "  Storage: $total_storage GB"
echo ""

echo -e "${GREEN}Recommended (with 30% buffer for production):${NC}"
echo "  CPU: $buffer_cpu cores"
echo "  Memory: $buffer_memory GB"
echo "  Storage: $buffer_storage GB"
echo ""

# Breakdown by service
echo -e "${BLUE}Resource Breakdown by Service:${NC}"
echo ""

# Calculate per-service resources based on deployment size
case $deployment_size in
    "small")
        echo "OpenCTI Platform:"
        echo "  CPU: 2 cores (request) / 4 cores (limit)"
        echo "  Memory: 4 GB (request) / 8 GB (limit)"
        echo "  Storage: 20 GB"
        echo ""
        echo "Elasticsearch (OpenCTI):"
        echo "  CPU: 2 cores (request) / 4 cores (limit)"
        echo "  Memory: 8 GB (request) / 16 GB (limit)"
        echo "  Storage: 50 GB"
        echo ""
        echo "Wazuh Manager:"
        echo "  CPU: 2 cores (request) / 4 cores (limit)"
        echo "  Memory: 4 GB (request) / 8 GB (limit)"
        echo "  Storage: 20 GB"
        echo ""
        echo "Wazuh Indexer:"
        echo "  CPU: 2 cores (request) / 4 cores (limit)"
        echo "  Memory: 8 GB (request) / 16 GB (limit)"
        echo "  Storage: 50 GB"
        ;;
    "medium")
        echo "OpenCTI Platform:"
        echo "  CPU: 3 cores (request) / 6 cores (limit)"
        echo "  Memory: 6 GB (request) / 12 GB (limit)"
        echo "  Storage: 30 GB"
        echo ""
        echo "Elasticsearch (OpenCTI):"
        echo "  CPU: 3 cores (request) / 6 cores (limit)"
        echo "  Memory: 12 GB (request) / 24 GB (limit)"
        echo "  Storage: 75 GB"
        echo ""
        echo "Wazuh Manager:"
        echo "  CPU: 3 cores (request) / 6 cores (limit)"
        echo "  Memory: 6 GB (request) / 12 GB (limit)"
        echo "  Storage: 30 GB"
        echo ""
        echo "Wazuh Indexer:"
        echo "  CPU: 3 cores (request) / 6 cores (limit)"
        echo "  Memory: 12 GB (request) / 24 GB (limit)"
        echo "  Storage: 75 GB"
        ;;
    "large")
        echo "OpenCTI Platform:"
        echo "  CPU: 5 cores (request) / 10 cores (limit)"
        echo "  Memory: 10 GB (request) / 20 GB (limit)"
        echo "  Storage: 50 GB"
        echo ""
        echo "Elasticsearch (OpenCTI):"
        echo "  CPU: 5 cores (request) / 10 cores (limit)"
        echo "  Memory: 20 GB (request) / 40 GB (limit)"
        echo "  Storage: 100 GB"
        echo ""
        echo "Wazuh Manager:"
        echo "  CPU: 5 cores (request) / 10 cores (limit)"
        echo "  Memory: 10 GB (request) / 20 GB (limit)"
        echo "  Storage: 50 GB"
        echo ""
        echo "Wazuh Indexer:"
        echo "  CPU: 5 cores (request) / 10 cores (limit)"
        echo "  Memory: 20 GB (request) / 40 GB (limit)"
        echo "  Storage: 100 GB"
        ;;
    "xlarge")
        echo "OpenCTI Platform:"
        echo "  CPU: 8 cores (request) / 16 cores (limit)"
        echo "  Memory: 16 GB (request) / 32 GB (limit)"
        echo "  Storage: 80 GB"
        echo ""
        echo "Elasticsearch (OpenCTI):"
        echo "  CPU: 8 cores (request) / 16 cores (limit)"
        echo "  Memory: 32 GB (request) / 64 GB (limit)"
        echo "  Storage: 150 GB"
        echo ""
        echo "Wazuh Manager:"
        echo "  CPU: 8 cores (request) / 16 cores (limit)"
        echo "  Memory: 16 GB (request) / 32 GB (limit)"
        echo "  Storage: 80 GB"
        echo ""
        echo "Wazuh Indexer:"
        echo "  CPU: 8 cores (request) / 16 cores (limit)"
        echo "  Memory: 32 GB (request) / 64 GB (limit)"
        echo "  Storage: 150 GB"
        ;;
esac

echo ""
echo "Other Services (OPA, Kubecost, Redis, RabbitMQ, MinIO, Wazuh Dashboard):"
echo "  Combined CPU: 5-8 cores"
echo "  Combined Memory: 10-15 GB"
echo "  Combined Storage: 50-70 GB"
echo ""

# Node recommendations
recommend_nodes $buffer_cpu $buffer_memory

# Cost estimation
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Estimated Monthly Cost (AWS)${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Simple cost calculation (AWS pricing as example)
# t3.xlarge: ~$0.166/hour = ~$120/month
# t3.2xlarge: ~$0.332/hour = ~$240/month
# m5.4xlarge: ~$0.768/hour = ~$555/month
# m5.8xlarge: ~$1.536/hour = ~$1110/month

case $deployment_size in
    "small")
        if [ "$ha_enabled" = "yes" ]; then
            echo "Estimated cost: $600 - $800/month"
            echo "  (3-4 x t3.xlarge nodes + storage + data transfer)"
        else
            echo "Estimated cost: $400 - $600/month"
            echo "  (2-3 x t3.xlarge nodes + storage + data transfer)"
        fi
        ;;
    "medium")
        if [ "$ha_enabled" = "yes" ]; then
            echo "Estimated cost: $1,200 - $1,600/month"
            echo "  (3-4 x t3.2xlarge nodes + storage + data transfer)"
        else
            echo "Estimated cost: $800 - $1,200/month"
            echo "  (2-3 x t3.2xlarge nodes + storage + data transfer)"
        fi
        ;;
    "large")
        if [ "$ha_enabled" = "yes" ]; then
            echo "Estimated cost: $2,500 - $3,500/month"
            echo "  (3-4 x m5.4xlarge nodes + storage + data transfer)"
        else
            echo "Estimated cost: $1,800 - $2,500/month"
            echo "  (2-3 x m5.4xlarge nodes + storage + data transfer)"
        fi
        ;;
    "xlarge")
        if [ "$ha_enabled" = "yes" ]; then
            echo "Estimated cost: $5,000 - $7,000/month"
            echo "  (3-4 x m5.8xlarge nodes + storage + data transfer)"
        else
            echo "Estimated cost: $3,500 - $5,000/month"
            echo "  (2-3 x m5.8xlarge nodes + storage + data transfer)"
        fi
        ;;
esac

echo ""
echo -e "${YELLOW}Note: Costs vary by cloud provider and region. This is an estimate for AWS us-east-1.${NC}"
echo ""

# Save results
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}Save Results${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

read -p "Save these results to a file? [yes/no] (default: yes): " save_results
save_results=${save_results:-yes}

if [ "$save_results" = "yes" ]; then
    output_file="resource-requirements-$(date +%Y%m%d-%H%M%S).txt"
    
    cat > "$output_file" << EOF
IDLR Security Infrastructure - Resource Requirements
Generated: $(date)

Configuration:
  Deployment Size: $deployment_size
  High Availability: $ha_enabled
  Monitoring Level: $monitoring_level

Minimum Requirements:
  CPU: $total_cpu cores
  Memory: $total_memory GB
  Storage: $total_storage GB

Recommended (with buffer):
  CPU: $buffer_cpu cores
  Memory: $buffer_memory GB
  Storage: $buffer_storage GB

Next Steps:
1. Review cluster capacity with: kubectl top nodes
2. Ensure sufficient resources are available
3. Run pre-flight check: ./preflight-check.sh
4. Deploy with: ./deploy-security-services.sh

For detailed breakdown and node recommendations, see the calculator output.
EOF
    
    echo -e "${GREEN}✓ Results saved to: $output_file${NC}"
    echo ""
fi

# Summary
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Summary${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Your cluster should have at least:"
echo "  • $buffer_cpu CPU cores"
echo "  • $buffer_memory GB RAM"
echo "  • $buffer_storage GB storage"
echo ""
echo "Next steps:"
echo "  1. Verify your cluster meets these requirements"
echo "  2. Run ./preflight-check.sh to validate"
echo "  3. Proceed with deployment using ./deploy-security-services.sh"
echo ""
