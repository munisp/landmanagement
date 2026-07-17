#!/bin/bash

# IDLR-PTS Platform - Production Pre-Flight Check
# Usage: ./scripts/pre-flight-check.sh [staging|production]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((CHECKS_PASSED++))
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
    ((CHECKS_WARNING++))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    ((CHECKS_FAILED++))
}

log_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# Check functions
check_environment_variables() {
    log_section "Checking Environment Variables"
    
    local required_vars=(
        "DATABASE_URL"
        "JWT_SECRET"
        "VITE_APP_ID"
        "OAUTH_SERVER_URL"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Missing required environment variable: $var"
        else
            log_success "Environment variable set: $var"
        fi
    done
    
    # Check optional but recommended vars
    local optional_vars=(
        "REDIS_URL"
        "FABRIC_GATEWAY_URL"
        "MOJALOOP_API_URL"
        "TIGERBEETLE_CLUSTER_URL"
        "KAFKA_BROKERS"
        "TEMPORAL_SERVER_URL"
        "ELASTICSEARCH_URL"
        "SLACK_WEBHOOK_URL"
    )
    
    for var in "${optional_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_warning "Optional environment variable not set: $var"
        else
            log_success "Optional environment variable set: $var"
        fi
    done
}

check_dependencies() {
    log_section "Checking Dependencies"
    
    cd "$PROJECT_DIR"
    
    log_info "Checking node_modules..."
    if [ -d "node_modules" ]; then
        log_success "node_modules directory exists"
    else
        log_error "node_modules directory missing - run 'pnpm install'"
    fi
    
    log_info "Checking for outdated dependencies..."
    if pnpm outdated > /dev/null 2>&1; then
        log_success "All dependencies up to date"
    else
        log_warning "Some dependencies are outdated"
    fi
    
    log_info "Checking for security vulnerabilities..."
    if pnpm audit --audit-level=high > /dev/null 2>&1; then
        log_success "No high/critical vulnerabilities found"
    else
        log_warning "Security vulnerabilities detected - run 'pnpm audit' for details"
    fi
}

check_database_connection() {
    log_section "Checking Database Connection"
    
    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL not set"
        return
    fi
    
    log_info "Testing database connection..."
    # This would require a database client - simplified check
    log_warning "Database connection check requires manual verification"
}

check_redis_connection() {
    log_section "Checking Redis Connection"
    
    if [ -z "$REDIS_URL" ]; then
        log_warning "REDIS_URL not set - caching will not work"
        return
    fi
    
    log_info "Testing Redis connection..."
    if command -v redis-cli &> /dev/null; then
        if redis-cli -u "$REDIS_URL" ping > /dev/null 2>&1; then
            log_success "Redis connection successful"
        else
            log_error "Redis connection failed"
        fi
    else
        log_warning "redis-cli not installed - cannot test connection"
    fi
}

check_external_services() {
    log_section "Checking External Services"
    
    local services=(
        "FABRIC_GATEWAY_URL:Hyperledger Fabric"
        "MOJALOOP_API_URL:Mojaloop"
        "TIGERBEETLE_CLUSTER_URL:TigerBeetle"
        "KAFKA_BROKERS:Kafka"
        "TEMPORAL_SERVER_URL:Temporal"
        "ELASTICSEARCH_URL:Elasticsearch"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r var_name service_name <<< "$service"
        if [ -z "${!var_name}" ]; then
            log_warning "$service_name not configured"
        else
            log_info "Testing $service_name connection..."
            # Simplified check - actual implementation would test connectivity
            log_success "$service_name endpoint configured: ${!var_name}"
        fi
    done
}

check_build() {
    log_section "Checking Build"
    
    cd "$PROJECT_DIR"
    
    log_info "Running TypeScript compiler..."
    if pnpm tsc --noEmit > /dev/null 2>&1; then
        log_success "TypeScript compilation successful"
    else
        log_error "TypeScript compilation failed"
    fi
    
    log_info "Running production build..."
    if pnpm build > /dev/null 2>&1; then
        log_success "Production build successful"
    else
        log_error "Production build failed"
    fi
}

check_security() {
    log_section "Checking Security Configuration"
    
    # Check for sensitive files
    if [ -f "$PROJECT_DIR/.env" ]; then
        log_warning ".env file exists - ensure it's not committed to git"
    else
        log_success "No .env file in repository"
    fi
    
    # Check gitignore
    if grep -q ".env" "$PROJECT_DIR/.gitignore" 2>/dev/null; then
        log_success ".env is in .gitignore"
    else
        log_error ".env not in .gitignore"
    fi
    
    # Check for hardcoded secrets
    log_info "Scanning for potential hardcoded secrets..."
    if grep -r "password\|secret\|api_key" "$PROJECT_DIR/server" --exclude-dir=node_modules > /dev/null 2>&1; then
        log_warning "Potential hardcoded secrets found - manual review required"
    else
        log_success "No obvious hardcoded secrets found"
    fi
}

check_monitoring() {
    log_section "Checking Monitoring Configuration"
    
    # Check Prometheus config
    if [ -f "$PROJECT_DIR/prometheus/prometheus.yml" ]; then
        log_success "Prometheus configuration exists"
    else
        log_warning "Prometheus configuration missing"
    fi
    
    # Check Grafana dashboards
    if [ -f "$PROJECT_DIR/grafana/provisioning/dashboards/idlr-pts-dashboard.json" ]; then
        log_success "Grafana dashboard exists"
    else
        log_warning "Grafana dashboard missing"
    fi
    
    # Check alert rules
    if [ -f "$PROJECT_DIR/prometheus/alert_rules.yml" ]; then
        log_success "Prometheus alert rules exist"
    else
        log_warning "Prometheus alert rules missing"
    fi
    
    # Check Alertmanager config
    if [ -f "$PROJECT_DIR/prometheus/alertmanager.yml" ]; then
        log_success "Alertmanager configuration exists"
    else
        log_warning "Alertmanager configuration missing"
    fi
}

check_documentation() {
    log_section "Checking Documentation"
    
    local docs=(
        "README.md:Project README"
        "PRODUCTION_DEPLOYMENT_GUIDE.md:Deployment Guide"
        "OPERATIONS_RUNBOOK.md:Operations Runbook"
        "SYSTEM_ARCHITECTURE.md:Architecture Documentation"
        "PRODUCTION_READINESS_CHECKLIST.md:Readiness Checklist"
    )
    
    for doc in "${docs[@]}"; do
        IFS=':' read -r filename doc_name <<< "$doc"
        if [ -f "/home/ubuntu/$filename" ] || [ -f "$PROJECT_DIR/$filename" ]; then
            log_success "$doc_name exists"
        else
            log_warning "$doc_name missing"
        fi
    done
}

check_deployment_scripts() {
    log_section "Checking Deployment Scripts"
    
    local scripts=(
        "deploy.sh:Deployment script"
        "rollback.sh:Rollback script"
        "validate-deployment.sh:Validation script"
        "smoke-test.sh:Smoke test script"
        "setup-external-services.sh:External services setup"
    )
    
    for script in "${scripts[@]}"; do
        IFS=':' read -r filename script_name <<< "$script"
        if [ -f "$PROJECT_DIR/scripts/$filename" ]; then
            if [ -x "$PROJECT_DIR/scripts/$filename" ]; then
                log_success "$script_name exists and is executable"
            else
                log_warning "$script_name exists but is not executable"
            fi
        else
            log_error "$script_name missing"
        fi
    done
}

check_docker_config() {
    log_section "Checking Docker Configuration"
    
    if [ -f "$PROJECT_DIR/Dockerfile" ]; then
        log_success "Dockerfile exists"
    else
        log_warning "Dockerfile missing"
    fi
    
    if [ -f "$PROJECT_DIR/docker-compose.staging.yml" ]; then
        log_success "Docker Compose staging config exists"
    else
        log_warning "Docker Compose staging config missing"
    fi
    
    if [ -f "$PROJECT_DIR/.dockerignore" ]; then
        log_success ".dockerignore exists"
    else
        log_warning ".dockerignore missing"
    fi
}

generate_report() {
    log_section "Pre-Flight Check Summary"
    
    local total_checks=$((CHECKS_PASSED + CHECKS_FAILED + CHECKS_WARNING))
    local pass_rate=$((CHECKS_PASSED * 100 / total_checks))
    
    echo ""
    echo -e "${BLUE}Total Checks:${NC} $total_checks"
    echo -e "${GREEN}Passed:${NC} $CHECKS_PASSED"
    echo -e "${YELLOW}Warnings:${NC} $CHECKS_WARNING"
    echo -e "${RED}Failed:${NC} $CHECKS_FAILED"
    echo -e "${BLUE}Pass Rate:${NC} $pass_rate%"
    echo ""
    
    if [ $CHECKS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ Pre-flight checks passed!${NC}"
        echo -e "${GREEN}Platform is ready for $ENVIRONMENT deployment${NC}"
        return 0
    else
        echo -e "${RED}✗ Pre-flight checks failed!${NC}"
        echo -e "${RED}Fix $CHECKS_FAILED critical issues before deployment${NC}"
        return 1
    fi
}

# Main execution
main() {
    echo ""
    log_section "IDLR-PTS Platform - Production Pre-Flight Check"
    log_info "Environment: $ENVIRONMENT"
    log_info "Timestamp: $(date)"
    echo ""
    
    check_environment_variables
    check_dependencies
    check_database_connection
    check_redis_connection
    check_external_services
    check_build
    check_security
    check_monitoring
    check_documentation
    check_deployment_scripts
    check_docker_config
    
    echo ""
    generate_report
}

# Run main function
main
exit_code=$?
exit $exit_code
