import fs from 'fs';
import path from 'path';

export type ComplianceStatus = 'compliant' | 'needs_attention';
export type ReportStatus = 'not_started' | 'in_progress' | 'completed';

export interface ComplianceRegulationRecord {
  id: number;
  name: string;
  status: ComplianceStatus;
  lastAudit: string;
  nextReview: string;
  score: number;
}

export interface ComplianceReportRecord {
  id: number;
  name: string;
  dueDate: string;
  status: ReportStatus;
  completion: number;
}

export interface ComplianceAuditRecord {
  id: number;
  title: string;
  date: string;
  auditor: string;
  result: string;
  findings: number;
}

export interface CertificationRecord {
  id: number;
  name: string;
  description: string;
  accent: 'blue' | 'green' | 'purple';
  issuedLabel?: string;
  expiresLabel?: string;
  statusLabel?: string;
  reviewLabel?: string;
}

interface ComplianceDashboardStore {
  regulations: ComplianceRegulationRecord[];
  upcomingReports: ComplianceReportRecord[];
  recentAudits: ComplianceAuditRecord[];
  certifications: CertificationRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'compliance-dashboard-store.json');

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function defaultStore(): ComplianceDashboardStore {
  return {
    regulations: [
      { id: 1, name: 'Land Use Act 1978', status: 'compliant', lastAudit: '2026-01-15T00:00:00.000Z', nextReview: '2026-07-15T00:00:00.000Z', score: 98 },
      { id: 2, name: 'GDPR Data Protection', status: 'compliant', lastAudit: '2026-02-01T00:00:00.000Z', nextReview: '2026-08-01T00:00:00.000Z', score: 95 },
      { id: 3, name: 'Anti-Money Laundering (AML)', status: 'needs_attention', lastAudit: '2026-01-20T00:00:00.000Z', nextReview: '2026-04-20T00:00:00.000Z', score: 85 },
      { id: 4, name: 'ISO 27001 Information Security', status: 'compliant', lastAudit: '2025-12-10T00:00:00.000Z', nextReview: '2026-06-10T00:00:00.000Z', score: 91 },
    ],
    upcomingReports: [
      { id: 1, name: 'Quarterly Transaction Report', dueDate: '2026-06-30T00:00:00.000Z', status: 'in_progress', completion: 65 },
      { id: 2, name: 'Annual Compliance Audit', dueDate: '2026-07-15T00:00:00.000Z', status: 'not_started', completion: 0 },
      { id: 3, name: 'Data Protection Impact Assessment', dueDate: '2026-06-20T00:00:00.000Z', status: 'in_progress', completion: 40 },
    ],
    recentAudits: [
      { id: 1, title: 'Q1 2026 Compliance Audit', date: '2026-01-15T00:00:00.000Z', auditor: 'PwC Nigeria', result: 'Pass', findings: 3 },
      { id: 2, title: 'Security Assessment', date: '2025-12-10T00:00:00.000Z', auditor: 'Deloitte', result: 'Pass with Recommendations', findings: 7 },
      { id: 3, title: 'AML Compliance Review', date: '2025-11-20T00:00:00.000Z', auditor: 'KPMG', result: 'Pass', findings: 2 },
    ],
    certifications: [
      { id: 1, name: 'ISO 27001', description: 'Information Security', accent: 'blue', issuedLabel: 'Jan 2023', expiresLabel: 'Jan 2026' },
      { id: 2, name: 'SOC 2 Type II', description: 'Security & Privacy', accent: 'green', issuedLabel: 'Mar 2023', expiresLabel: 'Mar 2026' },
      { id: 3, name: 'GDPR', description: 'Data Protection', accent: 'purple', statusLabel: 'Compliant', reviewLabel: 'Feb 2026' },
    ],
  };
}

function loadStore(): ComplianceDashboardStore {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const seeded = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as ComplianceDashboardStore;
  } catch {
    const seeded = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

export function getComplianceDashboardState() {
  const store = loadStore();
  const totalScore = store.regulations.reduce((sum, item) => sum + item.score, 0);
  const complianceScore = store.regulations.length > 0 ? Math.round(totalScore / store.regulations.length) : 0;
  return {
    complianceScore,
    regulations: store.regulations,
    upcomingReports: store.upcomingReports,
    recentAudits: store.recentAudits,
    certifications: store.certifications,
  };
}
