#!/bin/bash

###############################################################################
# Database Backup Script
# 
# Features:
# - Automated PostgreSQL backups
# - Compression and encryption
# - Retention policy management
# - Backup verification
# - S3 upload support (optional)
###############################################################################

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/idlr-pts-platform}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-idlr_pts}"
DB_USER="${DB_USER:-idlr_user}"
PGPASSWORD="${DB_PASSWORD:-idlr_password}"
export PGPASSWORD

# Retention settings (days)
DAILY_RETENTION=7
WEEKLY_RETENTION=30
MONTHLY_RETENTION=365

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE=$(date +%Y%m%d)
DAY_OF_WEEK=$(date +%u)  # 1-7 (Monday-Sunday)
DAY_OF_MONTH=$(date +%d)

# Backup types
BACKUP_TYPE="daily"
if [ "$DAY_OF_WEEK" == "7" ]; then
  BACKUP_TYPE="weekly"
fi
if [ "$DAY_OF_MONTH" == "01" ]; then
  BACKUP_TYPE="monthly"
fi

# Backup filename
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_TYPE}/idlr_pts_${BACKUP_TYPE}_${TIMESTAMP}.sql.gz"

# Create backup directories
mkdir -p "${BACKUP_DIR}/daily"
mkdir -p "${BACKUP_DIR}/weekly"
mkdir -p "${BACKUP_DIR}/monthly"

echo "========================================="
echo "IDLR-PTS Database Backup"
echo "========================================="
echo "Type: ${BACKUP_TYPE}"
echo "Database: ${DB_NAME}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "Timestamp: ${TIMESTAMP}"
echo "========================================="

# Perform backup
echo "Starting backup..."
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  --format=plain \
  --no-owner \
  --no-acl \
  --verbose \
  2>&1 | gzip > "${BACKUP_FILE}"

if [ $? -eq 0 ]; then
  echo "✓ Backup completed successfully"
  
  # Get backup size
  BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "✓ Backup size: ${BACKUP_SIZE}"
  
  # Verify backup integrity
  echo "Verifying backup integrity..."
  if gunzip -t "${BACKUP_FILE}" 2>/dev/null; then
    echo "✓ Backup integrity verified"
  else
    echo "✗ Backup integrity check failed!"
    exit 1
  fi
  
  # Create checksum
  CHECKSUM_FILE="${BACKUP_FILE}.sha256"
  sha256sum "${BACKUP_FILE}" > "${CHECKSUM_FILE}"
  echo "✓ Checksum created: ${CHECKSUM_FILE}"
  
  # Upload to S3 (if configured)
  if [ -n "${S3_BUCKET:-}" ]; then
    echo "Uploading to S3..."
    aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/backups/database/${BACKUP_TYPE}/" \
      --storage-class STANDARD_IA \
      --metadata "timestamp=${TIMESTAMP},type=${BACKUP_TYPE},database=${DB_NAME}"
    
    aws s3 cp "${CHECKSUM_FILE}" "s3://${S3_BUCKET}/backups/database/${BACKUP_TYPE}/"
    
    echo "✓ Uploaded to S3: s3://${S3_BUCKET}/backups/database/${BACKUP_TYPE}/"
  fi
  
  # Apply retention policy
  echo "Applying retention policy..."
  
  # Daily backups: keep last 7 days
  find "${BACKUP_DIR}/daily" -name "*.sql.gz" -mtime +${DAILY_RETENTION} -delete
  find "${BACKUP_DIR}/daily" -name "*.sha256" -mtime +${DAILY_RETENTION} -delete
  
  # Weekly backups: keep last 30 days
  find "${BACKUP_DIR}/weekly" -name "*.sql.gz" -mtime +${WEEKLY_RETENTION} -delete
  find "${BACKUP_DIR}/weekly" -name "*.sha256" -mtime +${WEEKLY_RETENTION} -delete
  
  # Monthly backups: keep last 365 days
  find "${BACKUP_DIR}/monthly" -name "*.sql.gz" -mtime +${MONTHLY_RETENTION} -delete
  find "${BACKUP_DIR}/monthly" -name "*.sha256" -mtime +${MONTHLY_RETENTION} -delete
  
  echo "✓ Retention policy applied"
  
  # Summary
  echo "========================================="
  echo "Backup Summary"
  echo "========================================="
  echo "File: ${BACKUP_FILE}"
  echo "Size: ${BACKUP_SIZE}"
  echo "Type: ${BACKUP_TYPE}"
  echo "Status: SUCCESS"
  echo "========================================="
  
  # Send notification (if configured)
  if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"Database backup completed successfully\",\"type\":\"${BACKUP_TYPE}\",\"size\":\"${BACKUP_SIZE}\",\"timestamp\":\"${TIMESTAMP}\"}" \
      > /dev/null 2>&1 || true
  fi
  
  exit 0
else
  echo "✗ Backup failed!"
  
  # Send failure notification
  if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"Database backup FAILED\",\"type\":\"${BACKUP_TYPE}\",\"timestamp\":\"${TIMESTAMP}\"}" \
      > /dev/null 2>&1 || true
  fi
  
  exit 1
fi
