SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('verification_provider_events', 'onboarding_verification_evidence', 'dapr_inbox_deliveries')
ORDER BY tablename;

SELECT product_key
FROM commercial_products
WHERE product_key = 'verification-control';
