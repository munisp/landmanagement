/**
 * Phase 4 Service: Database operations for advanced integration systems
 * Handles mortgage, tax, insurance, legal, survey, environmental, public notice, and land use systems
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { requireDb } from './db';
import {
  mortgageApplications,
  taxClearances,
  insurancePolicies,
  legalDocuments,
  cadastralSurveys,
  environmentalAssessments,
  publicNotices,
  landUsePlans,
  type InsertMortgageApplication,
  type InsertTaxClearance,
  type InsertInsurancePolicy,
  type InsertLegalDocument,
  type InsertCadastralSurvey,
  type InsertEnvironmentalAssessment,
  type InsertPublicNotice,
  type InsertLandUsePlan,
} from '../drizzle/schema';

/**
 * ========================================
 * MORTGAGE APPLICATIONS
 * ========================================
 */


/**
 * Insert a row with a unique placeholder code, then derive the final public
 * code from the row identity inside the same transaction. Codes are unique
 * across instances and restarts — unlike the Date.now()+random suffixes the
 * routers previously generated (collision-prone, non-sequential).
 */
async function insertWithDerivedCode<T>(params: {
  table: any;
  codeKey: string;
  prefix: string;
  values: Record<string, unknown>;
}): Promise<T> {
  const db = await requireDb();
  const year = new Date().getUTCFullYear();
  return db.transaction(async (tx) => {
    const tempCode = `${params.prefix}-PENDING-${randomUUID()}`;
    const [inserted] = await tx
      .insert(params.table)
      .values({ ...params.values, [params.codeKey]: tempCode } as any)
      .returning();
    const finalCode = `${params.prefix}-${year}-${String((inserted as any).id).padStart(6, '0')}`;
    const [updated] = await tx
      .update(params.table)
      .set({ [params.codeKey]: finalCode } as any)
      .where(eq(params.table.id, (inserted as any).id))
      .returning();
    return updated as T;
  });
}

export async function createMortgageApplication(data: Omit<InsertMortgageApplication, 'applicationId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { applicationId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: mortgageApplications,
    codeKey: 'applicationId',
    prefix: 'MORT',
    values,
  });
}

export async function getMortgageApplicationById(applicationId: string) {

    const db = await requireDb();


    const [application] = await db
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.applicationId, applicationId))
      .limit(1);

    return application;
  
}

export async function getMortgageApplicationsByTransaction(transactionId: string) {
  const db = await requireDb();

  const applications = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.transactionId, transactionId))
    .orderBy(desc(mortgageApplications.createdAt));

  return applications;
}

export async function getMortgageApplicationsByApplicant(applicantId: number) {

    const db = await requireDb();


    const applications = await db
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.applicantId, applicantId))
      .orderBy(desc(mortgageApplications.createdAt));

    return applications;
  
}

export async function updateMortgageApplicationStatus(
  applicationId: string,
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'disbursed' | 'cancelled',
  additionalData?: { rejectionReason?: string; actorId?: number }
) {

    const db = await requireDb();


    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

  if (status === 'under_review') {
    updateData.reviewedAt = new Date();
  } else if (status === 'approved') {
    updateData.approvedAt = new Date();
  } else if (status === 'rejected') {
    updateData.rejectedAt = new Date();
    updateData.rejectionReason = additionalData?.rejectionReason;
  } else if (status === 'disbursed') {
    updateData.disbursedAt = new Date();
  }

    const [updated] = await db
      .update(mortgageApplications)
      .set(updateData)
      .where(eq(mortgageApplications.applicationId, applicationId))
      .returning();

    return updated;
  
}

/**
 * ========================================
 * TAX CLEARANCES
 * ========================================
 */

export async function createTaxClearance(data: Omit<InsertTaxClearance, 'clearanceId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { clearanceId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: taxClearances,
    codeKey: 'clearanceId',
    prefix: 'TCC',
    values,
  });
}

export async function getTaxClearanceById(clearanceId: string) {
  const db = await requireDb();


  const [clearance] = await db
    .select()
    .from(taxClearances)
    .where(eq(taxClearances.clearanceId, clearanceId))
    .limit(1);

  return clearance;
}

export async function getTaxClearancesByTransaction(transactionId: string) {
  const db = await requireDb();

  const clearances = await db
    .select()
    .from(taxClearances)
    .where(eq(taxClearances.transactionId, transactionId))
    .orderBy(desc(taxClearances.createdAt));

  return clearances;
}

export async function getTaxClearancesByOwner(ownerId: number) {
  const db = await requireDb();


  const clearances = await db
    .select()
    .from(taxClearances)
    .where(eq(taxClearances.ownerId, ownerId))
    .orderBy(desc(taxClearances.createdAt));

  return clearances;
}

export async function updateTaxClearanceStatus(
  clearanceId: string,
  status: 'pending' | 'in_progress' | 'verified' | 'issued' | 'rejected' | 'expired',
  additionalData?: { certificateUrl?: string; firsReferenceNumber?: string }
) {
  const db = await requireDb();


  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'verified') {
    updateData.verifiedAt = new Date();
    updateData.firsVerificationDate = new Date();
    if (additionalData?.firsReferenceNumber) {
      updateData.firsReferenceNumber = additionalData.firsReferenceNumber;
    }
  } else if (status === 'issued') {
    updateData.issuedAt = new Date();
    updateData.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    if (additionalData?.certificateUrl) {
      updateData.certificateUrl = additionalData.certificateUrl;
    }
  }

  const [updated] = await db
    .update(taxClearances)
    .set(updateData)
    .where(eq(taxClearances.clearanceId, clearanceId))
    .returning();

  return updated;
}

/**
 * ========================================
 * INSURANCE POLICIES
 * ========================================
 */

export async function createInsurancePolicy(data: Omit<InsertInsurancePolicy, 'policyId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { policyId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: insurancePolicies,
    codeKey: 'policyId',
    prefix: 'INS',
    values,
  });
}

export async function getInsurancePolicyById(policyId: string) {
  const db = await requireDb();


  const [policy] = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.policyId, policyId))
    .limit(1);

  return policy;
}

export async function getInsurancePoliciesByTransaction(transactionId: string) {
  const db = await requireDb();

  const policies = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.transactionId, transactionId))
    .orderBy(desc(insurancePolicies.createdAt));

  return policies;
}

export async function getInsurancePoliciesByParcel(parcelId: number) {
  const db = await requireDb();


  const policies = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.parcelId, parcelId))
    .orderBy(desc(insurancePolicies.createdAt));

  return policies;
}

export async function updateInsurancePolicyStatus(
  policyId: string,
  status: 'pending' | 'active' | 'expired' | 'cancelled' | 'suspended'
) {
  const db = await requireDb();


  const [updated] = await db
    .update(insurancePolicies)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(insurancePolicies.policyId, policyId))
    .returning();

  return updated;
}

/**
 * ========================================
 * LEGAL DOCUMENTS
 * ========================================
 */

export async function createLegalDocument(data: Omit<InsertLegalDocument, 'documentId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { documentId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: legalDocuments,
    codeKey: 'documentId',
    prefix: 'LEGAL',
    values,
  });
}

export async function getLegalDocumentById(documentId: string) {
  const db = await requireDb();

  const [document] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.documentId, documentId))
    .limit(1);

  return document;
}

export async function getLegalDocumentsByTransaction(transactionId: string) {
  const db = await requireDb();

  const documents = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.transactionId, transactionId))
    .orderBy(desc(legalDocuments.createdAt));

  return documents;
}

export async function updateLegalDocumentStatus(
  documentId: string,
  status: 'draft' | 'pending_review' | 'approved' | 'signed' | 'registered' | 'rejected',
  additionalData?: { registrationNumber?: string }
) {
  const db = await requireDb();

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'pending_review') {
    updateData.reviewedAt = new Date();
  } else if (status === 'approved') {
    updateData.approvedAt = new Date();
  } else if (status === 'signed') {
    updateData.signedAt = new Date();
  } else if (status === 'registered') {
    updateData.registeredAt = new Date();
    if (additionalData?.registrationNumber) {
      updateData.registrationNumber = additionalData.registrationNumber;
    }
  }

  const [updated] = await db
    .update(legalDocuments)
    .set(updateData)
    .where(eq(legalDocuments.documentId, documentId))
    .returning();

  return updated;
}

/**
 * ========================================
 * CADASTRAL SURVEYS
 * ========================================
 */

export async function createCadastralSurvey(data: Omit<InsertCadastralSurvey, 'surveyId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { surveyId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: cadastralSurveys,
    codeKey: 'surveyId',
    prefix: 'SURVEY',
    values,
  });
}

export async function getCadastralSurveyById(surveyId: string) {
  const db = await requireDb();

  const [survey] = await db
    .select()
    .from(cadastralSurveys)
    .where(eq(cadastralSurveys.surveyId, surveyId))
    .limit(1);

  return survey;
}

export async function getCadastralSurveysByTransaction(transactionId: string) {
  const db = await requireDb();

  const surveys = await db
    .select()
    .from(cadastralSurveys)
    .where(eq(cadastralSurveys.transactionId, transactionId))
    .orderBy(desc(cadastralSurveys.createdAt));

  return surveys;
}

export async function updateCadastralSurveyStatus(
  surveyId: string,
  status: 'pending' | 'in_progress' | 'completed' | 'approved' | 'rejected' | 'expired',
  additionalData?: { approvedBy?: string; rejectionReason?: string }
) {
  const db = await requireDb();

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'approved') {
    updateData.approvedAt = new Date();
    updateData.expiresAt = new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000); // 5 years
    if (additionalData?.approvedBy) {
      updateData.approvedBy = additionalData.approvedBy;
    }
  } else if (status === 'rejected') {
    updateData.rejectedAt = new Date();
    if (additionalData?.rejectionReason) {
      updateData.rejectionReason = additionalData.rejectionReason;
    }
  }

  const [updated] = await db
    .update(cadastralSurveys)
    .set(updateData)
    .where(eq(cadastralSurveys.surveyId, surveyId))
    .returning();

  return updated;
}

/**
 * ========================================
 * ENVIRONMENTAL ASSESSMENTS
 * ========================================
 */

export async function createEnvironmentalAssessment(data: Omit<InsertEnvironmentalAssessment, 'assessmentId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { assessmentId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: environmentalAssessments,
    codeKey: 'assessmentId',
    prefix: 'ENV',
    values,
  });
}

export async function getEnvironmentalAssessmentById(assessmentId: string) {
  const db = await requireDb();

  const [assessment] = await db
    .select()
    .from(environmentalAssessments)
    .where(eq(environmentalAssessments.assessmentId, assessmentId))
    .limit(1);

  return assessment;
}

export async function getEnvironmentalAssessmentsByTransaction(transactionId: string) {
  const db = await requireDb();

  const assessments = await db
    .select()
    .from(environmentalAssessments)
    .where(eq(environmentalAssessments.transactionId, transactionId))
    .orderBy(desc(environmentalAssessments.createdAt));

  return assessments;
}

export async function updateEnvironmentalAssessmentStatus(
  assessmentId: string,
  status: 'pending' | 'under_review' | 'approved' | 'conditional_approval' | 'rejected' | 'expired',
  additionalData?: { conditions?: string; rejectionReason?: string; certificateUrl?: string }
) {
  const db = await requireDb();

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'under_review') {
    updateData.reviewedAt = new Date();
  } else if (status === 'approved' || status === 'conditional_approval') {
    updateData.approvedAt = new Date();
    updateData.expiresAt = new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000); // 3 years
    if (status === 'conditional_approval' && additionalData?.conditions) {
      updateData.conditions = additionalData.conditions;
    }
    if (additionalData?.certificateUrl) {
      updateData.certificateUrl = additionalData.certificateUrl;
    }
  } else if (status === 'rejected') {
    updateData.rejectedAt = new Date();
    if (additionalData?.rejectionReason) {
      updateData.rejectionReason = additionalData.rejectionReason;
    }
  }

  const [updated] = await db
    .update(environmentalAssessments)
    .set(updateData)
    .where(eq(environmentalAssessments.assessmentId, assessmentId))
    .returning();

  return updated;
}

/**
 * ========================================
 * PUBLIC NOTICES
 * ========================================
 */

export async function createPublicNotice(data: Omit<InsertPublicNotice, 'noticeId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { noticeId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: publicNotices,
    codeKey: 'noticeId',
    prefix: 'NOTICE',
    values,
  });
}

export async function getPublicNoticeById(noticeId: string) {
  const db = await requireDb();

  const [notice] = await db
    .select()
    .from(publicNotices)
    .where(eq(publicNotices.noticeId, noticeId))
    .limit(1);

  return notice;
}

export async function getPublicNoticesByTransaction(transactionId: string) {
  const db = await requireDb();

  const notices = await db
    .select()
    .from(publicNotices)
    .where(eq(publicNotices.transactionId, transactionId))
    .orderBy(desc(publicNotices.createdAt));

  return notices;
}

export async function updatePublicNoticeStatus(
  noticeId: string,
  status: 'pending' | 'published' | 'objection_filed' | 'objection_resolved' | 'completed' | 'cancelled'
) {
  const db = await requireDb();

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'published') {
    updateData.publishedAt = new Date();
  } else if (status === 'completed') {
    updateData.completedAt = new Date();
  }

  const [updated] = await db
    .update(publicNotices)
    .set(updateData)
    .where(eq(publicNotices.noticeId, noticeId))
    .returning();

  return updated;
}

export async function addPublicNoticeObjection(
  noticeId: string,
  objection: {
    objectorName: string;
    objectorContact: string;
    objectionDetails: string;
    filedAt: Date;
  }
) {
  const db = await requireDb();

  const notice = await getPublicNoticeById(noticeId);
  if (!notice) throw new Error('Public notice not found');

  const objections = (notice.objections as any[]) || [];
  objections.push(objection);

  const [updated] = await db
    .update(publicNotices)
    .set({
      hasObjections: true,
      objectionsCount: objections.length,
      objections,
      status: 'objection_filed',
      updatedAt: new Date(),
    })
    .where(eq(publicNotices.noticeId, noticeId))
    .returning();

  return updated;
}

/**
 * ========================================
 * LAND USE PLANS
 * ========================================
 */

export async function createLandUsePlan(data: Omit<InsertLandUsePlan, 'planId'>) {
  // Ignore any caller-supplied code; the final public code is
  // derived from the row identity (unique across instances).
  const { planId: _ignored, ...values } = data as any;
  return insertWithDerivedCode<any>({
    table: landUsePlans,
    codeKey: 'planId',
    prefix: 'LANDUSE',
    values,
  });
}

export async function getLandUsePlanById(planId: string) {
  const db = await requireDb();

  const [plan] = await db
    .select()
    .from(landUsePlans)
    .where(eq(landUsePlans.planId, planId))
    .limit(1);

  return plan;
}

export async function getLandUsePlansByTransaction(transactionId: string) {
  const db = await requireDb();

  const plans = await db
    .select()
    .from(landUsePlans)
    .where(eq(landUsePlans.transactionId, transactionId))
    .orderBy(desc(landUsePlans.createdAt));

  return plans;
}

export async function updateLandUsePlanStatus(
  planId: string,
  status: 'pending' | 'under_review' | 'approved' | 'conditional_approval' | 'rejected' | 'expired',
  additionalData?: { conditions?: string; rejectionReason?: string; isCompliant?: boolean }
) {
  const db = await requireDb();

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'under_review') {
    updateData.reviewedAt = new Date();
  } else if (status === 'approved' || status === 'conditional_approval') {
    updateData.approvedAt = new Date();
    updateData.expiresAt = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000); // 2 years
    if (status === 'conditional_approval' && additionalData?.conditions) {
      updateData.conditions = additionalData.conditions;
    }
    if (additionalData?.isCompliant !== undefined) {
      updateData.isCompliant = additionalData.isCompliant;
    }
  } else if (status === 'rejected') {
    updateData.rejectedAt = new Date();
    if (additionalData?.rejectionReason) {
      updateData.rejectionReason = additionalData.rejectionReason;
    }
  }

  const [updated] = await db
    .update(landUsePlans)
    .set(updateData)
    .where(eq(landUsePlans.planId, planId))
    .returning();

  return updated;
}

/**
 * ========================================
 * UNIFIED SYSTEM STATUS
 * ========================================
 */

/**
 * Get all Phase 4 system statuses for a transaction
 */
export async function getTransactionPhase4Status(transactionId: string) {
  const db = await requireDb();


  const [
    mortgageApps,
    taxClearanceRecords,
    insurancePolicyRecords,
    legalDocs,
    surveys,
    envAssessments,
    notices,
    landUsePlanRecords,
  ] = await Promise.all([
    getMortgageApplicationsByTransaction(transactionId),
    getTaxClearancesByTransaction(transactionId),
    getInsurancePoliciesByTransaction(transactionId),
    getLegalDocumentsByTransaction(transactionId),
    getCadastralSurveysByTransaction(transactionId),
    getEnvironmentalAssessmentsByTransaction(transactionId),
    getPublicNoticesByTransaction(transactionId),
    getLandUsePlansByTransaction(transactionId),
  ]);

  return {
    mortgage: mortgageApps[0] || null,
    tax: taxClearanceRecords[0] || null,
    insurance: insurancePolicyRecords[0] || null,
    legal: legalDocs[0] || null,
    survey: surveys[0] || null,
    environmental: envAssessments[0] || null,
    publicNotice: notices[0] || null,
    landUse: landUsePlanRecords[0] || null,
  };
}
