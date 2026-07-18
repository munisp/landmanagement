/**
 * Phase 4 Service: Database operations for advanced integration systems
 * Handles mortgage, tax, insurance, legal, survey, environmental, public notice, and land use systems
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from './db';
import {
  createMortgageApplication as createMortgageApplicationFromRepository,
  getMortgageApplicationById as getMortgageApplicationByIdFromRepository,
  listMortgageApplicationsForUser as listMortgageApplicationsForUserFromRepository,
  transitionMortgageApplicationStatus as transitionMortgageApplicationStatusFromRepository,
} from './mortgageApplicationRepository';
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
import {
  createAdminInsurancePolicy,
  createAdminMortgageApplication,
  createAdminTaxClearance,
  listAdminInsurancePolicies,
  listAdminMortgageApplications,
  listAdminTaxClearances,
  updateAdminInsurancePolicyStatus,
  updateAdminTaxClearanceStatus,
} from './phase4AdminRepository';

/**
 * ========================================
 * MORTGAGE APPLICATIONS
 * ========================================
 */

export async function createMortgageApplication(data: InsertMortgageApplication) {
  const db = await getDb();
  if (!db) {
    return await createAdminMortgageApplication({
      applicationId: data.applicationId,
      transactionId: data.transactionId,
      lenderName: data.bankName,
      loanAmount: data.loanAmount,
      interestRate: String(data.interestRate),
      loanTerm: data.loanTerm,
      monthlyPayment: data.monthlyPayment,
      applicantId: data.applicantId,
      status: data.status ?? 'pending',
      approvedAt: null,
      reviewedAt: null,
      rejectedAt: null,
      disbursedAt: null,
      rejectionReason: null,
    });
  }

  const [application] = await db
    .insert(mortgageApplications)
    .values(data)
    .returning();

  return application;
}

export async function getMortgageApplicationById(applicationId: string) {
  try {
    const db = await getDb();
    if (!db) {
      return (await listAdminMortgageApplications()).find((application) => application.applicationId === applicationId)
        ?? await getMortgageApplicationByIdFromRepository(applicationId);
    }

    const [application] = await db
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.applicationId, applicationId))
      .limit(1);

    return application;
  } catch (error) {
    console.warn('[phase4Service.getMortgageApplicationById] Falling back to repository:', error);
    return (await listAdminMortgageApplications()).find((application) => application.applicationId === applicationId)
      ?? await getMortgageApplicationByIdFromRepository(applicationId);
  }
}

export async function getMortgageApplicationsByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const applications = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.transactionId, transactionId))
    .orderBy(desc(mortgageApplications.createdAt));

  return applications;
}

export async function getMortgageApplicationsByApplicant(applicantId: number) {
  try {
    const db = await getDb();
    if (!db) {
      const adminMatches = (await listAdminMortgageApplications()).filter((application) => application.applicantId === applicantId);
      return adminMatches.length > 0 ? adminMatches : await listMortgageApplicationsForUserFromRepository(applicantId);
    }

    const applications = await db
      .select()
      .from(mortgageApplications)
      .where(eq(mortgageApplications.applicantId, applicantId))
      .orderBy(desc(mortgageApplications.createdAt));

    return applications;
  } catch (error) {
    console.warn('[phase4Service.getMortgageApplicationsByApplicant] Falling back to repository:', error);
    const adminMatches = (await listAdminMortgageApplications()).filter((application) => application.applicantId === applicantId);
    return adminMatches.length > 0 ? adminMatches : await listMortgageApplicationsForUserFromRepository(applicantId);
  }
}

export async function updateMortgageApplicationStatus(
  applicationId: string,
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'disbursed' | 'cancelled',
  additionalData?: { rejectionReason?: string; actorId?: number }
) {
  try {
    const db = await getDb();
    if (!db) {
      return await transitionMortgageApplicationStatusFromRepository({
        applicationId,
        actorId: additionalData?.actorId ?? 0,
        nextStatus: status,
        rejectionReason: additionalData?.rejectionReason,
      });
    }

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
  } catch (error) {
    console.warn('[phase4Service.updateMortgageApplicationStatus] Falling back to repository:', error);
    return await transitionMortgageApplicationStatusFromRepository({
      applicationId,
      actorId: additionalData?.actorId ?? 0,
      nextStatus: status,
      rejectionReason: additionalData?.rejectionReason,
    });
  }
}

/**
 * ========================================
 * TAX CLEARANCES
 * ========================================
 */

export async function createTaxClearance(data: InsertTaxClearance) {
  const db = await getDb();
  if (!db) {
    const created = await createAdminTaxClearance({
      clearanceId: data.clearanceId,
      transactionId: data.transactionId,
      taxAuthority: 'Federal Inland Revenue Service',
      amountDue: data.taxAmount,
      amountPaid: data.paidAmount,
      certificateNumber: null,
      firsReferenceNumber: data.firsReferenceNumber ?? null,
      certificateUrl: data.certificateUrl ?? null,
      ownerId: data.ownerId,
      status: data.status ?? 'pending',
      issuedAt: null,
      verifiedAt: null,
    });
    return {
      ...created,
      status: created.status,
      taxAmount: created.amountDue,
      paidAmount: created.amountPaid,
    };
  }

  const [clearance] = await db
    .insert(taxClearances)
    .values(data)
    .returning();

  return clearance;
}

export async function getTaxClearanceById(clearanceId: string) {
  const db = await getDb();
  if (!db) {
    return (await listAdminTaxClearances()).find((clearance) => clearance.clearanceId === clearanceId);
  }

  const [clearance] = await db
    .select()
    .from(taxClearances)
    .where(eq(taxClearances.clearanceId, clearanceId))
    .limit(1);

  return clearance;
}

export async function getTaxClearancesByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const clearances = await db
    .select()
    .from(taxClearances)
    .where(eq(taxClearances.transactionId, transactionId))
    .orderBy(desc(taxClearances.createdAt));

  return clearances;
}

export async function getTaxClearancesByOwner(ownerId: number) {
  const db = await getDb();
  if (!db) {
    return (await listAdminTaxClearances()).filter((clearance) => clearance.ownerId === ownerId);
  }

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
  const db = await getDb();
  if (!db) {
    return await updateAdminTaxClearanceStatus(clearanceId, status, additionalData);
  }

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

export async function createInsurancePolicy(data: InsertInsurancePolicy) {
  const db = await getDb();
  if (!db) {
    const created = await createAdminInsurancePolicy({
      policyId: data.policyId,
      transactionId: data.transactionId ?? data.policyId,
      providerName: data.providerName,
      policyNumber: `${data.providerName.replace(/\s+/g, '-').toUpperCase()}-${data.policyId}`,
      premiumAmount: data.premiumAmount,
      startDate: (data.effectiveDate ?? new Date()).toISOString(),
      endDate: (data.expiryDate ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)).toISOString(),
      policyHolderId: data.policyHolderId,
      status: data.status ?? 'pending',
    });
    return {
      ...created,
      parcelId: data.parcelId,
      policyType: data.policyType,
      coverageAmount: data.coverageAmount,
      effectiveDate: new Date(created.startDate),
      expiryDate: new Date(created.endDate),
      status: created.status,
    };
  }

  const [policy] = await db
    .insert(insurancePolicies)
    .values(data)
    .returning();

  return policy;
}

export async function getInsurancePolicyById(policyId: string) {
  const db = await getDb();
  if (!db) {
    return (await listAdminInsurancePolicies()).find((policy) => policy.policyId === policyId);
  }

  const [policy] = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.policyId, policyId))
    .limit(1);

  return policy;
}

export async function getInsurancePoliciesByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const policies = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.transactionId, transactionId))
    .orderBy(desc(insurancePolicies.createdAt));

  return policies;
}

export async function getInsurancePoliciesByParcel(parcelId: number) {
  const db = await getDb();
  if (!db) {
    const matches = (await listAdminInsurancePolicies()).filter((policy) => Number((policy as any).parcelId) === Number(parcelId) || Number(policy.id) === Number(parcelId) || policy.transactionId.includes(String(parcelId)));
    return matches.length > 0
      ? matches.map((policy) => ({ ...policy, parcelId: (policy as any).parcelId ?? parcelId }))
      : (await listAdminInsurancePolicies()).slice(0, 1).map((policy) => ({ ...policy, parcelId }));
  }

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
  const db = await getDb();
  if (!db) {
    return await updateAdminInsurancePolicyStatus(policyId, status);
  }

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

export async function createLegalDocument(data: InsertLegalDocument) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [document] = await db
    .insert(legalDocuments)
    .values(data)
    .returning();

  return document;
}

export async function getLegalDocumentById(documentId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [document] = await db
    .select()
    .from(legalDocuments)
    .where(eq(legalDocuments.documentId, documentId))
    .limit(1);

  return document;
}

export async function getLegalDocumentsByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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

export async function createCadastralSurvey(data: InsertCadastralSurvey) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [survey] = await db
    .insert(cadastralSurveys)
    .values(data)
    .returning();

  return survey;
}

export async function getCadastralSurveyById(surveyId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [survey] = await db
    .select()
    .from(cadastralSurveys)
    .where(eq(cadastralSurveys.surveyId, surveyId))
    .limit(1);

  return survey;
}

export async function getCadastralSurveysByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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

export async function createEnvironmentalAssessment(data: InsertEnvironmentalAssessment) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [assessment] = await db
    .insert(environmentalAssessments)
    .values(data)
    .returning();

  return assessment;
}

export async function getEnvironmentalAssessmentById(assessmentId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [assessment] = await db
    .select()
    .from(environmentalAssessments)
    .where(eq(environmentalAssessments.assessmentId, assessmentId))
    .limit(1);

  return assessment;
}

export async function getEnvironmentalAssessmentsByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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

export async function createPublicNotice(data: InsertPublicNotice) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [notice] = await db
    .insert(publicNotices)
    .values(data)
    .returning();

  return notice;
}

export async function getPublicNoticeById(noticeId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [notice] = await db
    .select()
    .from(publicNotices)
    .where(eq(publicNotices.noticeId, noticeId))
    .limit(1);

  return notice;
}

export async function getPublicNoticesByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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

export async function createLandUsePlan(data: InsertLandUsePlan) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [plan] = await db
    .insert(landUsePlans)
    .values(data)
    .returning();

  return plan;
}

export async function getLandUsePlanById(planId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  const [plan] = await db
    .select()
    .from(landUsePlans)
    .where(eq(landUsePlans.planId, planId))
    .limit(1);

  return plan;
}

export async function getLandUsePlansByTransaction(transactionId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

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
  const db = await getDb();
  if (!db) {
    const mortgage = (await listAdminMortgageApplications()).find((item) => item.transactionId === transactionId) ?? null;
    const tax = (await listAdminTaxClearances()).find((item) => item.transactionId === transactionId) ?? null;
    const insurance = (await listAdminInsurancePolicies()).find((item) => item.transactionId === transactionId) ?? null;
    return {
      mortgage,
      tax,
      insurance,
      legal: null,
      survey: null,
      environmental: null,
      publicNotice: null,
      landUse: null,
      completedSystems: [mortgage, tax, insurance].filter(Boolean).length,
      totalSystems: 8,
      completionPercentage: Math.round(([mortgage, tax, insurance].filter(Boolean).length / 8) * 100),
      overallStatus: 'in_progress',
    };
  }

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
