BEGIN;

CREATE TYPE rollout_jurisdiction_status AS ENUM ('planned', 'rehearsal', 'shadow_register', 'limited_authoritative', 'expanded', 'paused', 'retired');
CREATE TYPE rollout_import_status AS ENUM ('draft', 'submitted', 'validating', 'reconciliation_required', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE rollout_staging_status AS ENUM ('pending', 'validated', 'reconciliation_required', 'accepted', 'rejected');
CREATE TYPE rollout_reconciliation_status AS ENUM ('open', 'matched', 'rejected', 'escalated', 'withdrawn');
CREATE TYPE rollout_gate_status AS ENUM ('not_started', 'evidence_submitted', 'approved', 'expired', 'rejected');
CREATE TYPE rollout_drill_status AS ENUM ('planned', 'running', 'passed', 'failed', 'cancelled');
CREATE TYPE assisted_service_status AS ENUM ('opened', 'in_progress', 'resolved', 'escalated', 'closed');

CREATE TABLE rollout_jurisdictions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code varchar(32) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  administrative_level varchar(32) NOT NULL CHECK (administrative_level IN ('national', 'state', 'lga', 'ward', 'customary_area')),
  parent_jurisdiction_id integer REFERENCES rollout_jurisdictions(id) ON DELETE RESTRICT,
  country varchar(128) NOT NULL DEFAULT 'Nigeria',
  authoritative_record_statement text NOT NULL,
  legal_mandate_reference varchar(512),
  service_fallback_description text NOT NULL,
  status rollout_jurisdiction_status NOT NULL DEFAULT 'planned',
  pilot_enabled boolean NOT NULL DEFAULT false,
  paused_reason text,
  created_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK ((status = 'paused') = (paused_reason IS NOT NULL)),
  CHECK ((status IN ('shadow_register', 'limited_authoritative', 'expanded')) = pilot_enabled OR status IN ('planned', 'rehearsal', 'paused', 'retired'))
);

CREATE INDEX rollout_jurisdictions_status_idx ON rollout_jurisdictions(status);
CREATE INDEX rollout_jurisdictions_parent_idx ON rollout_jurisdictions(parent_jurisdiction_id);

CREATE TABLE rollout_gate_attestations (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jurisdiction_id integer NOT NULL REFERENCES rollout_jurisdictions(id) ON DELETE CASCADE,
  gate_code varchar(64) NOT NULL CHECK (gate_code IN ('release_provenance', 'legal_authority', 'privacy', 'security', 'identity_authorization', 'data_inventory', 'data_reconciliation', 'backup_recovery', 'capacity', 'accessibility', 'support_training', 'independent_assurance')),
  status rollout_gate_status NOT NULL DEFAULT 'not_started',
  evidence_reference varchar(512),
  evidence_sha256 varchar(64),
  attested_by integer REFERENCES users(id) ON DELETE RESTRICT,
  attested_at timestamp,
  expires_at timestamp,
  reviewer_notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(jurisdiction_id, gate_code),
  CHECK ((status = 'approved') = (attested_by IS NOT NULL AND attested_at IS NOT NULL AND evidence_reference IS NOT NULL AND evidence_sha256 IS NOT NULL)),
  CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[A-Fa-f0-9]{64}$')
);

CREATE INDEX rollout_gate_attestations_jurisdiction_status_idx ON rollout_gate_attestations(jurisdiction_id, status);

CREATE TABLE rollout_import_batches (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jurisdiction_id integer NOT NULL REFERENCES rollout_jurisdictions(id) ON DELETE RESTRICT,
  source_system varchar(255) NOT NULL,
  source_export_reference varchar(512) NOT NULL,
  source_extract_sha256 varchar(64) NOT NULL,
  source_record_count integer NOT NULL CHECK (source_record_count >= 0),
  accepted_record_count integer NOT NULL DEFAULT 0 CHECK (accepted_record_count >= 0),
  rejected_record_count integer NOT NULL DEFAULT 0 CHECK (rejected_record_count >= 0),
  reconciliation_required_count integer NOT NULL DEFAULT 0 CHECK (reconciliation_required_count >= 0),
  status rollout_import_status NOT NULL DEFAULT 'draft',
  submitted_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by integer REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamp,
  submitted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(jurisdiction_id, source_system, source_extract_sha256),
  CHECK (source_extract_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  CHECK (accepted_record_count + rejected_record_count + reconciliation_required_count <= source_record_count),
  CHECK ((status = 'accepted') = (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE INDEX rollout_import_batches_jurisdiction_status_idx ON rollout_import_batches(jurisdiction_id, status);

CREATE TABLE rollout_staging_records (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_batch_id integer NOT NULL REFERENCES rollout_import_batches(id) ON DELETE CASCADE,
  source_record_id varchar(255) NOT NULL,
  source_record_sha256 varchar(64) NOT NULL,
  parcel_identifier varchar(128),
  title_identifier varchar(128),
  geometry_geojson jsonb,
  normalized_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  status rollout_staging_status NOT NULL DEFAULT 'pending',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(import_batch_id, source_record_id),
  CHECK (source_record_sha256 ~ '^[A-Fa-f0-9]{64}$')
);

CREATE INDEX rollout_staging_records_batch_status_idx ON rollout_staging_records(import_batch_id, status);
CREATE INDEX rollout_staging_records_parcel_identifier_idx ON rollout_staging_records(parcel_identifier);

CREATE TABLE rollout_reconciliation_cases (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jurisdiction_id integer NOT NULL REFERENCES rollout_jurisdictions(id) ON DELETE RESTRICT,
  staging_record_id integer NOT NULL UNIQUE REFERENCES rollout_staging_records(id) ON DELETE CASCADE,
  canonical_parcel_id integer REFERENCES parcels(id) ON DELETE RESTRICT,
  status rollout_reconciliation_status NOT NULL DEFAULT 'open',
  issue_code varchar(96) NOT NULL,
  issue_summary text NOT NULL,
  risk_level varchar(16) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  assigned_to integer REFERENCES users(id) ON DELETE SET NULL,
  resolved_by integer REFERENCES users(id) ON DELETE RESTRICT,
  resolution_reference varchar(512),
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK ((status IN ('matched', 'rejected', 'withdrawn')) = (resolved_by IS NOT NULL AND resolved_at IS NOT NULL))
);

CREATE INDEX rollout_reconciliation_cases_jurisdiction_status_idx ON rollout_reconciliation_cases(jurisdiction_id, status);
CREATE INDEX rollout_reconciliation_cases_assignee_idx ON rollout_reconciliation_cases(assigned_to, status);

CREATE TABLE rollout_reconciliation_events (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reconciliation_case_id integer NOT NULL REFERENCES rollout_reconciliation_cases(id) ON DELETE CASCADE,
  actor_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action varchar(64) NOT NULL CHECK (action IN ('opened', 'assigned', 'matched', 'rejected', 'escalated', 'withdrawn', 'note_added')),
  prior_status rollout_reconciliation_status,
  next_status rollout_reconciliation_status,
  evidence_reference varchar(512),
  note text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX rollout_reconciliation_events_case_created_idx ON rollout_reconciliation_events(reconciliation_case_id, created_at);

CREATE TABLE rollout_recovery_drills (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jurisdiction_id integer REFERENCES rollout_jurisdictions(id) ON DELETE SET NULL,
  drill_type varchar(64) NOT NULL CHECK (drill_type IN ('backup_restore', 'point_in_time_restore', 'regional_failover', 'queue_replay', 'identity_recovery', 'full_service_recovery')),
  status rollout_drill_status NOT NULL DEFAULT 'planned',
  planned_at timestamp NOT NULL,
  started_at timestamp,
  completed_at timestamp,
  measured_rpo_seconds integer CHECK (measured_rpo_seconds >= 0),
  measured_rto_seconds integer CHECK (measured_rto_seconds >= 0),
  evidence_reference varchar(512),
  evidence_sha256 varchar(64),
  executed_by integer REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by integer REFERENCES users(id) ON DELETE RESTRICT,
  review_notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  CHECK ((status = 'passed') = (completed_at IS NOT NULL AND evidence_reference IS NOT NULL AND evidence_sha256 IS NOT NULL AND executed_by IS NOT NULL AND reviewed_by IS NOT NULL))
);

CREATE INDEX rollout_recovery_drills_status_planned_idx ON rollout_recovery_drills(status, planned_at);

CREATE TABLE assisted_service_cases (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jurisdiction_id integer NOT NULL REFERENCES rollout_jurisdictions(id) ON DELETE RESTRICT,
  requester_reference varchar(128) NOT NULL,
  service_channel varchar(32) NOT NULL CHECK (service_channel IN ('in_person', 'phone', 'community_kiosk', 'accessibility_assistance', 'mobile_outreach')),
  requested_service varchar(128) NOT NULL,
  status assisted_service_status NOT NULL DEFAULT 'opened',
  assigned_to integer REFERENCES users(id) ON DELETE SET NULL,
  escalation_reference varchar(512),
  consent_recorded_at timestamp NOT NULL,
  opened_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  resolved_by integer REFERENCES users(id) ON DELETE RESTRICT,
  resolution_summary text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK ((status IN ('resolved', 'closed')) = (resolved_by IS NOT NULL))
);

CREATE INDEX assisted_service_cases_jurisdiction_status_idx ON assisted_service_cases(jurisdiction_id, status);
CREATE INDEX assisted_service_cases_assignee_idx ON assisted_service_cases(assigned_to, status);

COMMIT;
