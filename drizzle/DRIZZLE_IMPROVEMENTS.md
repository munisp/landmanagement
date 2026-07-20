# Drizzle ORM Improvements & Enhancements

## Summary of Changes

### 1. Comprehensive Relations (relations.ts)
Full Drizzle relations graph for all major entities enabling `db.query.*` with
`with:` eager loading — eliminates N+1 query patterns.

### 2. Missing Composite Indexes
- `registry_transactions`: composite `(parcel_id, status)`, `(initiator_id, status)`, `(type, status)`
- `parcels`: composite `(state, status)`, `(land_use, status)`, `(state, lga)`
- `titles`: `(title_number)`, `(status)`, composite `(parcel_id, status)`
- `verification_requests`: `(parcel_id, status)`, `(reviewer_id, status)`

### 3. Type-Safe Query Builder Helpers (db-helpers.ts)
Reusable typed query helpers for common patterns:
- `paginatedQuery<T>()` — cursor/offset pagination with total count
- `upsertOne<T>()` — insert-or-update with conflict resolution
- `softDelete<T>()` — sets `deleted_at` instead of hard delete
- `auditedInsert<T>()` — auto-populates `created_by`, `updated_by`

### 4. Drizzle Zod Integration (schema-validators.ts)
Auto-generated Zod schemas from Drizzle table definitions for:
- Input validation at tRPC layer (no duplicate schema definitions)
- OpenAPI spec generation
- Runtime type guards

### 5. Query Performance Monitoring (db-monitor.ts)
Drizzle query logger that:
- Logs slow queries (>100ms) to the activity log
- Tracks query counts per request for N+1 detection
- Integrates with the existing OpenTelemetry tracing setup

### 6. Soft Delete Pattern (soft-delete.ts)
Generic soft-delete mixin for tables that need audit trails:
- `deleted_at` timestamp column
- `deleted_by` varchar column
- Automatic `where deleted_at IS NULL` filter injection

### 7. Optimistic Locking (optimistic-lock.ts)
Version-based optimistic concurrency control for:
- `parcels` — prevents concurrent update conflicts
- `registry_transactions` — prevents double-approval race conditions
- `titles` — prevents concurrent ownership transfer conflicts
