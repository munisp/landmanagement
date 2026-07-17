-- IDLR-PTS Test Data Seed Script
-- This script populates the database with realistic test data for development and testing

-- Clear existing test data (optional - comment out if you want to preserve existing data)
-- TRUNCATE TABLE parcels, transactions, verification_requests, documents CASCADE;

-- Insert test users (if not already exist)
INSERT INTO "user" (id, "openId", name, email, role, "createdAt", "updatedAt")
VALUES 
  (1, 'test-owner-1', 'Adewale Johnson', 'adewale.johnson@example.com', 'citizen', NOW(), NOW()),
  (2, 'test-owner-2', 'Fatima Abubakar', 'fatima.abubakar@example.com', 'citizen', NOW(), NOW()),
  (3, 'test-owner-3', 'Chioma Okafor', 'chioma.okafor@example.com', 'citizen', NOW(), NOW()),
  (4, 'test-registrar-1', 'Ibrahim Musa', 'ibrahim.musa@example.com', 'registrar', NOW(), NOW()),
  (5, 'test-surveyor-1', 'Oluwaseun Adeyemi', 'oluwaseun.adeyemi@example.com', 'surveyor', NOW(), NOW())
ON CONFLICT ("openId") DO NOTHING;

-- Insert test parcels with realistic Nigerian locations
INSERT INTO parcels (
  "parcelNumber", "titleNumber", state, lga, "streetAddress", "landUseType",
  "areaSquareMeters", "geometryGeoJSON", status, "ownerId", "surveyorId",
  "registeredAt", "verifiedAt", "createdAt", "updatedAt"
)
VALUES
  -- Lagos - Victoria Island (Commercial)
  (
    'LG-VI-2024-001',
    'TN-LG-001-2024',
    'Lagos',
    'Eti-Osa',
    '15 Adeola Odeku Street, Victoria Island',
    'commercial',
    2500.00,
    '{"type":"Polygon","coordinates":[[[3.4219,6.4281],[3.4249,6.4281],[3.4249,6.4251],[3.4219,6.4251],[3.4219,6.4281]]]}',
    'verified',
    1,
    5,
    NOW() - INTERVAL '6 months',
    NOW() - INTERVAL '5 months',
    NOW() - INTERVAL '6 months',
    NOW()
  ),
  
  -- Lagos - Lekki (Residential)
  (
    'LG-LEK-2024-002',
    'TN-LG-002-2024',
    'Lagos',
    'Eti-Osa',
    'Plot 45, Admiralty Way, Lekki Phase 1',
    'residential',
    1200.00,
    '{"type":"Polygon","coordinates":[[[3.4719,6.4381],[3.4739,6.4381],[3.4739,6.4361],[3.4719,6.4361],[3.4719,6.4381]]]}',
    'verified',
    2,
    5,
    NOW() - INTERVAL '4 months',
    NOW() - INTERVAL '3 months',
    NOW() - INTERVAL '4 months',
    NOW()
  ),
  
  -- Abuja - Garki (Residential)
  (
    'AB-GAR-2024-003',
    'TN-AB-003-2024',
    'FCT',
    'Abuja Municipal',
    '23 Tafawa Balewa Way, Garki II',
    'residential',
    800.00,
    '{"type":"Polygon","coordinates":[[[7.4951,9.0579],[7.4971,9.0579],[7.4971,9.0559],[7.4951,9.0559],[7.4951,9.0579]]]}',
    'registered',
    3,
    5,
    NOW() - INTERVAL '2 months',
    NULL,
    NOW() - INTERVAL '2 months',
    NOW()
  ),
  
  -- Kano - Sabon Gari (Commercial)
  (
    'KN-SG-2024-004',
    'TN-KN-004-2024',
    'Kano',
    'Kano Municipal',
    'Ibrahim Taiwo Road, Sabon Gari',
    'commercial',
    1500.00,
    '{"type":"Polygon","coordinates":[[[8.5919,12.0022],[8.5949,12.0022],[8.5949,11.9992],[8.5919,11.9992],[8.5919,12.0022]]]}',
    'verified',
    1,
    5,
    NOW() - INTERVAL '8 months',
    NOW() - INTERVAL '7 months',
    NOW() - INTERVAL '8 months',
    NOW()
  ),
  
  -- Lagos - Ikeja (Mixed Use)
  (
    'LG-IKJ-2024-005',
    'TN-LG-005-2024',
    'Lagos',
    'Ikeja',
    '12 Allen Avenue, Ikeja',
    'mixed',
    1800.00,
    '{"type":"Polygon","coordinates":[[[3.3419,6.6031],[3.3439,6.6031],[3.3439,6.6011],[3.3419,6.6011],[3.3419,6.6031]]]}',
    'pending_verification',
    2,
    5,
    NOW() - INTERVAL '1 month',
    NULL,
    NOW() - INTERVAL '1 month',
    NOW()
  ),
  
  -- Abuja - Maitama (Residential - High Value)
  (
    'AB-MAI-2024-006',
    NULL,
    'FCT',
    'Abuja Municipal',
    'Plot 789, Aguiyi Ironsi Street, Maitama',
    'residential',
    3000.00,
    '{"type":"Polygon","coordinates":[[[7.4851,9.0879],[7.4881,9.0879],[7.4881,9.0849],[7.4851,9.0849],[7.4851,9.0879]]]}',
    'under_survey',
    3,
    5,
    NULL,
    NULL,
    NOW() - INTERVAL '2 weeks',
    NOW()
  ),
  
  -- Port Harcourt - GRA (Residential)
  (
    'PH-GRA-2024-007',
    'TN-PH-007-2024',
    'Rivers',
    'Port Harcourt',
    '56 Aba Road, GRA Phase II',
    'residential',
    1000.00,
    '{"type":"Polygon","coordinates":[[[7.0119,4.8156],[7.0139,4.8156],[7.0139,4.8136],[7.0119,4.8136],[7.0119,4.8156]]]}',
    'verified',
    1,
    5,
    NOW() - INTERVAL '5 months',
    NOW() - INTERVAL '4 months',
    NOW() - INTERVAL '5 months',
    NOW()
  ),
  
  -- Ibadan - Bodija (Agricultural)
  (
    'OY-BOD-2024-008',
    'TN-OY-008-2024',
    'Oyo',
    'Ibadan North',
    'Sango-Bodija Road',
    'agricultural',
    50000.00,
    '{"type":"Polygon","coordinates":[[[3.8919,7.4356],[3.9019,7.4356],[3.9019,7.4256],[3.8919,7.4256],[3.8919,7.4356]]]}',
    'verified',
    2,
    5,
    NOW() - INTERVAL '1 year',
    NOW() - INTERVAL '11 months',
    NOW() - INTERVAL '1 year',
    NOW()
  );

-- Insert test transactions
INSERT INTO transactions (
  "transactionNumber", type, status, "parcelId", "fromUserId", "toUserId",
  amount, "paymentStatus", "blockchainTxHash", "initiatedAt", "completedAt",
  "createdAt", "updatedAt"
)
VALUES
  -- Completed transfer transaction
  (
    'TXN-2024-001',
    'transfer',
    'completed',
    1,
    1,
    2,
    25000000.00,
    'completed',
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    NOW() - INTERVAL '3 months',
    NOW() - INTERVAL '2 months',
    NOW() - INTERVAL '3 months',
    NOW()
  ),
  
  -- Pending approval transfer
  (
    'TXN-2024-002',
    'transfer',
    'pending_approval',
    4,
    1,
    3,
    18000000.00,
    'pending',
    NULL,
    NOW() - INTERVAL '1 week',
    NULL,
    NOW() - INTERVAL '1 week',
    NOW()
  ),
  
  -- Completed registration
  (
    'TXN-2024-003',
    'registration',
    'completed',
    2,
    2,
    NULL,
    500000.00,
    'completed',
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    NOW() - INTERVAL '4 months',
    NOW() - INTERVAL '3 months',
    NOW() - INTERVAL '4 months',
    NOW()
  ),
  
  -- Mortgage transaction
  (
    'TXN-2024-004',
    'mortgage',
    'completed',
    7,
    1,
    NULL,
    15000000.00,
    'completed',
    '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
    NOW() - INTERVAL '2 months',
    NOW() - INTERVAL '1 month',
    NOW() - INTERVAL '2 months',
    NOW()
  ),
  
  -- Rejected transfer
  (
    'TXN-2024-005',
    'transfer',
    'rejected',
    3,
    3,
    1,
    12000000.00,
    'refunded',
    NULL,
    NOW() - INTERVAL '1 month',
    NOW() - INTERVAL '3 weeks',
    NOW() - INTERVAL '1 month',
    NOW()
  );

-- Insert test verification requests
INSERT INTO verification_requests (
  "requestNumber", "parcelId", "requestedById", status, priority,
  "verificationNotes", "submittedAt", "assignedAt", "completedAt",
  "createdAt", "updatedAt"
)
VALUES
  -- Completed verification
  (
    'VER-2024-001',
    1,
    1,
    'approved',
    'high',
    'All documents verified. Boundaries match survey data. Title is clear.',
    NOW() - INTERVAL '6 months',
    NOW() - INTERVAL '5 months 20 days',
    NOW() - INTERVAL '5 months',
    NOW() - INTERVAL '6 months',
    NOW()
  ),
  
  -- Pending verification
  (
    'VER-2024-002',
    5,
    2,
    'pending',
    'medium',
    NULL,
    NOW() - INTERVAL '2 weeks',
    NULL,
    NULL,
    NOW() - INTERVAL '2 weeks',
    NOW()
  ),
  
  -- In progress verification
  (
    'VER-2024-003',
    6,
    3,
    'in_review',
    'high',
    'Survey data under review. Awaiting boundary confirmation.',
    NOW() - INTERVAL '1 week',
    NOW() - INTERVAL '5 days',
    NULL,
    NOW() - INTERVAL '1 week',
    NOW()
  ),
  
  -- Rejected verification
  (
    'VER-2024-004',
    3,
    3,
    'rejected',
    'low',
    'Incomplete documentation. Missing survey plan and deed of assignment.',
    NOW() - INTERVAL '3 months',
    NOW() - INTERVAL '2 months 20 days',
    NOW() - INTERVAL '2 months',
    NOW() - INTERVAL '3 months',
    NOW()
  );

-- Insert test documents
INSERT INTO documents (
  "fileName", "fileType", "fileSize", "storageUrl", "uploadedById",
  "parcelId", "transactionId", "documentType", status,
  "createdAt", "updatedAt"
)
VALUES
  -- Parcel 1 documents
  (
    'survey-plan-lg-vi-001.pdf',
    'application/pdf',
    2456789,
    'https://storage.example.com/documents/survey-plan-lg-vi-001.pdf',
    1,
    1,
    NULL,
    'survey_plan',
    'verified',
    NOW() - INTERVAL '6 months',
    NOW()
  ),
  (
    'deed-of-assignment-lg-vi-001.pdf',
    'application/pdf',
    1234567,
    'https://storage.example.com/documents/deed-lg-vi-001.pdf',
    1,
    1,
    NULL,
    'deed',
    'verified',
    NOW() - INTERVAL '6 months',
    NOW()
  ),
  
  -- Parcel 2 documents
  (
    'certificate-of-occupancy-lg-lek-002.pdf',
    'application/pdf',
    3456789,
    'https://storage.example.com/documents/c-of-o-lg-lek-002.pdf',
    2,
    2,
    NULL,
    'certificate_of_occupancy',
    'verified',
    NOW() - INTERVAL '4 months',
    NOW()
  ),
  
  -- Transaction 1 documents
  (
    'transfer-agreement-txn-001.pdf',
    'application/pdf',
    1876543,
    'https://storage.example.com/documents/transfer-txn-001.pdf',
    1,
    NULL,
    1,
    'transfer_agreement',
    'verified',
    NOW() - INTERVAL '3 months',
    NOW()
  );

-- Insert test activity logs
INSERT INTO activity_logs (
  "userId", action, entity, "entityId", details,
  "ipAddress", "userAgent", "createdAt"
)
VALUES
  (1, 'create', 'parcel', 1, '{"parcelNumber":"LG-VI-2024-001"}', '192.168.1.100', 'Mozilla/5.0', NOW() - INTERVAL '6 months'),
  (2, 'create', 'transaction', 1, '{"transactionNumber":"TXN-2024-001","type":"transfer"}', '192.168.1.101', 'Mozilla/5.0', NOW() - INTERVAL '3 months'),
  (4, 'approve', 'verification_request', 1, '{"status":"approved"}', '192.168.1.102', 'Mozilla/5.0', NOW() - INTERVAL '5 months'),
  (1, 'view', 'parcel', 1, '{}', '192.168.1.100', 'Mozilla/5.0', NOW() - INTERVAL '1 day'),
  (3, 'create', 'verification_request', 3, '{"requestNumber":"VER-2024-003"}', '192.168.1.103', 'Mozilla/5.0', NOW() - INTERVAL '1 week');

-- Insert test blockchain transactions
INSERT INTO blockchain_transactions (
  "txHash", "blockNumber", "blockTimestamp", "fromAddress", "toAddress",
  "transactionId", "parcelId", status, "gasUsed", "gasFee",
  "createdAt", "updatedAt"
)
VALUES
  (
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    1234567,
    NOW() - INTERVAL '2 months',
    '0xSender123',
    '0xReceiver456',
    1,
    1,
    'confirmed',
    21000,
    0.0005,
    NOW() - INTERVAL '2 months',
    NOW()
  ),
  (
    '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    1234890,
    NOW() - INTERVAL '3 months',
    '0xSender789',
    '0xReceiver012',
    3,
    2,
    'confirmed',
    21000,
    0.0004,
    NOW() - INTERVAL '3 months',
    NOW()
  );

-- Verify data insertion
SELECT 'Parcels inserted:' AS info, COUNT(*) AS count FROM parcels;
SELECT 'Transactions inserted:' AS info, COUNT(*) AS count FROM transactions;
SELECT 'Verification requests inserted:' AS info, COUNT(*) AS count FROM verification_requests;
SELECT 'Documents inserted:' AS info, COUNT(*) AS count FROM documents;
SELECT 'Activity logs inserted:' AS info, COUNT(*) AS count FROM activity_logs;
SELECT 'Blockchain transactions inserted:' AS info, COUNT(*) AS count FROM blockchain_transactions;
