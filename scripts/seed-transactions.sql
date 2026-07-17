-- Insert transactions and verifications with correct enum values
DO $$
DECLARE
  p1 INTEGER; p2 INTEGER; p3 INTEGER; p4 INTEGER; p7 INTEGER;
BEGIN
  SELECT id INTO p1 FROM parcels WHERE parcel_id = 'LG-VI-2024-001';
  SELECT id INTO p2 FROM parcels WHERE parcel_id = 'LG-LEK-2024-002';
  SELECT id INTO p3 FROM parcels WHERE parcel_id = 'AB-GAR-2024-003';
  SELECT id INTO p4 FROM parcels WHERE parcel_id = 'KN-SG-2024-004';
  SELECT id INTO p7 FROM parcels WHERE parcel_id = 'PH-GRA-2024-007';

  INSERT INTO transactions (transaction_id, parcel_id, from_user_id, to_user_id, transaction_type, status, amount, currency, blockchain_tx_hash, initiated_at, completed_at, "createdAt", "updatedAt")
  VALUES
    ('TXN-2024-001', p1, 100, 101, 'transfer', 'completed', 25000000, 'NGN', '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', NOW() - INTERVAL '3 months', NOW() - INTERVAL '2 months', NOW() - INTERVAL '3 months', NOW()),
    ('TXN-2024-002', p4, 100, 102, 'transfer', 'pending', 18000000, 'NGN', NULL, NOW() - INTERVAL '1 week', NULL, NOW() - INTERVAL '1 week', NOW()),
    ('TXN-2024-003', p2, 101, 101, 'registration', 'completed', 500000, 'NGN', '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', NOW() - INTERVAL '4 months', NOW() - INTERVAL '3 months', NOW() - INTERVAL '4 months', NOW()),
    ('TXN-2024-004', p7, 100, 100, 'mortgage', 'completed', 15000000, 'NGN', '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456', NOW() - INTERVAL '2 months', NOW() - INTERVAL '1 month', NOW() - INTERVAL '2 months', NOW()),
    ('TXN-2024-005', p3, 102, 100, 'transfer', 'cancelled', 12000000, 'NGN', NULL, NOW() - INTERVAL '1 month', NULL, NOW() - INTERVAL '1 month', NOW())
  ON CONFLICT (transaction_id) DO NOTHING;

  INSERT INTO verification_requests (parcel_id, requester_id, reviewer_id, status, submitted_at, reviewed_at, approved_at, notes, created_at, updated_at)
  VALUES
    ('LG-VI-2024-001', 100, 103, 'approved', NOW() - INTERVAL '6 months', NOW() - INTERVAL '5 months 20 days', NOW() - INTERVAL '5 months', 'All documents verified. Boundaries match survey data. Title is clear.', NOW() - INTERVAL '6 months', NOW()),
    ('LG-IKJ-2024-005', 101, NULL, 'submitted', NOW() - INTERVAL '2 weeks', NULL, NULL, NULL, NOW() - INTERVAL '2 weeks', NOW()),
    ('AB-MAI-2024-006', 102, 103, 'under_review', NOW() - INTERVAL '1 week', NOW() - INTERVAL '5 days', NULL, 'Survey data under review. Awaiting boundary confirmation.', NOW() - INTERVAL '1 week', NOW()),
    ('AB-GAR-2024-003', 102, 103, 'rejected', NOW() - INTERVAL '3 months', NOW() - INTERVAL '2 months 20 days', NULL, 'Incomplete documentation. Missing survey plan and deed of assignment.', NOW() - INTERVAL '3 months', NOW());

  INSERT INTO activity_logs ("userId", type, description, metadata, "createdAt")
  VALUES
    (100, 'parcel_created', 'Created parcel LG-VI-2024-001', '{"parcel_id":"LG-VI-2024-001"}'::jsonb, NOW() - INTERVAL '6 months'),
    (101, 'transaction_initiated', 'Initiated transfer transaction TXN-2024-001', '{"transaction_id":"TXN-2024-001"}'::jsonb, NOW() - INTERVAL '3 months'),
    (103, 'verification_approved', 'Approved verification request', '{"parcel_id":"LG-VI-2024-001"}'::jsonb, NOW() - INTERVAL '5 months'),
    (100, 'parcel_viewed', 'Viewed parcel details', '{"parcel_id":"LG-VI-2024-001"}'::jsonb, NOW() - INTERVAL '1 day'),
    (102, 'verification_submitted', 'Submitted verification request', '{"parcel_id":"AB-MAI-2024-006"}'::jsonb, NOW() - INTERVAL '1 week');
END $$;

SELECT 'Test Data Summary:' as info;
SELECT 'Users:' as table_name, COUNT(*) as count FROM users WHERE id >= 100;
SELECT 'Parcels:' as table_name, COUNT(*) as count FROM parcels WHERE parcel_id LIKE '%-2024-%';
SELECT 'Transactions:' as table_name, COUNT(*) as count FROM transactions WHERE transaction_id LIKE 'TXN-2024-%';
SELECT 'Verifications:' as table_name, COUNT(*) as count FROM verification_requests WHERE parcel_id LIKE '%-2024-%';
SELECT 'Activity Logs:' as table_name, COUNT(*) as count FROM activity_logs WHERE "userId" >= 100;
