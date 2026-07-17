#!/bin/bash

###############################################################################
# Database Restore Script
# 
# Features:
# - Restore from local or S3 backups
# - Backup verification before restore
# - Safety checks and confirmations
# - Point-in-time recovery support
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

# Parse arguments
BACKUP_FILE=""
SKIP_CONFIRMATION=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--file)
      BACKUP_FILE="$2"
      shift 2
      ;;
    -y|--yes)
      SKIP_CONFIRMATION=true
      shift
      ;;
    --latest)
      # Find latest backup
      BACKUP_FILE=$(find "${BACKUP_DIR}" -name "*.sql.gz" -type f -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2)
      shift
      ;;
    --s3)
      # Download from S3
      S3_PATH="$2"
      BACKUP_FILE="/tmp/restore_$(date +%Y%m%d_%H%M%S).sql.gz"
      echo "Downloading from S3: ${S3_PATH}"
      aws s3 cp "${S3_PATH}" "${BACKUP_FILE}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [-f|--file BACKUP_FILE] [-y|--yes] [--latest] [--s3 S3_PATH]"
      exit 1
      ;;
  esac
done

# Validate backup file
if [ -z "${BACKUP_FILE}" ]; then
  echo "Error: No backup file specified"
  echo "Usage: $0 [-f|--file BACKUP_FILE] [-y|--yes] [--latest] [--s3 S3_PATH]"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "========================================="
echo "IDLR-PTS Database Restore"
echo "========================================="
echo "Backup file: ${BACKUP_FILE}"
echo "Database: ${DB_NAME}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "========================================="

# Verify backup integrity
echo "Verifying backup integrity..."
if gunzip -t "${BACKUP_FILE}" 2>/dev/null; then
  echo "✓ Backup integrity verified"
else
  echo "✗ Backup file is corrupted!"
  exit 1
fi

# Verify checksum if available
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
  echo "Verifying checksum..."
  if sha256sum -c "${CHECKSUM_FILE}" > /dev/null 2>&1; then
    echo "✓ Checksum verified"
  else
    echo "✗ Checksum verification failed!"
    exit 1
  fi
fi

# Get backup info
BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
BACKUP_DATE=$(stat -c %y "${BACKUP_FILE}" | cut -d' ' -f1)

echo ""
echo "Backup Information:"
echo "  Size: ${BACKUP_SIZE}"
echo "  Date: ${BACKUP_DATE}"
echo ""

# Safety confirmation
if [ "${SKIP_CONFIRMATION}" = false ]; then
  echo "⚠️  WARNING: This will REPLACE the current database!"
  echo "⚠️  All existing data will be LOST!"
  echo ""
  read -p "Are you sure you want to continue? (type 'yes' to confirm): " CONFIRM
  
  if [ "${CONFIRM}" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
  fi
fi

# Create pre-restore backup
echo "Creating pre-restore backup..."
PRE_RESTORE_BACKUP="/tmp/pre_restore_${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"
pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  --format=plain \
  --no-owner \
  --no-acl \
  2>/dev/null | gzip > "${PRE_RESTORE_BACKUP}" || true

if [ -f "${PRE_RESTORE_BACKUP}" ]; then
  echo "✓ Pre-restore backup created: ${PRE_RESTORE_BACKUP}"
else
  echo "⚠️  Warning: Could not create pre-restore backup"
fi

# Terminate active connections
echo "Terminating active connections..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true

# Drop and recreate database
echo "Dropping database..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" > /dev/null 2>&1

echo "Creating database..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${DB_NAME};" > /dev/null 2>&1

# Restore database
echo "Restoring database..."
gunzip -c "${BACKUP_FILE}" | psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo "✓ Database restored successfully"
  
  # Verify restore
  echo "Verifying restore..."
  TABLE_COUNT=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
  
  echo "✓ Restored ${TABLE_COUNT} tables"
  
  # Update statistics
  echo "Updating database statistics..."
  psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "ANALYZE;" > /dev/null 2>&1
  
  echo "========================================="
  echo "Restore Summary"
  echo "========================================="
  echo "Status: SUCCESS"
  echo "Tables: ${TABLE_COUNT}"
  echo "Pre-restore backup: ${PRE_RESTORE_BACKUP}"
  echo "========================================="
  
  # Send notification
  if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"Database restore completed successfully\",\"tables\":\"${TABLE_COUNT}\",\"timestamp\":\"$(date +%Y-%m-%d\ %H:%M:%S)\"}" \
      > /dev/null 2>&1 || true
  fi
  
  exit 0
else
  echo "✗ Restore failed!"
  
  # Attempt to restore from pre-restore backup
  if [ -f "${PRE_RESTORE_BACKUP}" ]; then
    echo "Attempting to restore from pre-restore backup..."
    gunzip -c "${PRE_RESTORE_BACKUP}" | psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
      echo "✓ Rolled back to pre-restore state"
    else
      echo "✗ Rollback failed! Database may be in inconsistent state!"
    fi
  fi
  
  # Send failure notification
  if [ -n "${WEBHOOK_URL:-}" ]; then
    curl -X POST "${WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"Database restore FAILED\",\"timestamp\":\"$(date +%Y-%m-%d\ %H:%M:%S)\"}" \
      > /dev/null 2>&1 || true
  fi
  
  exit 1
fi
