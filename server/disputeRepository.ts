import { readJsonStore, writeJsonStore } from './jsonStore';

export type DisputeType =
  | 'boundary_dispute'
  | 'ownership_dispute'
  | 'title_dispute'
  | 'encroachment'
  | 'fraud'
  | 'tax_assessment'
  | 'other';

export type DisputeStatus =
  | 'pending'
  | 'investigating'
  | 'mediation'
  | 'hearing'
  | 'resolved'
  | 'dismissed';

export interface DisputeEvidenceRecord {
  id: string;
  fileName: string;
  fileType: string;
  uploadedBy: string;
  uploadedAt: string;
  note?: string;
}

export interface DisputeTimelineEvent {
  id: string;
  disputeId: number;
  status: DisputeStatus;
  title: string;
  description: string;
  actor: string;
  createdAt: string;
}

export interface DisputeRecord {
  id: number;
  caseNumber: string;
  parcelId?: number;
  parcelNumber: string;
  titleId?: number;
  transactionId?: number;
  type: DisputeType;
  status: DisputeStatus;
  state: string;
  lga: string;
  filedBy: string;
  filedByUserId?: number;
  respondent: string;
  assignedOfficer?: string;
  mediator?: string | null;
  hearingDate?: string | null;
  filedDate: string;
  description: string;
  requestedRelief?: string;
  resolution?: string;
  resolvedDate?: string | null;
  slaDays: number;
  evidence: DisputeEvidenceRecord[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface DisputeStore {
  disputes: DisputeRecord[];
  timeline: DisputeTimelineEvent[];
  nextId: number;
}

export interface ListDisputesInput {
  status?: DisputeStatus | 'all';
  type?: DisputeType | 'all';
  state?: string;
  lga?: string;
  search?: string;
  assignedOfficer?: string;
  page?: number;
  limit?: number;
}


function buildSeedStore(): DisputeStore {
  const disputes: DisputeRecord[] = [
    {
      id: 1,
      caseNumber: 'DSP-2024-001',
      parcelId: 1,
      parcelNumber: 'LG-VI-2024-001',
      titleId: 1,
      transactionId: 1,
      type: 'boundary_dispute',
      status: 'mediation',
      state: 'Lagos',
      lga: 'Victoria Island',
      filedBy: 'Amina Bello',
      filedByUserId: 1,
      respondent: 'Femi Adeyemi',
      assignedOfficer: 'Registrar Ngozi Eze',
      mediator: 'Chief Mediator Okonkwo',
      hearingDate: '2024-04-20T10:00:00.000Z',
      filedDate: '2024-04-02T09:15:00.000Z',
      description: 'Complainant alleges the neighbouring parcel fence encroaches on the registered survey line and obstructs access to the parcel frontage.',
      requestedRelief: 'Reinstatement of approved boundary beacons and supervised site demarcation.',
      slaDays: 21,
      evidence: [
        {
          id: 'DSP-2024-001-E1',
          fileName: 'survey-overlay-victoria-island.pdf',
          fileType: 'application/pdf',
          uploadedBy: 'Amina Bello',
          uploadedAt: '2024-04-02T09:20:00.000Z',
          note: 'Overlay of beacon coordinates against field measurements.',
        },
      ],
      tags: ['boundary', 'beacon', 'survey'],
      createdAt: '2024-04-02T09:15:00.000Z',
      updatedAt: '2024-04-12T14:00:00.000Z',
    },
    {
      id: 2,
      caseNumber: 'DSP-2024-002',
      parcelId: 2,
      parcelNumber: 'AB-FCT-2024-002',
      titleId: 2,
      type: 'ownership_dispute',
      status: 'pending',
      state: 'FCT',
      lga: 'Garki',
      filedBy: 'Ahmed Ibrahim',
      filedByUserId: 2,
      respondent: 'Fatima Yusuf',
      assignedOfficer: 'Dispute Desk Ibrahim Musa',
      mediator: null,
      hearingDate: null,
      filedDate: '2024-04-10T11:00:00.000Z',
      description: 'Competing transfer instruments were lodged for the same parcel, requiring registry review of chain-of-title and consent instruments.',
      requestedRelief: 'Suspension of further dealings until ownership is conclusively determined.',
      slaDays: 30,
      evidence: [
        {
          id: 'DSP-2024-002-E1',
          fileName: 'deed-of-assignment-scan.pdf',
          fileType: 'application/pdf',
          uploadedBy: 'Ahmed Ibrahim',
          uploadedAt: '2024-04-10T11:05:00.000Z',
          note: 'Registered deed and proof of stamp duty payment.',
        },
      ],
      tags: ['ownership', 'consent', 'chain-of-title'],
      createdAt: '2024-04-10T11:00:00.000Z',
      updatedAt: '2024-04-10T11:00:00.000Z',
    },
    {
      id: 3,
      caseNumber: 'DSP-2024-003',
      parcelId: 3,
      parcelNumber: 'KN-KN-2024-003',
      titleId: 3,
      type: 'title_dispute',
      status: 'resolved',
      state: 'Kano',
      lga: 'Kano Municipal',
      filedBy: 'Musa Garba Farms',
      filedByUserId: 3,
      respondent: 'Northern Agri Holdings',
      assignedOfficer: 'Justice Panel Secretary Binta Lawal',
      mediator: 'Justice Adeyemi',
      hearingDate: '2024-03-05T09:30:00.000Z',
      filedDate: '2024-02-18T08:30:00.000Z',
      description: 'Challenge to the validity of a title perfection submission after conflicting governor-consent records were detected during verification.',
      requestedRelief: 'Invalidate duplicate instrument and retain perfected title in favour of original allottee.',
      resolution: 'Registry review upheld the complainant title package after confirming authentic governor-consent reference and survey provenance.',
      resolvedDate: '2024-03-05T13:45:00.000Z',
      slaDays: 14,
      evidence: [
        {
          id: 'DSP-2024-003-E1',
          fileName: 'governor-consent-register-extract.pdf',
          fileType: 'application/pdf',
          uploadedBy: 'Registry Clerk',
          uploadedAt: '2024-02-20T10:00:00.000Z',
          note: 'Certified extract from consent register.',
        },
      ],
      tags: ['title', 'consent', 'registry-review'],
      createdAt: '2024-02-18T08:30:00.000Z',
      updatedAt: '2024-03-05T13:45:00.000Z',
    },
  ];

  const timeline: DisputeTimelineEvent[] = [
    {
      id: 'DSP-2024-001-filed',
      disputeId: 1,
      status: 'pending',
      title: 'Dispute lodged',
      description: 'Boundary dispute registered and intake screening completed.',
      actor: 'Registry Intake Desk',
      createdAt: '2024-04-02T09:15:00.000Z',
    },
    {
      id: 'DSP-2024-001-investigating',
      disputeId: 1,
      status: 'investigating',
      title: 'Field verification ordered',
      description: 'Survey reconciliation and site inspection were requested.',
      actor: 'Registrar Ngozi Eze',
      createdAt: '2024-04-04T12:00:00.000Z',
    },
    {
      id: 'DSP-2024-001-mediation',
      disputeId: 1,
      status: 'mediation',
      title: 'Mediation scheduled',
      description: 'Parties were invited to mediation before escalation to formal hearing.',
      actor: 'Chief Mediator Okonkwo',
      createdAt: '2024-04-12T14:00:00.000Z',
    },
    {
      id: 'DSP-2024-002-filed',
      disputeId: 2,
      status: 'pending',
      title: 'Dispute lodged',
      description: 'Ownership dispute received pending assignment to reviewing officer.',
      actor: 'Registry Intake Desk',
      createdAt: '2024-04-10T11:00:00.000Z',
    },
    {
      id: 'DSP-2024-003-filed',
      disputeId: 3,
      status: 'pending',
      title: 'Dispute lodged',
      description: 'Title dispute accepted for documentary review.',
      actor: 'Registry Intake Desk',
      createdAt: '2024-02-18T08:30:00.000Z',
    },
    {
      id: 'DSP-2024-003-hearing',
      disputeId: 3,
      status: 'hearing',
      title: 'Formal hearing concluded',
      description: 'Panel heard parties and compared consent references against registry records.',
      actor: 'Justice Adeyemi',
      createdAt: '2024-03-05T09:30:00.000Z',
    },
    {
      id: 'DSP-2024-003-resolved',
      disputeId: 3,
      status: 'resolved',
      title: 'Determination issued',
      description: 'Title validity confirmed in favour of the complainant.',
      actor: 'Justice Adeyemi',
      createdAt: '2024-03-05T13:45:00.000Z',
    },
  ];

  return {
    disputes,
    timeline,
    nextId: disputes.length + 1,
  };
}

async function loadStore(): Promise<DisputeStore> {
  return readJsonStore<DisputeStore>('dispute-store', buildSeedStore);
}

async function saveStore(store: DisputeStore) {
  await writeJsonStore('dispute-store', store);
}

function buildCaseNumber(id: number) {
  return `DSP-${new Date().getUTCFullYear()}-${String(id).padStart(3, '0')}`;
}

function appendTimelineEvent(
  store: DisputeStore,
  disputeId: number,
  status: DisputeStatus,
  title: string,
  description: string,
  actor: string,
  createdAt: string = new Date().toISOString(),
) {
  store.timeline.push({
    id: `${disputeId}-${status}-${Date.now()}`,
    disputeId,
    status,
    title,
    description,
    actor,
    createdAt,
  });
}

export async function listDisputes(input: ListDisputesInput = {}) {
  const store = await loadStore();
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const search = input.search?.trim().toLowerCase();

  const filtered = store.disputes.filter((dispute) => {
    if (input.status && input.status !== 'all' && dispute.status !== input.status) return false;
    if (input.type && input.type !== 'all' && dispute.type !== input.type) return false;
    if (input.state && dispute.state.toLowerCase() !== input.state.toLowerCase()) return false;
    if (input.lga && dispute.lga.toLowerCase() !== input.lga.toLowerCase()) return false;
    if (input.assignedOfficer && dispute.assignedOfficer !== input.assignedOfficer) return false;
    if (!search) return true;

    return [
      dispute.caseNumber,
      dispute.parcelNumber,
      dispute.filedBy,
      dispute.respondent,
      dispute.description,
      dispute.type,
      dispute.state,
      dispute.lga,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });

  const sorted = filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const start = (page - 1) * limit;

  return {
    disputes: sorted.slice(start, start + limit),
    total: sorted.length,
    page,
    limit,
  };
}

export async function getDisputeById(id: number) {
  const store = await loadStore();
  const dispute = store.disputes.find((item) => item.id === id) ?? null;
  if (!dispute) return null;

  const timeline = store.timeline
    .filter((event) => event.disputeId === id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return {
    ...dispute,
    timeline,
  };
}

export async function getDisputeStats() {
  const store = await loadStore();
  const total = store.disputes.length;
  const statusCounts = store.disputes.reduce<Record<DisputeStatus, number>>(
    (acc, dispute) => {
      acc[dispute.status] += 1;
      return acc;
    },
    {
      pending: 0,
      investigating: 0,
      mediation: 0,
      hearing: 0,
      resolved: 0,
      dismissed: 0,
    },
  );

  return {
    total,
    pending: statusCounts.pending,
    investigating: statusCounts.investigating,
    mediation: statusCounts.mediation,
    hearing: statusCounts.hearing,
    resolved: statusCounts.resolved,
    dismissed: statusCounts.dismissed,
  };
}

export async function createDispute(input: {
  parcelNumber: string;
  parcelId?: number;
  titleId?: number;
  transactionId?: number;
  type: DisputeType;
  state: string;
  lga: string;
  filedBy: string;
  filedByUserId?: number;
  respondent: string;
  description: string;
  requestedRelief?: string;
  evidence?: Array<{
    fileName: string;
    fileType?: string;
    uploadedBy?: string;
    note?: string;
  }>;
}) {
  const store = await loadStore();
  const id = store.nextId;
  const now = new Date().toISOString();
  const caseNumber = buildCaseNumber(id);

  const dispute: DisputeRecord = {
    id,
    caseNumber,
    parcelId: input.parcelId,
    parcelNumber: input.parcelNumber,
    titleId: input.titleId,
    transactionId: input.transactionId,
    type: input.type,
    status: 'pending',
    state: input.state,
    lga: input.lga,
    filedBy: input.filedBy,
    filedByUserId: input.filedByUserId,
    respondent: input.respondent,
    assignedOfficer: `${input.state} Registry Dispute Desk`,
    mediator: null,
    hearingDate: null,
    filedDate: now,
    description: input.description,
    requestedRelief: input.requestedRelief,
    slaDays: input.type === 'fraud' ? 14 : input.type === 'ownership_dispute' ? 30 : 21,
    evidence: (input.evidence ?? []).map((item, index) => ({
      id: `${caseNumber}-E${index + 1}`,
      fileName: item.fileName,
      fileType: item.fileType ?? 'application/octet-stream',
      uploadedBy: item.uploadedBy ?? input.filedBy,
      uploadedAt: now,
      note: item.note,
    })),
    tags: [input.type, input.state.toLowerCase(), input.lga.toLowerCase()],
    createdAt: now,
    updatedAt: now,
  };

  store.disputes.unshift(dispute);
  store.nextId += 1;
  appendTimelineEvent(store, id, 'pending', 'Dispute lodged', 'Dispute intake completed and queued for registry review.', dispute.assignedOfficer || 'Registry Intake Desk', now);
  await saveStore(store);
  return dispute;
}

export async function addDisputeEvidence(input: {
  disputeId: number;
  fileName: string;
  fileType?: string;
  uploadedBy: string;
  note?: string;
}) {
  const store = await loadStore();
  const dispute = store.disputes.find((item) => item.id === input.disputeId);
  if (!dispute) {
    throw new Error('Dispute not found');
  }

  const evidence: DisputeEvidenceRecord = {
    id: `${dispute.caseNumber}-E${dispute.evidence.length + 1}`,
    fileName: input.fileName,
    fileType: input.fileType ?? 'application/octet-stream',
    uploadedBy: input.uploadedBy,
    uploadedAt: new Date().toISOString(),
    note: input.note,
  };

  dispute.evidence.push(evidence);
  dispute.updatedAt = evidence.uploadedAt;
  appendTimelineEvent(store, dispute.id, dispute.status, 'Additional evidence uploaded', `Evidence file ${input.fileName} was attached to the dispute record.`, input.uploadedBy, evidence.uploadedAt);
  await saveStore(store);
  return dispute;
}

export async function assignMediator(input: {
  disputeId: number;
  mediator: string;
  actor: string;
  hearingDate?: string;
}) {
  const store = await loadStore();
  const dispute = store.disputes.find((item) => item.id === input.disputeId);
  if (!dispute) {
    throw new Error('Dispute not found');
  }

  dispute.mediator = input.mediator;
  dispute.hearingDate = input.hearingDate ?? dispute.hearingDate ?? null;
  dispute.status = 'mediation';
  dispute.updatedAt = new Date().toISOString();
  appendTimelineEvent(
    store,
    dispute.id,
    'mediation',
    'Mediator assigned',
    `${input.mediator} was assigned to facilitate settlement discussions between the parties.`,
    input.actor,
    dispute.updatedAt,
  );
  await saveStore(store);
  return dispute;
}

export async function scheduleDisputeHearing(input: {
  disputeId: number;
  hearingDate: string;
  actor: string;
}) {
  const store = await loadStore();
  const dispute = store.disputes.find((item) => item.id === input.disputeId);
  if (!dispute) {
    throw new Error('Dispute not found');
  }

  if (!dispute.mediator && !dispute.assignedOfficer) {
    throw new Error('Dispute must be assigned before a hearing can be scheduled');
  }

  dispute.hearingDate = input.hearingDate;
  dispute.status = 'hearing';
  dispute.updatedAt = new Date().toISOString();
  appendTimelineEvent(
    store,
    dispute.id,
    'hearing',
    'Hearing scheduled',
    `Formal hearing fixed for ${new Date(input.hearingDate).toLocaleString('en-NG', { timeZone: 'UTC' })}.`,
    input.actor,
    dispute.updatedAt,
  );
  await saveStore(store);
  return dispute;
}

const allowedTransitions: Record<DisputeStatus, DisputeStatus[]> = {
  pending: ['investigating', 'dismissed'],
  investigating: ['mediation', 'hearing', 'dismissed'],
  mediation: ['hearing', 'resolved', 'dismissed'],
  hearing: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export async function transitionDispute(input: {
  disputeId: number;
  nextStatus: DisputeStatus;
  actor: string;
  resolution?: string;
  mediator?: string;
  hearingDate?: string;
}) {
  const store = await loadStore();
  const dispute = store.disputes.find((item) => item.id === input.disputeId);
  if (!dispute) {
    throw new Error('Dispute not found');
  }

  if (!allowedTransitions[dispute.status].includes(input.nextStatus)) {
    throw new Error(`Dispute cannot move from ${dispute.status} to ${input.nextStatus}`);
  }

  if ((input.nextStatus === 'mediation' || input.nextStatus === 'hearing') && !input.mediator && !dispute.mediator) {
    throw new Error('Mediator or responsible officer must be assigned before mediation or hearing');
  }

  if ((input.nextStatus === 'resolved' || input.nextStatus === 'dismissed') && !input.resolution?.trim()) {
    throw new Error('Resolution notes are required to close a dispute');
  }

  if (input.mediator) {
    dispute.mediator = input.mediator;
  }

  if (input.hearingDate) {
    dispute.hearingDate = input.hearingDate;
  }

  dispute.status = input.nextStatus;
  dispute.updatedAt = new Date().toISOString();

  if (input.nextStatus === 'resolved' || input.nextStatus === 'dismissed') {
    dispute.resolution = input.resolution;
    dispute.resolvedDate = dispute.updatedAt;
  }

  appendTimelineEvent(
    store,
    dispute.id,
    input.nextStatus,
    input.nextStatus === 'investigating'
      ? 'Registry investigation opened'
      : input.nextStatus === 'mediation'
        ? 'Matter entered mediation'
        : input.nextStatus === 'hearing'
          ? 'Matter escalated to hearing'
          : input.nextStatus === 'resolved'
            ? 'Dispute resolved'
            : 'Dispute dismissed',
    input.resolution || `Dispute status updated from ${dispute.status} to ${input.nextStatus}.`,
    input.actor,
    dispute.updatedAt,
  );

  await saveStore(store);
  return dispute;
}
