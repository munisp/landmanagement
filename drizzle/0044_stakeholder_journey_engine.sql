-- Reusable stakeholder journey engine: durable, evidence-led orchestration state.
-- This migration never grants authority to change land rights, approve credit, decide
-- valuation/tax outcomes, verify identity, or bypass domain-specific review controls.

CREATE TYPE stakeholder_journey_run_status AS ENUM (
  'pending',
  'running',
  'awaiting_intervention',
  'blocked',
  'completed',
  'cancelled',
  'failed'
);

CREATE TYPE stakeholder_journey_step_status AS ENUM (
  'pending',
  'running',
  'awaiting_intervention',
  'completed',
  'blocked',
  'failed',
  'skipped'
);

CREATE TYPE stakeholder_journey_intervention_status AS ENUM (
  'requested',
  'continued',
  'blocked',
  'cancelled',
  'expired'
);

CREATE TABLE stakeholder_journey_runs (
  id SERIAL PRIMARY KEY,
  run_key VARCHAR(96) NOT NULL UNIQUE,
  template_code VARCHAR(8) NOT NULL CHECK (template_code ~ '^J(0[1-9]|1[0-9]|20)$'),
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subject_kind VARCHAR(48) NOT NULL,
  subject_reference VARCHAR(160) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status stakeholder_journey_run_status NOT NULL DEFAULT 'pending',
  current_step_key VARCHAR(80),
  workflow_id VARCHAR(160) UNIQUE,
  temporal_run_id VARCHAR(128),
  input_hash VARCHAR(64) NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  blocked_reason TEXT,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stakeholder_journey_runs_actor_template_idempotency_unique UNIQUE (actor_id, template_code, idempotency_key),
  CONSTRAINT stakeholder_journey_runs_subject_reference_nonempty CHECK (length(trim(subject_reference)) > 0),
  CONSTRAINT stakeholder_journey_runs_idempotency_nonempty CHECK (length(trim(idempotency_key)) >= 12)
);

CREATE INDEX stakeholder_journey_runs_actor_status_idx
  ON stakeholder_journey_runs (actor_id, status, updated_at DESC);
CREATE INDEX stakeholder_journey_runs_template_status_idx
  ON stakeholder_journey_runs (template_code, status, updated_at DESC);
CREATE INDEX stakeholder_journey_runs_subject_idx
  ON stakeholder_journey_runs (subject_kind, subject_reference);

CREATE TABLE stakeholder_journey_steps (
  id SERIAL PRIMARY KEY,
  journey_run_id INTEGER NOT NULL REFERENCES stakeholder_journey_runs(id) ON DELETE CASCADE,
  step_key VARCHAR(80) NOT NULL,
  adapter_key VARCHAR(80) NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  status stakeholder_journey_step_status NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  output_hash VARCHAR(64),
  output JSONB,
  failure_code VARCHAR(80),
  failure_detail TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT stakeholder_journey_steps_run_step_unique UNIQUE (journey_run_id, step_key),
  CONSTRAINT stakeholder_journey_steps_run_sequence_unique UNIQUE (journey_run_id, sequence_no)
);

CREATE INDEX stakeholder_journey_steps_run_status_idx
  ON stakeholder_journey_steps (journey_run_id, status, sequence_no);

CREATE TABLE stakeholder_journey_events (
  id SERIAL PRIMARY KEY,
  event_key VARCHAR(96) NOT NULL UNIQUE,
  journey_run_id INTEGER NOT NULL REFERENCES stakeholder_journey_runs(id) ON DELETE CASCADE,
  journey_step_id INTEGER REFERENCES stakeholder_journey_steps(id) ON DELETE SET NULL,
  event_type VARCHAR(96) NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  evidence_hash VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX stakeholder_journey_events_run_created_idx
  ON stakeholder_journey_events (journey_run_id, created_at ASC);

CREATE TABLE stakeholder_journey_interventions (
  id SERIAL PRIMARY KEY,
  intervention_key VARCHAR(96) NOT NULL UNIQUE,
  journey_run_id INTEGER NOT NULL REFERENCES stakeholder_journey_runs(id) ON DELETE CASCADE,
  journey_step_id INTEGER NOT NULL REFERENCES stakeholder_journey_steps(id) ON DELETE CASCADE,
  requested_role VARCHAR(96) NOT NULL,
  reason TEXT NOT NULL,
  status stakeholder_journey_intervention_status NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  expires_at TIMESTAMP
);

CREATE INDEX stakeholder_journey_interventions_pending_idx
  ON stakeholder_journey_interventions (status, requested_role, requested_at ASC);
CREATE INDEX stakeholder_journey_interventions_run_idx
  ON stakeholder_journey_interventions (journey_run_id, status);

COMMENT ON TABLE stakeholder_journey_runs IS 'Reusable Temporal-orchestrated stakeholder journey requests; no record-right authority is conferred by a run.';
COMMENT ON TABLE stakeholder_journey_events IS 'Immutable, minimized orchestration evidence. Provider secrets and raw verification payloads are prohibited.';
