import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

export type VerificationState = 'pending' | 'verified' | 'failed';
export type KycDocumentStatus = 'pending' | 'verified' | 'rejected';

export interface IdentityProfile {
  userId: number;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  phoneNumber: string;
  nin: {
    number: string | null;
    status: VerificationState;
    verifiedAt: string | null;
  };
  bvn: {
    number: string | null;
    status: VerificationState;
    verifiedAt: string | null;
  };
  documents: Array<{
    id: number;
    type: string;
    status: KycDocumentStatus;
    fileName: string;
    uploadedAt: string;
  }>;
}

interface IdentityStore {
  nextDocumentId: number;
  profiles: IdentityProfile[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'identity-verification-store.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createSeedProfile(): IdentityProfile {
  return {
    userId: 1,
    fullName: 'Patrick Munis',
    dateOfBirth: '1985-03-15',
    gender: 'Male',
    phoneNumber: '+234 803 555 0145',
    nin: {
      number: '12345678901',
      status: 'verified',
      verifiedAt: '2026-05-10T09:30:00.000Z',
    },
    bvn: {
      number: null,
      status: 'pending',
      verifiedAt: null,
    },
    documents: [
      {
        id: 1,
        type: 'National ID Card',
        status: 'verified',
        fileName: 'national-id-card.pdf',
        uploadedAt: '2026-05-10T10:00:00.000Z',
      },
      {
        id: 2,
        type: 'Passport Photograph',
        status: 'verified',
        fileName: 'passport-photo.jpg',
        uploadedAt: '2026-05-10T10:05:00.000Z',
      },
      {
        id: 3,
        type: 'Proof of Address',
        status: 'pending',
        fileName: 'utility-bill.pdf',
        uploadedAt: '2026-05-12T08:45:00.000Z',
      },
    ],
  };
}

function defaultStore(): IdentityStore {
  return {
    nextDocumentId: 4,
    profiles: [createSeedProfile()],
  };
}

function loadStore(): IdentityStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as IdentityStore;
    if (!Array.isArray(parsed.profiles) || typeof parsed.nextDocumentId !== 'number') {
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

function saveStore(store: IdentityStore) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function getOrCreateProfile(userId: number) {
  const store = loadStore();
  let profile = store.profiles.find((item) => item.userId === userId);
  if (!profile) {
    profile = {
      ...createSeedProfile(),
      userId,
      nin: { number: null, status: 'pending', verifiedAt: null },
      bvn: { number: null, status: 'pending', verifiedAt: null },
      documents: [],
    };
    store.profiles.push(profile);
    saveStore(store);
  }
  return { store, profile };
}

export function getIdentityProfile(userId: number) {
  return getOrCreateProfile(userId).profile;
}

export function verifyNin(userId: number, nin: string) {
  const { store, profile } = getOrCreateProfile(userId);
  profile.nin = {
    number: nin,
    status: nin.length === 11 ? 'verified' : 'failed',
    verifiedAt: nin.length === 11 ? new Date().toISOString() : null,
  };
  saveStore(store);
  return profile;
}

export function verifyBvn(userId: number, bvn: string) {
  const { store, profile } = getOrCreateProfile(userId);
  profile.bvn = {
    number: bvn,
    status: bvn.length === 11 ? 'verified' : 'failed',
    verifiedAt: bvn.length === 11 ? new Date().toISOString() : null,
  };
  saveStore(store);
  return profile;
}

export function uploadKycDocument(userId: number, input: { type: string; fileName: string }) {
  const { store, profile } = getOrCreateProfile(userId);
  const document = {
    id: store.nextDocumentId,
    type: input.type,
    status: input.type === 'Proof of Address' ? 'pending' as KycDocumentStatus : 'verified' as KycDocumentStatus,
    fileName: input.fileName,
    uploadedAt: new Date().toISOString(),
  };
  store.nextDocumentId += 1;
  profile.documents.unshift(document);
  saveStore(store);
  return document;
}

function maskValue(value: string | null) {
  if (!value) return null;
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(2, value.length - 4))}${value.slice(-2)}`;
}

function createCommitment(label: string, value: string | null, status: VerificationState | KycDocumentStatus, timestamp: string | null) {
  const basis = `${label}|${value || 'none'}|${status}|${timestamp || 'none'}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}

export function getVerificationProofSummary(userId: number) {
  const profile = getIdentityProfile(userId);

  const ninCommitment = createCommitment('nin', profile.nin.number, profile.nin.status, profile.nin.verifiedAt);
  const bvnCommitment = createCommitment('bvn', profile.bvn.number, profile.bvn.status, profile.bvn.verifiedAt);

  return {
    generatedAt: new Date().toISOString(),
    policy: 'Zero-knowledge-style verification summary exposing only commitments, masks, and verification states for sensitive identity attributes.',
    proofs: {
      nin: {
        status: profile.nin.status,
        maskedValue: maskValue(profile.nin.number),
        verifiedAt: profile.nin.verifiedAt,
        commitment: ninCommitment,
      },
      bvn: {
        status: profile.bvn.status,
        maskedValue: maskValue(profile.bvn.number),
        verifiedAt: profile.bvn.verifiedAt,
        commitment: bvnCommitment,
      },
      documents: profile.documents.map((document) => ({
        id: document.id,
        type: document.type,
        status: document.status,
        uploadedAt: document.uploadedAt,
        fileNameMask: document.fileName.replace(/.(?=.{4})/g, '*'),
        commitment: createCommitment(`document:${document.id}`, document.fileName, document.status, document.uploadedAt),
      })),
    },
  };
}
