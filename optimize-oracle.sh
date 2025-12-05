#!/bin/bash

# Oracle Cloud Free Tier Optimization Script
# This script optimizes the VPS for running on 1GB RAM

set -e

echo "🔧 Optimizing for Oracle Cloud Free Tier (1GB RAM)..."

# 1. Add swap space (2GB)
echo "💾 Adding 2GB swap space..."
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2. Adjust swappiness
echo "⚙️ Adjusting swappiness..."
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 3. Optimize PostgreSQL for low memory
echo "🗄️ Optimizing PostgreSQL..."
sudo tee -a /etc/postgresql/*/main/postgresql.conf << EOF

# Oracle Cloud Free Tier Optimizations
shared_buffers = 128MB
effective_cache_size = 512MB
maintenance_work_mem = 64MB
work_mem = 4MB
max_connections = 20
EOF

sudo systemctl restart postgresql

# 4. Set PM2 max memory restart
echo "⚙️ Configuring PM2 memory limit..."
# This is already in ecosystem.config.js (500MB)

# 5. Enable automatic security updates
echo "🔒 Enabling automatic security updates..."
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# 6. Install monitoring tools
echo "📊 Installing monitoring tools..."
sudo apt install -y htop iotop

echo ""
echo "✅ Optimization completed!"
echo ""
echo "Memory status:"
free -h
echo ""
echo "Swap status:"
swapon --show
echo ""
echo "To monitor resources:"
echo "  htop          - Interactive process viewer"
echo "  free -h       - Memory usage"
echo "  df -h         - Disk usage"
echo "  pm2 monit     - PM2 monitoring"
