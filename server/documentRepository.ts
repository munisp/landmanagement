import fs from 'fs';
import path from 'path';

export interface DocumentRecord {
  id: number;
  parcelId?: number;
  titleId?: number;
  transactionId?: number;
  type: string;
  title: string;
  description?: string;
  fileKey: string;
  fileUrl: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: number;
  uploadedAt: string;
  verified: boolean;
  verifiedBy?: number;
  verifiedAt?: string;
}

interface DocumentStore {
  nextId: number;
  documents: DocumentRecord[];
}

const STORE_PATH = path.join(process.cwd(), 'data', 'document-store.json');

function ensureStoreDir() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
}

function seededDocuments(): DocumentRecord[] {
  return [
    {
      id: 1,
      parcelId: 1,
      type: 'survey_plan',
      title: 'Registered Survey Plan',
      description: 'Approved survey plan for the parcel boundary lodged during registration.',
      fileKey: 'parcel-1-survey-plan',
      fileUrl: 'https://storage.idlr.local/documents/parcel-1-survey-plan.pdf',
      fileName: 'parcel-1-survey-plan.pdf',
      fileSize: 284112,
      mimeType: 'application/pdf',
      uploadedBy: 101,
      uploadedAt: '2024-03-12T10:00:00.000Z',
      verified: true,
      verifiedBy: 12,
      verifiedAt: '2024-03-14T09:30:00.000Z',
    },
    {
      id: 2,
      parcelId: 2,
      transactionId: 1,
      type: 'deed_of_assignment',
      title: 'Executed Deed of Assignment',
      description: 'Signed transfer instrument attached to the ongoing title transfer workflow.',
      fileKey: 'txn-1-deed-of-assignment',
      fileUrl: 'https://storage.idlr.local/documents/txn-1-deed-of-assignment.pdf',
      fileName: 'txn-1-deed-of-assignment.pdf',
      fileSize: 412550,
      mimeType: 'application/pdf',
      uploadedBy: 34,
      uploadedAt: '2024-04-05T11:20:00.000Z',
      verified: false,
    },
    {
      id: 3,
      parcelId: 3,
      transactionId: 2,
      type: 'tax_clearance',
      title: 'Tax Clearance Certificate',
      description: 'Latest tax-clearance document used for compliance review before closing.',
      fileKey: 'txn-2-tax-clearance',
      fileUrl: 'https://storage.idlr.local/documents/txn-2-tax-clearance.pdf',
      fileName: 'txn-2-tax-clearance.pdf',
      fileSize: 190440,
      mimeType: 'application/pdf',
      uploadedBy: 56,
      uploadedAt: '2024-04-18T14:15:00.000Z',
      verified: true,
      verifiedBy: 12,
      verifiedAt: '2024-04-19T08:00:00.000Z',
    },
  ];
}

function defaultStore(): DocumentStore {
  const documents = seededDocuments();
  return {
    nextId: Math.max(...documents.map((item) => item.id), 0) + 1,
    documents,
  };
}

function loadStore(): DocumentStore {
  ensureStoreDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as DocumentStore;
    if (!Array.isArray(parsed.documents) || typeof parsed.nextId !== 'number') {
      const store = defaultStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
      return store;
    }
    return parsed;
  } catch {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
}

function saveStore(store: DocumentStore) {
  ensureStoreDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function listAllDocuments() {
  return loadStore().documents
    .slice()
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function getDocumentsByParcel(parcelId: number) {
  return loadStore().documents
    .filter((item) => item.parcelId === parcelId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function getDocumentsByTransaction(transactionId: number) {
  return loadStore().documents
    .filter((item) => item.transactionId === transactionId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function uploadDocumentRecord(input: Omit<DocumentRecord, 'id' | 'uploadedAt' | 'verified' | 'verifiedAt' | 'verifiedBy'>) {
  const store = loadStore();
  const uploadedAt = new Date().toISOString();
  const record: DocumentRecord = {
    id: store.nextId,
    ...input,
    uploadedAt,
    verified: false,
  };

  store.documents.unshift(record);
  store.nextId += 1;
  saveStore(store);
  return record;
}

export function verifyDocumentRecord(input: { id: number; verifierId: number }) {
  const store = loadStore();
  const record = store.documents.find((item) => item.id === input.id);
  if (!record) {
    throw new Error('Document not found');
  }

  record.verified = true;
  record.verifiedBy = input.verifierId;
  record.verifiedAt = new Date().toISOString();
  saveStore(store);
  return record;
}
