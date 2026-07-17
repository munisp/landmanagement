-- IDLR-PTS Test Data Seed Script (Final - Matches Exact Schema)

-- Insert test users (using OVERRIDING SYSTEM VALUE for identity column)
INSERT INTO users (id, "openId", name, email, role, "createdAt", "updatedAt", "lastSignedIn")
OVERRIDING SYSTEM VALUE
VALUES 
  (100, 'test-owner-1', 'Adewale Johnson', 'adewale.johnson@example.com', 'user', NOW(), NOW(), NOW()),
  (101, 'test-owner-2', 'Fatima Abubakar', 'fatima.abubakar@example.com', 'user', NOW(), NOW(), NOW()),
  (102, 'test-owner-3', 'Chioma Okafor', 'chioma.okafor@example.com', 'user', NOW(), NOW(), NOW()),
  (103, 'test-registrar-1', 'Ibrahim Musa', 'ibrahim.musa@example.com', 'registrar', NOW(), NOW(), NOW()),
  (104, 'test-surveyor-1', 'Oluwaseun Adeyemi', 'oluwaseun.adeyemi@example.com', 'surveyor', NOW(), NOW(), NOW())
ON CONFLICT ("openId") DO NOTHING;

-- Insert test parcels (status must be: draft, registered, transferred, disputed, archived)
INSERT INTO parcels (
  parcel_id, owner_id, address, city, state, country,
  latitude, longitude, area, land_use, status, title_number,
  survey_plan_number, registration_date, metadata,
  "createdAt", "updatedAt"
)
VALUES
  -- Lagos - Victoria Island (Commercial) - registered
  (
    'LG-VI-2024-001',
    100,
    '15 Adeola Odeku Street, Victoria Island',
    'Lagos',
    'Lagos',
    'Nigeria',
    '6.4281',
    '3.4219',
    2500,
    'commercial',
    'registered',
    'TN-LG-001-2024',
    'SP-LG-VI-001-2024',
    NOW() - INTERVAL '6 months',
    '{"boundaries":[{"lat":6.4281,"lng":3.4219},{"lat":6.4281,"lng":3.4249},{"lat":6.4251,"lng":3.4249},{"lat":6.4251,"lng":3.4219}]}'::jsonb,
    NOW() - INTERVAL '6 months',
    NOW()
  ),
  
  -- Lagos - Lekki (Residential) - transferred
  (
    'LG-LEK-2024-002',
    101,
    'Plot 45, Admiralty Way, Lekki Phase 1',
    'Lagos',
    'Lagos',
    'Nigeria',
    '6.4381',
    '3.4719',
    1200,
    'residential',
    'transferred',
    'TN-LG-002-2024',
    'SP-LG-LEK-002-2024',
    NOW() - INTERVAL '4 months',
    '{"boundaries":[{"lat":6.4381,"lng":3.4719},{"lat":6.4381,"lng":3.4739},{"lat":6.4361,"lng":3.4739},{"lat":6.4361,"lng":3.4719}]}'::jsonb,
    NOW() - INTERVAL '4 months',
    NOW()
  ),
  
  -- Abuja - Garki (Residential) - registered
  (
    'AB-GAR-2024-003',
    102,
    '23 Tafawa Balewa Way, Garki II',
    'Abuja',
    'FCT',
    'Nigeria',
    '9.0579',
    '7.4951',
    800,
    'residential',
    'registered',
    'TN-AB-003-2024',
    'SP-AB-GAR-003-2024',
    NOW() - INTERVAL '2 months',
    '{"boundaries":[{"lat":9.0579,"lng":7.4951},{"lat":9.0579,"lng":7.4971},{"lat":9.0559,"lng":7.4971},{"lat":9.0559,"lng":7.4951}]}'::jsonb,
    NOW() - INTERVAL '2 months',
    NOW()
  ),
  
  -- Kano - Sabon Gari (Commercial) - registered
  (
    'KN-SG-2024-004',
    100,
    'Ibrahim Taiwo Road, Sabon Gari',
    'Kano',
    'Kano',
    'Nigeria',
    '12.0022',
    '8.5919',
    1500,
    'commercial',
    'registered',
    'TN-KN-004-2024',
    'SP-KN-SG-004-2024',
    NOW() - INTERVAL '8 months',
    '{"boundaries":[{"lat":12.0022,"lng":8.5919},{"lat":12.0022,"lng":8.5949},{"lat":11.9992,"lng":8.5949},{"lat":11.9992,"lng":8.5919}]}'::jsonb,
    NOW() - INTERVAL '8 months',
    NOW()
  ),
  
  -- Lagos - Ikeja (Mixed Use) - draft
  (
    'LG-IKJ-2024-005',
    101,
    '12 Allen Avenue, Ikeja',
    'Lagos',
    'Lagos',
    'Nigeria',
    '6.6031',
    '3.3419',
    1800,
    'mixed',
    'draft',
    NULL,
    NULL,
    NULL,
    '{"boundaries":[{"lat":6.6031,"lng":3.3419},{"lat":6.6031,"lng":3.3439},{"lat":6.6011,"lng":3.3439},{"lat":6.6011,"lng":3.3419}]}'::jsonb,
    NOW() - INTERVAL '1 month',
    NOW()
  ),
  
  -- Abuja - Maitama (Residential - High Value) - draft
  (
    'AB-MAI-2024-006',
    102,
    'Plot 789, Aguiyi Ironsi Street, Maitama',
    'Abuja',
    'FCT',
    'Nigeria',
    '9.0879',
    '7.4851',
    3000,
    'residential',
    'draft',
    NULL,
    NULL,
    NULL,
    '{"boundaries":[{"lat":9.0879,"lng":7.4851},{"lat":9.0879,"lng":7.4881},{"lat":9.0849,"lng":7.4881},{"lat":9.0849,"lng":7.4851}]}'::jsonb,
    NOW() - INTERVAL '2 weeks',
    NOW()
  ),
  
  -- Port Harcourt - GRA (Residential) - registered
  (
    'PH-GRA-2024-007',
    100,
    '56 Aba Road, GRA Phase II',
    'Port Harcourt',
    'Rivers',
    'Nigeria',
    '4.8156',
    '7.0119',
    1000,
    'residential',
    'registered',
    'TN-PH-007-2024',
    'SP-PH-GRA-007-2024',
    NOW() - INTERVAL '5 months',
    '{"boundaries":[{"lat":4.8156,"lng":7.0119},{"lat":4.8156,"lng":7.0139},{"lat":4.8136,"lng":7.0139},{"lat":4.8136,"lng":7.0119}]}'::jsonb,
    NOW() - INTERVAL '5 months',
    NOW()
  ),
  
  -- Ibadan - Bodija (Agricultural) - registered
  (
    'OY-BOD-2024-008',
    101,
    'Sango-Bodija Road',
    'Ibadan',
    'Oyo',
    'Nigeria',
    '7.4356',
    '3.8919',
    50000,
    'agricultural',
    'registered',
    'TN-OY-008-2024',
    'SP-OY-BOD-008-2024',
    NOW() - INTERVAL '1 year',
    '{"boundaries":[{"lat":7.4356,"lng":3.8919},{"lat":7.4356,"lng":3.9019},{"lat":7.4256,"lng":3.9019},{"lat":7.4256,"lng":3.8919}]}'::jsonb,
    NOW() - INTERVAL '1 year',
    NOW()
  )
ON CONFLICT (parcel_id) DO NOTHING;

-- Get parcel IDs for foreign key references
DO $$
DECLARE
  parcel1_id INTEGER;
  parcel2_id INTEGER;
  parcel3_id INTEGER;
  parcel4_id INTEGER;
  parcel7_id INTEGER;
BEGIN
  SELECT id INTO parcel1_id FROM parcels WHERE parcel_id = 'LG-VI-2024-001';
  SELECT id INTO parcel2_id FROM parcels WHERE parcel_id = 'LG-LEK-2024-002';
  SELECT id INTO parcel3_id FROM parcels WHERE parcel_id = 'AB-GAR-2024-003';
  SELECT id INTO parcel4_id FROM parcels WHERE parcel_id = 'KN-SG-2024-004';
  SELECT id INTO parcel7_id FROM parcels WHERE parcel_id = 'PH-GRA-2024-007';

  -- Insert test transactions (status: initiated, pending_approval, approved, completed, failed, cancelled, rejected)
  INSERT INTO transactions (
    transaction_id, parcel_id, from_user_id, to_user_id,
    transaction_type, status, amount, currency,
    blockchain_tx_hash, initiated_at, completed_at,
    "createdAt", "updatedAt"
  )
  VALUES
    -- Completed transfer transaction
    (
      'TXN-2024-001',
      parcel1_id,
      100,
      101,
      'transfer',
      'completed',
      25000000,
      'NGN',
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      NOW() - INTERVAL '3 months',
      NOW() - INTERVAL '2 months',
      NOW() - INTERVAL '3 months',
      NOW()
    ),
    
    -- Pending approval transfer
    (
      'TXN-2024-002',
      parcel4_id,
      100,
      102,
      'transfer',
      'pending_approval',
      18000000,
      'NGN',
      NULL,
      NOW() - INTERVAL '1 week',
      NULL,
      NOW() - INTERVAL '1 week',
      NOW()
    ),
    
    -- Completed registration
    (
      'TXN-2024-003',
      parcel2_id,
      101,
      101,
      'registration',
      'completed',
      500000,
      'NGN',
      '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      NOW() - INTERVAL '4 months',
      NOW() - INTERVAL '3 months',
      NOW() - INTERVAL '4 months',
      NOW()
    ),
    
    -- Mortgage transaction
    (
      'TXN-2024-004',
      parcel7_id,
      100,
      100,
      'mortgage',
      'completed',
      15000000,
      'NGN',
      '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
      NOW() - INTERVAL '2 months',
      NOW() - INTERVAL '1 month',
      NOW() - INTERVAL '2 months',
      NOW()
    ),
    
    -- Rejected transfer
    (
      'TXN-2024-005',
      parcel3_id,
      102,
      100,
      'transfer',
      'rejected',
      12000000,
      'NGN',
      NULL,
      NOW() - INTERVAL '1 month',
      NULL,
      NOW() - INTERVAL '1 month',
      NOW()
    )
  ON CONFLICT (transaction_id) DO NOTHING;

  -- Insert test verification requests (status: draft, submitted, under_review, approved, rejected)
  INSERT INTO verification_requests (
    parcel_id, requester_id, reviewer_id, status,
    submitted_at, reviewed_at, approved_at, notes,
    created_at, updated_at
  )
  VALUES
    -- Approved verification
    (
      'LG-VI-2024-001',
      100,
      103,
      'approved',
      NOW() - INTERVAL '6 months',
      NOW() - INTERVAL '5 months 20 days',
      NOW() - INTERVAL '5 months',
      'All documents verified. Boundaries match survey data. Title is clear.',
      NOW() - INTERVAL '6 months',
      NOW()
    ),
    
    -- Submitted verification
    (
      'LG-IKJ-2024-005',
      101,
      NULL,
      'submitted',
      NOW() - INTERVAL '2 weeks',
      NULL,
      NULL,
      NULL,
      NOW() - INTERVAL '2 weeks',
      NOW()
    ),
    
    -- Under review verification
    (
      'AB-MAI-2024-006',
      102,
      103,
      'under_review',
      NOW() - INTERVAL '1 week',
      NOW() - INTERVAL '5 days',
      NULL,
      'Survey data under review. Awaiting boundary confirmation.',
      NOW() - INTERVAL '1 week',
      NOW()
    ),
    
    -- Rejected verification
    (
      'AB-GAR-2024-003',
      102,
      103,
      'rejected',
      NOW() - INTERVAL '3 months',
      NOW() - INTERVAL '2 months 20 days',
      NULL,
      'Incomplete documentation. Missing survey plan and deed of assignment.',
      NOW() - INTERVAL '3 months',
      NOW()
    );

  -- Insert test activity logs
  INSERT INTO activity_logs ("userId", type, description, metadata, "createdAt")
  VALUES
    (100, 'parcel_created', 'Created parcel LG-VI-2024-001', '{"parcel_id":"LG-VI-2024-001"}'::jsonb, NOW() - INTERVAL '6 months'),
    (101, 'transaction_initiated', 'Initiated transfer transaction TXN-2024-001', '{"transaction_id":"TXN-2024-001"}'::jsonb, NOW() - INTERVAL '3 months'),
    (103, 'verification_approved', 'Approved verification request', '{"parcel_id":"LG-VI-2024-001"}'::jsonb, NOW() - INTERVAL '5 months'),
    (100, 'parcel_viewed', 'Viewed parcel details', '{"parcel_id":"LG-VI-2024-001"}'::jsonb, NOW() - INTERVAL '1 day'),
    (102, 'verification_submitted', 'Submitted verification request', '{"parcel_id":"AB-MAI-2024-006"}'::jsonb, NOW() - INTERVAL '1 week');

END $$;

-- Verify data insertion
SELECT 'Users inserted:' AS info, COUNT(*) AS count FROM users WHERE id >= 100;
SELECT 'Parcels inserted:' AS info, COUNT(*) AS count FROM parcels WHERE parcel_id LIKE '%-2024-%';
SELECT 'Transactions inserted:' AS info, COUNT(*) AS count FROM transactions WHERE transaction_id LIKE 'TXN-2024-%';
SELECT 'Verification requests inserted:' AS info, COUNT(*) AS count FROM verification_requests WHERE parcel_id LIKE '%-2024-%';
SELECT 'Activity logs inserted:' AS info, COUNT(*) AS count FROM activity_logs WHERE "userId" >= 100;

-- Display sample data
SELECT 'Sample Parcels:' AS section;
SELECT parcel_id, address, city, state, status, title_number FROM parcels WHERE parcel_id LIKE '%-2024-%' LIMIT 5;

SELECT 'Sample Transactions:' AS section;
SELECT transaction_id, transaction_type, status, amount, initiated_at FROM transactions WHERE transaction_id LIKE 'TXN-2024-%' LIMIT 5;

SELECT 'Sample Verification Requests:' AS section;
SELECT parcel_id, status, submitted_at, notes FROM verification_requests WHERE parcel_id LIKE '%-2024-%' LIMIT 5;
