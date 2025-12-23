#!/bin/bash

# Deployment script for VPS
# Usage: ./deploy.sh

set -e

echo "🚀 Starting deployment..."

# Pull latest changes
echo "📥 Pulling latest code..."
git pull origin master

# If docker-compose exists, prefer containerized flow
if [ -f docker-compose.yml ]; then
  echo "📦 Using Docker Compose flow"

  # Ensure DB is up
  echo "📥 Pulling latest images..."
  docker-compose pull || true

  echo "⬆️ Starting database container..."
  docker-compose up -d db

  echo "⏳ Waiting for Postgres to be ready..."
  # Wait until pg_isready returns success
  until docker exec resto-postgres pg_isready -U "${POSTGRES_USER:-resto_user}" -d "${POSTGRES_DB:-resto_db}" >/dev/null 2>&1; do
    echo -n '.'; sleep 1
  done
  echo " OK"

  echo "🔨 Building app image..."
  docker-compose build app

  echo "🗄️ Running database migrations inside app container..."
  docker-compose run --rm app npx prisma migrate deploy --schema=prisma/schema.prisma

  echo "⬆️ Starting (or restarting) app container..."
  docker-compose up -d --no-deps --build app
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
