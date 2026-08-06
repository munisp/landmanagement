\set ON_ERROR_STOP on
BEGIN;

WITH jurisdiction AS (
  INSERT INTO rollout_jurisdictions (
    code, name, administrative_level, authoritative_record_statement,
    legal_mandate_reference, service_fallback_description, created_by
  ) VALUES (
    'NG-SMOKE-ROLL', 'Nationwide Rollout Smoke Jurisdiction', 'state',
    'The existing statutory registry remains authoritative during rehearsal.',
    'https://example.invalid/mandate/smoke',
    'In-person and telephone service continue when the digital channel is unavailable.',
    1
  ) RETURNING id
)
INSERT INTO rollout_gate_attestations (
  jurisdiction_id, gate_code, status, evidence_reference, evidence_sha256, attested_by, attested_at
)
SELECT id, 'release_provenance', 'approved', 's3://rollout-evidence/smoke-release.json', repeat('a', 64), 1, now()
FROM jurisdiction;

WITH jurisdiction AS (
  SELECT id FROM rollout_jurisdictions WHERE code = 'NG-SMOKE-ROLL'
), batch AS (
  INSERT INTO rollout_import_batches (
    jurisdiction_id, source_system, source_export_reference, source_extract_sha256,
    source_record_count, submitted_by, status, submitted_at
  ) SELECT id, 'legacy-registry-smoke', 's3://imports/smoke.csv', repeat('b', 64), 1, 1, 'submitted', now()
  FROM jurisdiction RETURNING id, jurisdiction_id
), staged AS (
  INSERT INTO rollout_staging_records (
    import_batch_id, source_record_id, source_record_sha256, parcel_identifier,
    normalized_attributes, quality_flags, status
  ) SELECT id, 'legacy-record-001', repeat('c', 64), 'SMOKE-PARCEL-001', '{}'::jsonb, '["source-check"]'::jsonb, 'reconciliation_required'
  FROM batch RETURNING id
)
INSERT INTO rollout_reconciliation_cases (
  jurisdiction_id, staging_record_id, canonical_parcel_id, issue_code, issue_summary, risk_level
)
SELECT batch.jurisdiction_id, staged.id, 1, 'identifier_collision', 'Smoke reconciliation requires a human decision.', 'high'
FROM batch CROSS JOIN staged;

INSERT INTO rollout_recovery_drills (
  jurisdiction_id, drill_type, status, planned_at, started_at, completed_at,
  measured_rpo_seconds, measured_rto_seconds, evidence_reference, evidence_sha256,
  executed_by, reviewed_by, review_notes
)
SELECT id, 'backup_restore', 'passed', now() - interval '2 hours', now() - interval '1 hour', now(),
  300, 1800, 's3://recovery-evidence/smoke.json', repeat('d', 64), 1, 2,
  'Independent reviewer evidence recorded for schema smoke test.'
FROM rollout_jurisdictions WHERE code = 'NG-SMOKE-ROLL';

INSERT INTO assisted_service_cases (
  jurisdiction_id, requester_reference, service_channel, requested_service,
  consent_recorded_at, opened_by
)
SELECT id, 'assisted-smoke-001', 'accessibility_assistance', 'registration guidance', now(), 1
FROM rollout_jurisdictions WHERE code = 'NG-SMOKE-ROLL';

SELECT
  (SELECT count(*) FROM rollout_jurisdictions WHERE code = 'NG-SMOKE-ROLL') AS jurisdictions,
  (SELECT count(*) FROM rollout_import_batches WHERE source_system = 'legacy-registry-smoke') AS import_batches,
  (SELECT count(*) FROM rollout_reconciliation_cases WHERE issue_code = 'identifier_collision') AS reconciliation_cases,
  (SELECT count(*) FROM rollout_recovery_drills WHERE evidence_reference = 's3://recovery-evidence/smoke.json') AS recovery_drills,
  (SELECT count(*) FROM assisted_service_cases WHERE requester_reference = 'assisted-smoke-001') AS assisted_cases;

ROLLBACK;
