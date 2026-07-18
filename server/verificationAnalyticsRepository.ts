import { readJsonStore, writeJsonStore } from './jsonStore';

export type VerificationLifecycleStatus = 'submitted' | 'under_review' | 'approved' | 'rejected';

export interface VerificationAnalyticsRecord {
  id: number;
  parcelId: string;
  requesterId: number;
  reviewerId: number | null;
  reviewerName: string | null;
  status: VerificationLifecycleStatus;
  createdAt: string;
  submittedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
}

interface VerificationAnalyticsStore {
  nextId: number;
  requests: VerificationAnalyticsRecord[];
}


function hoursAfter(dateIso: string, hours: number) {
  return new Date(new Date(dateIso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function seededRequests(): VerificationAnalyticsRecord[] {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const seeds: Array<{
    id: number;
    parcelId: string;
    requesterId: number;
    reviewerId: number | null;
    reviewerName: string | null;
    status: VerificationLifecycleStatus;
    ageDays: number;
    reviewDelayHours?: number;
    decisionDelayHours?: number;
  }> = [
    { id: 1, parcelId: 'LG-IKJ-2026-001', requesterId: 101, reviewerId: 501, reviewerName: 'Amina Bello', status: 'approved', ageDays: 2, reviewDelayHours: 8, decisionDelayHours: 30 },
    { id: 2, parcelId: 'AB-MAI-2026-014', requesterId: 102, reviewerId: 502, reviewerName: 'Tunde Adebayo', status: 'approved', ageDays: 5, reviewDelayHours: 12, decisionDelayHours: 52 },
    { id: 3, parcelId: 'RV-PHA-2026-008', requesterId: 103, reviewerId: 501, reviewerName: 'Amina Bello', status: 'rejected', ageDays: 7, reviewDelayHours: 14, decisionDelayHours: 40 },
    { id: 4, parcelId: 'KN-NAS-2026-022', requesterId: 104, reviewerId: 503, reviewerName: 'Chinedu Okafor', status: 'under_review', ageDays: 3, reviewDelayHours: 16 },
    { id: 5, parcelId: 'OY-IBA-2026-017', requesterId: 105, reviewerId: null, reviewerName: null, status: 'submitted', ageDays: 1 },
    { id: 6, parcelId: 'LG-LKI-2026-045', requesterId: 106, reviewerId: 502, reviewerName: 'Tunde Adebayo', status: 'approved', ageDays: 11, reviewDelayHours: 10, decisionDelayHours: 60 },
    { id: 7, parcelId: 'AB-GWA-2026-019', requesterId: 107, reviewerId: 503, reviewerName: 'Chinedu Okafor', status: 'under_review', ageDays: 9, reviewDelayHours: 9 },
    { id: 8, parcelId: 'RV-OBI-2026-006', requesterId: 108, reviewerId: 501, reviewerName: 'Amina Bello', status: 'approved', ageDays: 14, reviewDelayHours: 7, decisionDelayHours: 28 },
    { id: 9, parcelId: 'KD-ZAR-2026-003', requesterId: 109, reviewerId: 502, reviewerName: 'Tunde Adebayo', status: 'rejected', ageDays: 18, reviewDelayHours: 18, decisionDelayHours: 44 },
    { id: 10, parcelId: 'LG-AJA-2026-028', requesterId: 110, reviewerId: null, reviewerName: null, status: 'submitted', ageDays: 4 },
    { id: 11, parcelId: 'EN-GRA-2026-012', requesterId: 111, reviewerId: 503, reviewerName: 'Chinedu Okafor', status: 'approved', ageDays: 21, reviewDelayHours: 11, decisionDelayHours: 74 },
    { id: 12, parcelId: 'FC-KUB-2026-009', requesterId: 112, reviewerId: 501, reviewerName: 'Amina Bello', status: 'under_review', ageDays: 6, reviewDelayHours: 5 },
  ];

  return seeds.map((seed) => {
    const createdAt = new Date(now - seed.ageDays * day).toISOString();
    const submittedAt = createdAt;
    const reviewedAt = seed.reviewDelayHours != null ? hoursAfter(createdAt, seed.reviewDelayHours) : null;
    const approvedAt = seed.status === 'approved' && seed.decisionDelayHours != null ? hoursAfter(createdAt, seed.decisionDelayHours) : null;
    const rejectedAt = seed.status === 'rejected' && seed.decisionDelayHours != null ? hoursAfter(createdAt, seed.decisionDelayHours) : null;

    return {
      id: seed.id,
      parcelId: seed.parcelId,
      requesterId: seed.requesterId,
      reviewerId: seed.reviewerId,
      reviewerName: seed.reviewerName,
      status: seed.status,
      createdAt,
      submittedAt,
      reviewedAt,
      approvedAt,
      rejectedAt,
    };
  });
}

function defaultStore(): VerificationAnalyticsStore {
  const requests = seededRequests();
  return {
    nextId: Math.max(...requests.map((item) => item.id), 0) + 1,
    requests,
  };
}

async function loadStore(): Promise<VerificationAnalyticsStore> {
  return readJsonStore<VerificationAnalyticsStore>('verification-analytics-store', defaultStore);
}

export async function listVerificationAnalyticsRequests() {
  return (await loadStore()).requests;
}
