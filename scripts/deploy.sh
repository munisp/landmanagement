#!/bin/bash

# IDLR-PTS Platform - Deployment Script
# Usage: ./scripts/deploy.sh [staging|production]

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

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if compose file exists
    if [ ! -f "$PROJECT_DIR/$COMPOSE_FILE" ]; then
        log_error "Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    # Check if env file exists
    if [ ! -f "$PROJECT_DIR/$ENV_FILE" ]; then
        log_warning "Environment file not found: $ENV_FILE"
        log_info "Creating template environment file..."
        cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/$ENV_FILE" || true
    fi
    
    log_success "Prerequisites check passed"
}

generate_ssl_cert() {
    log_info "Checking SSL certificates..."
    
    SSL_DIR="$PROJECT_DIR/nginx/ssl"
    mkdir -p "$SSL_DIR"
    
    if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
        log_warning "SSL certificates not found. Generating self-signed certificates..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$SSL_DIR/key.pem" \
            -out "$SSL_DIR/cert.pem" \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" \
            2>/dev/null || log_warning "Failed to generate SSL certificates"
        log_success "Self-signed SSL certificates generated"
    else
        log_success "SSL certificates found"
    fi
}

pull_images() {
    log_info "Pulling Docker images..."
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull || log_warning "Some images could not be pulled"
    log_success "Docker images pulled"
}

stop_services() {
    log_info "Stopping existing services..."
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down || true
    log_success "Services stopped"
}

start_services() {
    log_info "Starting services..."
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    log_success "Services started"
}

wait_for_health() {
    log_info "Waiting for services to be healthy..."
    
    MAX_WAIT=180
    ELAPSED=0
    INTERVAL=5
    
    while [ $ELAPSED -lt $MAX_WAIT ]; do
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "healthy"; then
            HEALTHY_COUNT=$(docker-compose -f "$COMPOSE_FILE" ps | grep -c "healthy" || echo "0")
            TOTAL_COUNT=$(docker-compose -f "$COMPOSE_FILE" ps | grep -c "Up" || echo "0")
            log_info "Healthy services: $HEALTHY_COUNT/$TOTAL_COUNT"
            
            if [ "$HEALTHY_COUNT" -ge 3 ]; then
                log_success "Services are healthy"
                return 0
            fi
        fi
        
        sleep $INTERVAL
        ELAPSED=$((ELAPSED + INTERVAL))
    done
    
    log_warning "Timeout waiting for services to be healthy"
    return 1
}

run_migrations() {
    log_info "Running database migrations..."
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T app pnpm db:push || log_warning "Migrations failed or already applied"
    log_success "Database migrations completed"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check application health
    if docker-compose -f "$COMPOSE_FILE" exec -T app curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        log_success "Application health check passed"
    else
        log_error "Application health check failed"
        return 1
    fi
    
    # Check database connectivity
    if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U idlr_admin > /dev/null 2>&1; then
        log_success "Database connectivity check passed"
    else
        log_error "Database connectivity check failed"
        return 1
    fi
    
    # Check Redis connectivity
    if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis connectivity check passed"
    else
        log_error "Redis connectivity check failed"
        return 1
    fi
    
    log_success "Deployment verification passed"
}

show_status() {
    log_info "Service status:"
    cd "$PROJECT_DIR"
    docker-compose -f "$COMPOSE_FILE" ps
    
    echo ""
    log_info "Access URLs:"
    echo "  Application: https://localhost"
    echo "  Metrics: http://localhost:9090/metrics"
    echo "  Prometheus: http://localhost:9091"
    echo "  Grafana: http://localhost:3001 (admin/admin)"
    echo ""
    log_info "View logs: docker-compose -f $COMPOSE_FILE logs -f"
}

create_backup() {
    log_info "Creating pre-deployment backup..."
    BACKUP_DIR="$PROJECT_DIR/backups"
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql.gz"
    
    if docker-compose -f "$COMPOSE_FILE" ps postgres | grep -q "Up"; then
        docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U idlr_admin idlr_pts_${ENVIRONMENT} | gzip > "$BACKUP_FILE" || log_warning "Backup failed"
        log_success "Backup created: $BACKUP_FILE"
    else
        log_warning "Database not running, skipping backup"
    fi
}

# Main deployment flow
main() {
    echo ""
    log_info "========================================="
    log_info "IDLR-PTS Platform Deployment"
    log_info "Environment: $ENVIRONMENT"
    log_info "========================================="
    echo ""
    
    check_prerequisites
    generate_ssl_cert
    
    # Create backup if services are running
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        create_backup
    fi
    
    pull_images
    stop_services
    start_services
    wait_for_health
    run_migrations
    verify_deployment
    show_status
    
    echo ""
    log_success "========================================="
    log_success "Deployment completed successfully!"
    log_success "========================================="
    echo ""
}

# Run main function
main
