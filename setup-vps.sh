#!/bin/bash

# Initial VPS Setup Script
# Run this script once on a fresh VPS (Ubuntu/Debian)

set -e

echo "🔧 Setting up VPS for NestJS application..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 (using NodeSource)
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
echo "🗄️ Installing PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

# Install PM2 globally
echo "⚙️ Installing PM2..."
sudo npm install -g pm2

# Install Git
echo "📦 Installing Git..."
sudo apt install -y git

# Install Nginx (optional, for reverse proxy)
echo "🌐 Installing Nginx..."
sudo apt install -y nginx

# Configure PostgreSQL
echo "🗄️ Configuring PostgreSQL..."
sudo -u postgres psql << EOF
CREATE DATABASE resto_management;
CREATE USER resto_user WITH ENCRYPTED PASSWORD 'changeme123';
GRANT ALL PRIVILEGES ON DATABASE resto_management TO resto_user;
\q
EOF

# Create app directory
echo "📁 Creating application directory..."
sudo mkdir -p /var/www/resto-backend
sudo chown -R $USER:$USER /var/www/resto-backend

# Setup firewall
echo "🔥 Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Setup PM2 startup script
echo "⚙️ Setting up PM2 startup..."
pm2 startup systemd -u $USER --hp /home/$USER

echo "✅ VPS setup completed!"
echo ""
echo "Next steps:"
echo "1. Clone your repository to /var/www/resto-backend"
echo "2. Copy .env.production to .env and configure it"
echo "3. Run: npm install"
echo "4. Run: npx prisma migrate deploy"
echo "5. Run: npm run build"
echo "6. Run: pm2 start ecosystem.config.js --env production"
echo "7. Run: pm2 save"
echo "8. Configure Nginx reverse proxy (see nginx.conf)"
