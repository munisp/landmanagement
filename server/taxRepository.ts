import fs from 'fs';
import path from 'path';
import { getParcelByNumber } from './parcelRepository';

export type TaxStatus = 'pending' | 'paid' | 'overdue' | 'disputed';
export type PaymentStatus = 'pending' | 'completed' | 'failed';
export type ClearanceStatus = 'valid' | 'expired' | 'revoked';
export type TaxPaymentMethod = 'bank_transfer' | 'card' | 'ussd' | 'pos';
export type LandUseType = 'residential' | 'commercial' | 'industrial' | 'agricultural' | 'mixed';

export interface PropertyTaxCalculationInput {
  parcelId: string;
  propertyValue: number;
  landArea: number;
  landUseType: LandUseType;
  state: string;
  lga: string;
}

export interface TaxAssessmentRecord {
  assessmentId: string;
  parcelId: string;
  taxYear: number;
  propertyValue: number;
  assessedValue: number;
  taxRate: number;
  annualTax: number;
  penalties: number;
  totalDue: number;
  dueDate: string;
  status: TaxStatus;
  assessmentDate: string;
  landUseType: LandUseType;
  state: string;
  lga: string;
  landArea: number;
}

export interface TaxPaymentRecord {
  paymentId: string;
  assessmentId: string;
  amount: number;
  paymentMethod: TaxPaymentMethod;
  paymentDate: string;
  receiptNumber: string;
  status: PaymentStatus;
}

export interface TaxClearanceRecord {
  certificateId: string;
  parcelId: string;
  ownerName: string;
  ownerTin: string;
  validFrom: string;
  validUntil: string;
  status: ClearanceStatus;
  issueDate: string;
  certificateUrl: string;
}

export interface TinVerificationRecord {
  valid: boolean;
  taxpayerName?: string;
  taxpayerType?: string;
  registrationDate?: string;
}

interface TaxStore {
  assessments: TaxAssessmentRecord[];
  payments: TaxPaymentRecord[];
  clearances: TaxClearanceRecord[];
  tins: Record<string, TinVerificationRecord>;
  nextAssessmentSequence: number;
  nextPaymentSequence: number;
  nextClearanceSequence: number;
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'tax-store.json');

const taxRates: Record<LandUseType, number> = {
  residential: 0.005,
  commercial: 0.01,
  industrial: 0.015,
  agricultural: 0.002,
  mixed: 0.0075,
};

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function seedTinRegistry(): Record<string, TinVerificationRecord> {
  return {
    '12345678-0001': {
      valid: true,
      taxpayerName: 'Amina Bello',
      taxpayerType: 'Individual',
      registrationDate: '2021-02-11T00:00:00.000Z',
    },
    '22345678-0002': {
      valid: true,
      taxpayerName: 'Chinedu Okafor Holdings',
      taxpayerType: 'Corporate',
      registrationDate: '2020-07-19T00:00:00.000Z',
    },
    '32345678-0003': {
      valid: true,
      taxpayerName: 'Industrial Assets Limited',
      taxpayerType: 'Corporate',
      registrationDate: '2019-10-08T00:00:00.000Z',
    },
  };
}

function buildAssessment(input: PropertyTaxCalculationInput, sequence: number, assessmentDate: Date): TaxAssessmentRecord {
  const assessedValue = Math.round(input.propertyValue * 0.9);
  const taxRate = taxRates[input.landUseType];
  const annualTax = Math.round(assessedValue * taxRate);
  const penalties = 0;
  const dueDate = new Date(assessmentDate);
  dueDate.setMonth(dueDate.getMonth() + 3);

  return {
    assessmentId: `ASM-${assessmentDate.getFullYear()}-${String(sequence).padStart(4, '0')}`,
    parcelId: input.parcelId,
    taxYear: assessmentDate.getFullYear(),
    propertyValue: input.propertyValue,
    assessedValue,
    taxRate,
    annualTax,
    penalties,
    totalDue: annualTax + penalties,
    dueDate: dueDate.toISOString(),
    status: 'pending',
    assessmentDate: assessmentDate.toISOString(),
    landUseType: input.landUseType,
    state: input.state,
    lga: input.lga,
    landArea: input.landArea,
  };
}

function initialStore(): TaxStore {
  const now = new Date();
  const currentYear = now.getFullYear();

  const seededAssessments: TaxAssessmentRecord[] = [
    {
      assessmentId: `ASM-${currentYear - 2}-0001`,
      parcelId: 'LG-VI-2024-001',
      taxYear: currentYear - 2,
      propertyValue: 150000000,
      assessedValue: 135000000,
      taxRate: taxRates.residential,
      annualTax: 675000,
      penalties: 15000,
      totalDue: 690000,
      dueDate: new Date(currentYear - 2, 11, 31).toISOString(),
      status: 'paid',
      assessmentDate: new Date(currentYear - 2, 0, 12).toISOString(),
      landUseType: 'residential',
      state: 'Lagos',
      lga: 'Victoria Island',
      landArea: 1200.5,
    },
    {
      assessmentId: `ASM-${currentYear - 1}-0002`,
      parcelId: 'LG-VI-2024-001',
      taxYear: currentYear - 1,
      propertyValue: 162000000,
      assessedValue: 145800000,
      taxRate: taxRates.residential,
      annualTax: 729000,
      penalties: 0,
      totalDue: 729000,
      dueDate: new Date(currentYear - 1, 11, 31).toISOString(),
      status: 'paid',
      assessmentDate: new Date(currentYear - 1, 0, 10).toISOString(),
      landUseType: 'residential',
      state: 'Lagos',
      lga: 'Victoria Island',
      landArea: 1200.5,
    },
    {
      assessmentId: `ASM-${currentYear}-0003`,
      parcelId: 'AB-MA-2024-005',
      taxYear: currentYear,
      propertyValue: 250000000,
      assessedValue: 225000000,
      taxRate: taxRates.residential,
      annualTax: 1125000,
      penalties: 0,
      totalDue: 1125000,
      dueDate: new Date(currentYear, 11, 31).toISOString(),
      status: 'pending',
      assessmentDate: new Date(currentYear, 0, 15).toISOString(),
      landUseType: 'residential',
      state: 'Abuja',
      lga: 'Maitama',
      landArea: 1500,
    },
  ];

  const seededPayments: TaxPaymentRecord[] = [
    {
      paymentId: 'TAXPAY-0001',
      assessmentId: `ASM-${currentYear - 2}-0001`,
      amount: 690000,
      paymentMethod: 'bank_transfer',
      paymentDate: new Date(currentYear - 2, 2, 8).toISOString(),
      receiptNumber: 'TXR-0001',
      status: 'completed',
    },
    {
      paymentId: 'TAXPAY-0002',
      assessmentId: `ASM-${currentYear - 1}-0002`,
      amount: 729000,
      paymentMethod: 'card',
      paymentDate: new Date(currentYear - 1, 2, 12).toISOString(),
      receiptNumber: 'TXR-0002',
      status: 'completed',
    },
  ];

  const seededClearances: TaxClearanceRecord[] = [
    {
      certificateId: 'TCC-0001',
      parcelId: 'LG-VI-2024-001',
      ownerName: 'Amina Bello',
      ownerTin: '12345678-0001',
      validFrom: new Date(currentYear - 1, 0, 1).toISOString(),
      validUntil: new Date(currentYear, 11, 31).toISOString(),
      status: 'valid',
      issueDate: new Date(currentYear - 1, 0, 10).toISOString(),
      certificateUrl: 'https://storage.idlr.local/tax-clearance/TCC-0001.pdf',
    },
  ];

  return {
    assessments: seededAssessments,
    payments: seededPayments,
    clearances: seededClearances,
    tins: seedTinRegistry(),
    nextAssessmentSequence: seededAssessments.length + 1,
    nextPaymentSequence: seededPayments.length + 1,
    nextClearanceSequence: seededClearances.length + 1,
  };
}

function loadStore(): TaxStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const initial = initialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as TaxStore;
  if (!parsed.assessments || !parsed.payments || !parsed.clearances || !parsed.tins) {
    const initial = initialStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }

  return parsed;
}

function saveStore(store: TaxStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

export function calculateTaxAssessment(input: PropertyTaxCalculationInput) {
  const store = loadStore();
  const existing = store.assessments.find(
    (assessment) => assessment.parcelId === input.parcelId && assessment.taxYear === new Date().getFullYear()
  );

  if (existing) {
    return existing;
  }

  const assessment = buildAssessment(input, store.nextAssessmentSequence, new Date());
  store.assessments.unshift(assessment);
  store.nextAssessmentSequence += 1;
  saveStore(store);
  return assessment;
}

export function getTaxAssessmentById(assessmentId: string) {
  return loadStore().assessments.find((assessment) => assessment.assessmentId === assessmentId) ?? null;
}

export function getTaxHistoryByParcel(parcelId: string) {
  return loadStore().assessments
    .filter((assessment) => assessment.parcelId === parcelId)
    .sort((a, b) => new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime());
}

export function submitTaxPaymentRecord(assessmentId: string, amount: number, paymentMethod: TaxPaymentMethod) {
  const store = loadStore();
  const assessment = store.assessments.find((item) => item.assessmentId === assessmentId);
  if (!assessment) {
    throw new Error('Tax assessment not found');
  }

  const paymentId = `TAXPAY-${String(store.nextPaymentSequence).padStart(4, '0')}`;
  const receiptNumber = `TXR-${String(store.nextPaymentSequence).padStart(4, '0')}`;
  const paymentDate = new Date().toISOString();

  const payment: TaxPaymentRecord = {
    paymentId,
    assessmentId,
    amount,
    paymentMethod,
    paymentDate,
    receiptNumber,
    status: 'completed',
  };

  assessment.status = 'paid';
  assessment.penalties = 0;
  assessment.totalDue = amount;
  store.payments.unshift(payment);
  store.nextPaymentSequence += 1;
  saveStore(store);
  return payment;
}

export function generateTaxClearanceRecord(parcelId: string, ownerName: string, ownerTin: string) {
  const store = loadStore();
  const parcel = getParcelByNumber(parcelId);
  if (!parcel) {
    throw new Error('Parcel not found in registry continuity store');
  }

  const outstanding = store.assessments.find(
    (assessment) => assessment.parcelId === parcelId && assessment.status !== 'paid' && assessment.totalDue > 0
  );

  if (outstanding) {
    throw new Error('Outstanding tax liabilities must be settled before generating a clearance certificate');
  }

  store.tins[ownerTin] = store.tins[ownerTin] ?? {
    valid: true,
    taxpayerName: ownerName,
    taxpayerType: 'Property Owner',
    registrationDate: new Date().toISOString(),
  };

  const issueDate = new Date();
  const validUntil = new Date(issueDate);
  validUntil.setFullYear(validUntil.getFullYear() + 1);

  const certificateId = `TCC-${String(store.nextClearanceSequence).padStart(4, '0')}`;
  const record: TaxClearanceRecord = {
    certificateId,
    parcelId,
    ownerName,
    ownerTin,
    validFrom: issueDate.toISOString(),
    validUntil: validUntil.toISOString(),
    status: 'valid',
    issueDate: issueDate.toISOString(),
    certificateUrl: `https://storage.idlr.local/tax-clearance/${certificateId}.pdf`,
  };

  store.clearances.unshift(record);
  store.nextClearanceSequence += 1;
  saveStore(store);
  return record;
}

export function verifyTaxClearanceRecord(certificateId: string) {
  return loadStore().clearances.find((clearance) => clearance.certificateId === certificateId) ?? null;
}

export function verifyTinRecord(tin: string): TinVerificationRecord {
  const normalized = tin.trim();
  const existing = loadStore().tins[normalized];
  if (existing) {
    return existing;
  }

  const plausibleTin = /^\d{8}-\d{4}$/.test(normalized);
  return plausibleTin
    ? {
        valid: true,
        taxpayerName: 'Registry-linked taxpayer',
        taxpayerType: 'Unclassified',
        registrationDate: new Date('2022-01-01T00:00:00.000Z').toISOString(),
      }
    : { valid: false };
}
