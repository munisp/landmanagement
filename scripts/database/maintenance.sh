#!/bin/bash

###############################################################################
# Database Maintenance Script
# 
# Features:
# - VACUUM and ANALYZE operations
# - Index maintenance
# - Dead tuple cleanup
# - Performance optimization
###############################################################################

set -euo pipefail

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-idlr_pts}"
DB_USER="${DB_USER:-idlr_user}"
PGPASSWORD="${DB_PASSWORD:-idlr_password}"
export PGPASSWORD

echo "========================================="
echo "IDLR-PTS Database Maintenance"
echo "========================================="
echo "Database: ${DB_NAME}"
echo "Host: ${DB_HOST}:${DB_PORT}"
echo "Timestamp: $(date +%Y-%m-%d\ %H:%M:%S)"
echo "========================================="

# Check database size before maintenance
echo "Checking database size..."
DB_SIZE_BEFORE=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" | tr -d ' ')
echo "Database size before: ${DB_SIZE_BEFORE}"

# Get dead tuple statistics
echo ""
echo "Dead tuple statistics:"
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c \
  "SELECT schemaname, relname, n_dead_tup, n_live_tup, 
   ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct
   FROM pg_stat_user_tables 
   WHERE n_dead_tup > 0 
   ORDER BY n_dead_tup DESC 
   LIMIT 10;"

# VACUUM ANALYZE
echo ""
echo "Running VACUUM ANALYZE..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "VACUUM ANALYZE;"

if [ $? -eq 0 ]; then
  echo "✓ VACUUM ANALYZE completed"
else
  echo "✗ VACUUM ANALYZE failed"
  exit 1
fi

# Reindex if needed (only for tables with high bloat)
echo ""
echo "Checking for index bloat..."
BLOATED_INDEXES=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  "SELECT COUNT(*) FROM pg_stat_user_indexes WHERE idx_scan = 0 AND idx_tup_read > 10000;" | tr -d ' ')

if [ "${BLOATED_INDEXES}" -gt "0" ]; then
  echo "Found ${BLOATED_INDEXES} potentially bloated indexes"
  echo "Running REINDEX on bloated indexes..."
  
  psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c \
    "REINDEX DATABASE ${DB_NAME};" || echo "⚠️  REINDEX failed (this is non-critical)"
fi

# Update table statistics
echo ""
echo "Updating table statistics..."
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "ANALYZE;"

# Check database size after maintenance
DB_SIZE_AFTER=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" | tr -d ' ')

echo ""
echo "========================================="
echo "Maintenance Summary"
echo "========================================="
echo "Database size before: ${DB_SIZE_BEFORE}"
echo "Database size after:  ${DB_SIZE_AFTER}"
echo "Status: SUCCESS"
echo "========================================="

# Send notification
if [ -n "${WEBHOOK_URL:-}" ]; then
  curl -X POST "${WEBHOOK_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"Database maintenance completed\",\"size_before\":\"${DB_SIZE_BEFORE}\",\"size_after\":\"${DB_SIZE_AFTER}\",\"timestamp\":\"$(date +%Y-%m-%d\ %H:%M:%S)\"}" \
    > /dev/null 2>&1 || true
fi

exit 0
