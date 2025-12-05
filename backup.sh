# Backup script for production database
# Run with: ./backup.sh

#!/bin/bash

set -e

# Configuration
BACKUP_DIR="/var/backups/resto-management"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="resto_management"
DB_USER="resto_user"
RETENTION_DAYS=7

echo "🗄️ Starting database backup..."

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Backup database
echo "📦 Backing up database..."
PGPASSWORD=$POSTGRES_PASSWORD pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Backup uploads folder
echo "📁 Backing up uploads..."
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz uploads/

# Remove old backups
echo "🧹 Cleaning old backups (>$RETENTION_DAYS days)..."
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +$RETENTION_DAYS -delete

# List backups
echo ""
echo "✅ Backup completed!"
echo ""
echo "Available backups:"
ls -lh $BACKUP_DIR

# Optional: Upload to cloud storage
# Uncomment and configure for your cloud provider
# rclone copy $BACKUP_DIR/backup_$DATE.sql.gz remote:backups/
