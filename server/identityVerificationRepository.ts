import { readJsonStore, writeJsonStore } from './jsonStore';

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

async function loadStore(): Promise<IdentityStore> {
  return readJsonStore<IdentityStore>('identity-verification-store', defaultStore);
}

async function saveStore(store: IdentityStore) {
  await writeJsonStore('identity-verification-store', store);
}

async function getOrCreateProfile(userId: number) {
  const store = await loadStore();
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
    await saveStore(store);
  }
  return { store, profile };
}

export async function getIdentityProfile(userId: number) {
  return (await getOrCreateProfile(userId)).profile;
}

export async function verifyNin(userId: number, nin: string) {
  const { store, profile } = await getOrCreateProfile(userId);
  profile.nin = {
    number: nin,
    status: nin.length === 11 ? 'verified' : 'failed',
    verifiedAt: nin.length === 11 ? new Date().toISOString() : null,
  };
  await saveStore(store);
  return profile;
}

export async function verifyBvn(userId: number, bvn: string) {
  const { store, profile } = await getOrCreateProfile(userId);
  profile.bvn = {
    number: bvn,
    status: bvn.length === 11 ? 'verified' : 'failed',
    verifiedAt: bvn.length === 11 ? new Date().toISOString() : null,
  };
  await saveStore(store);
  return profile;
}

export async function uploadKycDocument(userId: number, input: { type: string; fileName: string }) {
  const { store, profile } = await getOrCreateProfile(userId);
  const document = {
    id: store.nextDocumentId,
    type: input.type,
    status: input.type === 'Proof of Address' ? 'pending' as KycDocumentStatus : 'verified' as KycDocumentStatus,
    fileName: input.fileName,
    uploadedAt: new Date().toISOString(),
  };
  store.nextDocumentId += 1;
  profile.documents.unshift(document);
  await saveStore(store);
  return document;
}
