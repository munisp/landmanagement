/**
 * Phase 4 tRPC Router: Advanced Integration Systems
 * Handles mortgage, tax, insurance, legal, survey, environmental, public notice, and land use systems
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../../_core/trpc';
import * as phase4Service from '../../phase4Service';
import { dashboardWS } from '../../dashboardWebSocketService';
import { getDb } from '../../db';
import {
  mortgageApplications,
  taxClearances,
  insurancePolicies,
  legalDocuments,
  cadastralSurveys,
  environmentalAssessments,
  publicNotices,
  landUsePlans,
} from '../../../drizzle/schema';
import {
  listAdminCadastralSurveys,
  listAdminEnvironmentalAssessments,
  listAdminInsurancePolicies,
  listAdminLandUsePlans,
  listAdminLegalDocuments,
  listAdminMortgageApplications,
  listAdminPublicNotices,
  listAdminTaxClearances,
  updateAdminCadastralSurveyStatus,
  updateAdminEnvironmentalAssessmentStatus,
  updateAdminInsurancePolicyStatus,
  updateAdminLandUsePlanStatus,
  updateAdminLegalDocumentStatus,
  updateAdminMortgageApplicationStatus,
  updateAdminPublicNoticeStatus,
  updateAdminTaxClearanceStatus,
} from '../../phase4AdminRepository';

// Admin procedure - requires admin role
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const phase4Router = router({
  /**
   * ========================================
   * MORTGAGE APPLICATIONS
   * ========================================
   */
  
  createMortgageApplication: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        parcelId: z.number(),
        loanAmount: z.number(),
        interestRate: z.string(),
        loanTerm: z.number(),
        monthlyPayment: z.number(),
        downPayment: z.number(),
        bankName: z.string(),
        bankBranch: z.string().optional(),
        loanOfficer: z.string().optional(),
        loanOfficerContact: z.string().optional(),
        documents: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const applicationId = `MORT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const application = await phase4Service.createMortgageApplication({
        applicationId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        applicantId: ctx.user.id,
        loanAmount: input.loanAmount,
        interestRate: input.interestRate,
        loanTerm: input.loanTerm,
        monthlyPayment: input.monthlyPayment,
        downPayment: input.downPayment,
        bankName: input.bankName,
        bankBranch: input.bankBranch,
        loanOfficer: input.loanOfficer,
        loanOfficerContact: input.loanOfficerContact,
        documents: input.documents,
      });

      return application;
    }),

  getMortgageApplication: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ input, ctx }) => {
      const application = await phase4Service.getMortgageApplicationById(input.applicationId);
      
      if (!application) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Mortgage application not found' });
      }

      // Check ownership
      if (application.applicantId !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return application;
    }),

  getMyMortgageApplications: protectedProcedure
    .query(async ({ ctx }) => {
      return await phase4Service.getMortgageApplicationsByApplicant(ctx.user.id);
    }),

  updateMortgageApplicationStatus: protectedProcedure
    .input(
      z.object({
        applicationId: z.string(),
        status: z.enum(['pending', 'under_review', 'approved', 'rejected', 'disbursed', 'cancelled']),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update application status' });
      }

      const updated = !(await getDb())
        ? await updateAdminMortgageApplicationStatus(input.applicationId, input.status, input.rejectionReason)
        : await phase4Service.updateMortgageApplicationStatus(
            input.applicationId,
            input.status,
            { rejectionReason: input.rejectionReason }
          );

      // Emit WebSocket event
      if (updated.transactionId) {
        const progress = input.status === 'approved' ? 100 : input.status === 'rejected' ? 0 : 50;
        dashboardWS.notifySystemStatusChange(
          updated.transactionId,
          'mortgage',
          input.status,
          progress
        );
      }

      return updated;
    }),

  /**
   * ========================================
   * TAX CLEARANCES
   * ========================================
   */

  createTaxClearance: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        parcelId: z.number(),
        taxYear: z.number(),
        taxAmount: z.number(),
        paidAmount: z.number(),
        outstandingAmount: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const clearanceId = `TAX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const clearance = await phase4Service.createTaxClearance({
        clearanceId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        ownerId: ctx.user.id,
        taxYear: input.taxYear,
        taxAmount: input.taxAmount,
        paidAmount: input.paidAmount,
        outstandingAmount: input.outstandingAmount,
      });

      return clearance;
    }),

  getTaxClearance: protectedProcedure
    .input(z.object({ clearanceId: z.string() }))
    .query(async ({ input, ctx }) => {
      const clearance = await phase4Service.getTaxClearanceById(input.clearanceId);
      
      if (!clearance) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax clearance not found' });
      }

      // Check ownership
      if (clearance.ownerId !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return clearance;
    }),

  getMyTaxClearances: protectedProcedure
    .query(async ({ ctx }) => {
      return await phase4Service.getTaxClearancesByOwner(ctx.user.id);
    }),

  updateTaxClearanceStatus: protectedProcedure
    .input(
      z.object({
        clearanceId: z.string(),
        status: z.enum(['pending', 'in_progress', 'verified', 'issued', 'rejected', 'expired']),
        certificateUrl: z.string().optional(),
        firsReferenceNumber: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update clearance status' });
      }

      const updated = !(await getDb())
        ? await updateAdminTaxClearanceStatus(input.clearanceId, input.status, {
            certificateUrl: input.certificateUrl,
            firsReferenceNumber: input.firsReferenceNumber,
          })
        : await phase4Service.updateTaxClearanceStatus(
            input.clearanceId,
            input.status,
            { certificateUrl: input.certificateUrl, firsReferenceNumber: input.firsReferenceNumber }
          );

      // Emit WebSocket event
      if (updated.transactionId) {
        const progress = input.status === 'issued' ? 100 : input.status === 'rejected' ? 0 : 50;
        dashboardWS.notifySystemStatusChange(
          updated.transactionId,
          'tax',
          input.status,
          progress
        );
      }

      return updated;
    }),

  /**
   * ========================================
   * INSURANCE POLICIES
   * ========================================
   */

  createInsurancePolicy: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().optional(),
        parcelId: z.number(),
        providerName: z.string(),
        providerContact: z.string().optional(),
        agentName: z.string().optional(),
        agentContact: z.string().optional(),
        policyType: z.string(),
        coverageAmount: z.number(),
        premiumAmount: z.number(),
        deductible: z.number().optional(),
        effectiveDate: z.date(),
        expiryDate: z.date(),
        policyDocumentUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const policyId = `INS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const policy = await phase4Service.createInsurancePolicy({
        policyId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        policyHolderId: ctx.user.id,
        providerName: input.providerName,
        providerContact: input.providerContact,
        agentName: input.agentName,
        agentContact: input.agentContact,
        policyType: input.policyType,
        coverageAmount: input.coverageAmount,
        premiumAmount: input.premiumAmount,
        deductible: input.deductible,
        effectiveDate: input.effectiveDate,
        expiryDate: input.expiryDate,
        policyDocumentUrl: input.policyDocumentUrl,
      });

      return policy;
    }),

  getInsurancePolicy: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ input, ctx }) => {
      const policy = await phase4Service.getInsurancePolicyById(input.policyId);
      
      if (!policy) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Insurance policy not found' });
      }

      // Check ownership
      if (policy.policyHolderId !== ctx.user.id && ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
      }

      return policy;
    }),

  getInsurancePoliciesByParcel: protectedProcedure
    .input(z.object({ parcelId: z.number() }))
    .query(async ({ input }) => {
      return await phase4Service.getInsurancePoliciesByParcel(input.parcelId);
    }),

  updateInsurancePolicyStatus: protectedProcedure
    .input(
      z.object({
        policyId: z.string(),
        status: z.enum(['pending', 'active', 'expired', 'cancelled', 'suspended']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update policy status' });
      }

      const updated = !(await getDb())
        ? await updateAdminInsurancePolicyStatus(input.policyId, input.status)
        : await phase4Service.updateInsurancePolicyStatus(input.policyId, input.status);

      // Emit WebSocket event
      if (updated.transactionId) {
        const progress = input.status === 'active' ? 100 : input.status === 'cancelled' ? 0 : 50;
        dashboardWS.notifySystemStatusChange(
          updated.transactionId,
          'insurance',
          input.status,
          progress
        );
      }

      return updated;
    }),

  /**
   * ========================================
   * LEGAL DOCUMENTS
   * ========================================
   */

  createLegalDocument: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        parcelId: z.number(),
        documentType: z.enum([
          'deed_of_assignment',
          'power_of_attorney',
          'contract_of_sale',
          'lease_agreement',
          'mortgage_deed',
          'certificate_of_occupancy',
          'governor_consent',
          'other',
        ]),
        title: z.string(),
        description: z.string().optional(),
        documentUrl: z.string().optional(),
        lawyerName: z.string().optional(),
        lawyerBarNumber: z.string().optional(),
        lawyerContact: z.string().optional(),
        lawFirm: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const documentId = `LEGAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const document = await phase4Service.createLegalDocument({
        documentId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        documentType: input.documentType,
        title: input.title,
        description: input.description,
        documentUrl: input.documentUrl,
        lawyerName: input.lawyerName,
        lawyerBarNumber: input.lawyerBarNumber,
        lawyerContact: input.lawyerContact,
        lawFirm: input.lawFirm,
      });

      return document;
    }),

  getLegalDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ input }) => {
      const document = await phase4Service.getLegalDocumentById(input.documentId);
      
      if (!document) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Legal document not found' });
      }

      return document;
    }),

  getLegalDocumentsByTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return await phase4Service.getLegalDocumentsByTransaction(input.transactionId);
    }),

  updateLegalDocumentStatus: protectedProcedure
    .input(
      z.object({
        documentId: z.string(),
        status: z.enum(['draft', 'pending_review', 'approved', 'signed', 'registered', 'rejected']),
        registrationNumber: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update document status' });
      }

      const updated = !(await getDb())
        ? await updateAdminLegalDocumentStatus(input.documentId, input.status, input.registrationNumber)
        : await phase4Service.updateLegalDocumentStatus(
            input.documentId,
            input.status,
            { registrationNumber: input.registrationNumber }
          );

      // Emit WebSocket event
      if (updated.transactionId) {
        const progress = input.status === 'registered' ? 100 : input.status === 'rejected' ? 0 : 50;
        dashboardWS.notifySystemStatusChange(
          updated.transactionId,
          'legal',
          input.status,
          progress
        );
      }

      return updated;
    }),

  /**
   * ========================================
   * CADASTRAL SURVEYS
   * ========================================
   */

  createCadastralSurvey: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().optional(),
        parcelId: z.number(),
        surveyPlanNumber: z.string(),
        surveyDate: z.date(),
        surveyorName: z.string(),
        surveyorLicenseNumber: z.string(),
        surveyFirm: z.string().optional(),
        coordinates: z.any(),
        area: z.number(),
        perimeter: z.number().optional(),
        boundaryPoints: z.any().optional(),
        surveyPlanUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const surveyId = `SURVEY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const survey = await phase4Service.createCadastralSurvey({
        surveyId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        surveyPlanNumber: input.surveyPlanNumber,
        surveyDate: input.surveyDate,
        surveyorName: input.surveyorName,
        surveyorLicenseNumber: input.surveyorLicenseNumber,
        surveyFirm: input.surveyFirm,
        coordinates: input.coordinates,
        area: input.area,
        perimeter: input.perimeter,
        boundaryPoints: input.boundaryPoints,
        surveyPlanUrl: input.surveyPlanUrl,
      });

      return survey;
    }),

  getCadastralSurvey: protectedProcedure
    .input(z.object({ surveyId: z.string() }))
    .query(async ({ input }) => {
      const survey = await phase4Service.getCadastralSurveyById(input.surveyId);
      
      if (!survey) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cadastral survey not found' });
      }

      return survey;
    }),

  getCadastralSurveysByTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return await phase4Service.getCadastralSurveysByTransaction(input.transactionId);
    }),

  updateCadastralSurveyStatus: protectedProcedure
    .input(
      z.object({
        surveyId: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'approved', 'rejected', 'expired']),
        approvedBy: z.string().optional(),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update survey status' });
      }

      const updated = !(await getDb())
        ? await updateAdminCadastralSurveyStatus(input.surveyId, input.status)
        : await phase4Service.updateCadastralSurveyStatus(
            input.surveyId,
            input.status,
            { approvedBy: input.approvedBy, rejectionReason: input.rejectionReason }
          );

      // Emit WebSocket event
      if (updated.transactionId) {
        const progress = input.status === 'approved' ? 100 : input.status === 'rejected' ? 0 : 50;
        dashboardWS.notifySystemStatusChange(
          updated.transactionId,
          'survey',
          input.status,
          progress
        );
      }

      return updated;
    }),

  /**
   * ========================================
   * ENVIRONMENTAL ASSESSMENTS
   * ========================================
   */

  createEnvironmentalAssessment: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().optional(),
        parcelId: z.number(),
        assessmentType: z.string(),
        assessorName: z.string(),
        assessorLicense: z.string().optional(),
        assessorFirm: z.string().optional(),
        soilQuality: z.string().optional(),
        waterQuality: z.string().optional(),
        airQuality: z.string().optional(),
        floodRisk: z.string().optional(),
        erosionRisk: z.string().optional(),
        contaminationLevel: z.string().optional(),
        isProtectedArea: z.boolean().optional(),
        protectedAreaType: z.string().optional(),
        reportUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const assessmentId = `ENV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const assessment = await phase4Service.createEnvironmentalAssessment({
        assessmentId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        assessmentType: input.assessmentType,
        assessorName: input.assessorName,
        assessorLicense: input.assessorLicense,
        assessorFirm: input.assessorFirm,
        soilQuality: input.soilQuality,
        waterQuality: input.waterQuality,
        airQuality: input.airQuality,
        floodRisk: input.floodRisk,
        erosionRisk: input.erosionRisk,
        contaminationLevel: input.contaminationLevel,
        isProtectedArea: input.isProtectedArea,
        protectedAreaType: input.protectedAreaType,
        reportUrl: input.reportUrl,
      });

      return assessment;
    }),

  getEnvironmentalAssessment: protectedProcedure
    .input(z.object({ assessmentId: z.string() }))
    .query(async ({ input }) => {
      const assessment = await phase4Service.getEnvironmentalAssessmentById(input.assessmentId);
      
      if (!assessment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Environmental assessment not found' });
      }

      return assessment;
    }),

  getEnvironmentalAssessmentsByTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return await phase4Service.getEnvironmentalAssessmentsByTransaction(input.transactionId);
    }),

  updateEnvironmentalAssessmentStatus: protectedProcedure
    .input(
      z.object({
        assessmentId: z.string(),
        status: z.enum(['pending', 'under_review', 'approved', 'conditional_approval', 'rejected', 'expired']),
        conditions: z.string().optional(),
        rejectionReason: z.string().optional(),
        certificateUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update assessment status' });
      }

      const updated = !(await getDb())
        ? await updateAdminEnvironmentalAssessmentStatus(input.assessmentId, input.status, {
            conditions: input.conditions,
            rejectionReason: input.rejectionReason,
            certificateUrl: input.certificateUrl,
          })
        : await phase4Service.updateEnvironmentalAssessmentStatus(
            input.assessmentId,
            input.status,
            {
              conditions: input.conditions,
              rejectionReason: input.rejectionReason,
              certificateUrl: input.certificateUrl,
            }
          );

      // Emit WebSocket event
      if (updated.transactionId) {
        const progress = input.status === 'approved' ? 100 : input.status === 'rejected' ? 0 : 50;
        dashboardWS.notifySystemStatusChange(
          updated.transactionId,
          'environmental',
          input.status,
          progress
        );
      }

      return updated;
    }),

  /**
   * ========================================
   * PUBLIC NOTICES
   * ========================================
   */

  createPublicNotice: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        parcelId: z.number(),
        noticeType: z.string(),
        noticeTitle: z.string(),
        noticeContent: z.string(),
        publicationDate: z.date(),
        publicationPeriodDays: z.number().optional(),
        expiryDate: z.date(),
        newspaperName: z.string().optional(),
        newspaperEdition: z.string().optional(),
        publicationUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const noticeId = `NOTICE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const notice = await phase4Service.createPublicNotice({
        noticeId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        noticeType: input.noticeType,
        noticeTitle: input.noticeTitle,
        noticeContent: input.noticeContent,
        publicationDate: input.publicationDate,
        publicationPeriodDays: input.publicationPeriodDays || 30,
        expiryDate: input.expiryDate,
        newspaperName: input.newspaperName,
        newspaperEdition: input.newspaperEdition,
        publicationUrl: input.publicationUrl,
      });

      return notice;
    }),

  getPublicNotice: protectedProcedure
    .input(z.object({ noticeId: z.string() }))
    .query(async ({ input }) => {
      const notice = await phase4Service.getPublicNoticeById(input.noticeId);
      
      if (!notice) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Public notice not found' });
      }

      return notice;
    }),

  getPublicNoticesByTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return await phase4Service.getPublicNoticesByTransaction(input.transactionId);
    }),

  updatePublicNoticeStatus: protectedProcedure
    .input(
      z.object({
        noticeId: z.string(),
        status: z.enum(['pending', 'published', 'objection_filed', 'objection_resolved', 'completed', 'cancelled']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update notice status' });
      }

      const updated = !(await getDb())
        ? await updateAdminPublicNoticeStatus(input.noticeId, input.status)
        : await phase4Service.updatePublicNoticeStatus(input.noticeId, input.status);

      // Emit WebSocket event
      const progress = input.status === 'completed' ? 100 : input.status === 'cancelled' ? 0 : 50;
      dashboardWS.notifySystemStatusChange(
        updated.transactionId,
        'publicNotice',
        input.status,
        progress
      );

      return updated;
    }),

  addPublicNoticeObjection: protectedProcedure
    .input(
      z.object({
        noticeId: z.string(),
        objectorName: z.string(),
        objectorContact: z.string(),
        objectionDetails: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return await phase4Service.addPublicNoticeObjection(input.noticeId, {
        objectorName: input.objectorName,
        objectorContact: input.objectorContact,
        objectionDetails: input.objectionDetails,
        filedAt: new Date(),
      });
    }),

  /**
   * ========================================
   * LAND USE PLANS
   * ========================================
   */

  createLandUsePlan: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().optional(),
        parcelId: z.number(),
        currentLandUse: z.string(),
        proposedLandUse: z.string(),
        zoningClassification: z.string().optional(),
        developmentType: z.string().optional(),
        planningAuthority: z.string(),
        planningOfficer: z.string().optional(),
        planningOfficerContact: z.string().optional(),
        complianceNotes: z.string().optional(),
        restrictions: z.string().optional(),
        applicationUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const planId = `LANDUSE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const plan = await phase4Service.createLandUsePlan({
        planId,
        transactionId: input.transactionId,
        parcelId: input.parcelId,
        currentLandUse: input.currentLandUse,
        proposedLandUse: input.proposedLandUse,
        zoningClassification: input.zoningClassification,
        developmentType: input.developmentType,
        planningAuthority: input.planningAuthority,
        planningOfficer: input.planningOfficer,
        planningOfficerContact: input.planningOfficerContact,
        complianceNotes: input.complianceNotes,
        restrictions: input.restrictions,
        applicationUrl: input.applicationUrl,
      });

      return plan;
    }),

  getLandUsePlan: protectedProcedure
    .input(z.object({ planId: z.string() }))
    .query(async ({ input }) => {
      const plan = await phase4Service.getLandUsePlanById(input.planId);
      
      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Land use plan not found' });
      }

      return plan;
    }),

  getLandUsePlansByTransaction: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return await phase4Service.getLandUsePlansByTransaction(input.transactionId);
    }),

  updateLandUsePlanStatus: protectedProcedure
    .input(
      z.object({
        planId: z.string(),
        status: z.enum(['pending', 'under_review', 'approved', 'conditional_approval', 'rejected', 'expired']),
        conditions: z.string().optional(),
        rejectionReason: z.string().optional(),
        isCompliant: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only admins can update status
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can update land use plan status' });
      }

      const updated = !(await getDb())
        ? await updateAdminLandUsePlanStatus(input.planId, input.status, {
            conditions: input.conditions,
            rejectionReason: input.rejectionReason,
            isCompliant: input.isCompliant,
          })
        : await phase4Service.updateLandUsePlanStatus(
            input.planId,
            input.status,
            {
              conditions: input.conditions,
              rejectionReason: input.rejectionReason,
              isCompliant: input.isCompliant,
            }
          );

      // Emit WebSocket event
      if (updated.transactionId) {
        const progress = input.status === 'approved' ? 100 : input.status === 'rejected' ? 0 : 50;
        dashboardWS.notifySystemStatusChange(
          updated.transactionId,
          'landUse',
          input.status,
          progress
        );
      }

      return updated;
    }),

  /**
   * ========================================
   * UNIFIED STATUS
   * ========================================
   */

  getTransactionPhase4Status: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      return await phase4Service.getTransactionPhase4Status(input.transactionId);
    }),

  /**
   * ========================================
   * ADMIN PROCEDURES
   * ========================================
   */

  getAllMortgageApplications: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminMortgageApplications();
      return await db.select().from(mortgageApplications);
    }),

  getAllTaxClearances: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminTaxClearances();
      return await db.select().from(taxClearances);
    }),

  getAllInsurancePolicies: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminInsurancePolicies();
      return await db.select().from(insurancePolicies);
    }),

  getAllLegalDocuments: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminLegalDocuments();
      return await db.select().from(legalDocuments);
    }),

  getAllCadastralSurveys: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminCadastralSurveys();
      return await db.select().from(cadastralSurveys);
    }),

  getAllEnvironmentalAssessments: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminEnvironmentalAssessments();
      return await db.select().from(environmentalAssessments);
    }),

  getAllPublicNotices: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminPublicNotices();
      return await db.select().from(publicNotices);
    }),

  getAllLandUsePlans: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return await listAdminLandUsePlans();
      return await db.select().from(landUsePlans);
    }),
});
