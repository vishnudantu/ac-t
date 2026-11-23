#!/bin/bash
# ACA TicketOps - One-Click Cloud Deployment Script
# Supports: AWS, GCP, Azure, DigitalOcean, Generic VPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
CLOUD_PROVIDER=""
DOMAIN=""
EMAIL=""
DB_PASSWORD=""
REDIS_PASSWORD=""
MINIO_USER=""
MINIO_PASSWORD=""
AUTH_SECRET=""
JWT_SECRET=""
SESSION_PASSWORD=""
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM=""
TWILIO_SID=""
TWILIO_TOKEN=""
TWILIO_FROM=""
WHATSAPP_TOKEN=""
WHATSAPP_VERIFY=""
SEED_DB="false"

# Print functions
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}  ACA TicketOps - Cloud Deploy  ${NC}"
    echo -e "${BLUE}================================${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
Usage: ./deploy.sh [OPTIONS]

One-click cloud deployment for ACA TicketOps

OPTIONS:
    --provider PROVIDER     Cloud provider (aws|gcp|azure|digitalocean|vps|local)
    --domain DOMAIN         Domain name for the application
    --email EMAIL           Email for SSL certificates (Let's Encrypt)
    --db-password PASS      PostgreSQL password
    --redis-password PASS   Redis password
    --minio-user USER       MinIO username
    --minio-password PASS   MinIO password
    --auth-secret SECRET    Auth secret (32+ chars)
    --jwt-secret SECRET     JWT secret (32+ chars)
    --session-password PASS Session password (32+ chars)
    --smtp-host HOST        SMTP server host
    --smtp-port PORT        SMTP server port
    --smtp-user USER        SMTP username
    --smtp-password PASS    SMTP password
    --smtp-from EMAIL       From email address
    --twilio-sid SID        Twilio Account SID
    --twilio-token TOKEN    Twilio Auth Token
    --twilio-from NUMBER    Twilio From Number
    --whatsapp-token TOKEN  WhatsApp Access Token
    --whatsapp-verify TOKEN WhatsApp Verify Token
    --seed-db               Seed database with sample data
    --help                  Show this help message

EXAMPLES:
    # Deploy to VPS with domain
    ./deploy.sh --provider vps --domain ticketops.aca.gov.in --email admin@aca.gov.in \\
                --db-password "secure_db_pass" --auth-secret "super_secret_32_chars_min" \\
                --jwt-secret "jwt_secret_32_chars_minimum" --session-password "session_pass_32_chars_min"

    # Local development
    ./deploy.sh --provider local --seed-db

    # AWS with all features
    ./deploy.sh --provider aws --domain ticketops.aca.gov.in --email admin@aca.gov.in \\
                --db-password "xxx" --auth-secret "xxx" --jwt-secret "xxx" --session-password "xxx" \\
                --smtp-host "smtp.example.com" --smtp-port "587" --smtp-user "user" --smtp-password "pass" \\
                --smtp-from "ACA TicketOps <noreply@aca.gov.in>" \\
                --twilio-sid "xxx" --twilio-token "xxx" --twilio-from "+1234567890" \\
                --whatsapp-token "xxx" --whatsapp-verify "xxx" --seed-db

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --provider) CLOUD_PROVIDER="$2"; shift 2 ;;
        --domain) DOMAIN="$2"; shift 2 ;;
        --email) EMAIL="$2"; shift 2 ;;
        --db-password) DB_PASSWORD="$2"; shift 2 ;;
        --redis-password) REDIS_PASSWORD="$2"; shift 2 ;;
        --minio-user) MINIO_USER="$2"; shift 2 ;;
        --minio-password) MINIO_PASSWORD="$2"; shift 2 ;;
        --auth-secret) AUTH_SECRET="$2"; shift 2 ;;
        --jwt-secret) JWT_SECRET="$2"; shift 2 ;;
        --session-password) SESSION_PASSWORD="$2"; shift 2 ;;
        --smtp-host) SMTP_HOST="$2"; shift 2 ;;
        --smtp-port) SMTP_PORT="$2"; shift 2 ;;
        --smtp-user) SMTP_USER="$2"; shift 2 ;;
        --smtp-password) SMTP_PASSWORD="$2"; shift 2 ;;
        --smtp-from) SMTP_FROM="$2"; shift 2 ;;
        --twilio-sid) TWILIO_SID="$2"; shift 2 ;;
        --twilio-token) TWILIO_TOKEN="$2"; shift 2 ;;
        --twilio-from) TWILIO_FROM="$2"; shift 2 ;;
        --whatsapp-token) WHATSAPP_TOKEN="$2"; shift 2 ;;
        --whatsapp-verify) WHATSAPP_VERIFY="$2"; shift 2 ;;
        --seed-db) SEED_DB="true"; shift ;;
        --help) show_help; exit 0 ;;
        *) print_error "Unknown option: $1"; show_help; exit 1 ;;
    esac
done

# Validate required parameters
validate_params() {
    if [[ -z "$CLOUD_PROVIDER" ]]; then
        print_error "Cloud provider is required (--provider)"
        exit 1
    fi

    if [[ "$CLOUD_PROVIDER" != "local" && -z "$DOMAIN" ]]; then
        print_error "Domain is required for cloud deployment (--domain)"
        exit 1
    fi

    if [[ "$CLOUD_PROVIDER" != "local" && -z "$EMAIL" ]]; then
        print_error "Email is required for SSL certificates (--email)"
        exit 1
    fi

    if [[ -z "$DB_PASSWORD" ]]; then
        print_error "Database password is required (--db-password)"
        exit 1
    fi

    if [[ -z "$AUTH_SECRET" || ${#AUTH_SECRET} -lt 32 ]]; then
        print_error "Auth secret must be at least 32 characters (--auth-secret)"
        exit 1
    fi

    if [[ -z "$JWT_SECRET" || ${#JWT_SECRET} -lt 32 ]]; then
        print_error "JWT secret must be at least 32 characters (--jwt-secret)"
        exit 1
    fi

    if [[ -z "$SESSION_PASSWORD" || ${#SESSION_PASSWORD} -lt 32 ]]; then
        print_error "Session password must be at least 32 characters (--session-password)"
        exit 1
    fi
}

# Generate secure random password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Create .env file
create_env_file() {
    print_step "Creating environment configuration..."

    # Generate passwords if not provided
    REDIS_PASSWORD=${REDIS_PASSWORD:-$(generate_password)}
    MINIO_USER=${MINIO_USER:-minioadmin}
    MINIO_PASSWORD=${MINIO_PASSWORD:-$(generate_password)}

    cat > .env << EOF
# Database
DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@postgres:5432/aca_ticketops?schema=public"

# Authentication
AUTH_SECRET="${AUTH_SECRET}"
JWT_SECRET="${JWT_SECRET}"
SESSION_PASSWORD="${SESSION_PASSWORD}"

# Redis
REDIS_URL="redis://:${REDIS_PASSWORD}@redis:6379"

# File Storage (MinIO)
S3_ENDPOINT="http://minio:9000"
S3_ACCESS_KEY_ID="${MINIO_USER}"
S3_SECRET_ACCESS_KEY="${MINIO_PASSWORD}"
S3_BUCKET="aca-ticketops"
S3_REGION="auto"

# Email
SMTP_HOST="${SMTP_HOST}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER}"
SMTP_PASSWORD="${SMTP_PASSWORD}"
SMTP_FROM="${SMTP_FROM}"

# SMS
SMS_PROVIDER="twilio"
TWILIO_ACCOUNT_SID="${TWILIO_SID}"
TWILIO_AUTH_TOKEN="${TWILIO_TOKEN}"
TWILIO_FROM_NUMBER="${TWILIO_FROM}"

# WhatsApp
WHATSAPP_API_URL="https://graph.facebook.com/v18.0"
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_ACCESS_TOKEN="${WHATSAPP_TOKEN}"
WHATSAPP_VERIFY_TOKEN="${WHATSAPP_VERIFY}"

# Application
NEXT_PUBLIC_APP_URL="https://${DOMAIN}"
NEXT_PUBLIC_APP_NAME="ACA TicketOps"
NEXT_PUBLIC_ORG_NAME="Andhra Cricket Association"
TIMEZONE="Asia/Kolkata"

# Feature Flags
ENABLE_MFA=true
ENABLE_WHATSAPP=${WHATSAPP_TOKEN:+true}
ENABLE_WHATSAPP=${ENABLE_WHATSAPP:-false}
ENABLE_SMS=${TWILIO_SID:+true}
ENABLE_SMS=${ENABLE_SMS:-false}
ENABLE_EMAIL=${SMTP_HOST:+true}
ENABLE_EMAIL=${ENABLE_EMAIL:-false}
EOF

    print_info "Environment file created"
}

# Create production docker-compose override
create_docker_override() {
    print_step "Creating production Docker Compose override..."

    cat > docker-compose.override.yml << EOF
version: '3.8'

services:
  postgres:
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD} --maxmemory 256mb --maxmemory-policy allkeys-lru

  minio:
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}

  app:
    environment:
      SEED_DATABASE: "${SEED_DB}"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx_cache:/var/cache/nginx
    depends_on:
      - app
EOF

    print_info "Docker Compose override created"
}

# Create nginx configuration
create_nginx_config() {
    print_step "Creating Nginx configuration..."

    mkdir -p ssl

    cat > nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    # Upstream
    upstream app {
        server app:3000;
        keepalive 32;
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name _;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;

        # SSL Configuration (will be replaced by certbot)
        ssl_certificate /etc/nginx/ssl/fullchain.pem;
        ssl_certificate_key /etc/nginx/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
        add_header X-XSS-Protection "1; mode=block";
        add_header Referrer-Policy "strict-origin-when-cross-origin";
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:;";

        # Client max body size for file uploads
        client_max_body_size 50M;

        # Proxy settings
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;

        # Static files
        location /_next/static/ {
            proxy_pass http://app;
            add_header Cache-Control "public, max-age=31536000, immutable";
        }

        location /_next/image/ {
            proxy_pass http://app;
            add_header Cache-Control "public, max-age=31536000, immutable";
        }

        # API routes with rate limiting
        location /api/auth/login {
            limit_req zone=login burst=3 nodelay;
            proxy_pass http://app;
        }

        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://app;
        }

        # Health check
        location /health {
            proxy_pass http://app;
            access_log off;
        }

        # Main application
        location / {
            proxy_pass http://app;
        }
    }
}
EOF

    print_info "Nginx configuration created"
}

# Setup SSL with Let's Encrypt
setup_ssl() {
    if [[ "$CLOUD_PROVIDER" == "local" ]]; then
        print_info "Skipping SSL setup for local deployment"
        return
    fi

    print_step "Setting up SSL certificates with Let's Encrypt..."

    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        print_info "Installing certbot..."
        if command -v apt-get &> /dev/null; then
            apt-get update && apt-get install -y certbot
        elif command -v yum &> /dev/null; then
            yum install -y certbot
        elif command -v apk &> /dev/null; then
            apk add certbot
        else
            print_warning "Could not install certbot automatically. Please install manually."
            return
        fi
    fi

    # Stop nginx if running
    docker compose stop nginx 2>/dev/null || true

    # Obtain certificate
    certbot certonly --standalone \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN" \
        --preferred-challenges http

    # Copy certificates to ssl directory
    mkdir -p ssl
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ssl/
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ssl/

    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --deploy-hook 'docker compose restart nginx'") | crontab -

    print_info "SSL certificates configured"
}

# Deploy application
deploy_app() {
    print_step "Deploying ACA TicketOps..."

    # Pull latest images
    docker compose pull postgres redis minio 2>/dev/null || true

    # Build application
    docker compose build app

    # Start services
    docker compose up -d

    print_info "Application deployed successfully"
}

# Wait for services
wait_for_services() {
    print_step "Waiting for services to be ready..."

    local max_attempts=60
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if docker compose exec -T app curl -f http://localhost:3000/health > /dev/null 2>&1; then
            print_info "Application is healthy"
            return 0
        fi
        sleep 5
        ((attempt++))
        echo -n "."
    done

    print_error "Application failed to start within timeout"
    docker compose logs app
    return 1
}

# Print deployment summary
print_summary() {
    echo ""
    echo -e "${GREEN}================================${NC}"
    echo -e "${GREEN}  Deployment Complete!  ${NC}"
    echo -e "${GREEN}================================${NC}"
    echo ""
    echo -e "${BLUE}Application URL:${NC} https://${DOMAIN}"
    echo -e "${BLUE}MinIO Console:${NC} http://${DOMAIN}:9001 (user: ${MINIO_USER})"
    echo -e "${BLUE}Database:${NC} postgresql://postgres:****@localhost:5432/aca_ticketops"
    echo -e "${BLUE}Redis:${NC} redis://:${REDIS_PASSWORD}@localhost:6379"
    echo ""
    echo -e "${YELLOW}Important:${NC}"
    echo "  1. Save your credentials securely!"
    echo "  2. Configure your DNS to point ${DOMAIN} to this server"
    echo "  3. Access the application at https://${DOMAIN}"
    echo "  4. Default admin will be created on first run (check logs)"
    echo ""
    echo -e "${BLUE}Useful commands:${NC}"
    echo "  View logs:     docker compose logs -f app"
    echo "  Restart:       docker compose restart"
    echo "  Stop:          docker compose down"
    echo "  Update:        git pull && docker compose build app && docker compose up -d"
    echo "  Backup DB:     docker compose exec postgres pg_dump -U postgres aca_ticketops > backup.sql"
    echo ""
}

# Main deployment flow
main() {
    print_header
    validate_params

    print_info "Starting deployment for provider: ${CLOUD_PROVIDER}"
    print_info "Domain: ${DOMAIN:-local}"

    create_env_file
    create_docker_override
    create_nginx_config

    if [[ "$CLOUD_PROVIDER" != "local" ]]; then
        setup_ssl
    fi

    deploy_app
    wait_for_services
    print_summary
}

# Run main
main "$@"