-- Database Initialization Script for IDLR-PTS Platform
-- This script runs automatically when PostgreSQL container starts

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Configure pg_stat_statements
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET pg_stat_statements.track = 'all';
ALTER SYSTEM SET pg_stat_statements.max = 10000;

-- Create read-only user for monitoring
CREATE USER idlr_readonly WITH PASSWORD 'readonly_password';
GRANT CONNECT ON DATABASE idlr_pts_staging TO idlr_readonly;
GRANT USAGE ON SCHEMA public TO idlr_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO idlr_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO idlr_readonly;

-- Create backup user
CREATE USER idlr_backup WITH PASSWORD 'backup_password';
GRANT CONNECT ON DATABASE idlr_pts_staging TO idlr_backup;
GRANT USAGE ON SCHEMA public TO idlr_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO idlr_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO idlr_backup;

-- Performance tuning
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;
ALTER SYSTEM SET work_mem = '10MB';
ALTER SYSTEM SET min_wal_size = '1GB';
ALTER SYSTEM SET max_wal_size = '4GB';

-- Logging configuration
ALTER SYSTEM SET log_destination = 'stderr';
ALTER SYSTEM SET logging_collector = on;
ALTER SYSTEM SET log_directory = 'pg_log';
ALTER SYSTEM SET log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log';
ALTER SYSTEM SET log_rotation_age = '1d';
ALTER SYSTEM SET log_rotation_size = '100MB';
ALTER SYSTEM SET log_min_duration_statement = 1000;
ALTER SYSTEM SET log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ';
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_connections = on;
ALTER SYSTEM SET log_disconnections = on;
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET log_temp_files = 0;
ALTER SYSTEM SET log_autovacuum_min_duration = 0;

-- Reload configuration
SELECT pg_reload_conf();

-- Display installed extensions
SELECT * FROM pg_extension;

-- Display configuration
SHOW shared_preload_libraries;
SHOW max_connections;
SHOW shared_buffers;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Database initialization completed successfully';
  RAISE NOTICE 'Extensions installed: uuid-ossp, postgis, pg_trgm, pg_stat_statements';
  RAISE NOTICE 'Users created: idlr_readonly, idlr_backup';
  RAISE NOTICE 'Performance tuning applied';
END $$;
