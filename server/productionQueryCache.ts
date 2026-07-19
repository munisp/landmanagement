import { CacheTTL, get as getCache, invalidate as invalidateCache, set as setCache } from './_core/cache';
import type { ParcelSearchInput } from './parcelRepository';
import { searchParcels as searchParcelRepository, getParcelById as getParcelFromRepository, getParcelByNumber as getParcelByNumberFromRepository } from './parcelRepository';
import { getTransactionById, listTransactions } from './transactionRepository';

type TransactionListInput = { status?: string; type?: string; page?: number; limit?: number };

function stable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${key}:${stable(nested)}`)
      .join(',')}}`;
  }
  return String(value);
}

export function parcelSearchCacheKey(input: ParcelSearchInput): string {
  return `parcel-search:${stable(input)}`;
}

export function parcelByIdCacheKey(id: number): string {
  return `parcel-by-id:${id}`;
}

export function parcelByNumberCacheKey(parcelNumber: string): string {
  return `parcel-by-number:${parcelNumber}`;
}

export function transactionListCacheKey(input: TransactionListInput): string {
  return `transaction-list:${stable(input)}`;
}

export function transactionByIdCacheKey(id: number): string {
  return `transaction-by-id:${id}`;
}

export async function getCachedParcelSearch(input: ParcelSearchInput) {
  const key = parcelSearchCacheKey(input);
  const cached = await getCache<ReturnType<typeof searchParcelRepository>>(key);
  if (cached) return cached;
  const result = searchParcelRepository(input);
  await setCache(key, result, CacheTTL.SHORT);
  return result;
}

export async function getCachedParcelById(id: number) {
  const key = parcelByIdCacheKey(id);
  const cached = await getCache<ReturnType<typeof getParcelFromRepository>>(key);
  if (cached) return cached;
  const result = getParcelFromRepository(id);
  if (result) {
    await setCache(key, result, CacheTTL.MEDIUM);
  }
  return result;
}

export async function getCachedParcelByNumber(parcelNumber: string) {
  const key = parcelByNumberCacheKey(parcelNumber);
  const cached = await getCache<ReturnType<typeof getParcelByNumberFromRepository>>(key);
  if (cached) return cached;
  const result = getParcelByNumberFromRepository(parcelNumber);
  if (result) {
    await setCache(key, result, CacheTTL.MEDIUM);
  }
  return result;
}

export async function getCachedTransactionList(input: TransactionListInput) {
  const key = transactionListCacheKey(input);
  const cached = await getCache<Awaited<ReturnType<typeof listTransactions>>>(key);
  if (cached) return cached;
  const result = await listTransactions(input);
  await setCache(key, result, CacheTTL.SHORT);
  return result;
}

export async function getCachedTransactionById(id: number) {
  const key = transactionByIdCacheKey(id);
  const cached = await getCache<Awaited<ReturnType<typeof getTransactionById>>>(key);
  if (cached) return cached;
  const result = await getTransactionById(id);
  if (result) {
    await setCache(key, result, CacheTTL.MEDIUM);
  }
  return result;
}

export async function invalidateParcelQueryCaches(parcelId?: number, parcelNumber?: string) {
  await invalidateCache('parcel-search:*');
  if (parcelId !== undefined) {
    await invalidateCache(parcelByIdCacheKey(parcelId));
  }
  if (parcelNumber) {
    await invalidateCache(parcelByNumberCacheKey(parcelNumber));
  }
}

export async function invalidateTransactionQueryCaches(transactionId?: number) {
  await invalidateCache('transaction-list:*');
  if (transactionId !== undefined) {
    await invalidateCache(transactionByIdCacheKey(transactionId));
  }
}

export async function warmProductionCaches() {
  await Promise.allSettled([
    getCachedParcelSearch({ page: 1, limit: 20 }),
    getCachedTransactionList({ page: 1, limit: 20 }),
  ]);
}
