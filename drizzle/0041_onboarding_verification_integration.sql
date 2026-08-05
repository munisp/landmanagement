CREATE TYPE onboarding_verification_kind AS ENUM ('identity', 'document');
CREATE TYPE onboarding_verification_outcome AS ENUM ('verified', 'rejected', 'requires_review');

CREATE TABLE verification_provider_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_event_id VARCHAR(255) NOT NULL UNIQUE,
  provider VARCHAR(120) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

CREATE TABLE onboarding_verification_evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  onboarding_id INTEGER NOT NULL REFERENCES stakeholder_onboarding(id) ON DELETE CASCADE,
  kind onboarding_verification_kind NOT NULL,
  provider VARCHAR(120) NOT NULL,
  external_reference VARCHAR(255) NOT NULL,
  provider_event_id VARCHAR(255) REFERENCES verification_provider_events(provider_event_id),
  outcome onboarding_verification_outcome NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  reviewed_by INTEGER REFERENCES users(id),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_verification_evidence_reference_unique UNIQUE (provider, external_reference)
);

CREATE INDEX onboarding_verification_evidence_onboarding_kind_idx
  ON onboarding_verification_evidence (onboarding_id, kind, created_at DESC);
CREATE INDEX onboarding_verification_evidence_outcome_idx
  ON onboarding_verification_evidence (outcome, created_at DESC);

INSERT INTO commercial_products (product_key, name, description, monthly_price_minor, currency, included_seats, included_units, active)
VALUES ('verification-control', 'Verification Control', 'Governed identity and document verification evidence, reviewer queue, and activation controls.', 125000, 'USD', 5, '{"verification_events":500}'::jsonb, true)
ON CONFLICT (product_key) DO NOTHING;
