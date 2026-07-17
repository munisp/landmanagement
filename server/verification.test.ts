import { describe, it, expect, beforeAll } from 'vitest';
import { getDb, upsertUser } from './db';
import * as verificationService from './verificationService';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Verification Workflow', () => {
  let testRequesterId: number;
  let testReviewerId: number;
  let testRequestId: number;

  beforeAll(async () => {
    const db = await getDb();

    if (!db) {
      testRequesterId = 501;
      testReviewerId = 601;
      return;
    }

    // Create test requester
    await upsertUser({
      openId: 'test-requester-openid',
      name: 'Test Requester',
      email: 'requester@test.com',
    });

    const [requester] = await db
      .select()
      .from(users)
      .where(eq(users.openId, 'test-requester-openid'))
      .limit(1);

    if (requester) {
      testRequesterId = requester.id;
    }

    // Create test reviewer
    await upsertUser({
      openId: 'test-reviewer-openid',
      name: 'Test Reviewer',
      email: 'reviewer@test.com',
    });

    const [reviewer] = await db
      .select()
      .from(users)
      .where(eq(users.openId, 'test-reviewer-openid'))
      .limit(1);

    if (reviewer) {
      testReviewerId = reviewer.id;
      // Set reviewer role to registrar
      await db
        .update(users)
        .set({ role: 'registrar' })
        .where(eq(users.id, testReviewerId));
    }
  });

  describe('createVerificationRequest', () => {
    it('should create a new verification request', async () => {
      const result = await verificationService.createVerificationRequest(
        'LG-VI-2024-TEST-001',
        testRequesterId,
        'Test verification request'
      );

      expect(result.success).toBe(true);
      expect(result.requestId).toBeDefined();
      
      if (result.requestId) {
        testRequestId = result.requestId;
      }
    });

    it('should create request in draft status', async () => {
      const details = await verificationService.getVerificationRequestDetails(testRequestId);

      expect(details).toBeDefined();
      expect(details?.status).toBe('draft');
      expect(details?.parcelId).toBe('LG-VI-2024-TEST-001');
      expect(details?.requesterId).toBe(testRequesterId);
    });
  });

  describe('addVerificationDocument', () => {
    it('should add document to verification request', async () => {
      const result = await verificationService.addVerificationDocument(
        testRequestId,
        'survey_plan',
        'test-survey.pdf',
        'https://storage.example.com/test-survey.pdf',
        1024000,
        'application/pdf',
        testRequesterId
      );

      expect(result.success).toBe(true);
      expect(result.documentId).toBeDefined();
    });

    it('should include document in request details', async () => {
      const details = await verificationService.getVerificationRequestDetails(testRequestId);

      expect(details?.documents.length).toBeGreaterThan(0);
      expect(details?.documents[0].documentType).toBe('survey_plan');
      expect(details?.documents[0].fileName).toBe('test-survey.pdf');
    });
  });

  describe('submitVerificationRequest', () => {
    it('should fail to submit request without documents', async () => {
      // Create new request without documents
      const createResult = await verificationService.createVerificationRequest(
        'LG-VI-2024-TEST-002',
        testRequesterId
      );

      const submitResult = await verificationService.submitVerificationRequest(
        createResult.requestId!,
        testRequesterId
      );

      expect(submitResult.success).toBe(false);
      expect(submitResult.message).toContain('at least one document');
    });

    it('should successfully submit request with documents', async () => {
      const result = await verificationService.submitVerificationRequest(
        testRequestId,
        testRequesterId
      );

      expect(result.success).toBe(true);
    });

    it('should update status to submitted', async () => {
      const details = await verificationService.getVerificationRequestDetails(testRequestId);

      expect(details?.status).toBe('submitted');
      expect(details?.submittedAt).toBeDefined();
    });

    it('should not allow resubmitting already submitted request', async () => {
      const result = await verificationService.submitVerificationRequest(
        testRequestId,
        testRequesterId
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('already been submitted');
    });
  });

  describe('assignReviewer', () => {
    it('should assign reviewer to submitted request', async () => {
      const result = await verificationService.assignReviewer(
        testRequestId,
        testReviewerId,
        testReviewerId
      );

      expect(result.success).toBe(true);
    });

    it('should update status to under_review', async () => {
      const details = await verificationService.getVerificationRequestDetails(testRequestId);

      expect(details?.status).toBe('under_review');
      expect(details?.reviewerId).toBe(testReviewerId);
      expect(details?.reviewerName).toBe('Test Reviewer');
    });
  });

  describe('approveVerificationRequest', () => {
    it('should approve verification request', async () => {
      const result = await verificationService.approveVerificationRequest(
        testRequestId,
        testReviewerId,
        '0x1234567890abcdef'
      );

      expect(result.success).toBe(true);
    });

    it('should update status to approved with blockchain hash', async () => {
      const details = await verificationService.getVerificationRequestDetails(testRequestId);

      expect(details?.status).toBe('approved');
      expect(details?.approvedAt).toBeDefined();
      expect(details?.reviewedAt).toBeDefined();
      expect(details?.blockchainTxHash).toBe('0x1234567890abcdef');
    });
  });

  describe('rejectVerificationRequest', () => {
    let rejectRequestId: number;

    beforeAll(async () => {
      // Create new request for rejection test
      const createResult = await verificationService.createVerificationRequest(
        'LG-VI-2024-TEST-003',
        testRequesterId,
        'Request to be rejected'
      );
      rejectRequestId = createResult.requestId!;

      // Add document
      await verificationService.addVerificationDocument(
        rejectRequestId,
        'title_deed',
        'test-deed.pdf',
        'https://storage.example.com/test-deed.pdf',
        512000,
        'application/pdf',
        testRequesterId
      );

      // Submit
      await verificationService.submitVerificationRequest(rejectRequestId, testRequesterId);

      // Assign reviewer
      await verificationService.assignReviewer(rejectRequestId, testReviewerId, testReviewerId);
    });

    it('should reject verification request with reason', async () => {
      const result = await verificationService.rejectVerificationRequest(
        rejectRequestId,
        testReviewerId,
        'Incomplete documentation'
      );

      expect(result.success).toBe(true);
    });

    it('should update status to rejected with reason', async () => {
      const details = await verificationService.getVerificationRequestDetails(rejectRequestId);

      expect(details?.status).toBe('rejected');
      expect(details?.rejectedAt).toBeDefined();
      expect(details?.reviewedAt).toBeDefined();
      expect(details?.rejectionReason).toBe('Incomplete documentation');
    });
  });

  describe('listVerificationRequests', () => {
    it('should list all verification requests', async () => {
      const result = await verificationService.listVerificationRequests({}, 1, 50);

      expect(result.requests.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should filter by status', async () => {
      const result = await verificationService.listVerificationRequests(
        { status: 'approved' },
        1,
        50
      );

      expect(result.requests.every((req) => req.status === 'approved')).toBe(true);
    });

    it('should filter by requester', async () => {
      const result = await verificationService.listVerificationRequests(
        { requesterId: testRequesterId },
        1,
        50
      );

      expect(result.requests.every((req) => req.requesterId === testRequesterId)).toBe(true);
    });

    it('should filter by reviewer', async () => {
      const result = await verificationService.listVerificationRequests(
        { reviewerId: testReviewerId },
        1,
        50
      );

      expect(result.requests.every((req) => req.reviewerId === testReviewerId)).toBe(true);
    });

    it('should filter by parcel ID', async () => {
      const result = await verificationService.listVerificationRequests(
        { parcelId: 'LG-VI-2024-TEST-FULL' },
        1,
        50
      );

      expect(result.requests.length).toBeGreaterThanOrEqual(1);
      expect(result.requests.every((req) => req.parcelId === 'LG-VI-2024-TEST-FULL')).toBe(true);
    });
  });

  describe('getVerificationHistory', () => {
    it('should return history for verification request', async () => {
      const history = await verificationService.getVerificationHistory(testRequestId);

      expect(history.length).toBeGreaterThan(0);
    });

    it('should include all workflow actions', async () => {
      const history = await verificationService.getVerificationHistory(testRequestId);

      const actions = history.map((h) => h.action);
      expect(actions).toContain('created');
      expect(actions).toContain('document_uploaded');
      expect(actions).toContain('submitted');
      expect(actions).toContain('assigned');
      expect(actions).toContain('approved');
    });

    it('should include user information in history', async () => {
      const history = await verificationService.getVerificationHistory(testRequestId);

      expect(history.every((h) => h.userName !== null)).toBe(true);
      expect(history.every((h) => h.userId !== null)).toBe(true);
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should handle complete workflow from creation to approval', async () => {
      // Create
      const createResult = await verificationService.createVerificationRequest(
        'LG-VI-2024-TEST-FULL',
        testRequesterId,
        'Full workflow test'
      );
      expect(createResult.success).toBe(true);
      const requestId = createResult.requestId!;

      // Add document
      const docResult = await verificationService.addVerificationDocument(
        requestId,
        'survey_plan',
        'full-test-survey.pdf',
        'https://storage.example.com/full-test-survey.pdf',
        2048000,
        'application/pdf',
        testRequesterId
      );
      expect(docResult.success).toBe(true);

      // Submit
      const submitResult = await verificationService.submitVerificationRequest(
        requestId,
        testRequesterId
      );
      expect(submitResult.success).toBe(true);

      // Assign
      const assignResult = await verificationService.assignReviewer(
        requestId,
        testReviewerId,
        testReviewerId
      );
      expect(assignResult.success).toBe(true);

      // Approve
      const approveResult = await verificationService.approveVerificationRequest(
        requestId,
        testReviewerId,
        '0xfullworkflowtest'
      );
      expect(approveResult.success).toBe(true);

      // Verify final state
      const details = await verificationService.getVerificationRequestDetails(requestId);
      expect(details?.status).toBe('approved');
      expect(details?.documents.length).toBe(1);
      expect(details?.blockchainTxHash).toBe('0xfullworkflowtest');

      // Verify history
      const history = await verificationService.getVerificationHistory(requestId);
      expect(history.length).toBeGreaterThanOrEqual(5);
    });
  });
});
