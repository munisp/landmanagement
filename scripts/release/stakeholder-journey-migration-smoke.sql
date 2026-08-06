\set ON_ERROR_STOP on
BEGIN;

SELECT id AS actor_id FROM users ORDER BY id LIMIT 1 \gset

INSERT INTO stakeholder_journey_runs (
  run_key, template_code, actor_id, subject_kind, subject_reference,
  idempotency_key, input_hash
) VALUES (
  'JSMOKE-RUN-000000000000001', 'J01', :actor_id, 'registry_operation',
  'migration-smoke-subject', 'journey-smoke-key-000000001', repeat('a', 64)
) RETURNING id AS journey_run_id \gset

INSERT INTO stakeholder_journey_steps (
  journey_run_id, step_key, adapter_key, sequence_no
) VALUES (
  :journey_run_id, 'validate_subject', 'validate_subject', 1
) RETURNING id AS journey_step_id \gset

INSERT INTO stakeholder_journey_events (
  event_key, journey_run_id, journey_step_id, event_type, actor_id, evidence_hash, payload
) VALUES (
  'JSMOKE-EVENT-00000000000001', :journey_run_id, :journey_step_id,
  'journey.migration_smoke', :actor_id, repeat('b', 64), '{"source":"migration-smoke"}'::jsonb
);

INSERT INTO stakeholder_journey_interventions (
  intervention_key, journey_run_id, journey_step_id, requested_role, reason
) VALUES (
  'JSMOKE-INTERVENTION-000000001', :journey_run_id, :journey_step_id,
  'registrar', 'Rollback-only migration smoke test'
);

DO $$
DECLARE
  smoke_run_id integer := (SELECT id FROM stakeholder_journey_runs WHERE run_key = 'JSMOKE-RUN-000000000000001');
BEGIN
  BEGIN
    INSERT INTO stakeholder_journey_steps (journey_run_id, step_key, adapter_key, sequence_no)
    VALUES (smoke_run_id, 'duplicate', 'validate_subject', 1);
    RAISE EXCEPTION 'Expected unique sequence constraint was not enforced';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

SELECT
  (SELECT count(*) FROM stakeholder_journey_runs WHERE id = :journey_run_id) AS runs,
  (SELECT count(*) FROM stakeholder_journey_steps WHERE journey_run_id = :journey_run_id) AS steps,
  (SELECT count(*) FROM stakeholder_journey_events WHERE journey_run_id = :journey_run_id) AS events,
  (SELECT count(*) FROM stakeholder_journey_interventions WHERE journey_run_id = :journey_run_id) AS interventions;

ROLLBACK;
