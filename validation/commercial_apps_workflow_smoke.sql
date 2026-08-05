BEGIN;

DO $$
DECLARE
  v_user_id integer;
  v_parcel_id integer;
  v_conv_product bigint;
  v_field_product bigint;
  v_conv_account bigint;
  v_field_account bigint;
  v_subscription bigint;
  v_matter bigint;
  v_assignment bigint;
BEGIN
  SELECT id INTO v_user_id FROM users ORDER BY id LIMIT 1;
  SELECT id INTO v_parcel_id FROM parcels ORDER BY id LIMIT 1;
  IF v_user_id IS NULL OR v_parcel_id IS NULL THEN
    RAISE EXCEPTION 'Smoke database requires existing user and parcel records';
  END IF;
  SELECT id INTO v_conv_product FROM commercial_products WHERE product_key = 'conveyancing-workspace';
  SELECT id INTO v_field_product FROM commercial_products WHERE product_key = 'field-survey-operations';
  IF v_conv_product IS NULL OR v_field_product IS NULL THEN
    RAISE EXCEPTION 'Expected commercial products are unavailable';
  END IF;

  INSERT INTO commercial_accounts (account_key, legal_name, billing_email, status, created_by)
  VALUES ('CONV-SMOKE00000000000000', 'Conveyancing Smoke Account', 'billing+conveyancing@audit.invalid', 'active', v_user_id)
  RETURNING id INTO v_conv_account;
  INSERT INTO commercial_account_members (account_id, user_id, role) VALUES (v_conv_account, v_user_id, 'legal_reviewer');
  INSERT INTO commercial_subscriptions (subscription_key, account_id, product_id, status, started_at, current_period_start, current_period_end)
  VALUES ('SUB-CONVSMOKE0000000000', v_conv_account, v_conv_product, 'active', now(), now(), now() + interval '30 days')
  RETURNING id INTO v_subscription;
  INSERT INTO conveyancing_matters (matter_key, account_id, parcel_id, client_id, status, created_by, opened_at)
  VALUES ('MAT-SMOKE00000000000000', v_conv_account, v_parcel_id, v_user_id, 'opened', v_user_id, now())
  RETURNING id INTO v_matter;
  INSERT INTO conveyancing_matter_evidence (evidence_key, matter_id, evidence_type, source_reference, status, submitted_by)
  VALUES ('MTE-SMOKE00000000000000', v_matter, 'title_search', 'audit://conveyancing/title-search', 'accepted', v_user_id);
  INSERT INTO conveyancing_matter_events (matter_id, event_type, next_status, actor_id, description)
  VALUES (v_matter, 'matter_opened', 'opened', v_user_id, 'Transactional commercial workspace smoke test');
  INSERT INTO commercial_invoices (invoice_key, account_id, subscription_id, status, currency, subtotal_minor, tax_minor, total_minor, issued_at, due_at, collection_method, created_by)
  VALUES ('INV-CONVSMOKE0000000000', v_conv_account, v_subscription, 'issued', 'USD', 150000, 0, 150000, now(), now() + interval '30 days', 'provider_verified', v_user_id);

  INSERT INTO commercial_accounts (account_key, legal_name, billing_email, status, created_by)
  VALUES ('FIELD-SMOKE0000000000000', 'Field Smoke Account', 'billing+field@audit.invalid', 'active', v_user_id)
  RETURNING id INTO v_field_account;
  INSERT INTO commercial_account_members (account_id, user_id, role) VALUES (v_field_account, v_user_id, 'field_inspector');
  INSERT INTO commercial_subscriptions (subscription_key, account_id, product_id, status, started_at, current_period_start, current_period_end)
  VALUES ('SUB-FIELDSMOKE000000000', v_field_account, v_field_product, 'active', now(), now(), now() + interval '30 days');
  INSERT INTO field_survey_assignments (assignment_key, account_id, parcel_id, assigned_to, assigned_by, status, instructions)
  VALUES ('ASN-SMOKE00000000000000', v_field_account, v_parcel_id, v_user_id, v_user_id, 'in_progress', 'Inspect parcel boundary marker condition and submit provenance-backed observations.')
  RETURNING id INTO v_assignment;
  INSERT INTO field_survey_evidence (evidence_key, assignment_id, evidence_type, source_reference, captured_at, latitude, longitude, quality_flags, status, submitted_by)
  VALUES ('FSE-SMOKE00000000000000', v_assignment, 'site_photo', 'audit://field/site-photo', now(), 6.524400, 3.379200, '["gps_verified"]'::jsonb, 'accepted', v_user_id);
  INSERT INTO field_survey_events (assignment_id, event_type, previous_status, next_status, actor_id, description)
  VALUES (v_assignment, 'evidence_reviewed', 'in_progress', 'under_review', v_user_id, 'Transactional field workflow smoke test');

  BEGIN
    INSERT INTO field_survey_evidence (evidence_key, assignment_id, evidence_type, source_reference, captured_at, latitude, submitted_by)
    VALUES ('FSE-INVALID000000000000', v_assignment, 'site_photo', 'audit://field/invalid-coordinate', now(), 6.524400, v_user_id);
    RAISE EXCEPTION 'Expected coordinate-pair constraint was not enforced';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

SELECT
  (SELECT count(*) FROM conveyancing_matters WHERE matter_key = 'MAT-SMOKE00000000000000') AS conveyancing_matters,
  (SELECT count(*) FROM conveyancing_matter_evidence WHERE evidence_key = 'MTE-SMOKE00000000000000') AS conveyancing_evidence,
  (SELECT count(*) FROM field_survey_assignments WHERE assignment_key = 'ASN-SMOKE00000000000000') AS field_assignments,
  (SELECT count(*) FROM field_survey_evidence WHERE evidence_key = 'FSE-SMOKE00000000000000') AS field_evidence,
  (SELECT count(*) FROM commercial_invoices WHERE invoice_key = 'INV-CONVSMOKE0000000000') AS invoices;

ROLLBACK;
