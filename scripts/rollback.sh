#!/bin/bash

# IDLR-PTS Platform - Rollback Script
# Usage: ./scripts/rollback.sh [staging|production] [version]

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
TARGET_VERSION=${2:-}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"
ENV_FILE=".env.${ENVIRONMENT}"
BACKUP_DIR="$PROJECT_DIR/backups"

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

confirm_rollback() {
    echo ""
    log_warning "========================================="
    log_warning "ROLLBACK CONFIRMATION"
    log_warning "========================================="
    log_warning "Environment: $ENVIRONMENT"
    if [ -n "$TARGET_VERSION" ]; then
        log_warning "Target Version: $TARGET_VERSION"
    else
        log_warning "Target: Previous version"
    fi
    log_warning "This will:"
    log_warning "  1. Stop current services"
    log_warning "  2. Restore previous version"
    log_warning "  3. Restart services"
    log_warning "========================================="
    echo ""
    
    read -p "Are you sure you want to proceed? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Rollback cancelled"
        exit 0
    fi
}

create_pre_rollback_backup() {
    log_info "Creating pre-rollback backup..."
    
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/pre_rollback_$(date +%Y%m%d_%H%M%S).sql.gz"
    
    cd "$PROJECT_DIR"
    if docker-compose -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
        docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U idlr_admin idlr_pts_${ENVIRONMENT} | gzip > "$BACKUP_FILE" || {
            log_warning "Backup failed, but continuing with rollback"
            return 0
        }
        log_success "Pre-rollback backup created: $BACKUP_FILE"
    else
        log_warning "Database not running, skipping backup"
    fi
}

get_current_version() {
    cd "$PROJECT_DIR"
    CURRENT_VERSION=$(docker-compose -f "$COMPOSE_FILE" ps app | grep "Up" | awk '{print $2}' | cut -d: -f2 || echo "unknown")
    log_info "Current version: $CURRENT_VERSION"
}

stop_services() {
    log_info "Stopping current services..."
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" stop app
    log_success "Services stopped"
}

rollback_application() {
    log_info "Rolling back application..."
    cd "$PROJECT_DIR"
    
    if [ -n "$TARGET_VERSION" ]; then
        # Rollback to specific version
        log_info "Rolling back to version: $TARGET_VERSION"
        
        # Update VERSION in env file
        if grep -q "^VERSION=" "$ENV_FILE"; then
            sed -i "s/^VERSION=.*/VERSION=$TARGET_VERSION/" "$ENV_FILE"
        else
            echo "VERSION=$TARGET_VERSION" >> "$ENV_FILE"
        fi
        
        # Pull specific version
        docker-compose -f "$COMPOSE_FILE" pull app
    else
        # Rollback to previous version (using Docker)
        log_info "Rolling back to previous version..."
        
        if command -v kubectl &> /dev/null; then
            # Kubernetes rollback
            kubectl rollout undo deployment/idlr-pts-app -n idlr-pts
            kubectl rollout status deployment/idlr-pts-app -n idlr-pts
        else
            # Docker Compose rollback
            log_warning "No specific version provided and not using Kubernetes"
            log_warning "Please specify a version to rollback to"
            exit 1
        fi
    fi
    
    log_success "Application rolled back"
}

start_services() {
    log_info "Starting services..."
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" up -d app
    log_success "Services started"
}

wait_for_health() {
    log_info "Waiting for services to be healthy..."
    
    MAX_WAIT=180
    ELAPSED=0
    INTERVAL=5
    
    cd "$PROJECT_DIR"
    while [ $ELAPSED -lt $MAX_WAIT ]; do
        if docker-compose -f "$COMPOSE_FILE" ps app | grep -q "healthy"; then
            log_success "Application is healthy"
            return 0
        fi
        
        if docker-compose -f "$COMPOSE_FILE" ps app | grep -q "Up"; then
            log_info "Application is up, waiting for healthy status..."
        else
            log_error "Application failed to start"
            return 1
        fi
        
        sleep $INTERVAL
        ELAPSED=$((ELAPSED + INTERVAL))
    done
    
    log_error "Timeout waiting for application to be healthy"
    return 1
}

verify_rollback() {
    log_info "Verifying rollback..."
    
    cd "$PROJECT_DIR"
    
    # Check application health
    if docker-compose -f "$COMPOSE_FILE" exec -T app curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        log_success "Application health check passed"
    else
        log_error "Application health check failed"
        return 1
    fi
    
    # Check version
    ROLLED_BACK_VERSION=$(docker-compose -f "$COMPOSE_FILE" ps app | grep "Up" | awk '{print $2}' | cut -d: -f2 || echo "unknown")
    log_info "Rolled back to version: $ROLLED_BACK_VERSION"
    
    # Run smoke tests
    if [ -f "$SCRIPT_DIR/smoke-test.sh" ]; then
        log_info "Running smoke tests..."
        if "$SCRIPT_DIR/smoke-test.sh" "http://localhost:3000"; then
            log_success "Smoke tests passed"
        else
            log_warning "Some smoke tests failed"
        fi
    fi
    
    log_success "Rollback verification completed"
}

show_rollback_status() {
    log_info "Rollback status:"
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" ps app
    
    echo ""
    log_info "To monitor logs:"
    echo "  docker-compose -f $COMPOSE_FILE logs -f app"
    echo ""
    log_info "To check health:"
    echo "  curl http://localhost:3000/api/health"
}

rollback_database() {
    if [ -n "${3:-}" ]; then
        BACKUP_FILE="$3"
        
        log_warning "========================================="
        log_warning "DATABASE ROLLBACK REQUESTED"
        log_warning "========================================="
        log_warning "This will restore database from: $BACKUP_FILE"
        log_warning "ALL CURRENT DATA WILL BE LOST"
        log_warning "========================================="
        echo ""
        
        read -p "Are you ABSOLUTELY sure? Type 'ROLLBACK DATABASE' to confirm: " -r
        if [[ ! $REPLY = "ROLLBACK DATABASE" ]]; then
            log_info "Database rollback cancelled"
            return 0
        fi
        
        log_info "Rolling back database..."
        cd "$PROJECT_DIR"
        
        # Drop and recreate database
        docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U idlr_admin -c "DROP DATABASE IF EXISTS idlr_pts_${ENVIRONMENT};"
        docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U idlr_admin -c "CREATE DATABASE idlr_pts_${ENVIRONMENT};"
        
        # Restore backup
        gunzip < "$BACKUP_FILE" | docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U idlr_admin idlr_pts_${ENVIRONMENT}
        
        log_success "Database rolled back"
    fi
}

# Main rollback flow
main() {
    echo ""
    log_info "========================================="
    log_info "IDLR-PTS Platform Rollback"
    log_info "Environment: $ENVIRONMENT"
    log_info "========================================="
    echo ""
    
    # Check prerequisites
    if [ ! -f "$PROJECT_DIR/$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    if [ ! -f "$PROJECT_DIR/$ENV_FILE" ]; then
        log_error "Environment file not found: $ENV_FILE"
        exit 1
    fi
    
    get_current_version
    confirm_rollback
    create_pre_rollback_backup
    stop_services
    rollback_application
    start_services
    wait_for_health
    verify_rollback
    show_rollback_status
    
    echo ""
    log_success "========================================="
    log_success "Rollback completed successfully!"
    log_success "========================================="
    echo ""
}

# Run main function
main
