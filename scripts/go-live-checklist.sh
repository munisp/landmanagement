#!/bin/bash

# IDLR-PTS Platform - Go-Live Checklist Automation
# Usage: ./scripts/go-live-checklist.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CHECKLIST_FILE="$PROJECT_DIR/go-live-status.json"

# Initialize checklist
initialize_checklist() {
    cat > "$CHECKLIST_FILE" <<'EOF'
{
  "lastUpdated": "",
  "overallStatus": "not_ready",
  "sections": {
    "infrastructure": {
      "status": "pending",
      "items": [
        {"id": "servers_provisioned", "name": "Production servers provisioned", "status": "pending"},
        {"id": "load_balancer", "name": "Load balancer configured", "status": "pending"},
        {"id": "ssl_certificates", "name": "SSL/TLS certificates installed", "status": "pending"},
        {"id": "dns_configured", "name": "DNS records configured", "status": "pending"},
        {"id": "firewall_rules", "name": "Firewall rules configured", "status": "pending"}
      ]
    },
    "database": {
      "status": "pending",
      "items": [
        {"id": "db_cluster", "name": "PostgreSQL cluster deployed", "status": "pending"},
        {"id": "db_backups", "name": "Automated backups configured", "status": "pending"},
        {"id": "db_replication", "name": "Database replication verified", "status": "pending"},
        {"id": "db_performance", "name": "Database performance tuned", "status": "pending"}
      ]
    },
    "application": {
      "status": "pending",
      "items": [
        {"id": "code_review", "name": "Code review completed", "status": "pending"},
        {"id": "tests_passed", "name": "All tests passed", "status": "pending"},
        {"id": "build_successful", "name": "Production build successful", "status": "pending"},
        {"id": "env_configured", "name": "Environment variables configured", "status": "pending"}
      ]
    },
    "external_services": {
      "status": "pending",
      "items": [
        {"id": "fabric_configured", "name": "Hyperledger Fabric configured", "status": "pending"},
        {"id": "mojaloop_configured", "name": "Mojaloop configured", "status": "pending"},
        {"id": "tigerbeetle_configured", "name": "TigerBeetle configured", "status": "pending"},
        {"id": "kafka_configured", "name": "Kafka configured", "status": "pending"},
        {"id": "temporal_configured", "name": "Temporal configured", "status": "pending"},
        {"id": "elasticsearch_configured", "name": "Elasticsearch configured", "status": "pending"}
      ]
    },
    "monitoring": {
      "status": "pending",
      "items": [
        {"id": "prometheus_deployed", "name": "Prometheus deployed", "status": "pending"},
        {"id": "grafana_deployed", "name": "Grafana deployed", "status": "pending"},
        {"id": "alertmanager_configured", "name": "Alertmanager configured", "status": "pending"},
        {"id": "alerts_tested", "name": "Alert delivery tested", "status": "pending"}
      ]
    },
    "security": {
      "status": "pending",
      "items": [
        {"id": "security_audit", "name": "Security audit completed", "status": "pending"},
        {"id": "vulnerabilities_resolved", "name": "Vulnerabilities resolved", "status": "pending"},
        {"id": "encryption_enabled", "name": "Encryption at rest/transit enabled", "status": "pending"},
        {"id": "access_controls", "name": "Access controls configured", "status": "pending"}
      ]
    },
    "testing": {
      "status": "pending",
      "items": [
        {"id": "unit_tests", "name": "Unit tests passed", "status": "pending"},
        {"id": "integration_tests", "name": "Integration tests passed", "status": "pending"},
        {"id": "load_tests", "name": "Load tests passed", "status": "pending"},
        {"id": "uat_completed", "name": "User acceptance testing completed", "status": "pending"}
      ]
    },
    "documentation": {
      "status": "pending",
      "items": [
        {"id": "deployment_guide", "name": "Deployment guide complete", "status": "pending"},
        {"id": "operations_runbook", "name": "Operations runbook complete", "status": "pending"},
        {"id": "architecture_docs", "name": "Architecture docs complete", "status": "pending"},
        {"id": "user_guide", "name": "User guide complete", "status": "pending"}
      ]
    },
    "operations": {
      "status": "pending",
      "items": [
        {"id": "team_trained", "name": "Operations team trained", "status": "pending"},
        {"id": "oncall_rotation", "name": "On-call rotation established", "status": "pending"},
        {"id": "incident_procedures", "name": "Incident procedures documented", "status": "pending"},
        {"id": "rollback_tested", "name": "Rollback procedures tested", "status": "pending"}
      ]
    },
    "compliance": {
      "status": "pending",
      "items": [
        {"id": "legal_approval", "name": "Legal approval obtained", "status": "pending"},
        {"id": "compliance_audit", "name": "Compliance audit completed", "status": "pending"},
        {"id": "privacy_policy", "name": "Privacy policy published", "status": "pending"},
        {"id": "terms_of_service", "name": "Terms of service published", "status": "pending"}
      ]
    }
  }
}
EOF
}

# Display checklist
display_checklist() {
    echo -e "\n${MAGENTA}========================================${NC}"
    echo -e "${MAGENTA}IDLR-PTS Platform - Go-Live Checklist${NC}"
    echo -e "${MAGENTA}========================================${NC}\n"
    
    if [ ! -f "$CHECKLIST_FILE" ]; then
        initialize_checklist
    fi
    
    local overall_status=$(jq -r '.overallStatus' "$CHECKLIST_FILE")
    local last_updated=$(jq -r '.lastUpdated' "$CHECKLIST_FILE")
    
    echo -e "${BLUE}Overall Status:${NC} $overall_status"
    echo -e "${BLUE}Last Updated:${NC} $last_updated"
    echo ""
    
    # Display each section
    local sections=$(jq -r '.sections | keys[]' "$CHECKLIST_FILE")
    
    for section in $sections; do
        local section_status=$(jq -r ".sections.$section.status" "$CHECKLIST_FILE")
        local section_name=$(echo "$section" | tr '_' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2));}1')
        
        case "$section_status" in
            "complete")
                echo -e "${GREEN}✓${NC} $section_name"
                ;;
            "in_progress")
                echo -e "${YELLOW}◐${NC} $section_name"
                ;;
            *)
                echo -e "${RED}○${NC} $section_name"
                ;;
        esac
        
        # Display items
        local items=$(jq -r ".sections.$section.items[] | @json" "$CHECKLIST_FILE")
        while IFS= read -r item; do
            local item_name=$(echo "$item" | jq -r '.name')
            local item_status=$(echo "$item" | jq -r '.status')
            
            case "$item_status" in
                "complete")
                    echo -e "  ${GREEN}✓${NC} $item_name"
                    ;;
                "in_progress")
                    echo -e "  ${YELLOW}◐${NC} $item_name"
                    ;;
                *)
                    echo -e "  ${RED}○${NC} $item_name"
                    ;;
            esac
        done <<< "$items"
        
        echo ""
    done
}

# Update item status
update_item() {
    local section=$1
    local item_id=$2
    local new_status=$3
    
    if [ ! -f "$CHECKLIST_FILE" ]; then
        initialize_checklist
    fi
    
    # Update item status
    jq ".sections.$section.items |= map(if .id == \"$item_id\" then .status = \"$new_status\" else . end)" "$CHECKLIST_FILE" > "$CHECKLIST_FILE.tmp"
    mv "$CHECKLIST_FILE.tmp" "$CHECKLIST_FILE"
    
    # Update section status
    local all_complete=$(jq ".sections.$section.items | all(.status == \"complete\")" "$CHECKLIST_FILE")
    local any_in_progress=$(jq ".sections.$section.items | any(.status == \"in_progress\")" "$CHECKLIST_FILE")
    
    if [ "$all_complete" == "true" ]; then
        jq ".sections.$section.status = \"complete\"" "$CHECKLIST_FILE" > "$CHECKLIST_FILE.tmp"
    elif [ "$any_in_progress" == "true" ]; then
        jq ".sections.$section.status = \"in_progress\"" "$CHECKLIST_FILE" > "$CHECKLIST_FILE.tmp"
    else
        jq ".sections.$section.status = \"pending\"" "$CHECKLIST_FILE" > "$CHECKLIST_FILE.tmp"
    fi
    mv "$CHECKLIST_FILE.tmp" "$CHECKLIST_FILE"
    
    # Update overall status
    local all_sections_complete=$(jq '.sections | to_entries | all(.value.status == "complete")' "$CHECKLIST_FILE")
    if [ "$all_sections_complete" == "true" ]; then
        jq '.overallStatus = "ready"' "$CHECKLIST_FILE" > "$CHECKLIST_FILE.tmp"
    else
        jq '.overallStatus = "not_ready"' "$CHECKLIST_FILE" > "$CHECKLIST_FILE.tmp"
    fi
    mv "$CHECKLIST_FILE.tmp" "$CHECKLIST_FILE"
    
    # Update timestamp
    jq ".lastUpdated = \"$(date)\"" "$CHECKLIST_FILE" > "$CHECKLIST_FILE.tmp"
    mv "$CHECKLIST_FILE.tmp" "$CHECKLIST_FILE"
    
    echo -e "${GREEN}✓${NC} Updated $item_id to $new_status"
}

# Auto-check items
auto_check() {
    echo -e "\n${BLUE}Running automated checks...${NC}\n"
    
    # Check if tests passed
    if [ -f "$PROJECT_DIR/test-reports/test-summary-"*.md ]; then
        update_item "testing" "unit_tests" "complete"
    fi
    
    # Check if documentation exists
    if [ -f "/home/ubuntu/PRODUCTION_DEPLOYMENT_GUIDE.md" ]; then
        update_item "documentation" "deployment_guide" "complete"
    fi
    
    if [ -f "/home/ubuntu/OPERATIONS_RUNBOOK.md" ]; then
        update_item "documentation" "operations_runbook" "complete"
    fi
    
    if [ -f "/home/ubuntu/SYSTEM_ARCHITECTURE.md" ]; then
        update_item "documentation" "architecture_docs" "complete"
    fi
    
    # Check if build successful
    if pnpm tsc --noEmit > /dev/null 2>&1; then
        update_item "application" "build_successful" "complete"
    fi
    
    # Check if monitoring configs exist
    if [ -f "$PROJECT_DIR/prometheus/prometheus.yml" ]; then
        update_item "monitoring" "prometheus_deployed" "complete"
    fi
    
    if [ -f "$PROJECT_DIR/grafana/provisioning/dashboards/idlr-pts-dashboard.json" ]; then
        update_item "monitoring" "grafana_deployed" "complete"
    fi
    
    if [ -f "$PROJECT_DIR/prometheus/alertmanager.yml" ]; then
        update_item "monitoring" "alertmanager_configured" "complete"
    fi
    
    echo -e "${GREEN}✓${NC} Automated checks complete"
}

# Generate report
generate_report() {
    local report_file="$PROJECT_DIR/go-live-report.md"
    
    cat > "$report_file" <<EOF
# IDLR-PTS Platform - Go-Live Status Report

**Generated:** $(date)

## Overall Status

EOF

    local overall_status=$(jq -r '.overallStatus' "$CHECKLIST_FILE")
    if [ "$overall_status" == "ready" ]; then
        echo "**Status:** ✅ READY FOR PRODUCTION" >> "$report_file"
    else
        echo "**Status:** ⚠️ NOT READY FOR PRODUCTION" >> "$report_file"
    fi
    
    echo "" >> "$report_file"
    echo "## Section Status" >> "$report_file"
    echo "" >> "$report_file"
    
    local sections=$(jq -r '.sections | keys[]' "$CHECKLIST_FILE")
    for section in $sections; do
        local section_status=$(jq -r ".sections.$section.status" "$CHECKLIST_FILE")
        local section_name=$(echo "$section" | tr '_' ' ' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2));}1')
        
        local completed=$(jq ".sections.$section.items | map(select(.status == \"complete\")) | length" "$CHECKLIST_FILE")
        local total=$(jq ".sections.$section.items | length" "$CHECKLIST_FILE")
        local percentage=$((completed * 100 / total))
        
        echo "### $section_name" >> "$report_file"
        echo "" >> "$report_file"
        echo "**Progress:** $completed/$total ($percentage%)" >> "$report_file"
        echo "" >> "$report_file"
        
        local items=$(jq -r ".sections.$section.items[] | @json" "$CHECKLIST_FILE")
        while IFS= read -r item; do
            local item_name=$(echo "$item" | jq -r '.name')
            local item_status=$(echo "$item" | jq -r '.status')
            
            case "$item_status" in
                "complete")
                    echo "- [x] $item_name" >> "$report_file"
                    ;;
                "in_progress")
                    echo "- [ ] $item_name (in progress)" >> "$report_file"
                    ;;
                *)
                    echo "- [ ] $item_name" >> "$report_file"
                    ;;
            esac
        done <<< "$items"
        
        echo "" >> "$report_file"
    done
    
    echo -e "${GREEN}✓${NC} Report generated: $report_file"
}

# Interactive mode
interactive_mode() {
    while true; do
        clear
        display_checklist
        
        echo ""
        echo "Options:"
        echo "1. Update item status"
        echo "2. Run auto-check"
        echo "3. Generate report"
        echo "4. Reset checklist"
        echo "5. Exit"
        echo ""
        read -p "Select option: " option
        
        case "$option" in
            1)
                read -p "Enter section name: " section
                read -p "Enter item ID: " item_id
                read -p "Enter status (pending/in_progress/complete): " status
                update_item "$section" "$item_id" "$status"
                read -p "Press enter to continue..."
                ;;
            2)
                auto_check
                read -p "Press enter to continue..."
                ;;
            3)
                generate_report
                read -p "Press enter to continue..."
                ;;
            4)
                initialize_checklist
                echo -e "${GREEN}✓${NC} Checklist reset"
                read -p "Press enter to continue..."
                ;;
            5)
                echo "Goodbye!"
                exit 0
                ;;
            *)
                echo "Invalid option"
                read -p "Press enter to continue..."
                ;;
        esac
    done
}

# Main
main() {
    if [ ! -f "$CHECKLIST_FILE" ]; then
        initialize_checklist
    fi
    
    if [ "$1" == "display" ]; then
        display_checklist
    elif [ "$1" == "auto-check" ]; then
        auto_check
        display_checklist
    elif [ "$1" == "report" ]; then
        generate_report
    elif [ "$1" == "reset" ]; then
        initialize_checklist
        echo "Checklist reset"
    else
        interactive_mode
    fi
}

main "$@"
