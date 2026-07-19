import fs from 'fs';
import path from 'path';

export type Phase4MortgageStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'disbursed' | 'cancelled';
export type Phase4TaxStatus = 'pending' | 'in_progress' | 'verified' | 'issued' | 'rejected' | 'expired';
export type Phase4InsuranceStatus = 'pending' | 'active' | 'expired' | 'cancelled' | 'suspended';
export type Phase4LegalStatus = 'draft' | 'pending_review' | 'approved' | 'signed' | 'registered' | 'rejected';
export type Phase4SurveyStatus = 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected' | 'expired';
export type Phase4EnvironmentalStatus = 'pending' | 'under_review' | 'approved' | 'conditional_approval' | 'rejected' | 'expired';
export type Phase4NoticeStatus = 'pending' | 'published' | 'objection_filed' | 'objection_resolved' | 'completed' | 'cancelled';
export type Phase4LandUseStatus = 'pending' | 'under_review' | 'approved' | 'conditional_approval' | 'rejected' | 'expired';

export interface AdminMortgageApplicationRecord {
  id: number;
  applicationId: string;
  transactionId: string;
  lenderName: string;
  loanAmount: number;
  interestRate: string;
  loanTerm: number;
  monthlyPayment: number;
  applicantId: number;
  status: Phase4MortgageStatus;
  approvedAt?: string | null;
  reviewedAt?: string | null;
  rejectedAt?: string | null;
  disbursedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminTaxClearanceRecord {
  id: number;
  clearanceId: string;
  transactionId: string;
  taxAuthority: string;
  amountDue: number;
  amountPaid: number;
  certificateNumber?: string | null;
  firsReferenceNumber?: string | null;
  certificateUrl?: string | null;
  ownerId: number;
  status: Phase4TaxStatus;
  issuedAt?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInsurancePolicyRecord {
  id: number;
  policyId: string;
  transactionId: string;
  providerName: string;
  policyNumber: string;
  premiumAmount: number;
  startDate: string;
  endDate: string;
  policyHolderId: number;
  status: Phase4InsuranceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLegalDocumentRecord {
  id: number;
  documentId: string;
  transactionId: string;
  documentType: string;
  preparedBy: string;
  reviewedBy?: string | null;
  registrationNumber?: string | null;
  status: Phase4LegalStatus;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCadastralSurveyRecord {
  id: number;
  surveyId: string;
  transactionId: string;
  surveyorName: string;
  surveyorLicense: string;
  surveyedArea: number;
  surveyMethod: string;
  status: Phase4SurveyStatus;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminEnvironmentalAssessmentRecord {
  id: number;
  assessmentId: string;
  transactionId: string;
  assessorName: string;
  assessmentType: string;
  impactLevel: string;
  mitigationRequired: boolean;
  status: Phase4EnvironmentalStatus;
  completedAt?: string | null;
  certificateUrl?: string | null;
  conditions?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPublicNoticeRecord {
  id: number;
  noticeId: string;
  transactionId: string;
  noticeType: string;
  publicationName: string;
  publicationReference?: string | null;
  noticeStartDate: string;
  noticeEndDate: string;
  status: Phase4NoticeStatus;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLandUsePlanRecord {
  id: number;
  planId: string;
  transactionId: string;
  currentZoning: string;
  proposedUse: string;
  isCompliant: boolean;
  planningAuthority: string;
  status: Phase4LandUseStatus;
  approvedAt?: string | null;
  conditions?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Phase4AdminStore {
  mortgages: AdminMortgageApplicationRecord[];
  taxes: AdminTaxClearanceRecord[];
  insurance: AdminInsurancePolicyRecord[];
  legal: AdminLegalDocumentRecord[];
  surveys: AdminCadastralSurveyRecord[];
  environmental: AdminEnvironmentalAssessmentRecord[];
  notices: AdminPublicNoticeRecord[];
  landUse: AdminLandUsePlanRecord[];
}

const dataDir = path.join(process.cwd(), 'server', 'data');
const storePath = path.join(dataDir, 'phase4-admin-store.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function seedStore(): Phase4AdminStore {
  return {
    mortgages: [
      {
        id: 1,
        applicationId: 'MORT-ADMIN-001',
        transactionId: 'TXN-2026-1101',
        lenderName: 'First Meridian Mortgage Bank',
        loanAmount: 125000000,
        interestRate: '18.5',
        loanTerm: 180,
        monthlyPayment: 1602500,
        applicantId: 2,
        status: 'under_review',
        reviewedAt: '2026-05-10T09:30:00.000Z',
        approvedAt: null,
        rejectedAt: null,
        disbursedAt: null,
        rejectionReason: null,
        createdAt: '2026-05-06T08:15:00.000Z',
        updatedAt: '2026-05-10T09:30:00.000Z',
      },
      {
        id: 2,
        applicationId: 'MORT-ADMIN-002',
        transactionId: 'TXN-2026-1102',
        lenderName: 'Unity Home Finance',
        loanAmount: 88000000,
        interestRate: '17.2',
        loanTerm: 144,
        monthlyPayment: 1234000,
        applicantId: 3,
        status: 'approved',
        reviewedAt: '2026-05-08T11:00:00.000Z',
        approvedAt: '2026-05-11T14:20:00.000Z',
        rejectedAt: null,
        disbursedAt: null,
        rejectionReason: null,
        createdAt: '2026-05-05T10:45:00.000Z',
        updatedAt: '2026-05-11T14:20:00.000Z',
      },
    ],
    taxes: [
      {
        id: 1,
        clearanceId: 'TAX-ADMIN-001',
        transactionId: 'TXN-2026-1101',
        taxAuthority: 'FIRS Lagos Regional Office',
        amountDue: 2400000,
        amountPaid: 1800000,
        certificateNumber: null,
        firsReferenceNumber: 'FIRS-VAL-2201',
        certificateUrl: null,
        ownerId: 2,
        status: 'verified',
        issuedAt: null,
        verifiedAt: '2026-05-09T16:00:00.000Z',
        createdAt: '2026-05-07T12:00:00.000Z',
        updatedAt: '2026-05-09T16:00:00.000Z',
      },
      {
        id: 2,
        clearanceId: 'TAX-ADMIN-002',
        transactionId: 'TXN-2026-1103',
        taxAuthority: 'FCT Internal Revenue Service',
        amountDue: 1250000,
        amountPaid: 1250000,
        certificateNumber: 'FCT-TCC-2026-0441',
        firsReferenceNumber: 'FCT-CLR-0441',
        certificateUrl: '/certificates/FCT-TCC-2026-0441.pdf',
        ownerId: 4,
        status: 'issued',
        issuedAt: '2026-05-03T10:00:00.000Z',
        verifiedAt: '2026-05-02T14:00:00.000Z',
        createdAt: '2026-04-28T08:20:00.000Z',
        updatedAt: '2026-05-03T10:00:00.000Z',
      },
    ],
    insurance: [
      {
        id: 1,
        policyId: 'INS-ADMIN-001',
        transactionId: 'TXN-2026-1102',
        providerName: 'Leadway Assurance',
        policyNumber: 'LDW-MTG-99301',
        premiumAmount: 1450000,
        startDate: '2026-05-01T00:00:00.000Z',
        endDate: '2027-04-30T00:00:00.000Z',
        policyHolderId: 3,
        status: 'active',
        createdAt: '2026-04-29T09:00:00.000Z',
        updatedAt: '2026-05-01T08:00:00.000Z',
      },
      {
        id: 2,
        policyId: 'INS-ADMIN-002',
        transactionId: 'TXN-2026-1104',
        providerName: 'AXA Mansard',
        policyNumber: 'AXA-MTG-55390',
        premiumAmount: 980000,
        startDate: '2026-05-15T00:00:00.000Z',
        endDate: '2027-05-14T00:00:00.000Z',
        policyHolderId: 5,
        status: 'pending',
        createdAt: '2026-05-12T13:30:00.000Z',
        updatedAt: '2026-05-12T13:30:00.000Z',
      },
    ],
    legal: [
      {
        id: 1,
        documentId: 'LEGAL-ADMIN-001',
        transactionId: 'TXN-2026-1103',
        documentType: 'deed_of_assignment',
        preparedBy: 'A. Ogunleye & Co.',
        reviewedBy: 'Registry Legal Unit',
        registrationNumber: 'REG-LGL-1188',
        status: 'registered',
        approvedAt: '2026-05-04T11:45:00.000Z',
        createdAt: '2026-04-27T15:10:00.000Z',
        updatedAt: '2026-05-04T11:45:00.000Z',
      },
      {
        id: 2,
        documentId: 'LEGAL-ADMIN-002',
        transactionId: 'TXN-2026-1101',
        documentType: 'mortgage_deed',
        preparedBy: 'Ikeja Title Chambers',
        reviewedBy: null,
        registrationNumber: null,
        status: 'pending_review',
        approvedAt: null,
        createdAt: '2026-05-08T09:40:00.000Z',
        updatedAt: '2026-05-08T09:40:00.000Z',
      },
    ],
    surveys: [
      {
        id: 1,
        surveyId: 'SURVEY-ADMIN-001',
        transactionId: 'TXN-2026-1105',
        surveyorName: 'Engr. Musa Balogun',
        surveyorLicense: 'SURV-44510',
        surveyedArea: 3250,
        surveyMethod: 'GNSS + total station',
        status: 'completed',
        completedAt: '2026-05-06T16:30:00.000Z',
        createdAt: '2026-05-01T07:15:00.000Z',
        updatedAt: '2026-05-06T16:30:00.000Z',
      },
      {
        id: 2,
        surveyId: 'SURVEY-ADMIN-002',
        transactionId: 'TXN-2026-1106',
        surveyorName: 'SurveyHub Geomatics',
        surveyorLicense: 'SURV-88211',
        surveyedArea: 1820,
        surveyMethod: 'Drone photogrammetry',
        status: 'under_review' as Phase4SurveyStatus,
        completedAt: null,
        createdAt: '2026-05-12T10:20:00.000Z',
        updatedAt: '2026-05-13T12:10:00.000Z',
      },
    ],
    environmental: [
      {
        id: 1,
        assessmentId: 'ENV-ADMIN-001',
        transactionId: 'TXN-2026-1104',
        assessorName: 'EcoMetrics Consulting',
        assessmentType: 'EIA',
        impactLevel: 'Moderate',
        mitigationRequired: true,
        status: 'conditional_approval',
        completedAt: '2026-05-07T15:00:00.000Z',
        certificateUrl: null,
        conditions: 'Stormwater retention and tree replacement plan required.',
        rejectionReason: null,
        createdAt: '2026-05-02T09:00:00.000Z',
        updatedAt: '2026-05-07T15:00:00.000Z',
      },
      {
        id: 2,
        assessmentId: 'ENV-ADMIN-002',
        transactionId: 'TXN-2026-1107',
        assessorName: 'GreenLine Impact Associates',
        assessmentType: 'Soil and groundwater review',
        impactLevel: 'Low',
        mitigationRequired: false,
        status: 'under_review',
        completedAt: null,
        certificateUrl: null,
        conditions: null,
        rejectionReason: null,
        createdAt: '2026-05-11T08:35:00.000Z',
        updatedAt: '2026-05-11T08:35:00.000Z',
      },
    ],
    notices: [
      {
        id: 1,
        noticeId: 'NOTICE-ADMIN-001',
        transactionId: 'TXN-2026-1108',
        noticeType: 'Title perfection',
        publicationName: 'The Guardian',
        publicationReference: 'GDN-NTC-5502',
        noticeStartDate: '2026-05-01T00:00:00.000Z',
        noticeEndDate: '2026-05-22T00:00:00.000Z',
        status: 'published',
        publishedAt: '2026-05-01T08:00:00.000Z',
        createdAt: '2026-04-29T17:10:00.000Z',
        updatedAt: '2026-05-01T08:00:00.000Z',
      },
      {
        id: 2,
        noticeId: 'NOTICE-ADMIN-002',
        transactionId: 'TXN-2026-1109',
        noticeType: 'Boundary adjustment',
        publicationName: 'Daily Trust',
        publicationReference: null,
        noticeStartDate: '2026-05-16T00:00:00.000Z',
        noticeEndDate: '2026-06-06T00:00:00.000Z',
        status: 'pending',
        publishedAt: null,
        createdAt: '2026-05-13T14:15:00.000Z',
        updatedAt: '2026-05-13T14:15:00.000Z',
      },
    ],
    landUse: [
      {
        id: 1,
        planId: 'LANDUSE-ADMIN-001',
        transactionId: 'TXN-2026-1110',
        currentZoning: 'Residential R2',
        proposedUse: 'Mixed-use residential/commercial',
        isCompliant: false,
        planningAuthority: 'Lagos State Physical Planning Permit Authority',
        status: 'conditional_approval',
        approvedAt: null,
        conditions: 'Traffic impact and parking study required before approval.',
        rejectionReason: null,
        createdAt: '2026-05-03T09:25:00.000Z',
        updatedAt: '2026-05-08T13:30:00.000Z',
      },
      {
        id: 2,
        planId: 'LANDUSE-ADMIN-002',
        transactionId: 'TXN-2026-1111',
        currentZoning: 'Agricultural',
        proposedUse: 'Agro-processing facility',
        isCompliant: true,
        planningAuthority: 'Oyo State Planning Authority',
        status: 'approved',
        approvedAt: '2026-05-09T12:00:00.000Z',
        conditions: null,
        rejectionReason: null,
        createdAt: '2026-05-01T11:10:00.000Z',
        updatedAt: '2026-05-09T12:00:00.000Z',
      },
    ],
  };
}

function readStore(): Phase4AdminStore {
  ensureDataDir();
  if (!fs.existsSync(storePath)) {
    const initial = seedStore();
    fs.writeFileSync(storePath, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Phase4AdminStore;
}

function writeStore(store: Phase4AdminStore) {
  ensureDataDir();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function stamp<T extends { updatedAt: string }>(record: T): T {
  record.updatedAt = new Date().toISOString();
  return record;
}

export function listAdminMortgageApplications() {
  return readStore().mortgages;
}
export function createAdminMortgageApplication(record: Omit<AdminMortgageApplicationRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.mortgages[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminMortgageApplicationRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.mortgages.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function updateAdminMortgageApplicationStatus(applicationId: string, status: Phase4MortgageStatus, rejectionReason?: string | null) {
  const store = readStore();
  const record = store.mortgages.find((item) => item.applicationId === applicationId);
  if (!record) throw new Error('Mortgage application not found');
  record.status = status;
  if (status === 'under_review') record.reviewedAt = new Date().toISOString();
  if (status === 'approved') record.approvedAt = new Date().toISOString();
  if (status === 'rejected') {
    record.rejectedAt = new Date().toISOString();
    record.rejectionReason = rejectionReason ?? 'Rejected during administrative review';
  }
  if (status === 'disbursed') record.disbursedAt = new Date().toISOString();
  writeStore(store);
  return stamp(record);
}

export function listAdminTaxClearances() {
  return readStore().taxes;
}
export function createAdminTaxClearance(record: Omit<AdminTaxClearanceRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.taxes[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminTaxClearanceRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.taxes.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function updateAdminTaxClearanceStatus(clearanceId: string, status: Phase4TaxStatus, options?: { certificateUrl?: string; firsReferenceNumber?: string }) {
  const store = readStore();
  const record = store.taxes.find((item) => item.clearanceId === clearanceId);
  if (!record) throw new Error('Tax clearance not found');
  record.status = status;
  if (status === 'verified') record.verifiedAt = new Date().toISOString();
  if (status === 'issued') {
    record.issuedAt = new Date().toISOString();
    record.certificateUrl = options?.certificateUrl ?? record.certificateUrl ?? `/certificates/${record.clearanceId}.pdf`;
    record.certificateNumber = record.certificateNumber ?? `${record.clearanceId}-CERT`;
  }
  if (options?.firsReferenceNumber) record.firsReferenceNumber = options.firsReferenceNumber;
  writeStore(store);
  return stamp(record);
}

export function listAdminInsurancePolicies() {
  return readStore().insurance;
}
export function createAdminInsurancePolicy(record: Omit<AdminInsurancePolicyRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.insurance[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminInsurancePolicyRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.insurance.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function updateAdminInsurancePolicyStatus(policyId: string, status: Phase4InsuranceStatus) {
  const store = readStore();
  const record = store.insurance.find((item) => item.policyId === policyId);
  if (!record) throw new Error('Insurance policy not found');
  record.status = status;
  writeStore(store);
  return stamp(record);
}

export function listAdminLegalDocuments() {
  return readStore().legal;
}

export function createAdminLegalDocument(record: Omit<AdminLegalDocumentRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.legal[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminLegalDocumentRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.legal.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function updateAdminLegalDocumentStatus(documentId: string, status: Phase4LegalStatus, registrationNumber?: string) {
  const store = readStore();
  const record = store.legal.find((item) => item.documentId === documentId);
  if (!record) throw new Error('Legal document not found');
  record.status = status;
  if (status === 'approved' || status === 'registered') {
    record.approvedAt = new Date().toISOString();
  }
  if (registrationNumber) record.registrationNumber = registrationNumber;
  if (status !== 'pending_review' && !record.reviewedBy) record.reviewedBy = 'Admin Legal Desk';
  writeStore(store);
  return stamp(record);
}

export function listAdminCadastralSurveys() {
  return readStore().surveys;
}

export function createAdminCadastralSurvey(record: Omit<AdminCadastralSurveyRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.surveys[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminCadastralSurveyRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.surveys.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function updateAdminCadastralSurveyStatus(surveyId: string, status: Phase4SurveyStatus) {
  const store = readStore();
  const record = store.surveys.find((item) => item.surveyId === surveyId);
  if (!record) throw new Error('Cadastral survey not found');
  record.status = status;
  if (status === 'completed' || status === 'approved') record.completedAt = record.completedAt ?? new Date().toISOString();
  writeStore(store);
  return stamp(record);
}

export function listAdminEnvironmentalAssessments() {
  return readStore().environmental;
}

export function createAdminEnvironmentalAssessment(record: Omit<AdminEnvironmentalAssessmentRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.environmental[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminEnvironmentalAssessmentRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.environmental.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function updateAdminEnvironmentalAssessmentStatus(assessmentId: string, status: Phase4EnvironmentalStatus, options?: { conditions?: string; rejectionReason?: string; certificateUrl?: string }) {
  const store = readStore();
  const record = store.environmental.find((item) => item.assessmentId === assessmentId);
  if (!record) throw new Error('Environmental assessment not found');
  record.status = status;
  if (status === 'approved' || status === 'conditional_approval') {
    record.completedAt = record.completedAt ?? new Date().toISOString();
    record.conditions = options?.conditions ?? record.conditions ?? null;
    record.certificateUrl = options?.certificateUrl ?? record.certificateUrl ?? null;
  }
  if (status === 'rejected') {
    record.rejectionReason = options?.rejectionReason ?? 'Rejected after environmental compliance review';
  }
  writeStore(store);
  return stamp(record);
}

export function listAdminPublicNotices() {
  return readStore().notices;
}

export function createAdminPublicNotice(record: Omit<AdminPublicNoticeRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.notices[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminPublicNoticeRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.notices.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function addAdminPublicNoticeObjection(noticeId: string, objection: { objectorName: string; objectorContact: string; objectionDetails: string; filedAt: Date }) {
  const store = readStore();
  const record = store.notices.find((item) => item.noticeId === noticeId);
  if (!record) throw new Error('Public notice not found');
  record.status = 'objection_filed';
  record.updatedAt = new Date().toISOString();
  writeStore(store);
  return stamp(record);
}

export function updateAdminPublicNoticeStatus(noticeId: string, status: Phase4NoticeStatus) {
  const store = readStore();
  const record = store.notices.find((item) => item.noticeId === noticeId);
  if (!record) throw new Error('Public notice not found');
  record.status = status;
  if (status === 'published') {
    record.publishedAt = record.publishedAt ?? new Date().toISOString();
    record.publicationReference = record.publicationReference ?? `${record.noticeId}-PUB`;
  }
  writeStore(store);
  return stamp(record);
}

export function listAdminLandUsePlans() {
  return readStore().landUse;
}

export function createAdminLandUsePlan(record: Omit<AdminLandUsePlanRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  const store = readStore();
  const nextId = (store.landUse[0]?.id ?? 0) + 1;
  const now = new Date().toISOString();
  const created: AdminLandUsePlanRecord = { id: nextId, createdAt: now, updatedAt: now, ...record };
  store.landUse.unshift(created);
  writeStore(store);
  return stamp(created);
}

export function updateAdminLandUsePlanStatus(planId: string, status: Phase4LandUseStatus, options?: { conditions?: string; rejectionReason?: string; isCompliant?: boolean }) {
  const store = readStore();
  const record = store.landUse.find((item) => item.planId === planId);
  if (!record) throw new Error('Land use plan not found');
  record.status = status;
  if (typeof options?.isCompliant === 'boolean') record.isCompliant = options.isCompliant;
  if (status === 'approved' || status === 'conditional_approval') {
    record.approvedAt = record.approvedAt ?? new Date().toISOString();
    record.conditions = options?.conditions ?? record.conditions ?? null;
  }
  if (status === 'rejected') {
    record.rejectionReason = options?.rejectionReason ?? 'Rejected during planning compliance review';
  }
  writeStore(store);
  return stamp(record);
}
