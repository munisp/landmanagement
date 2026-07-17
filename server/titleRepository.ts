import fs from 'fs';
import path from 'path';

export type TitleStatus = 'draft' | 'pending_verification' | 'verified' | 'registered' | 'encumbered';

export interface TitleRecord {
  id: number;
  titleNumber: string;
  parcelId: number;
  ownerId: number;
  ownerName: string;
  ownershipType: string;
  ownershipPercentage: number;
  titleType: string;
  status: TitleStatus;
  issuedAt?: string;
  verifiedAt?: string;
  encumbranceNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface TitleStore {
  titles: TitleRecord[];
  nextId: number;
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'title-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function seededTitles(): TitleRecord[] {
  return [
    {
      id: 1,
      titleNumber: 'C-of-O-LG-VI-2024-001',
      parcelId: 1,
      ownerId: 1,
      ownerName: 'Amina Bello',
      ownershipType: 'sole',
      ownershipPercentage: 100,
      titleType: 'certificate_of_occupancy',
      status: 'verified',
      issuedAt: '2024-01-22T09:00:00.000Z',
      verifiedAt: '2024-01-22T09:00:00.000Z',
      createdAt: '2024-01-18T09:00:00.000Z',
      updatedAt: '2024-01-22T09:00:00.000Z',
    },
    {
      id: 2,
      titleNumber: 'R-of-O-AB-FCT-2024-002',
      parcelId: 2,
      ownerId: 2,
      ownerName: 'Chinedu Okafor Holdings',
      ownershipType: 'corporate',
      ownershipPercentage: 100,
      titleType: 'right_of_occupancy',
      status: 'registered',
      issuedAt: '2024-02-14T11:00:00.000Z',
      verifiedAt: '2024-02-13T15:00:00.000Z',
      createdAt: '2024-02-11T09:00:00.000Z',
      updatedAt: '2024-02-14T11:00:00.000Z',
    },
    {
      id: 3,
      titleNumber: 'DEED-KN-KN-2024-003',
      parcelId: 3,
      ownerId: 3,
      ownerName: 'Musa Garba Farms',
      ownershipType: 'corporate',
      ownershipPercentage: 100,
      titleType: 'deed_of_assignment',
      status: 'pending_verification',
      encumbranceNotes: 'Awaiting governor consent and registry review.',
      createdAt: '2024-03-02T09:00:00.000Z',
      updatedAt: '2024-03-02T09:00:00.000Z',
    },
    {
      id: 4,
      titleNumber: 'C-of-O-LG-IK-2024-004',
      parcelId: 4,
      ownerId: 4,
      ownerName: 'Industrial Assets Limited',
      ownershipType: 'corporate',
      ownershipPercentage: 100,
      titleType: 'certificate_of_occupancy',
      status: 'encumbered',
      issuedAt: '2024-01-27T10:30:00.000Z',
      verifiedAt: '2024-01-26T17:00:00.000Z',
      encumbranceNotes: 'Registered mortgage in favor of Unity Commercial Bank.',
      createdAt: '2024-01-23T09:00:00.000Z',
      updatedAt: '2024-02-28T10:00:00.000Z',
    },
  ];
}

function initialStore(): TitleStore {
  const titles = seededTitles();
  return {
    titles,
    nextId: titles.length + 1,
  };
}

function loadStore(): TitleStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const initial = initialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as TitleStore;
  if (!parsed.titles?.length) {
    const initial = initialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  return parsed;
}

function saveStore(store: TitleStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function searchTitles(input: {
  query?: string;
  ownerId?: number;
  parcelId?: number;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const store = loadStore();
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;

  const filtered = store.titles.filter((title) => {
    if (input.ownerId !== undefined && title.ownerId !== input.ownerId) return false;
    if (input.parcelId !== undefined && title.parcelId !== input.parcelId) return false;
    if (input.status && title.status !== input.status) return false;
    if (input.query) {
      const query = input.query.toLowerCase();
      return [title.titleNumber, title.ownerName, title.titleType]
        .some((value) => value.toLowerCase().includes(query));
    }
    return true;
  });

  const start = (page - 1) * limit;
  return {
    titles: filtered.slice(start, start + limit),
    total: filtered.length,
    page,
    limit,
  };
}

export function getTitleById(id: number) {
  return loadStore().titles.find((title) => title.id === id) ?? null;
}

export function getTitleByNumber(titleNumber: string) {
  return loadStore().titles.find((title) => title.titleNumber === titleNumber) ?? null;
}

export function getTitlesByOwner(ownerId: number) {
  return loadStore().titles.filter((title) => title.ownerId === ownerId);
}

export function createTitle(input: {
  parcelId: number;
  ownerId: number;
  ownershipType: string;
  ownershipPercentage: number;
  titleType: string;
}) {
  const store = loadStore();
  const id = store.nextId;
  const now = new Date().toISOString();
  const titleNumber = `${input.titleType.slice(0, 4).toUpperCase()}-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;

  const title: TitleRecord = {
    id,
    titleNumber,
    parcelId: input.parcelId,
    ownerId: input.ownerId,
    ownerName: `Owner ${input.ownerId}`,
    ownershipType: input.ownershipType,
    ownershipPercentage: input.ownershipPercentage,
    titleType: input.titleType,
    status: 'pending_verification',
    createdAt: now,
    updatedAt: now,
  };

  store.titles.unshift(title);
  store.nextId += 1;
  saveStore(store);
  return title;
}

export function verifyTitle(id: number) {
  const store = loadStore();
  const title = store.titles.find((item) => item.id === id);
  if (!title) {
    throw new Error('Title not found');
  }

  if (title.status === 'verified' || title.status === 'registered' || title.status === 'encumbered') {
    return title;
  }

  title.status = 'verified';
  title.verifiedAt = new Date().toISOString();
  title.updatedAt = new Date().toISOString();
  saveStore(store);
  return title;
}
