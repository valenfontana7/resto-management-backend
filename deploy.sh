#!/bin/bash

# Deployment script for VPS
# Usage: ./deploy.sh

set -e

echo "🚀 Starting deployment..."

# Pull latest changes
echo "📥 Pulling latest code..."
git pull origin master

# Prefer Docker Compose v2 if available
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
else
  COMPOSE="docker-compose"
fi

# Prefer production compose file when present
COMPOSE_FILE=""
if [ -f docker-compose.prod.yml ]; then
  COMPOSE_FILE="docker-compose.prod.yml"
elif [ -f docker-compose.yml ]; then
  COMPOSE_FILE="docker-compose.yml"
fi

# If docker compose exists, prefer containerized flow
if [ -n "$COMPOSE_FILE" ]; then
  echo "📦 Using Docker Compose flow ($COMPOSE_FILE)"

  # Ensure DB is up
  echo "📥 Pulling latest images..."
  $COMPOSE -f "$COMPOSE_FILE" pull || true

  echo "⬆️ Starting database container..."
  $COMPOSE -f "$COMPOSE_FILE" up -d db

  echo "⏳ Waiting for Postgres to be ready..."
  # Wait until pg_isready returns success
  until docker exec resto-postgres pg_isready -U "${POSTGRES_USER:-resto_user}" -d "${POSTGRES_DB:-resto_db}" >/dev/null 2>&1; do
    echo -n '.'; sleep 1
  done
  echo " OK"

  echo "🔨 Building app image..."
  $COMPOSE -f "$COMPOSE_FILE" build app

  echo "🗄️ Running database migrations inside app container..."
  $COMPOSE -f "$COMPOSE_FILE" run --rm app npx prisma migrate deploy --schema=/app/prisma/schema.prisma

  echo "⬆️ Starting (or restarting) app container..."
  $COMPOSE -f "$COMPOSE_FILE" up -d --no-deps --build app
else
  # Host-based fallback
  echo "📦 Installing dependencies..."
  npm ci

  echo "🔨 Generating Prisma Client..."
  npx prisma generate

  echo "🗄️ Running database migrations (host)..."
  # If DATABASE_URL points to 'db', override to localhost when running from host
  if echo "${DATABASE_URL:-}" | grep -q "@db:"; then
    export DATABASE_URL="${DATABASE_URL//@db:/@localhost:}"
    echo "Using DATABASE_URL with localhost for host-side migrations"
  fi
  npx prisma migrate deploy --schema=prisma/schema.prisma

  echo "🏗️ Building application..."
  npm run build

  echo "🔄 Restarting application..."
  pm2 restart ecosystem.config.js --env production
fi

# Show status
if command -v pm2 >/dev/null 2>&1; then
  pm2 status || true
fi

echo "✅ Deployment completed successfully!"
