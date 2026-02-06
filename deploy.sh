#!/bin/bash

# Bharat Biz-Agent Production Deployment Script
# This script handles the complete deployment process

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="bharat-biz-agent"
BACKUP_DIR="./backups"
LOG_FILE="./deploy.log"

# Functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check .env file
    if [ ! -f ".env" ]; then
        warning ".env file not found. Creating from template..."
        cp .env.production .env
        warning "Please edit .env file with your actual configuration values."
        warning "After configuring, run this script again."
        exit 1
    fi
    
    # Check required environment variables
    source .env
    if [ -z "$ENCRYPTION_KEY" ] || [ "$ENCRYPTION_KEY" = "your-32-character-hex-encryption-key-here" ]; then
        error "Please set ENCRYPTION_KEY in .env file"
        exit 1
    fi
    
    if [ -z "$ADMIN_API_KEY" ] || [ "$ADMIN_API_KEY" = "bbz_your-secure-admin-api-key-here" ]; then
        error "Please set ADMIN_API_KEY in .env file"
        exit 1
    fi
    
    if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your-gemini-api-key-here" ]; then
        error "Please set GEMINI_API_KEY in .env file"
        exit 1
    fi
    
    log "Prerequisites check completed ✓"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p "$BACKUP_DIR"
    mkdir -p "./logs"
    mkdir -p "./nginx/ssl"
    mkdir -p "./gcp-keys"
    
    log "Directories created ✓"
}

# Backup existing data
backup_data() {
    if docker ps -q -f name=bizagent-mongodb | grep -q .; then
        log "Backing up existing MongoDB data..."
        docker exec bizagent-mongodb mongodump --out /tmp/backup
        docker cp bizagent-mongodb:/tmp/backup "$BACKUP_DIR/mongodb-$(date +%Y%m%d-%H%M%S)"
        log "MongoDB backup completed ✓"
    fi
    
    if [ -d "./data" ]; then
        log "Backing up file database..."
        cp -r ./data "$BACKUP_DIR/file-db-$(date +%Y%m%d-%H%M%S)"
        log "File database backup completed ✓"
    fi
}

# Build and deploy
deploy() {
    log "Starting deployment..."
    
    # Stop existing services
    log "Stopping existing services..."
    docker-compose down --remove-orphans || true
    
    # Build new images
    log "Building Docker images..."
    docker-compose build --no-cache
    
    # Start services
    log "Starting services..."
    docker-compose up -d
    
    # Wait for services to be ready
    log "Waiting for services to be ready..."
    sleep 30
    
    # Check health
    check_health
}

# Health check
check_health() {
    log "Performing health check..."
    
    # Check if containers are running
    if ! docker ps -q -f name=bizagent-app | grep -q .; then
        error "Application container is not running"
        exit 1
    fi
    
    if ! docker ps -q -f name=bizagent-mongodb | grep -q .; then
        error "MongoDB container is not running"
        exit 1
    fi
    
    if ! docker ps -q -f name=bizagent-redis | grep -q .; then
        error "Redis container is not running"
        exit 1
    fi
    
    # Check application health endpoint
    local health_check_attempts=0
    local max_attempts=10
    
    while [ $health_check_attempts -lt $max_attempts ]; do
        if curl -f http://localhost:3002/health &> /dev/null; then
            log "Application health check passed ✓"
            break
        fi
        
        health_check_attempts=$((health_check_attempts + 1))
        log "Health check attempt $health_check_attempts/$max_attempts..."
        sleep 10
    done
    
    if [ $health_check_attempts -eq $max_attempts ]; then
        error "Application health check failed after $max_attempts attempts"
        exit 1
    fi
}

# Show deployment status
show_status() {
    log "Deployment completed successfully! ✓"
    echo ""
    echo "=== Service Status ==="
    docker-compose ps
    echo ""
    echo "=== Application URLs ==="
    echo "• API: http://localhost:3002"
    echo "• Health Check: http://localhost:3002/health"
    echo "• Admin API Metrics: http://localhost:3002/api/admin/ai/metrics"
    echo ""
    echo "=== Useful Commands ==="
    echo "• View logs: docker-compose logs -f"
    echo "• Stop services: docker-compose down"
    echo "• Restart services: docker-compose restart"
    echo "• Access MongoDB: docker exec -it bizagent-mongodb mongosh"
    echo ""
    echo "=== Monitoring ==="
    echo "• Check AI metrics: curl -H \"Authorization: Bearer \$ADMIN_API_KEY\" http://localhost:3002/api/admin/ai/metrics"
    echo "• Health check: curl http://localhost:3002/health"
}

# Main execution
main() {
    log "Starting Bharat Biz-Agent deployment..."
    
    check_prerequisites
    create_directories
    backup_data
    deploy
    show_status
    
    log "Deployment completed successfully! 🎉"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "backup")
        backup_data
        ;;
    "health")
        check_health
        ;;
    "logs")
        docker-compose logs -f
        ;;
    "stop")
        log "Stopping services..."
        docker-compose down
        log "Services stopped ✓"
        ;;
    "restart")
        log "Restarting services..."
        docker-compose restart
        check_health
        ;;
    *)
        echo "Usage: $0 {deploy|backup|health|logs|stop|restart}"
        echo "  deploy  - Full deployment (default)"
        echo "  backup  - Backup existing data"
        echo "  health  - Check service health"
        echo "  logs    - Show service logs"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        exit 1
        ;;
esac
