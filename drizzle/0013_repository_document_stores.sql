-- Migration 0013: PostgreSQL document stores for the secondary feature
-- repositories that previously persisted to JSON files under server/data/
-- or kept process-local in-memory state. Each repository collection is stored
-- as one JSONB document row, keyed by collection name. Writes upsert the full
-- collection document, which preserves the exact store semantics (including
-- id counters) the repositories were built around — now durable, transactional
-- and shared across server instances.
CREATE TABLE IF NOT EXISTS "repository_stores" (
	"collection" varchar(128) PRIMARY KEY,
	"data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
