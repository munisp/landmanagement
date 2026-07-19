import { getDocumentsByParcel } from './documentRepository';
import { listDisputes } from './disputeRepository';
import { getParcelById } from './parcelRepository';
import { assessTitleRisk } from './titleRiskService';
import { getTitleById } from './titleRepository';
import { listTransactions } from './transactionRepository';

export interface TitleIntelligenceTimelineEvent {
  id: string;
  date: string;
  category: 'title' | 'document' | 'transaction' | 'dispute' | 'risk';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface TitleIntelligenceDossier {
  title: Awaited<ReturnType<typeof getTitleById>>;
  parcel: Awaited<ReturnType<typeof getParcelById>>;
  titleRisk: Awaited<ReturnType<typeof assessTitleRisk>>;
  documents: Awaited<ReturnType<typeof getDocumentsByParcel>>;
  disputes: Awaited<ReturnType<typeof listDisputes>>['disputes'];
  transactions: Awaited<ReturnType<typeof listTransactions>>['transactions'];
  scorecard: {
    chainOfTitleClarity: number;
    documentCompleteness: number;
    encumbranceExposure: number;
    disputeExposure: number;
    workflowReadiness: number;
  };
  operationalSummary: {
    openDisputeCount: number;
    activeTransactionCount: number;
    activeEncumbranceCount: number;
    verifiedDocumentCount: number;
    unverifiedDocumentCount: number;
    titleVerified: boolean;
    registrationReadiness: 'ready' | 'review' | 'blocked';
  };
  recommendations: string[];
  timeline: TitleIntelligenceTimelineEvent[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pushUnique(list: string[], value: string | undefined | null) {
  if (!value) return;
  if (!list.includes(value)) list.push(value);
}

export async function getTitleIntelligenceDossier(titleId: number): Promise<TitleIntelligenceDossier> {
  const title = await getTitleById(titleId);
  if (!title) {
    throw new Error('Title not found');
  }

  const parcel = await getParcelById(title.parcelId);
  const [documents, allDisputes, allTransactions, titleRisk] = await Promise.all([
    getDocumentsByParcel(title.parcelId),
    listDisputes({ limit: 1000 }),
    listTransactions({ limit: 1000 }),
    assessTitleRisk({ parcelId: title.parcelId }),
  ]);

  const disputes = allDisputes.disputes.filter((dispute) => dispute.titleId === title.id || dispute.parcelId === title.parcelId);
  const transactions = allTransactions.transactions.filter((transaction) => transaction.parcelId === title.parcelId);

  const openDisputes = disputes.filter((dispute) => !['resolved', 'dismissed'].includes(String(dispute.status)));
  const activeTransactions = transactions.filter((transaction) => !['completed', 'rejected'].includes(String(transaction.status)));
  const activeEncumbrances = transactions.filter((transaction) => String(transaction.type) === 'mortgage' && !['completed', 'rejected'].includes(String(transaction.status)));
  const verifiedDocuments = documents.filter((document) => document.verified);
  const unverifiedDocuments = documents.filter((document) => !document.verified);

  const scorecard = {
    chainOfTitleClarity: clampScore(100 - openDisputes.length * 25 - activeEncumbrances.length * 20 - (title.status === 'encumbered' ? 15 : 0)),
    documentCompleteness: documents.length === 0 ? 20 : clampScore((verifiedDocuments.length / documents.length) * 100),
    encumbranceExposure: clampScore(100 - activeEncumbrances.length * 35),
    disputeExposure: clampScore(100 - openDisputes.length * 30),
    workflowReadiness: clampScore(
      (title.status === 'verified' || title.status === 'registered' ? 45 : 20) +
      (documents.length > 0 ? 20 : 0) +
      (unverifiedDocuments.length === 0 ? 15 : 0) +
      (openDisputes.length === 0 ? 10 : 0) +
      (titleRisk.riskBand === 'low' ? 10 : titleRisk.riskBand === 'medium' ? 5 : 0)
    ),
  };

  const registrationReadiness: TitleIntelligenceDossier['operationalSummary']['registrationReadiness'] =
    openDisputes.length > 0 || titleRisk.riskBand === 'critical'
      ? 'blocked'
      : unverifiedDocuments.length > 0 || title.status === 'pending_verification' || titleRisk.riskBand === 'high'
        ? 'review'
        : 'ready';

  const recommendations: string[] = [];
  titleRisk.recommendations.forEach((item) => pushUnique(recommendations, item));
  if (documents.length === 0) pushUnique(recommendations, 'Upload foundational title documents to establish a complete digital record.');
  if (unverifiedDocuments.length > 0) pushUnique(recommendations, 'Verify outstanding documents to improve record confidence and public trust.');
  if (openDisputes.length > 0) pushUnique(recommendations, 'Resolve open disputes before approving downstream transfers, charges, or perfection steps.');
  if (activeTransactions.length > 0) pushUnique(recommendations, 'Monitor active transactions and confirm that all workflow stages remain synchronized.');
  if (activeEncumbrances.length > 0) pushUnique(recommendations, 'Surface lender consent or discharge evidence before clearing this title for transfer.');
  if (registrationReadiness === 'ready') pushUnique(recommendations, 'This title dossier is currently well-positioned for public-service self-serve review and downstream processing.');

  const timeline: TitleIntelligenceTimelineEvent[] = [];
  timeline.push({
    id: `title-created-${title.id}`,
    date: title.createdAt,
    category: 'title',
    title: 'Title record created',
    description: `${title.titleNumber} was created with ${title.ownershipType} ownership structure.`,
    severity: 'info',
  });

  if (title.verifiedAt) {
    timeline.push({
      id: `title-verified-${title.id}`,
      date: title.verifiedAt,
      category: 'title',
      title: 'Title verified',
      description: `Registry verification completed for ${title.titleNumber}.`,
      severity: 'info',
    });
  }

  documents.forEach((document) => {
    timeline.push({
      id: `document-${document.id}`,
      date: document.uploadedAt,
      category: 'document',
      title: document.verified ? 'Verified document on record' : 'Unverified document uploaded',
      description: `${document.title} (${document.type.replace(/_/g, ' ')}) ${document.verified ? 'has been verified' : 'is awaiting verification'}.`,
      severity: document.verified ? 'info' : 'warning',
    });
  });

  transactions.forEach((transaction) => {
    timeline.push({
      id: `transaction-${transaction.id}`,
      date: transaction.createdAt,
      category: 'transaction',
      title: `${transaction.type} transaction ${transaction.status.replace(/_/g, ' ')}`,
      description: `Transaction #${transaction.id} is in workflow stage ${transaction.workflowStage}.`,
      severity: ['rejected'].includes(transaction.status) ? 'warning' : 'info',
    });
  });

  disputes.forEach((dispute) => {
    timeline.push({
      id: `dispute-${dispute.id}`,
      date: dispute.filedDate,
      category: 'dispute',
      title: `${dispute.type.replace(/_/g, ' ')} filed`,
      description: `${dispute.caseNumber} is currently ${dispute.status.replace(/_/g, ' ')}.`,
      severity: ['resolved', 'dismissed'].includes(dispute.status) ? 'info' : 'critical',
    });
  });

  timeline.push({
    id: `risk-${title.id}`,
    date: titleRisk.assessedAt,
    category: 'risk',
    title: `Title risk assessed as ${titleRisk.riskBand}`,
    description: titleRisk.drivers[0] || `Overall title risk score is ${titleRisk.overallScore}.`,
    severity: titleRisk.riskBand === 'critical' ? 'critical' : titleRisk.riskBand === 'high' ? 'warning' : 'info',
  });

  timeline.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());

  return {
    title,
    parcel,
    titleRisk,
    documents,
    disputes,
    transactions,
    scorecard,
    operationalSummary: {
      openDisputeCount: openDisputes.length,
      activeTransactionCount: activeTransactions.length,
      activeEncumbranceCount: activeEncumbrances.length,
      verifiedDocumentCount: verifiedDocuments.length,
      unverifiedDocumentCount: unverifiedDocuments.length,
      titleVerified: Boolean(title.verifiedAt) || ['verified', 'registered', 'encumbered'].includes(title.status),
      registrationReadiness,
    },
    recommendations,
    timeline,
  };
}
