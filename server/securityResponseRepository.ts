import { readJsonStore, writeJsonStore } from './jsonStore';

export type BehavioralRiskLevel = 'low' | 'medium' | 'high';
export type HoneypotSeverity = 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved';

export interface BehavioralSignalRecord {
  id: number;
  userId: number;
  userLabel: string;
  signalType: 'velocity' | 'device_shift' | 'location_jump' | 'after_hours_access';
  riskLevel: BehavioralRiskLevel;
  score: number;
  description: string;
  createdAt: string;
}

export interface HoneypotEventRecord {
  id: number;
  sourceIp: string;
  endpoint: string;
  payloadSnippet: string;
  severity: HoneypotSeverity;
  detectedAt: string;
  disposition: 'observed' | 'blocked' | 'escalated';
}

export interface IncidentRecord {
  id: number;
  title: string;
  severity: 'medium' | 'high' | 'critical';
  status: IncidentStatus;
  source: 'behavioral_analytics' | 'honeypot' | 'manual' | 'threat_intelligence';
  owner: string;
  runbook: string;
  createdAt: string;
  updatedAt: string;
  automationSteps: string[];
  linkedEntity: string;
}

interface SecurityResponseStore {
  nextBehavioralSignalId: number;
  nextHoneypotEventId: number;
  nextIncidentId: number;
  behavioralSignals: BehavioralSignalRecord[];
  honeypotEvents: HoneypotEventRecord[];
  incidents: IncidentRecord[];
}


function defaultStore(): SecurityResponseStore {
  return {
    nextBehavioralSignalId: 5,
    nextHoneypotEventId: 4,
    nextIncidentId: 4,
    behavioralSignals: [
      {
        id: 1,
        userId: 18,
        userLabel: 'Loan Officer #18',
        signalType: 'velocity',
        riskLevel: 'high',
        score: 87,
        description: 'Five high-value mortgage approvals initiated within 14 minutes from a new device fingerprint.',
        createdAt: '2026-07-17T12:05:00.000Z',
      },
      {
        id: 2,
        userId: 22,
        userLabel: 'Registry Clerk #22',
        signalType: 'after_hours_access',
        riskLevel: 'medium',
        score: 61,
        description: 'Title modification workflow initiated during an unusual access window outside normal office hours.',
        createdAt: '2026-07-17T12:40:00.000Z',
      },
      {
        id: 3,
        userId: 31,
        userLabel: 'Broker #31',
        signalType: 'location_jump',
        riskLevel: 'high',
        score: 91,
        description: 'Marketplace access switched between distant geographies within 20 minutes while updating the same listing.',
        createdAt: '2026-07-17T13:10:00.000Z',
      },
      {
        id: 4,
        userId: 7,
        userLabel: 'Compliance Officer #7',
        signalType: 'device_shift',
        riskLevel: 'low',
        score: 34,
        description: 'Known compliance user authenticated from a newly registered workstation with MFA continuity maintained.',
        createdAt: '2026-07-17T14:15:00.000Z',
      },
    ],
    honeypotEvents: [
      {
        id: 1,
        sourceIp: '185.23.44.9',
        endpoint: '/admin/.env',
        payloadSnippet: 'GET /admin/.env HTTP/1.1',
        severity: 'high',
        detectedAt: '2026-07-17T11:50:00.000Z',
        disposition: 'blocked',
      },
      {
        id: 2,
        sourceIp: '41.77.12.20',
        endpoint: '/debug/sql-console',
        payloadSnippet: 'SELECT * FROM users--',
        severity: 'critical',
        detectedAt: '2026-07-17T12:18:00.000Z',
        disposition: 'escalated',
      },
      {
        id: 3,
        sourceIp: '102.11.5.77',
        endpoint: '/backup/private-keys.zip',
        payloadSnippet: 'wget /backup/private-keys.zip',
        severity: 'medium',
        detectedAt: '2026-07-17T13:02:00.000Z',
        disposition: 'observed',
      },
    ],
    incidents: [
      {
        id: 1,
        title: 'Suspicious mortgage approval velocity spike',
        severity: 'high',
        status: 'investigating',
        source: 'behavioral_analytics',
        owner: 'Fraud Response Desk',
        runbook: 'Freeze affected approval session, review device fingerprint, confirm second-factor continuity, and notify loan-operations leadership.',
        createdAt: '2026-07-17T12:08:00.000Z',
        updatedAt: '2026-07-17T12:25:00.000Z',
        automationSteps: ['Session risk elevated', 'Approvals queued for manual review', 'Owner notified in security dashboard'],
        linkedEntity: 'user:18',
      },
      {
        id: 2,
        title: 'Honeypot access to debug SQL console',
        severity: 'critical',
        status: 'contained',
        source: 'honeypot',
        owner: 'Platform Security',
        runbook: 'Block source IP, preserve request evidence, inspect parallel WAF hits, and notify incident commander.',
        createdAt: '2026-07-17T12:18:00.000Z',
        updatedAt: '2026-07-17T12:24:00.000Z',
        automationSteps: ['Source IP added to block list', 'Critical event logged', 'Incident ticket generated'],
        linkedEntity: 'ip:41.77.12.20',
      },
      {
        id: 3,
        title: 'Threat-intelligence watchlist match on hostile IP range',
        severity: 'medium',
        status: 'open',
        source: 'threat_intelligence',
        owner: 'Security Operations',
        runbook: 'Correlate watchlist against security events, inspect attempted endpoints, and determine whether containment should escalate.',
        createdAt: '2026-07-17T13:30:00.000Z',
        updatedAt: '2026-07-17T13:30:00.000Z',
        automationSteps: ['Watchlist correlation completed', 'Analyst queue updated'],
        linkedEntity: 'range:185.23.44.0/24',
      },
    ],
  };
}

async function loadStore(): Promise<SecurityResponseStore> {
  return readJsonStore<SecurityResponseStore>('security-response-store', defaultStore);
}

async function saveStore(store: SecurityResponseStore) {
  await writeJsonStore('security-response-store', store);
}

export async function getSecurityResponseOverview() {
  const store = await loadStore();
  return {
    behavioralSignals: store.behavioralSignals.slice().sort((a, b) => b.score - a.score),
    honeypotEvents: store.honeypotEvents.slice().sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()),
    incidents: store.incidents.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    metrics: {
      highRiskSignals: store.behavioralSignals.filter((item) => item.riskLevel === 'high').length,
      honeypotHits: store.honeypotEvents.length,
      openIncidents: store.incidents.filter((item) => item.status !== 'resolved').length,
      containedIncidents: store.incidents.filter((item) => item.status === 'contained' || item.status === 'resolved').length,
    },
  };
}

export async function createIncidentFromHoneypot(eventId: number) {
  const store = await loadStore();
  const event = store.honeypotEvents.find((item) => item.id === eventId);
  if (!event) {
    throw new Error('Honeypot event not found');
  }

  const now = new Date().toISOString();
  const incident: IncidentRecord = {
    id: store.nextIncidentId++,
    title: `Automated honeypot escalation for ${event.endpoint}`,
    severity: event.severity === 'critical' ? 'critical' : 'high',
    status: 'open',
    source: 'honeypot',
    owner: 'Security Operations',
    runbook: 'Review the payload, correlate with WAF and blocked-IP telemetry, and decide whether to expand containment.',
    createdAt: now,
    updatedAt: now,
    automationSteps: ['Honeypot event ingested', 'Security incident created', 'Operations queue notified'],
    linkedEntity: `ip:${event.sourceIp}`,
  };

  event.disposition = 'escalated';
  store.incidents.unshift(incident);
  await saveStore(store);
  return incident;
}

export async function updateIncidentStatus(input: { incidentId: number; status: IncidentStatus }) {
  const store = await loadStore();
  const incident = store.incidents.find((item) => item.id === input.incidentId);
  if (!incident) {
    throw new Error('Incident not found');
  }
  incident.status = input.status;
  incident.updatedAt = new Date().toISOString();
  if (input.status === 'contained') {
    incident.automationSteps.unshift('Containment confirmed by operator');
  }
  if (input.status === 'resolved') {
    incident.automationSteps.unshift('Incident resolution logged and queue closed');
  }
  await saveStore(store);
  return incident;
}

export async function createBehavioralSignal(input: {
  userId: number;
  userLabel: string;
  signalType: BehavioralSignalRecord['signalType'];
  riskLevel: BehavioralRiskLevel;
  score: number;
  description: string;
}) {
  const store = await loadStore();
  const signal: BehavioralSignalRecord = {
    id: store.nextBehavioralSignalId++,
    ...input,
    createdAt: new Date().toISOString(),
  };
  store.behavioralSignals.unshift(signal);
  await saveStore(store);
  return signal;
}

export async function registerHoneypotEvent(input: {
  sourceIp: string;
  endpoint: string;
  payloadSnippet: string;
  severity: HoneypotSeverity;
}) {
  const store = await loadStore();
  const event: HoneypotEventRecord = {
    id: store.nextHoneypotEventId++,
    sourceIp: input.sourceIp,
    endpoint: input.endpoint,
    payloadSnippet: input.payloadSnippet,
    severity: input.severity,
    detectedAt: new Date().toISOString(),
    disposition: 'observed',
  };
  store.honeypotEvents.unshift(event);
  await saveStore(store);
  return event;
}
