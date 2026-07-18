-- Migration 0015: Seed the verification workflow with the same baseline
-- records the legacy JSON store bootstrapped on first run, so a fresh
-- database serves identical domain content through the relational tables.
-- Also seeds the user accounts those records reference (FK integrity).

INSERT INTO "users" ("id", "openId", "name", "email", "loginMethod", "role", "createdAt", "updatedAt", "lastSignedIn") OVERRIDING SYSTEM VALUE VALUES
	(1, 'seed-user-registry-admin', 'Registry Administrator', 'admin@idlr.example.ng', 'seed', 'admin', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
	(101, 'seed-user-amina-bello', 'Amina Bello', 'amina.bello@example.ng', 'seed', 'user', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
	(102, 'seed-user-chinedu-okafor', 'Chinedu Okafor', 'chinedu.okafor@example.ng', 'seed', 'user', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
	(103, 'seed-user-musa-garba', 'Musa Garba', 'musa.garba@example.ng', 'seed', 'user', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
	(900, 'seed-reviewer-registry', 'Registry Reviewer', 'reviewer@idlr.example.ng', 'seed', 'registrar', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z'),
	(901, 'seed-reviewer-senior-registrar', 'Senior Registrar', 'senior.registrar@idlr.example.ng', 'seed', 'registrar', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

INSERT INTO "verification_requests" ("id", "parcel_id", "requester_id", "reviewer_id", "status", "submitted_at", "reviewed_at", "approved_at", "rejected_at", "rejection_reason", "blockchain_tx_hash", "notes", "metadata", "created_at", "updated_at") OVERRIDING SYSTEM VALUE VALUES
	(1, 'LG-VI-2024-001', 101, NULL, 'submitted', '2024-03-11T10:00:00.000Z', NULL, NULL, NULL, NULL, NULL, 'Request awaiting reviewer assignment.', '{}', '2024-03-10T09:00:00.000Z', '2024-03-11T10:00:00.000Z'),
	(2, 'AB-FCT-2024-002', 102, 900, 'approved', '2024-02-10T10:00:00.000Z', '2024-02-12T11:00:00.000Z', '2024-02-12T11:00:00.000Z', NULL, NULL, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Approved after document and boundary review.', '{}', '2024-02-09T09:00:00.000Z', '2024-02-12T11:00:00.000Z'),
	(3, 'KN-KN-2024-003', 103, 901, 'rejected', '2024-03-04T10:00:00.000Z', '2024-03-05T14:00:00.000Z', NULL, '2024-03-05T14:00:00.000Z', 'Incomplete supporting survey documentation', NULL, 'Incomplete cadastral survey package provided.', '{}', '2024-03-03T09:00:00.000Z', '2024-03-05T14:00:00.000Z')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint

SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "users"), 901));--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('verification_requests', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "verification_requests"), 3));
