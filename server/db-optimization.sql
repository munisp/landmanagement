-- Database Optimization Script for IDLR Platform
-- Indexes, partitioning, and performance tuning

-- ============================================
-- INDEXES FOR PARCELS TABLE
-- ============================================

-- Composite index for common search patterns
CREATE INDEX IF NOT EXISTS idx_parcels_state_lga ON parcels(state, lga);
CREATE INDEX IF NOT EXISTS idx_parcels_owner_state ON parcels(owner_id, state);
CREATE INDEX IF NOT EXISTS idx_parcels_landuse_state ON parcels(land_use_type, state);

-- Geospatial index for location-based queries
CREATE INDEX IF NOT EXISTS idx_parcels_location ON parcels(latitude, longitude);

-- Full-text search index for parcel search
CREATE INDEX IF NOT EXISTS idx_parcels_search ON parcels USING GIN(
    to_tsvector('english', coalesce(parcel_id, '') || ' ' || 
                           coalesce(owner_name, '') || ' ' ||
                           coalesce(address, ''))
);

-- Index for value-based queries
CREATE INDEX IF NOT EXISTS idx_parcels_value ON parcels(estimated_value) WHERE estimated_value IS NOT NULL;

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(status);

-- Covering index for list views
CREATE INDEX IF NOT EXISTS idx_parcels_list ON parcels(created_at DESC, parcel_id) 
    INCLUDE (owner_name, land_area, estimated_value, state, lga);

-- ============================================
-- INDEXES FOR TRANSACTIONS TABLE
-- ============================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transactions_parcel_type ON transactions(parcel_id, transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_owner_status ON transactions(from_owner, status);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(transaction_date, transaction_type);

-- Index for pending transactions
CREATE INDEX IF NOT EXISTS idx_transactions_pending ON transactions(status, created_at) 
    WHERE status = 'pending';

-- Index for amount-based queries
CREATE INDEX IF NOT EXISTS idx_transactions_amount ON transactions(amount) WHERE amount IS NOT NULL;

-- Covering index for transaction history
CREATE INDEX IF NOT EXISTS idx_transactions_history ON transactions(parcel_id, transaction_date DESC)
    INCLUDE (transaction_type, from_owner, to_owner, amount, status);

-- ============================================
-- INDEXES FOR DOCUMENTS TABLE
-- ============================================

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_documents_parcel_type ON documents(parcel_id, document_type);
CREATE INDEX IF NOT EXISTS idx_documents_transaction ON documents(transaction_id) WHERE transaction_id IS NOT NULL;

-- Full-text search for documents
CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING GIN(
    to_tsvector('english', coalesce(filename, '') || ' ' || 
                           coalesce(description, ''))
);

-- Index for recent documents
CREATE INDEX IF NOT EXISTS idx_documents_recent ON documents(uploaded_at DESC);

-- ============================================
-- INDEXES FOR USERS TABLE
-- ============================================

-- Unique index on email (if not already exists)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Index for active users
CREATE INDEX IF NOT EXISTS idx_users_active ON users(created_at) WHERE role IS NOT NULL;

-- ============================================
-- INDEXES FOR NOTIFICATIONS TABLE
-- ============================================

-- Composite index for user notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, created_at DESC) 
    WHERE is_read = false;

-- ============================================
-- TABLE PARTITIONING
-- ============================================

-- Partition transactions table by year
-- Note: This requires converting existing table to partitioned table
-- Run this on a new deployment or during maintenance window

-- CREATE TABLE transactions_partitioned (
--     LIKE transactions INCLUDING ALL
-- ) PARTITION BY RANGE (transaction_date);

-- CREATE TABLE transactions_2024 PARTITION OF transactions_partitioned
--     FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

-- CREATE TABLE transactions_2025 PARTITION OF transactions_partitioned
--     FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- CREATE TABLE transactions_2026 PARTITION OF transactions_partitioned
--     FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- ============================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================

-- Parcel statistics by state
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_parcel_stats_by_state AS
SELECT 
    state,
    lga,
    land_use_type,
    COUNT(*) as total_parcels,
    SUM(land_area) as total_land_area,
    AVG(land_area) as avg_land_area,
    SUM(estimated_value) as total_value,
    AVG(estimated_value) as avg_value,
    COUNT(DISTINCT owner_id) as unique_owners
FROM parcels
WHERE status = 'active'
GROUP BY state, lga, land_use_type;

CREATE UNIQUE INDEX ON mv_parcel_stats_by_state(state, lga, land_use_type);

-- Transaction statistics by month
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_transaction_stats_monthly AS
SELECT 
    DATE_TRUNC('month', transaction_date) as month,
    state,
    transaction_type,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount,
    COUNT(DISTINCT parcel_id) as unique_parcels
FROM transactions
WHERE status = 'completed'
GROUP BY DATE_TRUNC('month', transaction_date), state, transaction_type;

CREATE UNIQUE INDEX ON mv_transaction_stats_monthly(month, state, transaction_type);

-- ============================================
-- REFRESH MATERIALIZED VIEWS
-- ============================================

-- Schedule these to run daily via cron or pg_cron
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_parcel_stats_by_state;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_transaction_stats_monthly;

-- ============================================
-- QUERY OPTIMIZATION SETTINGS
-- ============================================

-- Increase shared buffers (25% of RAM)
-- ALTER SYSTEM SET shared_buffers = '4GB';

-- Increase effective cache size (50-75% of RAM)
-- ALTER SYSTEM SET effective_cache_size = '12GB';

-- Increase work memory for sorting/hashing
-- ALTER SYSTEM SET work_mem = '64MB';

-- Increase maintenance work memory for VACUUM, CREATE INDEX
-- ALTER SYSTEM SET maintenance_work_mem = '1GB';

-- Enable parallel query execution
-- ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
-- ALTER SYSTEM SET max_parallel_workers = 8;

-- Optimize checkpoint settings
-- ALTER SYSTEM SET checkpoint_completion_target = 0.9;
-- ALTER SYSTEM SET wal_buffers = '16MB';
-- ALTER SYSTEM SET min_wal_size = '1GB';
-- ALTER SYSTEM SET max_wal_size = '4GB';

-- Enable query plan caching
-- ALTER SYSTEM SET plan_cache_mode = 'auto';

-- ============================================
-- CONNECTION POOLING CONFIGURATION
-- ============================================

-- PgBouncer configuration (add to pgbouncer.ini)
-- [databases]
-- idlr = host=localhost port=5432 dbname=idlr
-- 
-- [pgbouncer]
-- pool_mode = transaction
-- max_client_conn = 1000
-- default_pool_size = 25
-- reserve_pool_size = 5
-- reserve_pool_timeout = 3
-- max_db_connections = 100
-- max_user_connections = 100

-- ============================================
-- VACUUM AND ANALYZE SCHEDULE
-- ============================================

-- Schedule autovacuum more aggressively for high-traffic tables
ALTER TABLE parcels SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

ALTER TABLE transactions SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);

-- ============================================
-- TABLE STATISTICS
-- ============================================

-- Update statistics for query planner
ANALYZE parcels;
ANALYZE transactions;
ANALYZE documents;
ANALYZE users;
ANALYZE notifications;

-- ============================================
-- MONITORING QUERIES
-- ============================================

-- Find slow queries
-- SELECT query, calls, total_time, mean_time, max_time
-- FROM pg_stat_statements
-- ORDER BY mean_time DESC
-- LIMIT 20;

-- Find missing indexes
-- SELECT schemaname, tablename, attname, n_distinct, correlation
-- FROM pg_stats
-- WHERE schemaname = 'public'
--   AND n_distinct > 100
--   AND correlation < 0.1;

-- Check index usage
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan ASC;

-- Check table bloat
-- SELECT schemaname, tablename, 
--        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================
-- BACKUP CONFIGURATION
-- ============================================

-- Continuous archiving (add to postgresql.conf)
-- wal_level = replica
-- archive_mode = on
-- archive_command = 'cp %p /var/lib/postgresql/archive/%f'
-- archive_timeout = 300

-- Point-in-time recovery setup
-- CREATE DATABASE idlr_backup TEMPLATE idlr;

COMMIT;
