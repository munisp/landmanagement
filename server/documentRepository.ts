import { readJsonStore, writeJsonStore } from './jsonStore';

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

async function loadStore(): Promise<DocumentStore> {
  return readJsonStore<DocumentStore>('document-store', defaultStore);
}

async function saveStore(store: DocumentStore) {
  await writeJsonStore('document-store', store);
}

export async function listAllDocuments() {
  return (await loadStore()).documents
    .slice()
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function getDocumentsByParcel(parcelId: number) {
  return (await loadStore()).documents
    .filter((item) => item.parcelId === parcelId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function getDocumentsByTransaction(transactionId: number) {
  return (await loadStore()).documents
    .filter((item) => item.transactionId === transactionId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function uploadDocumentRecord(input: Omit<DocumentRecord, 'id' | 'uploadedAt' | 'verified' | 'verifiedAt' | 'verifiedBy'>) {
  const store = await loadStore();
  const uploadedAt = new Date().toISOString();
  const record: DocumentRecord = {
    id: store.nextId,
    ...input,
    uploadedAt,
    verified: false,
  };

  store.documents.unshift(record);
  store.nextId += 1;
  await saveStore(store);
  return record;
}

export async function verifyDocumentRecord(input: { id: number; verifierId: number }) {
  const store = await loadStore();
  const record = store.documents.find((item) => item.id === input.id);
  if (!record) {
    throw new Error('Document not found');
  }

  record.verified = true;
  record.verifiedBy = input.verifierId;
  record.verifiedAt = new Date().toISOString();
  await saveStore(store);
  return record;
}
