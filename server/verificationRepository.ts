import { readJsonStore, writeJsonStore } from './jsonStore';

export type VerificationStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';

export interface VerificationDocumentRecord {
  id: number;
  verificationRequestId: number;
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

export interface VerificationHistoryRecord {
  id: number;
  verificationRequestId: number;
  userId: number;
  action: string;
  previousStatus: VerificationStatus | null;
  newStatus: VerificationStatus | null;
  comment: string | null;
  createdAt: Date;
}

export interface VerificationRequestRecord {
  id: number;
  parcelId: string;
  requesterId: number;
  requesterName: string | null;
  reviewerId: number | null;
  reviewerName: string | null;
  status: VerificationStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  blockchainTxHash: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface VerificationStore {
  nextRequestId: number;
  nextDocumentId: number;
  nextHistoryId: number;
  requests: VerificationRequestRecord[];
  documents: VerificationDocumentRecord[];
  history: VerificationHistoryRecord[];
}


function seededStore(): VerificationStore {
  const requests: VerificationRequestRecord[] = [
    {
      id: 1,
      parcelId: 'LG-VI-2024-001',
      requesterId: 101,
      requesterName: 'Amina Bello',
      reviewerId: null,
      reviewerName: null,
      status: 'submitted',
      submittedAt: new Date('2024-03-11T10:00:00.000Z'),
      reviewedAt: null,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
      blockchainTxHash: null,
      notes: 'Request awaiting reviewer assignment.',
      metadata: {},
      createdAt: new Date('2024-03-10T09:00:00.000Z'),
      updatedAt: new Date('2024-03-11T10:00:00.000Z'),
    },
    {
      id: 2,
      parcelId: 'AB-FCT-2024-002',
      requesterId: 102,
      requesterName: 'Chinedu Okafor',
      reviewerId: 900,
      reviewerName: 'Registry Reviewer',
      status: 'approved',
      submittedAt: new Date('2024-02-10T10:00:00.000Z'),
      reviewedAt: new Date('2024-02-12T11:00:00.000Z'),
      approvedAt: new Date('2024-02-12T11:00:00.000Z'),
      rejectedAt: null,
      rejectionReason: null,
      blockchainTxHash: '0x' + 'a'.repeat(64),
      notes: 'Approved after document and boundary review.',
      metadata: {},
      createdAt: new Date('2024-02-09T09:00:00.000Z'),
      updatedAt: new Date('2024-02-12T11:00:00.000Z'),
    },
    {
      id: 3,
      parcelId: 'KN-KN-2024-003',
      requesterId: 103,
      requesterName: 'Musa Garba',
      reviewerId: 901,
      reviewerName: 'Senior Registrar',
      status: 'rejected',
      submittedAt: new Date('2024-03-04T10:00:00.000Z'),
      reviewedAt: new Date('2024-03-05T14:00:00.000Z'),
      approvedAt: null,
      rejectedAt: new Date('2024-03-05T14:00:00.000Z'),
      rejectionReason: 'Incomplete supporting survey documentation',
      blockchainTxHash: null,
      notes: 'Incomplete cadastral survey package provided.',
      metadata: {},
      createdAt: new Date('2024-03-03T09:00:00.000Z'),
      updatedAt: new Date('2024-03-05T14:00:00.000Z'),
    },
  ];

  const documents: VerificationDocumentRecord[] = [
    {
      id: 1,
      verificationRequestId: 1,
      documentType: 'survey_plan',
      fileName: 'survey-plan-lg-vi-2024-001.pdf',
      fileUrl: '/documents/survey-plan-lg-vi-2024-001.pdf',
      fileSize: 245000,
      mimeType: 'application/pdf',
      uploadedBy: 101,
      uploaderName: 'Amina Bello',
      verified: false,
      verifiedBy: null,
      verifiedAt: null,
      createdAt: new Date('2024-03-10T09:30:00.000Z'),
    },
    {
      id: 2,
      verificationRequestId: 2,
      documentType: 'title_deed',
      fileName: 'title-deed-ab-fct-2024-002.pdf',
      fileUrl: '/documents/title-deed-ab-fct-2024-002.pdf',
      fileSize: 315000,
      mimeType: 'application/pdf',
      uploadedBy: 102,
      uploaderName: 'Chinedu Okafor',
      verified: true,
      verifiedBy: 900,
      verifiedAt: new Date('2024-02-12T10:45:00.000Z'),
      createdAt: new Date('2024-02-10T09:30:00.000Z'),
    },
  ];

  const history: VerificationHistoryRecord[] = [
    {
      id: 1,
      verificationRequestId: 1,
      userId: 101,
      action: 'submitted',
      previousStatus: 'draft',
      newStatus: 'submitted',
      comment: 'Request submitted for review',
      createdAt: new Date('2024-03-11T10:00:00.000Z'),
    },
    {
      id: 2,
      verificationRequestId: 2,
      userId: 900,
      action: 'approved',
      previousStatus: 'under_review',
      newStatus: 'approved',
      comment: 'Approved and recorded on blockchain',
      createdAt: new Date('2024-02-12T11:00:00.000Z'),
    },
    {
      id: 3,
      verificationRequestId: 3,
      userId: 901,
      action: 'rejected',
      previousStatus: 'under_review',
      newStatus: 'rejected',
      comment: 'Incomplete supporting survey documentation',
      createdAt: new Date('2024-03-05T14:00:00.000Z'),
    },
  ];

  return {
    nextRequestId: 4,
    nextDocumentId: 3,
    nextHistoryId: 4,
    requests,
    documents,
    history,
  };
}

function serialize(store: VerificationStore) {
  return JSON.stringify(store, null, 2);
}

function parseDate<T extends Record<string, any>>(record: T, keys: string[]): T {
  const mutableRecord = record as Record<string, any>;
  for (const key of keys) {
    if (mutableRecord[key]) mutableRecord[key] = new Date(mutableRecord[key]);
  }
  return record;
}

async function loadStore(): Promise<VerificationStore> {
  return readJsonStore<VerificationStore>('verification-store', seededStore);
}

async function saveStore(store: VerificationStore) {
  await writeJsonStore('verification-store', store);
}

function resolveUserName(userId: number) {
  if (userId === 501) return 'Test Requester';
  if (userId === 601) return 'Test Reviewer';
  return `User ${userId}`;
}

function withDocuments(request: VerificationRequestRecord, store: VerificationStore) {
  return {
    ...request,
    reviewerName: request.reviewerId ? resolveUserName(request.reviewerId) : request.reviewerName,
    documents: store.documents.filter((doc) => doc.verificationRequestId === request.id),
  };
}

export async function listVerificationRequestsOffline(filters: {
  status?: VerificationStatus;
  requesterId?: number;
  reviewerId?: number;
  parcelId?: string;
}, page = 1, limit = 20) {
  const store = await loadStore();
  const filtered = store.requests.filter((request) => {
    if (filters.status && request.status !== filters.status) return false;
    if (filters.requesterId && request.requesterId !== filters.requesterId) return false;
    if (filters.reviewerId && request.reviewerId !== filters.reviewerId) return false;
    if (filters.parcelId && request.parcelId !== filters.parcelId) return false;
    return true;
  });
  const start = (page - 1) * limit;
  return {
    requests: filtered.slice(start, start + limit).map((request) => withDocuments(request, store)),
    total: filtered.length,
    page,
    limit,
  };
}

export async function getVerificationRequestDetailsOffline(requestId: number) {
  const store = await loadStore();
  const request = store.requests.find((item) => item.id === requestId);
  return request ? withDocuments(request, store) : null;
}

export async function getVerificationHistoryOffline(requestId: number) {
  const store = await loadStore();
  return store.history.filter((entry) => entry.verificationRequestId === requestId);
}

export async function createVerificationRequestOffline(parcelId: string, requesterId: number, requesterName: string | null, notes?: string) {
  const store = await loadStore();
  const request: VerificationRequestRecord = {
    id: store.nextRequestId++,
    parcelId,
    requesterId,
    requesterName: requesterName ?? resolveUserName(requesterId),
    reviewerId: null,
    reviewerName: null,
    status: 'draft',
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    blockchainTxHash: null,
    notes: notes ?? null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.requests.unshift(request);
  store.history.unshift({
    id: store.nextHistoryId++,
    verificationRequestId: request.id,
    userId: requesterId,
    action: 'created',
    previousStatus: null,
    newStatus: 'draft',
    comment: 'Verification request created',
    createdAt: new Date(),
  });
  await saveStore(store);
  return { success: true, requestId: request.id };
}

export async function addVerificationDocumentOffline(
  requestId: number,
  documentType: string,
  fileName: string,
  fileUrl: string,
  fileSize: number,
  mimeType: string,
  uploadedBy: number,
) {
  const store = await loadStore();
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }

  const doc: VerificationDocumentRecord = {
    id: store.nextDocumentId++,
    verificationRequestId: requestId,
    documentType,
    fileName,
    fileUrl,
    fileSize,
    mimeType,
    uploadedBy,
    uploaderName: resolveUserName(uploadedBy),
    verified: false,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: new Date(),
  };

  store.documents.unshift(doc);
  request.updatedAt = new Date();
  store.history.unshift({
    id: store.nextHistoryId++,
    verificationRequestId: requestId,
    userId: uploadedBy,
    action: 'document_uploaded',
    previousStatus: request.status,
    newStatus: request.status,
    comment: `${documentType} uploaded`,
    createdAt: new Date(),
  });
  await saveStore(store);
  return { success: true, documentId: doc.id };
}

export async function submitVerificationRequestOffline(requestId: number, userId: number) {
  const store = await loadStore();
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }
  if (request.status !== 'draft') {
    return { success: false, message: 'Request has already been submitted' };
  }
  const docs = store.documents.filter((doc) => doc.verificationRequestId === requestId);
  if (docs.length === 0) {
    return { success: false, message: 'Please upload at least one document before submitting' };
  }
  request.status = 'submitted';
  request.submittedAt = new Date();
  request.updatedAt = new Date();
  store.history.unshift({
    id: store.nextHistoryId++,
    verificationRequestId: requestId,
    userId,
    action: 'submitted',
    previousStatus: 'draft',
    newStatus: 'submitted',
    comment: 'Request submitted for review',
    createdAt: new Date(),
  });
  await saveStore(store);
  return { success: true };
}

export async function assignReviewerOffline(requestId: number, reviewerId: number, assignedBy: number) {
  const store = await loadStore();
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }
  if (request.status !== 'submitted' && request.status !== 'under_review') {
    return { success: false, message: 'Request is not in a reviewable state' };
  }
  const previousStatus = request.status;
  request.reviewerId = reviewerId;
  request.reviewerName = resolveUserName(reviewerId);
  request.status = 'under_review';
  request.updatedAt = new Date();
  store.history.unshift({
    id: store.nextHistoryId++,
    verificationRequestId: requestId,
    userId: assignedBy,
    action: 'assigned',
    previousStatus,
    newStatus: 'under_review',
    comment: `Assigned to reviewer ID ${reviewerId}`,
    createdAt: new Date(),
  });
  await saveStore(store);
  return { success: true };
}

export async function approveVerificationRequestOffline(requestId: number, reviewerId: number, blockchainTxHash?: string) {
  const store = await loadStore();
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }
  if (request.status !== 'under_review') {
    return { success: false, message: 'Request is not under review' };
  }
  request.reviewerId = reviewerId;
  request.reviewerName = resolveUserName(reviewerId);
  request.status = 'approved';
  request.reviewedAt = new Date();
  request.approvedAt = new Date();
  request.blockchainTxHash = blockchainTxHash ?? null;
  request.updatedAt = new Date();
  store.history.unshift({
    id: store.nextHistoryId++,
    verificationRequestId: requestId,
    userId: reviewerId,
    action: 'approved',
    previousStatus: 'under_review',
    newStatus: 'approved',
    comment: blockchainTxHash ? `Approved and recorded on blockchain: ${blockchainTxHash}` : 'Approved',
    createdAt: new Date(),
  });
  await saveStore(store);
  return { success: true };
}

export async function rejectVerificationRequestOffline(requestId: number, reviewerId: number, reason: string) {
  const store = await loadStore();
  const request = store.requests.find((item) => item.id === requestId);
  if (!request) {
    return { success: false, message: 'Verification request not found' };
  }
  if (request.status !== 'under_review') {
    return { success: false, message: 'Request is not under review' };
  }
  request.reviewerId = reviewerId;
  request.reviewerName = resolveUserName(reviewerId);
  request.status = 'rejected';
  request.reviewedAt = new Date();
  request.rejectedAt = new Date();
  request.rejectionReason = reason;
  request.updatedAt = new Date();
  store.history.unshift({
    id: store.nextHistoryId++,
    verificationRequestId: requestId,
    userId: reviewerId,
    action: 'rejected',
    previousStatus: 'under_review',
    newStatus: 'rejected',
    comment: reason,
    createdAt: new Date(),
  });
  await saveStore(store);
  return { success: true };
}
