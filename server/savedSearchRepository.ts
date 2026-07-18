import { readJsonStore, writeJsonStore } from './jsonStore';

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

async function loadStore(): Promise<SavedSearchStore> {
  return readJsonStore<SavedSearchStore>('saved-search-store', defaultStore);
}

async function saveStore(store: SavedSearchStore) {
  await writeJsonStore('saved-search-store', store);
}

export async function listSavedSearches(userId: number) {
  return (await loadStore()).searches
    .filter((search) => search.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createSavedSearch(input: { userId: number; name: string; query: Record<string, any> }) {
  const store = await loadStore();
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
  await saveStore(store);
  return record;
}

export async function deleteSavedSearch(input: { id: number; userId: number }) {
  const store = await loadStore();
  const originalLength = store.searches.length;
  store.searches = store.searches.filter((search) => !(search.id === input.id && search.userId === input.userId));
  if (store.searches.length === originalLength) {
    throw new Error('Saved search not found');
  }
  await saveStore(store);
  return { success: true };
}

export async function toggleSavedSearchFavorite(input: { id: number; userId: number }) {
  const store = await loadStore();
  const record = store.searches.find((search) => search.id === input.id && search.userId === input.userId);
  if (!record) {
    throw new Error('Saved search not found');
  }
  record.isFavorite = !record.isFavorite;
  await saveStore(store);
  return record;
}
