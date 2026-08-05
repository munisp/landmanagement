BEGIN;

WITH seed AS (
  SELECT (SELECT id FROM users ORDER BY id LIMIT 1) AS user_id,
         (SELECT id FROM parcels ORDER BY id LIMIT 1) AS parcel_id,
         (SELECT id FROM commercial_products WHERE product_key = 'lender-collateral-core') AS product_id
), account AS (
  INSERT INTO commercial_accounts (account_key, legal_name, billing_email, status, created_by)
  SELECT 'LEND-SMOKETEST000000001', 'Commercial Smoke Lender', 'billing@example.test', 'active', user_id FROM seed
  RETURNING id
), member AS (
  INSERT INTO commercial_account_members (account_id, user_id, role)
  SELECT account.id, seed.user_id, 'owner' FROM account CROSS JOIN seed
), subscription AS (
  INSERT INTO commercial_subscriptions (subscription_key, account_id, product_id, status, started_at, current_period_start, current_period_end)
  SELECT 'SUB-SMOKETEST0000000001', account.id, seed.product_id, 'active', now(), now(), now() + interval '30 days' FROM account CROSS JOIN seed
  RETURNING id, account_id
), portfolio AS (
  INSERT INTO lender_portfolios (portfolio_key, account_id, lender_name, policy_version)
  SELECT 'PORT-SMOKETEST000000001', subscription.account_id, 'Commercial Smoke Lender', 'policy-1' FROM subscription
  RETURNING id, account_id
), collateral_case AS (
  INSERT INTO lender_collateral_cases (case_key, account_id, portfolio_id, parcel_id, borrower_id, status, requested_amount_minor, declared_collateral_value_minor, currency, created_by)
  SELECT 'COL-SMOKETEST0000000001', portfolio.account_id, portfolio.id, seed.parcel_id, seed.user_id, 'opened', 100000, 150000, 'USD', seed.user_id FROM portfolio CROSS JOIN seed
  RETURNING id, account_id
), evidence AS (
  INSERT INTO lender_collateral_evidence (evidence_key, case_id, evidence_type, source_reference, source_checksum_sha256, status, submitted_by, reviewed_by, review_notes, reviewed_at)
  SELECT 'EVD-SMOKETEST0000000001', collateral_case.id, 'title_search', 'DOC-SMOKE-001', repeat('a', 64), 'accepted', seed.user_id, seed.user_id, 'Verified in commercial schema smoke.', now() FROM collateral_case CROSS JOIN seed
  RETURNING id, case_id
), event_row AS (
  INSERT INTO lender_collateral_events (case_id, event_type, previous_status, next_status, actor_id, description)
  SELECT collateral_case.id, 'evidence_reviewed', 'opened', 'ready_for_review', seed.user_id, 'Commercial workflow smoke event.' FROM collateral_case CROSS JOIN seed
), invoice AS (
  INSERT INTO commercial_invoices (invoice_key, account_id, subscription_id, status, currency, subtotal_minor, tax_minor, total_minor, issued_at, due_at, collection_method, created_by)
  SELECT 'INV-SMOKETEST0000000001', subscription.account_id, subscription.id, 'issued', 'USD', 250000, 0, 250000, now(), now() + interval '30 days', 'manual_reconciliation', seed.user_id FROM subscription CROSS JOIN seed
  RETURNING id
)
SELECT (SELECT count(*) FROM account) AS accounts_created,
       (SELECT count(*) FROM collateral_case) AS cases_created,
       (SELECT count(*) FROM evidence) AS evidence_created,
       (SELECT count(*) FROM invoice) AS invoices_created;

ROLLBACK;
