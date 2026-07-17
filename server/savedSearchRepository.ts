import fs from 'fs';
import path from 'path';

export interface SavedSearchRecord {
  id: number;
  userId: number;
  name: string;
  query: Record<string, any>;
  isFavorite: boolean;
  createdAt: string;
}

interface SavedSearchStore {
  nextId: number;
  searches: SavedSearchRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'saved-search-store.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function seededSearches(): SavedSearchRecord[] {
  return [
    {
      id: 1,
      userId: 1,
      name: 'Verified Lagos Parcels',
      query: {
        query: '',
        state: 'Lagos',
        status: 'verified',
        landUseType: 'residential',
      },
      isFavorite: true,
      createdAt: '2026-05-10T09:00:00.000Z',
    },
    {
      id: 2,
      userId: 1,
      name: 'High Value Commercial Search',
      query: {
        query: '',
        state: 'Abuja',
        landUseType: 'commercial',
        priceMin: 50000000,
      },
      isFavorite: false,
      createdAt: '2026-05-11T11:30:00.000Z',
    },
  ];
}

function defaultStore(): SavedSearchStore {
  const searches = seededSearches();
  return {
    nextId: Math.max(...searches.map((item) => item.id), 0) + 1,
    searches,
  };
}

function loadStore(): SavedSearchStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as SavedSearchStore;
    if (!Array.isArray(parsed.searches) || typeof parsed.nextId !== 'number') {
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

function saveStore(store: SavedSearchStore) {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function listSavedSearches(userId: number) {
  return loadStore().searches
    .filter((search) => search.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createSavedSearch(input: { userId: number; name: string; query: Record<string, any> }) {
  const store = loadStore();
  const record: SavedSearchRecord = {
    id: store.nextId,
    userId: input.userId,
    name: input.name,
    query: input.query,
    isFavorite: false,
    createdAt: new Date().toISOString(),
  };

  store.searches.unshift(record);
  store.nextId += 1;
  saveStore(store);
  return record;
}

export function deleteSavedSearch(input: { id: number; userId: number }) {
  const store = loadStore();
  const originalLength = store.searches.length;
  store.searches = store.searches.filter((search) => !(search.id === input.id && search.userId === input.userId));
  if (store.searches.length === originalLength) {
    throw new Error('Saved search not found');
  }
  saveStore(store);
  return { success: true };
}

export function toggleSavedSearchFavorite(input: { id: number; userId: number }) {
  const store = loadStore();
  const record = store.searches.find((search) => search.id === input.id && search.userId === input.userId);
  if (!record) {
    throw new Error('Saved search not found');
  }
  record.isFavorite = !record.isFavorite;
  saveStore(store);
  return record;
}
