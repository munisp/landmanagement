/**
 * Verification Service
 * Handles parcel verification workflow including document management,
 * reviewer assignment, status transitions, and blockchain recording
 */

import { getDb } from './db';
import { 
  verificationRequests, 
  verificationDocuments, 
  verificationHistory,
  users 
} from '../drizzle/schema';
import { eq, desc, and, or, sql } from 'drizzle-orm';
import { notificationService } from './notifications';
import {
  addVerificationDocumentOffline,
  approveVerificationRequestOffline,
  assignReviewerOffline,
  createVerificationRequestOffline,
  getVerificationHistoryOffline,
  getVerificationRequestDetailsOffline,
  listVerificationRequestsOffline,
  rejectVerificationRequestOffline,
  submitVerificationRequestOffline,
} from './verificationRepository';

export interface VerificationRequestDetails {
  id: number;
  parcelId: string;
  requesterId: number;
  requesterName: string | null;
  reviewerId: number | null;
  reviewerName: string | null;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
  submittedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  blockchainTxHash: string | null;
  notes: string | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  documents: VerificationDocumentDetails[];
}

export interface VerificationDocumentDetails {
  id: number;
  documentType: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: number;
  uploaderName: string | null;
  verified: boolean;
  verifiedBy: number | null;
  verifiedAt: Date | null;
  createdAt: Date;
}

/**
 * Create a new verification request
 */
export async function createVerificationRequest(
  parcelId: string,
  requesterId: number,
  notes?: string
): Promise<{ success: boolean; requestId?: number }> {
  const db = await getDb();
  if (!db) {
    return createVerificationRequestOffline(parcelId, requesterId, `User ${requesterId}`, notes);
  }

  const [request] = await db
    .insert(verificationRequests)
    .values({
      parcelId,
      requesterId,
      status: 'draft',
      notes,
      metadata: {},
    })
    .returning();

  if (!request) {
    return { success: false };
  }

  // Log history
  await db.insert(verificationHistory).values({
    verificationRequestId: request.id,
    userId: requesterId,
    action: 'created',
    newStatus: 'draft',
    comment: 'Verification request created',
  });

  console.log(`[VerificationService] Request ${request.id} created for parcel ${parcelId}`);
  return { success: true, requestId: request.id };
}

/**
 * Submit verification request for review
 */
export async function submitVerificationRequest(
  requestId: number,
  userId: number
): Promise<{ success: boolean; message?: string }> {
  const db = await getDb();
  if (!db) {
    return submitVerificationRequestOffline(requestId, userId);
  }

  // Check if request exists and is in draft status
  const [request] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.id, requestId))
    .limit(1);

  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }

  if (request.status !== 'draft') {
    return { success: false, message: 'Request has already been submitted' };
  }

  // Check if documents are uploaded
  const docs = await db
    .select()
    .from(verificationDocuments)
    .where(eq(verificationDocuments.verificationRequestId, requestId));

  if (docs.length === 0) {
    return { success: false, message: 'Please upload at least one document before submitting' };
  }

  // Update status to submitted
  await db
    .update(verificationRequests)
    .set({
      status: 'submitted',
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(verificationRequests.id, requestId));

  // Log history
  await db.insert(verificationHistory).values({
    verificationRequestId: requestId,
    userId,
    action: 'submitted',
    previousStatus: 'draft',
    newStatus: 'submitted',
    comment: 'Request submitted for review',
  });

  // Send notification to admins/registrars
  notificationService.notifyNewVerificationRequest(requestId, request.parcelId);

  console.log(`[VerificationService] Request ${requestId} submitted`);
  return { success: true };
}

/**
 * Assign reviewer to verification request
 */
export async function assignReviewer(
  requestId: number,
  reviewerId: number,
  assignedBy: number
): Promise<{ success: boolean; message?: string }> {
  const db = await getDb();
  if (!db) {
    return assignReviewerOffline(requestId, reviewerId, assignedBy);
  }

  const [request] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.id, requestId))
    .limit(1);

  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }

  if (request.status !== 'submitted' && request.status !== 'under_review') {
    return { success: false, message: 'Request is not in a reviewable state' };
  }

  // Update reviewer and status
  await db
    .update(verificationRequests)
    .set({
      reviewerId,
      status: 'under_review',
      updatedAt: new Date(),
    })
    .where(eq(verificationRequests.id, requestId));

  // Log history
  await db.insert(verificationHistory).values({
    verificationRequestId: requestId,
    userId: assignedBy,
    action: 'assigned',
    previousStatus: request.status,
    newStatus: 'under_review',
    comment: `Assigned to reviewer ID ${reviewerId}`,
  });

  // Notify reviewer
  notificationService.notifyVerificationAssigned(requestId, reviewerId);

  console.log(`[VerificationService] Request ${requestId} assigned to reviewer ${reviewerId}`);
  return { success: true };
}

/**
 * Approve verification request
 */
export async function approveVerificationRequest(
  requestId: number,
  reviewerId: number,
  blockchainTxHash?: string
): Promise<{ success: boolean; message?: string }> {
  const db = await getDb();
  if (!db) {
    return approveVerificationRequestOffline(requestId, reviewerId, blockchainTxHash);
  }

  const [request] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.id, requestId))
    .limit(1);

  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }

  if (request.status !== 'under_review') {
    return { success: false, message: 'Request is not under review' };
  }

  // Update status to approved
  await db
    .update(verificationRequests)
    .set({
      status: 'approved',
      approvedAt: new Date(),
      reviewedAt: new Date(),
      blockchainTxHash,
      updatedAt: new Date(),
    })
    .where(eq(verificationRequests.id, requestId));

  // Log history
  await db.insert(verificationHistory).values({
    verificationRequestId: requestId,
    userId: reviewerId,
    action: 'approved',
    previousStatus: 'under_review',
    newStatus: 'approved',
    comment: blockchainTxHash ? `Approved and recorded on blockchain: ${blockchainTxHash}` : 'Approved',
  });

  // Notify requester
  notificationService.notifyVerificationApproved(requestId, request.requesterId);

  console.log(`[VerificationService] Request ${requestId} approved by reviewer ${reviewerId}`);
  return { success: true };
}

/**
 * Reject verification request
 */
export async function rejectVerificationRequest(
  requestId: number,
  reviewerId: number,
  reason: string
): Promise<{ success: boolean; message?: string }> {
  const db = await getDb();
  if (!db) {
    return rejectVerificationRequestOffline(requestId, reviewerId, reason);
  }

  const [request] = await db
    .select()
    .from(verificationRequests)
    .where(eq(verificationRequests.id, requestId))
    .limit(1);

  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }

  if (request.status !== 'under_review') {
    return { success: false, message: 'Request is not under review' };
  }

  // Update status to rejected
  await db
    .update(verificationRequests)
    .set({
      status: 'rejected',
      rejectedAt: new Date(),
      reviewedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(verificationRequests.id, requestId));

  // Log history
  await db.insert(verificationHistory).values({
    verificationRequestId: requestId,
    userId: reviewerId,
    action: 'rejected',
    previousStatus: 'under_review',
    newStatus: 'rejected',
    comment: `Rejected: ${reason}`,
  });

  // Notify requester
  notificationService.notifyVerificationRejected(requestId, request.requesterId, reason);

  console.log(`[VerificationService] Request ${requestId} rejected by reviewer ${reviewerId}`);
  return { success: true };
}

/**
 * Add document to verification request
 */
export async function addVerificationDocument(
  requestId: number,
  documentType: string,
  fileName: string,
  fileUrl: string,
  fileSize: number,
  mimeType: string,
  uploadedBy: number
): Promise<{ success: boolean; documentId?: number }> {
  const db = await getDb();
  if (!db) {
    return addVerificationDocumentOffline(requestId, documentType, fileName, fileUrl, fileSize, mimeType, uploadedBy) as {
      success: boolean;
      documentId?: number;
    };
  }

  const [doc] = await db
    .insert(verificationDocuments)
    .values({
      verificationRequestId: requestId,
      documentType,
      fileName,
      fileUrl,
      fileSize,
      mimeType,
      uploadedBy,
    })
    .returning();

  if (!doc) {
    return { success: false };
  }

  // Log history
  await db.insert(verificationHistory).values({
    verificationRequestId: requestId,
    userId: uploadedBy,
    action: 'document_uploaded',
    comment: `Uploaded ${documentType}: ${fileName}`,
  });

  console.log(`[VerificationService] Document ${doc.id} added to request ${requestId}`);
  return { success: true, documentId: doc.id };
}

/**
 * Get verification request details with documents
 */
export async function getVerificationRequestDetails(
  requestId: number
): Promise<VerificationRequestDetails | null> {
  const db = await getDb();
  if (!db) {
    return getVerificationRequestDetailsOffline(requestId) as VerificationRequestDetails | null;
  }

  const [request] = await db
    .select({
      id: verificationRequests.id,
      parcelId: verificationRequests.parcelId,
      requesterId: verificationRequests.requesterId,
      requesterName: users.name,
      reviewerId: verificationRequests.reviewerId,
      status: verificationRequests.status,
      submittedAt: verificationRequests.submittedAt,
      reviewedAt: verificationRequests.reviewedAt,
      approvedAt: verificationRequests.approvedAt,
      rejectedAt: verificationRequests.rejectedAt,
      rejectionReason: verificationRequests.rejectionReason,
      blockchainTxHash: verificationRequests.blockchainTxHash,
      notes: verificationRequests.notes,
      metadata: verificationRequests.metadata,
      createdAt: verificationRequests.createdAt,
      updatedAt: verificationRequests.updatedAt,
    })
    .from(verificationRequests)
    .leftJoin(users, eq(verificationRequests.requesterId, users.id))
    .where(eq(verificationRequests.id, requestId))
    .limit(1);

  if (!request) {
    return null;
  }

  // Get reviewer name if assigned
  let reviewerName: string | null = null;
  if (request.reviewerId) {
    const [reviewer] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, request.reviewerId))
      .limit(1);
    reviewerName = reviewer?.name || null;
  }

  // Get documents
  const docs = await db
    .select({
      id: verificationDocuments.id,
      documentType: verificationDocuments.documentType,
      fileName: verificationDocuments.fileName,
      fileUrl: verificationDocuments.fileUrl,
      fileSize: verificationDocuments.fileSize,
      mimeType: verificationDocuments.mimeType,
      uploadedBy: verificationDocuments.uploadedBy,
      uploaderName: users.name,
      verified: verificationDocuments.verified,
      verifiedBy: verificationDocuments.verifiedBy,
      verifiedAt: verificationDocuments.verifiedAt,
      createdAt: verificationDocuments.createdAt,
    })
    .from(verificationDocuments)
    .leftJoin(users, eq(verificationDocuments.uploadedBy, users.id))
    .where(eq(verificationDocuments.verificationRequestId, requestId));

  return {
    ...request,
    reviewerName,
    documents: docs,
  };
}

/**
 * List verification requests with filters
 */
export async function listVerificationRequests(
  filters: {
    status?: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
    requesterId?: number;
    reviewerId?: number;
    parcelId?: string;
  },
  page: number = 1,
  limit: number = 20
): Promise<{
  requests: VerificationRequestDetails[];
  total: number;
  page: number;
  limit: number;
}> {
  const db = await getDb();
  if (!db) {
    return listVerificationRequestsOffline(filters, page, limit) as {
      requests: VerificationRequestDetails[];
      total: number;
      page: number;
      limit: number;
    };
  }

  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions = [];
  if (filters.status) {
    conditions.push(eq(verificationRequests.status, filters.status));
  }
  if (filters.requesterId) {
    conditions.push(eq(verificationRequests.requesterId, filters.requesterId));
  }
  if (filters.reviewerId) {
    conditions.push(eq(verificationRequests.reviewerId, filters.reviewerId));
  }
  if (filters.parcelId) {
    conditions.push(eq(verificationRequests.parcelId, filters.parcelId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [requests, totalResult] = await Promise.all([
    db
      .select({
        id: verificationRequests.id,
        parcelId: verificationRequests.parcelId,
        requesterId: verificationRequests.requesterId,
        requesterName: users.name,
        reviewerId: verificationRequests.reviewerId,
        status: verificationRequests.status,
        submittedAt: verificationRequests.submittedAt,
        reviewedAt: verificationRequests.reviewedAt,
        approvedAt: verificationRequests.approvedAt,
        rejectedAt: verificationRequests.rejectedAt,
        rejectionReason: verificationRequests.rejectionReason,
        blockchainTxHash: verificationRequests.blockchainTxHash,
        notes: verificationRequests.notes,
        metadata: verificationRequests.metadata,
        createdAt: verificationRequests.createdAt,
        updatedAt: verificationRequests.updatedAt,
      })
      .from(verificationRequests)
      .leftJoin(users, eq(verificationRequests.requesterId, users.id))
      .where(whereClause)
      .orderBy(desc(verificationRequests.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(verificationRequests)
      .where(whereClause),
  ]);

  // Get reviewer names and documents for each request
  const requestsWithDetails = await Promise.all(
    requests.map(async (req) => {
      let reviewerName: string | null = null;
      if (req.reviewerId) {
        const [reviewer] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, req.reviewerId))
          .limit(1);
        reviewerName = reviewer?.name || null;
      }

      const docs = await db
        .select({
          id: verificationDocuments.id,
          documentType: verificationDocuments.documentType,
          fileName: verificationDocuments.fileName,
          fileUrl: verificationDocuments.fileUrl,
          fileSize: verificationDocuments.fileSize,
          mimeType: verificationDocuments.mimeType,
          uploadedBy: verificationDocuments.uploadedBy,
          uploaderName: users.name,
          verified: verificationDocuments.verified,
          verifiedBy: verificationDocuments.verifiedBy,
          verifiedAt: verificationDocuments.verifiedAt,
          createdAt: verificationDocuments.createdAt,
        })
        .from(verificationDocuments)
        .leftJoin(users, eq(verificationDocuments.uploadedBy, users.id))
        .where(eq(verificationDocuments.verificationRequestId, req.id));

      return {
        ...req,
        reviewerName,
        documents: docs,
      };
    })
  );

  return {
    requests: requestsWithDetails,
    total: Number(totalResult[0]?.count ?? 0),
    page,
    limit,
  };
}

/**
 * Get verification history for a request
 */
export async function getVerificationHistory(requestId: number) {
  const db = await getDb();
  if (!db) {
    return getVerificationHistoryOffline(requestId);
  }

  const history = await db
    .select({
      id: verificationHistory.id,
      userId: verificationHistory.userId,
      userName: users.name,
      action: verificationHistory.action,
      previousStatus: verificationHistory.previousStatus,
      newStatus: verificationHistory.newStatus,
      comment: verificationHistory.comment,
      metadata: verificationHistory.metadata,
      createdAt: verificationHistory.createdAt,
    })
    .from(verificationHistory)
    .leftJoin(users, eq(verificationHistory.userId, users.id))
    .where(eq(verificationHistory.verificationRequestId, requestId))
    .orderBy(desc(verificationHistory.createdAt));

  return history;
}
