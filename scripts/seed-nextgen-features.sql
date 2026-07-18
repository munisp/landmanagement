-- ============================================================================
-- Next-Generation Feature Seed Data (2026-07-18)
-- Seeds: title risk assessments, registry integrity findings, escrow
-- settlements + checkpoints, agency clearances, data exchange audits,
-- mortgage decision explanations.
--
-- Defensive by design: foreign-key-dependent rows are only inserted when a
-- referenced parent row exists, so the script is safe to run on a fresh or
-- partially seeded database. Idempotent via NOT EXISTS guards.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Title Risk Copilot — sample assessments for the first few parcels
-- ---------------------------------------------------------------------------
INSERT INTO title_risk_assessments (parcel_id, overall_score, risk_band, factor_scores, drivers, recommendations, assessed_at)
SELECT
  p.id,
  18,
  'low',
  jsonb_build_array(
    jsonb_build_object('key', 'disputeHistory', 'score', 0, 'weight', 25),
    jsonb_build_object('key', 'verificationStatus', 'score', 0, 'weight', 15),
    jsonb_build_object('key', 'documentIntegrity', 'score', 20, 'weight', 15),
    jsonb_build_object('key', 'encumbranceExposure', 'score', 0, 'weight', 15),
    jsonb_build_object('key', 'transactionCadence', 'score', 10, 'weight', 15),
    jsonb_build_object('key', 'valuationAnomaly', 'score', 5, 'weight', 15)
  ),
  '[]'::jsonb,
  '["No blocking issues detected; proceed with standard controls."]'::jsonb,
  NOW() - INTERVAL '2 days'
FROM parcels p
WHERE p.id IN (SELECT id FROM parcels ORDER BY id LIMIT 3)
  AND NOT EXISTS (SELECT 1 FROM title_risk_assessments t WHERE t.parcel_id = p.id);

-- One elevated-risk example for dashboards
INSERT INTO title_risk_assessments (parcel_id, overall_score, risk_band, factor_scores, drivers, recommendations, assessed_at)
SELECT
  p.id,
  68,
  'high',
  jsonb_build_array(
    jsonb_build_object('key', 'disputeHistory', 'score', 70, 'weight', 25),
    jsonb_build_object('key', 'verificationStatus', 'score', 55, 'weight', 15),
    jsonb_build_object('key', 'documentIntegrity', 'score', 40, 'weight', 15),
    jsonb_build_object('key', 'encumbranceExposure', 'score', 40, 'weight', 15),
    jsonb_build_object('key', 'transactionCadence', 'score', 45, 'weight', 15),
    jsonb_build_object('key', 'valuationAnomaly', 'score', 25, 'weight', 15)
  ),
  '["Dispute history: 2 open dispute(s) recorded against this parcel"]'::jsonb,
  '["Suspend completion until open disputes are resolved or mediated.", "Complete registry verification before proceeding."]'::jsonb,
  NOW() - INTERVAL '1 day'
FROM parcels p
WHERE p.id = (SELECT id FROM parcels ORDER BY id DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM title_risk_assessments t WHERE t.parcel_id = p.id AND t.risk_band = 'high');

-- ---------------------------------------------------------------------------
-- 2) Registry Integrity Monitoring — sample findings across all check types
-- ---------------------------------------------------------------------------
INSERT INTO registry_integrity_findings (check_type, severity, status, parcel_id, description, evidence, detected_by, scan_run_id, detected_at)
SELECT * FROM (
  SELECT
    'valuation_jump', 'medium', 'open', p.id,
    'Parcel ' || COALESCE(p.title_number, p.parcel_id, p.id::text) || ' valued significantly above the state median',
    jsonb_build_object('parcelId', p.parcel_id, 'titleNumber', p.title_number),
    'seed', 'SCAN-SEED-001', NOW() - INTERVAL '3 days'
  FROM parcels p ORDER BY COALESCE((p.metadata->>'estimatedValue')::numeric, 0) DESC NULLS LAST, p.id DESC LIMIT 1
) seed_rows
WHERE NOT EXISTS (SELECT 1 FROM registry_integrity_findings f WHERE f.check_type = 'valuation_jump' AND f.scan_run_id = 'SCAN-SEED-001');

INSERT INTO registry_integrity_findings (check_type, severity, status, description, evidence, detected_by, scan_run_id, detected_at)
SELECT 'document_fingerprint', 'high', 'acknowledged',
       'Document fingerprint reused across 2 parcels (seeded example)',
       '{"fingerprint": "seed-doc-hash-001", "parcelIds": [1, 2]}'::jsonb,
       'seed', 'SCAN-SEED-001', NOW() - INTERVAL '3 days'
WHERE NOT EXISTS (SELECT 1 FROM registry_integrity_findings f WHERE f.check_type = 'document_fingerprint' AND f.scan_run_id = 'SCAN-SEED-001');

INSERT INTO registry_integrity_findings (check_type, severity, status, description, evidence, detected_by, scan_run_id, detected_at)
SELECT 'timing_anomaly', 'medium', 'resolved',
       '3 transactions on the same parcel within 30 days (seeded example)',
       '{"windowDays": 30}'::jsonb,
       'seed', 'SCAN-SEED-001', NOW() - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM registry_integrity_findings f WHERE f.check_type = 'timing_anomaly' AND f.scan_run_id = 'SCAN-SEED-001');

-- ---------------------------------------------------------------------------
-- 3) Programmable Escrow — one release-ready and one in-flight settlement
-- ---------------------------------------------------------------------------
INSERT INTO escrow_settlements (settlement_ref, transaction_id, amount, currency, status, created_at, updated_at)
SELECT 'STL-SEED-00001', t.id, 45000000.00, 'NGN', 'pending', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'
FROM transactions t ORDER BY t.id LIMIT 1
ON CONFLICT (settlement_ref) DO NOTHING;

INSERT INTO settlement_checkpoints (settlement_id, checkpoint_key, label, required, status)
SELECT s.id, c.checkpoint_key, c.label, c.required, c.status
FROM escrow_settlements s
CROSS JOIN (VALUES
  ('title_verified',      'Title verification completed',        true,  'fulfilled'),
  ('tax_cleared',         'Tax clearance certificate issued',    true,  'fulfilled'),
  ('documents_validated', 'Transaction documents validated',     true,  'pending'),
  ('payment_confirmed',   'Purchase payment confirmed in escrow', true, 'pending')
) AS c(checkpoint_key, label, required, status)
WHERE s.settlement_ref = 'STL-SEED-00001'
  AND NOT EXISTS (SELECT 1 FROM settlement_checkpoints sc WHERE sc.settlement_id = s.id);

-- ---------------------------------------------------------------------------
-- 4) Federated Clearance Exchange — clearance states for one transaction
-- ---------------------------------------------------------------------------
INSERT INTO agency_clearances (transaction_id, agency, status, reference_number, sla_due_at, submitted_at, decided_at)
SELECT t.id, c.agency, c.status, c.ref, NOW() + c.sla, NOW() - INTERVAL '2 days',
       CASE WHEN c.status IN ('approved','rejected') THEN NOW() - INTERVAL '1 day' ELSE NULL END
FROM transactions t
CROSS JOIN (VALUES
  ('firs_tax',              'approved',  'FIRS-2026-SEED-001', INTERVAL '1 day'),
  ('identity_verification', 'approved',  'NIN-2026-SEED-001',  INTERVAL '1 day'),
  ('survey',                'submitted', 'SURV-2026-SEED-001', INTERVAL '4 days'),
  ('governor_consent',      'pending',   NULL,                 INTERVAL '13 days')
) AS c(agency, status, ref, sla)
WHERE t.id = (SELECT id FROM transactions ORDER BY id LIMIT 1)
  AND NOT EXISTS (
    SELECT 1 FROM agency_clearances ac
    WHERE ac.transaction_id = t.id AND ac.agency = c.agency
  );

-- ---------------------------------------------------------------------------
-- 5) Privacy-Aware Data Exchange Gateway — audit trail examples
-- ---------------------------------------------------------------------------
INSERT INTO data_exchange_audits (subject_user_id, requestor_role, purpose, jurisdiction, data_categories, decision, decision_reasons, conditions)
SELECT u.id, 'bank_officer', 'mortgage_underwriting', 'NG',
       '["identity", "financial", "property"]'::jsonb, 'allowed',
       '["All policy checks passed"]'::jsonb, '[]'::jsonb
FROM users u ORDER BY u.id LIMIT 1;

INSERT INTO data_exchange_audits (subject_user_id, requestor_role, purpose, jurisdiction, data_categories, decision, decision_reasons, conditions)
SELECT u.id, 'random_citizen', 'mortgage_underwriting', 'NG',
       '["identity"]'::jsonb, 'denied',
       '["Role \"random_citizen\" is not authorized for purpose \"mortgage_underwriting\""]'::jsonb, '[]'::jsonb
FROM users u ORDER BY u.id LIMIT 1
  AND NOT EXISTS (SELECT 1 FROM data_exchange_audits d WHERE d.purpose = 'mortgage_underwriting' AND d.decision = 'denied');

-- ---------------------------------------------------------------------------
-- 6) Explainable Mortgage Decisioning — one explanation per seeded application
-- ---------------------------------------------------------------------------
INSERT INTO mortgage_decision_explanations (application_id, overall_recommendation, overall_score, factors, policy_version)
SELECT ma.id, 'approve_with_conditions', 66,
  jsonb_build_array(
    jsonb_build_object('key', 'creditworthiness', 'label', 'Creditworthiness', 'weight', 30, 'score', 70, 'impact', 'positive'),
    jsonb_build_object('key', 'loanToValue', 'label', 'Loan-to-value', 'weight', 25, 'score', 65, 'impact', 'positive'),
    jsonb_build_object('key', 'downPaymentStrength', 'label', 'Down-payment strength', 'weight', 15, 'score', 65, 'impact', 'positive'),
    jsonb_build_object('key', 'repaymentBurden', 'label', 'Repayment burden', 'weight', 15, 'score', 50, 'impact', 'neutral'),
    jsonb_build_object('key', 'documentationCompleteness', 'label', 'Documentation completeness', 'weight', 10, 'score', 60, 'impact', 'neutral'),
    jsonb_build_object('key', 'collateralStatus', 'label', 'Collateral status', 'weight', 5, 'score', 85, 'impact', 'positive')
  ),
  'underwriting-v1.0'
FROM mortgage_applications ma
WHERE NOT EXISTS (SELECT 1 FROM mortgage_decision_explanations e WHERE e.application_id = ma.id)
LIMIT 3;

COMMIT;

-- Verification summary
SELECT 'title_risk_assessments' AS table_name, COUNT(*) AS rows FROM title_risk_assessments
UNION ALL SELECT 'registry_integrity_findings', COUNT(*) FROM registry_integrity_findings
UNION ALL SELECT 'escrow_settlements', COUNT(*) FROM escrow_settlements
UNION ALL SELECT 'settlement_checkpoints', COUNT(*) FROM settlement_checkpoints
UNION ALL SELECT 'agency_clearances', COUNT(*) FROM agency_clearances
UNION ALL SELECT 'data_exchange_audits', COUNT(*) FROM data_exchange_audits
UNION ALL SELECT 'mortgage_decision_explanations', COUNT(*) FROM mortgage_decision_explanations;
