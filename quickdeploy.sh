#!/bin/bash

# Quick deployment script for Oracle Cloud / VPS
# This script combines setup + deploy in one command

set -e

echo "🚀 Resto Management Backend - Automated Deployment"
echo "=================================================="

# Check if this is first run
if [ ! -d "node_modules" ]; then
    echo "📦 First time setup detected..."
    
    # Install dependencies
    echo "📦 Installing dependencies..."
    npm ci
    
    # Generate Prisma Client
    echo "🔨 Generating Prisma Client..."
    npx prisma generate
    
    # Run migrations
    echo "🗄️ Running database migrations..."
    npx prisma migrate deploy
    
    # Build
    echo "🏗️ Building application..."
    npm run build
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo "⚠️ PM2 not found. Installing globally..."
        npm install -g pm2
    fi
    
    # Start with PM2
    echo "🚀 Starting application with PM2..."
    pm2 start ecosystem.config.js --env production
    pm2 save
    
    echo ""
    echo "✅ Initial deployment completed!"
    echo ""
    echo "Next steps:"
    echo "1. Configure Nginx reverse proxy (see nginx.conf)"
    echo "2. Setup SSL with: sudo certbot --nginx -d yourdomain.com"
    echo "3. Configure firewall: sudo ufw allow 80/tcp && sudo ufw allow 443/tcp"
    echo ""
    echo "Useful commands:"
    echo "  pm2 status       - View app status"
    echo "  pm2 logs         - View logs"
    echo "  pm2 restart all  - Restart app"
    
else
    # Update deployment
    echo "🔄 Updating existing deployment..."
    
    # Pull latest changes
    if [ -d ".git" ]; then
        echo "📥 Pulling latest code..."
        git pull origin master || git pull origin main
    fi
    
    # Install/update dependencies
    echo "📦 Installing dependencies..."
    npm ci
    
    # Generate Prisma Client
    echo "🔨 Generating Prisma Client..."
    npx prisma generate
    
    # Run migrations
    echo "🗄️ Running database migrations..."
    npx prisma migrate deploy
    
    # Build
    echo "🏗️ Building application..."
    npm run build
    
    # Restart PM2
    echo "🔄 Restarting application..."
    pm2 restart ecosystem.config.js --env production
    
    echo ""
    echo "✅ Update completed successfully!"
    echo ""
    pm2 status
fi
