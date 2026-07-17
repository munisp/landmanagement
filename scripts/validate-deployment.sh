#!/bin/bash

# IDLR-PTS Platform - Deployment Validation Script
# Usage: ./scripts/validate-deployment.sh [staging|production]

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-staging}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"
ENV_FILE=".env.${ENVIRONMENT}"

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    PASSED_TESTS=$((PASSED_TESTS + 1))
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
    FAILED_TESTS=$((FAILED_TESTS + 1))
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

run_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    local test_name="$1"
    local test_command="$2"
    
    log_info "Testing: $test_name"
    if eval "$test_command" > /dev/null 2>&1; then
        log_success "$test_name"
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

# Validation Tests

validate_prerequisites() {
    echo ""
    log_info "=== Validating Prerequisites ==="
    
    run_test "Docker installed" "command -v docker"
    run_test "Docker Compose installed" "command -v docker-compose"
    run_test "Compose file exists" "test -f $PROJECT_DIR/$COMPOSE_FILE"
    run_test "Environment file exists" "test -f $PROJECT_DIR/$ENV_FILE"
}

validate_services() {
    echo ""
    log_info "=== Validating Services ==="
    
    cd "$PROJECT_DIR"
    
    run_test "PostgreSQL container running" "docker-compose -f $COMPOSE_FILE ps postgres | grep -q 'Up'"
    run_test "Redis container running" "docker-compose -f $COMPOSE_FILE ps redis | grep -q 'Up'"
    run_test "Application container running" "docker-compose -f $COMPOSE_FILE ps app | grep -q 'Up'"
    run_test "Nginx container running" "docker-compose -f $COMPOSE_FILE ps nginx | grep -q 'Up'"
    run_test "Prometheus container running" "docker-compose -f $COMPOSE_FILE ps prometheus | grep -q 'Up'"
    run_test "Grafana container running" "docker-compose -f $COMPOSE_FILE ps grafana | grep -q 'Up'"
}

validate_health_checks() {
    echo ""
    log_info "=== Validating Health Checks ==="
    
    cd "$PROJECT_DIR"
    
    run_test "PostgreSQL healthy" "docker-compose -f $COMPOSE_FILE ps postgres | grep -q 'healthy'"
    run_test "Redis healthy" "docker-compose -f $COMPOSE_FILE ps redis | grep -q 'healthy'"
    run_test "Application healthy" "docker-compose -f $COMPOSE_FILE ps app | grep -q 'healthy'"
    run_test "Nginx healthy" "docker-compose -f $COMPOSE_FILE ps nginx | grep -q 'healthy'"
}

validate_connectivity() {
    echo ""
    log_info "=== Validating Connectivity ==="
    
    cd "$PROJECT_DIR"
    
    # Application health endpoint
    run_test "Application health endpoint" "docker-compose -f $COMPOSE_FILE exec -T app curl -f http://localhost:3000/api/health"
    
    # Database connectivity
    run_test "Database connectivity" "docker-compose -f $COMPOSE_FILE exec -T postgres pg_isready -U idlr_admin"
    
    # Redis connectivity
    run_test "Redis connectivity" "docker-compose -f $COMPOSE_FILE exec -T redis redis-cli ping | grep -q PONG"
    
    # Nginx connectivity
    run_test "Nginx HTTP endpoint" "curl -f http://localhost/health"
}

validate_integration_health() {
    echo ""
    log_info "=== Validating Integration Health ==="
    
    cd "$PROJECT_DIR"
    
    # Get integration health status
    INTEGRATION_STATUS=$(docker-compose -f $COMPOSE_FILE exec -T app curl -s http://localhost:3000/api/trpc/integrationHealth.getStatus || echo "{}")
    
    if [ -n "$INTEGRATION_STATUS" ] && [ "$INTEGRATION_STATUS" != "{}" ]; then
        log_success "Integration health endpoint accessible"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log_error "Integration health endpoint not accessible"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

validate_database() {
    echo ""
    log_info "=== Validating Database ==="
    
    cd "$PROJECT_DIR"
    
    # Check database exists
    run_test "Database exists" "docker-compose -f $COMPOSE_FILE exec -T postgres psql -U idlr_admin -lqt | cut -d \| -f 1 | grep -qw idlr_pts_${ENVIRONMENT}"
    
    # Check extensions
    run_test "PostGIS extension" "docker-compose -f $COMPOSE_FILE exec -T postgres psql -U idlr_admin -d idlr_pts_${ENVIRONMENT} -c 'SELECT 1 FROM pg_extension WHERE extname = '\''postgis'\''' | grep -q 1"
    
    # Check connections
    CONNECTIONS=$(docker-compose -f $COMPOSE_FILE exec -T postgres psql -U idlr_admin -d idlr_pts_${ENVIRONMENT} -t -c 'SELECT count(*) FROM pg_stat_activity;' | tr -d ' ')
    if [ "$CONNECTIONS" -gt 0 ] && [ "$CONNECTIONS" -lt 100 ]; then
        log_success "Database connections: $CONNECTIONS (healthy)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log_error "Database connections: $CONNECTIONS (unhealthy)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

validate_cache() {
    echo ""
    log_info "=== Validating Cache ==="
    
    cd "$PROJECT_DIR"
    
    # Check Redis info
    run_test "Redis server info" "docker-compose -f $COMPOSE_FILE exec -T redis redis-cli INFO server | grep -q redis_version"
    
    # Check memory usage
    MEMORY_USED=$(docker-compose -f $COMPOSE_FILE exec -T redis redis-cli INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    log_info "Redis memory usage: $MEMORY_USED"
    
    # Check connected clients
    CLIENTS=$(docker-compose -f $COMPOSE_FILE exec -T redis redis-cli INFO clients | grep connected_clients | cut -d: -f2 | tr -d '\r')
    log_info "Redis connected clients: $CLIENTS"
}

validate_metrics() {
    echo ""
    log_info "=== Validating Metrics ==="
    
    cd "$PROJECT_DIR"
    
    # Check Prometheus metrics endpoint
    run_test "Application metrics endpoint" "docker-compose -f $COMPOSE_FILE exec -T app curl -f http://localhost:9090/metrics"
    
    # Check Prometheus server
    run_test "Prometheus server" "curl -f http://localhost:9091/-/healthy"
    
    # Check Grafana
    run_test "Grafana server" "curl -f http://localhost:3001/api/health"
}

validate_logs() {
    echo ""
    log_info "=== Validating Logs ==="
    
    cd "$PROJECT_DIR"
    
    # Check for critical errors in logs
    ERROR_COUNT=$(docker-compose -f $COMPOSE_FILE logs --tail=100 app | grep -i "critical\|fatal" | wc -l)
    if [ "$ERROR_COUNT" -eq 0 ]; then
        log_success "No critical errors in application logs"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log_error "Found $ERROR_COUNT critical errors in application logs"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    # Check database logs
    DB_ERROR_COUNT=$(docker-compose -f $COMPOSE_FILE logs --tail=100 postgres | grep -i "error\|fatal" | wc -l)
    if [ "$DB_ERROR_COUNT" -eq 0 ]; then
        log_success "No errors in database logs"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log_warning "Found $DB_ERROR_COUNT errors in database logs (may be normal)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

validate_resources() {
    echo ""
    log_info "=== Validating Resource Usage ==="
    
    cd "$PROJECT_DIR"
    
    # Get container stats
    docker-compose -f $COMPOSE_FILE ps -q | while read container_id; do
        CONTAINER_NAME=$(docker inspect --format='{{.Name}}' $container_id | sed 's/\///')
        CPU_USAGE=$(docker stats --no-stream --format "{{.CPUPerc}}" $container_id)
        MEM_USAGE=$(docker stats --no-stream --format "{{.MemPerc}}" $container_id)
        
        log_info "$CONTAINER_NAME - CPU: $CPU_USAGE, Memory: $MEM_USAGE"
    done
}

validate_security() {
    echo ""
    log_info "=== Validating Security ==="
    
    cd "$PROJECT_DIR"
    
    # Check SSL certificates
    run_test "SSL certificate exists" "test -f nginx/ssl/cert.pem"
    run_test "SSL key exists" "test -f nginx/ssl/key.pem"
    
    # Check environment variables are set
    run_test "POSTGRES_PASSWORD set" "grep -q 'POSTGRES_PASSWORD=' $ENV_FILE"
    run_test "REDIS_PASSWORD set" "grep -q 'REDIS_PASSWORD=' $ENV_FILE"
    run_test "JWT_SECRET set" "grep -q 'JWT_SECRET=' $ENV_FILE"
}

validate_backups() {
    echo ""
    log_info "=== Validating Backups ==="
    
    BACKUP_DIR="$PROJECT_DIR/backups"
    
    if [ -d "$BACKUP_DIR" ]; then
        BACKUP_COUNT=$(ls -1 "$BACKUP_DIR" | wc -l)
        if [ "$BACKUP_COUNT" -gt 0 ]; then
            LATEST_BACKUP=$(ls -t "$BACKUP_DIR" | head -1)
            BACKUP_SIZE=$(du -h "$BACKUP_DIR/$LATEST_BACKUP" | cut -f1)
            log_success "Backups exist: $BACKUP_COUNT backups, latest: $LATEST_BACKUP ($BACKUP_SIZE)"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            log_warning "No backups found"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        fi
    else
        log_warning "Backup directory does not exist"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

# Main validation flow
main() {
    echo ""
    log_info "========================================="
    log_info "IDLR-PTS Deployment Validation"
    log_info "Environment: $ENVIRONMENT"
    log_info "========================================="
    
    validate_prerequisites
    validate_services
    validate_health_checks
    validate_connectivity
    validate_integration_health
    validate_database
    validate_cache
    validate_metrics
    validate_logs
    validate_resources
    validate_security
    validate_backups
    
    # Summary
    echo ""
    log_info "========================================="
    log_info "Validation Summary"
    log_info "========================================="
    log_info "Total Tests: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS"
    if [ "$FAILED_TESTS" -gt 0 ]; then
        log_error "Failed: $FAILED_TESTS"
    else
        log_info "Failed: $FAILED_TESTS"
    fi
    
    PASS_RATE=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    log_info "Pass Rate: $PASS_RATE%"
    
    echo ""
    if [ "$FAILED_TESTS" -eq 0 ]; then
        log_success "========================================="
        log_success "All validation tests passed!"
        log_success "Deployment is healthy and ready."
        log_success "========================================="
        exit 0
    else
        log_error "========================================="
        log_error "Some validation tests failed."
        log_error "Please review the errors above."
        log_error "========================================="
        exit 1
    fi
}

# Run main function
main
