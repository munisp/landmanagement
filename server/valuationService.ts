import fs from 'fs';
import path from 'path';
import { getParcelByNumber, searchParcels } from './parcelRepository';
import { listTransactions } from './transactionRepository';

export type ValuationMethod = 'comparative' | 'income' | 'cost' | 'avm';
export type ValuationPurpose = 'sale' | 'mortgage' | 'tax' | 'insurance' | 'legal';

export interface ValuationComparableSale {
  parcelNumber: string;
  address: string;
  area: number;
  salePrice: number;
  saleDate: string;
  pricePerSqm: number;
}

export interface ValuationHistoryRecord {
  id: number;
  date: string;
  parcelNumber: string;
  method: string;
  purpose: ValuationPurpose;
  value: number;
  valuerId: string;
  valuerName: string;
  status: 'approved' | 'pending';
  confidence: number;
}

interface ValuationStore {
  history: ValuationHistoryRecord[];
  nextId: number;
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'valuation-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function seedStore(): ValuationStore {
  return {
    history: [
      {
        id: 1,
        date: '2024-02-16T10:00:00.000Z',
        parcelNumber: 'LG-VI-2024-001',
        method: 'Comparative Sales',
        purpose: 'mortgage',
        value: 152400000,
        valuerId: 'VAL-001',
        valuerName: 'Registry Valuation Desk',
        status: 'approved',
        confidence: 87,
      },
      {
        id: 2,
        date: '2024-02-10T12:30:00.000Z',
        parcelNumber: 'AB-FCT-2024-002',
        method: 'Income Approach',
        purpose: 'tax',
        value: 198500000,
        valuerId: 'VAL-002',
        valuerName: 'Federal Capital Territory Valuation Unit',
        status: 'pending',
        confidence: 79,
      },
    ],
    nextId: 3,
  };
}

function loadStore(): ValuationStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const initial = seedStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as ValuationStore;
  if (!Array.isArray(parsed.history)) {
    const initial = seedStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  return parsed;
}

function saveStore(store: ValuationStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function formatMethod(method: ValuationMethod) {
  return method === 'comparative'
    ? 'Comparative Sales'
    : method === 'income'
      ? 'Income Approach'
      : method === 'cost'
        ? 'Cost Approach'
        : 'Automated Valuation Model';
}

function getMethodMultiplier(method: ValuationMethod) {
  switch (method) {
    case 'income':
      return 1.04;
    case 'cost':
      return 0.98;
    case 'avm':
      return 1.01;
    default:
      return 1;
  }
}

function getPurposeAdjustment(purpose: ValuationPurpose) {
  switch (purpose) {
    case 'mortgage':
      return 0.97;
    case 'tax':
      return 0.94;
    case 'insurance':
      return 1.02;
    case 'legal':
      return 1;
    case 'sale':
    default:
      return 1;
  }
}

function getComparableSales(parcelNumber: string): ValuationComparableSale[] {
  const subject = getParcelByNumber(parcelNumber);
  if (!subject) {
    throw new Error('Parcel not found');
  }

  const parcels = searchParcels({ page: 1, limit: 1000 }).parcels.filter((parcel) => parcel.parcelNumber !== subject.parcelNumber);
  const transactions = listTransactions({ page: 1, limit: 1000 }).transactions;

  const ranked = parcels
    .map((parcel) => {
      const relatedTransaction = transactions.find((transaction) => transaction.parcelId === parcel.id);
      const sameLga = parcel.lga === subject.lga;
      const sameState = parcel.state === subject.state;
      const sameUse = parcel.landUseType === subject.landUseType;
      const score = (sameLga ? 3 : 0) + (sameState ? 2 : 0) + (sameUse ? 2 : 0);
      const salePrice = relatedTransaction?.considerationAmount || parcel.estimatedValue;
      return {
        parcelNumber: parcel.parcelNumber,
        address: parcel.streetAddress || `${parcel.lga}, ${parcel.state}`,
        area: parcel.areaSquareMeters,
        salePrice,
        saleDate: relatedTransaction?.updatedAt || parcel.updatedAt,
        pricePerSqm: salePrice / Math.max(parcel.areaSquareMeters, 1),
        score,
      };
    })
    .filter((sale) => sale.score > 0)
    .sort((a, b) => b.score - a.score || b.saleDate.localeCompare(a.saleDate));

  return ranked.slice(0, 4).map(({ score, ...sale }) => sale);
}

export function calculatePropertyValuation(input: {
  parcelNumber: string;
  method: ValuationMethod;
  purpose: ValuationPurpose;
  requestedByUserId?: number;
  requestedByName?: string;
}) {
  const subject = getParcelByNumber(input.parcelNumber);
  if (!subject) {
    throw new Error('Parcel not found');
  }

  const comparableSales = getComparableSales(input.parcelNumber);
  const averageComparablePricePerSqm = comparableSales.length > 0
    ? comparableSales.reduce((sum, sale) => sum + sale.pricePerSqm, 0) / comparableSales.length
    : subject.estimatedValue / Math.max(subject.areaSquareMeters, 1);

  const baseline = averageComparablePricePerSqm * subject.areaSquareMeters;
  const landUseAdjustment = subject.landUseType === 'commercial'
    ? 1.12
    : subject.landUseType === 'industrial'
      ? 1.08
      : subject.landUseType === 'agricultural'
        ? 0.9
        : 1;
  const titleAdjustment = subject.status === 'registered' ? 1.05 : subject.status === 'verified' ? 1.02 : 0.94;
  const methodMultiplier = getMethodMultiplier(input.method);
  const purposeAdjustment = getPurposeAdjustment(input.purpose);

  const estimatedValue = Math.round((baseline * landUseAdjustment * titleAdjustment * methodMultiplier * purposeAdjustment + subject.estimatedValue) / 2);
  const pricePerSqm = Math.round(estimatedValue / Math.max(subject.areaSquareMeters, 1));
  const confidence = Math.max(68, Math.min(94, 72 + comparableSales.length * 4 + (subject.status === 'registered' ? 6 : subject.status === 'verified' ? 4 : 0)));

  const store = loadStore();
  const record: ValuationHistoryRecord = {
    id: store.nextId,
    date: new Date().toISOString(),
    parcelNumber: subject.parcelNumber,
    method: formatMethod(input.method),
    purpose: input.purpose,
    value: estimatedValue,
    valuerId: `VAL-${String(input.requestedByUserId || 0).padStart(3, '0')}`,
    valuerName: input.requestedByName || 'Automated Valuation Desk',
    status: input.method === 'avm' ? 'approved' : 'pending',
    confidence,
  };

  store.history.unshift(record);
  store.nextId += 1;
  saveStore(store);

  return {
    parcel: subject,
    estimatedValue,
    pricePerSqm,
    confidence,
    valueRange: {
      low: Math.round(estimatedValue * 0.92),
      high: Math.round(estimatedValue * 1.08),
    },
    method: formatMethod(input.method),
    purpose: input.purpose,
    valuationDate: record.date,
    comparableSales,
    factors: [
      'Location and neighbourhood demand profile',
      'Parcel size and land-use category',
      'Recent comparable sales from registry transactions',
      'Title and verification status within the registry workflow',
      'Current market positioning inferred from parcel value benchmarks',
    ],
    historyRecord: record,
  };
}

export function listValuationHistory(parcelNumber?: string) {
  const history = loadStore().history;
  return history
    .filter((record) => (parcelNumber ? record.parcelNumber === parcelNumber : true))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getMarketInsights(parcelNumber?: string) {
  const parcels = searchParcels({ page: 1, limit: 1000 }).parcels;
  const history = loadStore().history;
  const subject = parcelNumber ? getParcelByNumber(parcelNumber) : null;
  const locationParcels = subject ? parcels.filter((parcel) => parcel.state === subject.state && parcel.lga === subject.lga) : parcels;

  const averagePricePerSqm = locationParcels.length > 0
    ? Math.round(locationParcels.reduce((sum, parcel) => sum + parcel.estimatedValue / Math.max(parcel.areaSquareMeters, 1), 0) / locationParcels.length)
    : 0;

  const valuationsThisMonth = history.filter((record) => {
    const recordDate = new Date(record.date);
    const now = new Date();
    return recordDate.getUTCFullYear() === now.getUTCFullYear() && recordDate.getUTCMonth() === now.getUTCMonth();
  }).length;

  const approved = history.filter((record) => record.status === 'approved');
  const avgTurnaroundDays = approved.length > 0 ? 3 : 0;

  return {
    averagePricePerSqm,
    valuationsThisMonth,
    averageTurnaroundDays: avgTurnaroundDays,
    locationLabel: subject ? `${subject.lga}, ${subject.state}` : 'Platform-wide',
  };
}
