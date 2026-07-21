import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import * as fabricClient from './fabricClient';
import { systemRouter } from "./_core/systemRouter";
import { unifiedDashboardRouter } from './api/routers/unified-dashboard';
import { phase4Router } from './api/routers/phase4';
import { analyticsRouter } from './api/routers/analytics';
import { securityIntegrationRouter } from './api/routers/security-integration';
import { searchRouter } from './api/routers/search';
import { aiServicesRouter } from './api/routers/ai-services';
import { financialRouter } from './api/routers/financial';
import { marketplaceRouter } from './api/routers/marketplace';
import { mortgagePaymentRouter } from './api/routers/mortgage-payment';
import { creditBureauRouter } from './api/routers/credit-bureau';
import { mortgageInsuranceRouter } from './api/routers/mortgage-insurance';
import { documentVerificationRouter } from './api/routers/document-verification';
import { mortgageBrokerRouter } from './api/routers/mortgage-broker';
import { secondaryMarketRouter } from './api/routers/secondary-market';
import { regulatoryComplianceRouter } from './api/routers/regulatory-compliance';
import { webhookRouter } from './api/routers/webhook';
import { mortgageAnalyticsRouter } from './api/routers/mortgage-analytics';
import { reportSchedulerRouter } from './api/routers/report-scheduler';
import { emailTemplateRouter } from './api/routers/email-template';
import { disputesRouter } from './api/routers/disputes';
import { valuationsRouter } from './api/routers/valuations';
import { geoAnalyticsRouter } from './api/routers/geo-analytics';
import { geospatialIntelligenceRouter } from './api/routers/geospatial-intelligence';
import { geolibreRouter } from './api/routers/geolibre';
import { geospatialRouter } from './api/routers/geospatial';
import { mortgageApplicationsRouter } from './api/routers/mortgage-applications';
import { cachedParcelRouter } from './api/routers/cached-parcel';
import { cachedTransactionRouter } from './api/routers/cached-transaction';
import { integrationHealthRouter } from './api/routers/integration-health';
import { integrationRegistryRouter } from './api/routers/integration-registry';
import { titleRiskRouter } from './api/routers/title-risk';
import { titleIntelligenceRouter } from './api/routers/title-intelligence';
import { registryIntegrityRouter } from './api/routers/registry-integrity';
import { escrowSettlementRouter } from './api/routers/escrow-settlement';
import { mortgageExplainabilityRouter } from './api/routers/mortgage-explainability';
import { dataExchangeRouter } from './api/routers/data-exchange';
import { clearanceExchangeRouter } from './api/routers/clearance-exchange';
import { parcelDigitalTwinRouter } from './api/routers/parcel-digital-twin';
import { caseConciergeRouter } from './api/routers/case-concierge';
import { operationalEventsRouter } from './api/routers/operational-events';
import { commandCenterRouter } from './api/routers/command-center';
import { platformOperationsRouter } from './api/routers/platform-operations';
import { publicSecurityRouter } from './api/routers/public-security';
import { parcelSubscriptionsRouter, notificationPreferencesRouter, notificationInboxRouter } from './api/routers/parcel-subscriptions';
import { identityRouter } from './api/routers/identity';
import { legalRouter } from './api/routers/legal';
import { miningRouter } from "./api/routers/mining";
import { oilGasRouter } from "./api/routers/oil-gas";
import { concessionsRouter } from "./api/routers/concessions";
import { environmentalRouter } from "./api/routers/environmental";
import { cofoWorkflowRouter } from "./api/routers/cofo-workflow";
import { onboardingRouter } from "./api/routers/onboarding";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { notificationService } from "./notifications";
import { notificationWS } from "./notificationWebSocketService";
import { adminNotifications } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireDb } from "./db";
import * as odmService from './odm';
import {
  cancelDroneProcessingTask,
  createDroneProcessingTask,
  getDroneProcessingTask,
  listDroneProcessingTasks,
} from './droneProcessingRepository';
import * as firsService from './firs';
import {
  calculateTaxAssessment,
  getTaxAssessmentById as getTaxAssessmentFromRepository,
  getTaxHistoryByParcel,
  generateTaxClearanceRecord,
  submitTaxPaymentRecord,
  verifyTaxClearanceRecord,
  verifyTinRecord,
} from './taxRepository';
import * as analyticsService from './analytics';
import * as bulkImportService from './bulkImport';
import * as userPreferencesService from './userPreferences';
import * as adminService from './adminService';
import * as verificationService from './verificationService';
import * as reportingService from './reportingService';
import { storagePut } from './storage';
import { TRPCError } from '@trpc/server';
import {
  batchAssignParcels,
  batchVerifyParcels,
  createParcel,
  geospatialSearch as geospatialParcelSearch,
  getParcelById as getParcelFromRepository,
  getParcelByNumber as getParcelByNumberFromRepository,
  searchParcels as searchParcelRepository,
  updateParcel as updateParcelInRepository,
  verifyParcel as verifyParcelInRepository,
} from './parcelRepository';
import {
  createTitle,
  getTitleById,
  getTitleByNumber,
  getTitlesByOwner,
  searchTitles,
  verifyTitle,
} from './titleRepository';
import {
  advanceTransaction,
  createTransaction,
  getTransactionById,
  listTransactions,
} from './transactionRepository';
import {
  buildPaymentReceipt,
  confirmPaymentRecord,
  listPaymentsByTransaction,
  processPaymentRecord,
} from './paymentRepository';
import { generatePaymentReceiptPdf } from './paymentReceipt';
import {
  getDocumentsByParcel,
  getDocumentsByTransaction,
  listAllDocuments,
  uploadDocumentRecord,
  verifyDocumentRecord,
} from './documentRepository';
import { 
  parcelService, 
  titleService, 
  transactionService, 
  paymentService, 
  documentService, 
  blockchainService 
} from "./db";

// Helper function for report MIME types
function getMimeType(format: string): string {
  switch (format) {
    case 'pdf':
      return 'application/pdf';
    case 'excel':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'csv':
      return 'text/csv';
    default:
      return 'application/octet-stream';
  }
}

export const appRouter = router({
  mining: miningRouter,
  oilGas: oilGasRouter,
  concessions: concessionsRouter,
  environmental: environmentalRouter,
  cofoWorkflow: cofoWorkflowRouter,
  onboarding: onboardingRouter,
  system: systemRouter,
  creditBureau: creditBureauRouter,
  mortgageInsurance: mortgageInsuranceRouter,
  documentVerification: documentVerificationRouter,
  mortgageBroker: mortgageBrokerRouter,
  secondaryMarket: secondaryMarketRouter,
  regulatoryCompliance: regulatoryComplianceRouter,
  webhook: webhookRouter,
  mortgageAnalytics: mortgageAnalyticsRouter,
  reportScheduler: reportSchedulerRouter,
  emailTemplate: emailTemplateRouter,
  disputes: disputesRouter,
  valuations: valuationsRouter,
  geoAnalytics: geoAnalyticsRouter,
  geospatialIntelligence: geospatialIntelligenceRouter,
  geolibre: geolibreRouter,
  geospatial: geospatialRouter,
  mortgageApplications: mortgageApplicationsRouter,
  cachedParcel: cachedParcelRouter,
  cachedTransaction: cachedTransactionRouter,
  integrationHealth: integrationHealthRouter,
  integrationRegistry: integrationRegistryRouter,
  titleRisk: titleRiskRouter,
  titleIntelligence: titleIntelligenceRouter,
  registryIntegrity: registryIntegrityRouter,
  escrowSettlement: escrowSettlementRouter,
  mortgageExplainability: mortgageExplainabilityRouter,
  dataExchange: dataExchangeRouter,
  clearanceExchange: clearanceExchangeRouter,
  parcelDigitalTwin: parcelDigitalTwinRouter,
  caseConcierge: caseConciergeRouter,
  operationalEvents: operationalEventsRouter,
  commandCenter: commandCenterRouter,
  platformOperations: platformOperationsRouter,
  publicSecurity: publicSecurityRouter,
  parcelSubscriptions: parcelSubscriptionsRouter,
  notificationPreferences: notificationPreferencesRouter,
  notificationInbox: notificationInboxRouter,

  // Storage upload endpoint
  storage: router({
    upload: protectedProcedure
      .input(z.object({
        key: z.string(),
        data: z.string(), // base64 encoded
        contentType: z.string(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.data, 'base64');
        return await storagePut(input.key, buffer, input.contentType);
      }),
  }),

  // User Preferences
  preferences: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return await userPreferencesService.getUserPreferences(ctx.user.id);
    }),
    
    update: protectedProcedure
      .input(z.object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        language: z.string().optional(),
        timezone: z.string().optional(),
        dateFormat: z.string().optional(),
        currency: z.string().optional(),
        notificationSettings: z.object({
          email: z.boolean().optional(),
          sms: z.boolean().optional(),
          push: z.boolean().optional(),
          transactionUpdates: z.boolean().optional(),
          systemAlerts: z.boolean().optional(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Handle partial notification settings
        const updateData: Partial<userPreferencesService.UserPreferences> = {
          theme: input.theme,
          language: input.language,
          timezone: input.timezone,
          dateFormat: input.dateFormat,
          currency: input.currency,
        };
        
        if (input.notificationSettings) {
          const current = await userPreferencesService.getUserPreferences(ctx.user.id);
          const currentSettings: userPreferencesService.NotificationSettings = current?.notificationSettings ?? {
            email: true,
            sms: true,
            push: true,
            transactionUpdates: true,
            systemAlerts: true,
          };
          
          updateData.notificationSettings = {
            email: input.notificationSettings.email !== undefined ? input.notificationSettings.email : currentSettings.email,
            sms: input.notificationSettings.sms !== undefined ? input.notificationSettings.sms : currentSettings.sms,
            push: input.notificationSettings.push !== undefined ? input.notificationSettings.push : currentSettings.push,
            transactionUpdates: input.notificationSettings.transactionUpdates !== undefined ? input.notificationSettings.transactionUpdates : currentSettings.transactionUpdates,
            systemAlerts: input.notificationSettings.systemAlerts !== undefined ? input.notificationSettings.systemAlerts : currentSettings.systemAlerts,
          };
        }
        
        return await userPreferencesService.updateUserPreferences(ctx.user.id, updateData);
      }),
    
    saveDashboardLayout: protectedProcedure
      .input(z.array(z.any()))
      .mutation(async ({ ctx, input }) => {
        await userPreferencesService.saveDashboardLayout(ctx.user.id, input);
        return { success: true };
      }),
    
    getDashboardLayout: protectedProcedure.query(async ({ ctx }) => {
      return await userPreferencesService.getDashboardLayout(ctx.user.id);
    }),
  }),
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  accountSettings: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const repo = await import('./accountSettingsRepository');
      return repo.getAccountSettings(Number(ctx.user.id), {
        name: ctx.user.name || `User ${ctx.user.id}`,
        email: ctx.user.email || `user${ctx.user.id}@idlr.local`,
        role: ctx.user.role || 'user',
      });
    }),

    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(2),
        email: z.string().email(),
        phone: z.string().min(7),
      }))
      .mutation(async ({ ctx, input }) => {
        const repo = await import('./accountSettingsRepository');
        return repo.updateAccountProfile(Number(ctx.user.id), {
          ...input,
          role: ctx.user.role || 'user',
        });
      }),

    changePassword: protectedProcedure
      .input(z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ ctx, input }) => {
        const repo = await import('./accountSettingsRepository');
        return repo.changeAccountPassword(Number(ctx.user.id), input);
      }),

    setTwoFactorEnabled: protectedProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const repo = await import('./accountSettingsRepository');
        return repo.setTwoFactorEnabled(Number(ctx.user.id), input.enabled);
      }),

    revokeSession: protectedProcedure
      .input(z.object({ sessionId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const repo = await import('./accountSettingsRepository');
        return repo.revokeAccountSession(Number(ctx.user.id), input.sessionId);
      }),
  }),

  privacy: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const gdpr = await import('./gdpr');
      return gdpr.getPrivacyOverview(Number(ctx.user.id), {
        name: ctx.user.name || `User ${ctx.user.id}`,
        email: ctx.user.email || `user${ctx.user.id}@idlr.local`,
        role: ctx.user.role || 'user',
      });
    }),

    exportData: protectedProcedure
      .mutation(async ({ ctx }) => {
        const gdpr = await import('./gdpr');
        return gdpr.exportUserData(Number(ctx.user.id), {
          name: ctx.user.name || `User ${ctx.user.id}`,
          email: ctx.user.email || `user${ctx.user.id}@idlr.local`,
          role: ctx.user.role || 'user',
        });
      }),

    portData: protectedProcedure
      .input(z.object({ format: z.enum(['json', 'csv', 'xml']).default('json') }))
      .mutation(async ({ ctx, input }) => {
        const gdpr = await import('./gdpr');
        return gdpr.portUserData(Number(ctx.user.id), input.format, {
          name: ctx.user.name || `User ${ctx.user.id}`,
          email: ctx.user.email || `user${ctx.user.id}@idlr.local`,
          role: ctx.user.role || 'user',
        });
      }),

    rectifyProfile: protectedProcedure
      .input(z.object({
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        phone: z.string().min(7).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const gdpr = await import('./gdpr');
        await gdpr.rectifyUserData(Number(ctx.user.id), input, {
          name: ctx.user.name || `User ${ctx.user.id}`,
          email: ctx.user.email || `user${ctx.user.id}@idlr.local`,
          role: ctx.user.role || 'user',
        });
        return { success: true };
      }),

    recordConsent: protectedProcedure
      .input(z.object({ purpose: z.string().min(2), granted: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const gdpr = await import('./gdpr');
        await gdpr.recordConsent(Number(ctx.user.id), input.purpose, input.granted);
        return { success: true };
      }),

    policy: protectedProcedure.query(async () => ({
      version: '2026.07',
      title: 'IDLR PTS Privacy Policy',
      summary: 'This policy governs identity data, land-registry workflow data, transaction records, document processing outputs, and audit evidence retained by the platform.',
      updatedAt: new Date('2026-07-17T00:00:00.000Z'),
      requiredPurpose: 'privacy_policy_2026_07',
    })),

    acknowledgePolicy: protectedProcedure
      .input(z.object({ granted: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        const gdpr = await import('./gdpr');
        await gdpr.recordConsent(Number(ctx.user.id), 'privacy_policy_2026_07', input.granted);
        return { success: true };
      }),

    reportBreach: protectedProcedure
      .input(z.object({
        description: z.string().min(10),
        affectedUsers: z.array(z.number()).min(1),
        dataCategories: z.array(z.string().min(2)).min(1),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
      }))
      .mutation(async ({ ctx, input }) => {
        if ((ctx.user.role || 'user') !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can report privacy breaches' });
        }
        const gdpr = await import('./gdpr');
        await gdpr.notifyDataBreach(input);
        return { success: true };
      }),

    withdrawConsent: protectedProcedure
      .input(z.object({ purpose: z.string().min(2) }))
      .mutation(async ({ ctx, input }) => {
        const gdpr = await import('./gdpr');
        await gdpr.withdrawConsent(Number(ctx.user.id), input.purpose);
        return { success: true };
      }),

    eraseData: protectedProcedure
      .input(z.object({ anonymize: z.boolean().default(true) }))
      .mutation(async ({ ctx, input }) => {
        const gdpr = await import('./gdpr');
        await gdpr.eraseUserData(Number(ctx.user.id), input.anonymize, {
          name: ctx.user.name || `User ${ctx.user.id}`,
          email: ctx.user.email || `user${ctx.user.id}@idlr.local`,
          role: ctx.user.role || 'user',
        });
        return { success: true };
      }),
  }),

  support: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./supportRepository');
      return {
        tickets: await repo.listSupportTickets(),
        analytics: await repo.getSupportAnalytics(),
        knowledgeBase: await repo.listKnowledgeBaseArticles(),
        faqs: await repo.listFaqs(),
      };
    }),

    createTicket: protectedProcedure
      .input(z.object({
        subject: z.string().min(5),
        category: z.enum(['account', 'payments', 'registry', 'technical', 'compliance']),
        priority: z.enum(['low', 'medium', 'high', 'urgent']),
        channel: z.enum(['portal', 'live_chat', 'email']).default('portal'),
        customerName: z.string().min(2),
        customerEmail: z.string().email(),
        message: z.string().min(5),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./supportRepository');
        return await repo.createSupportTicket(input);
      }),

    addMessage: protectedProcedure
      .input(z.object({
        ticketId: z.number(),
        senderType: z.enum(['customer', 'support']),
        senderName: z.string().min(2),
        message: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./supportRepository');
        return await repo.addSupportMessage(input);
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        ticketId: z.number(),
        status: z.enum(['open', 'in_progress', 'waiting_on_customer', 'resolved']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./supportRepository');
        return await repo.updateSupportTicketStatus(input);
      }),

    createKnowledgeBaseArticle: protectedProcedure
      .input(z.object({
        title: z.string().min(5),
        category: z.enum(['getting_started', 'payments', 'verification', 'privacy', 'registry']),
        summary: z.string().min(10),
        content: z.string().min(20),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!['admin', 'registrar'].includes(ctx.user.role || 'user')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only privileged users can publish knowledge-base content' });
        }
        const repo = await import('./supportRepository');
        return await repo.createKnowledgeBaseArticle(input);
      }),

    createFaq: protectedProcedure
      .input(z.object({
        question: z.string().min(5),
        answer: z.string().min(10),
        category: z.string().min(2),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!['admin', 'registrar'].includes(ctx.user.role || 'user')) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only privileged users can manage FAQ content' });
        }
        const repo = await import('./supportRepository');
        return await repo.createFaq(input);
      }),
  }),

  marketing: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./marketingRepository');
      return await repo.getMarketingOverview();
    }),

    createCampaign: protectedProcedure
      .input(z.object({
        name: z.string().min(3),
        channel: z.enum(['email', 'sms', 'push']),
        audience: z.string().min(2),
        scheduledFor: z.string().min(5),
        message: z.string().min(10),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./marketingRepository');
        return await repo.createCampaign(input);
      }),

    updateCampaignStatus: protectedProcedure
      .input(z.object({
        campaignId: z.number(),
        status: z.enum(['draft', 'scheduled', 'active', 'completed']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./marketingRepository');
        return await repo.updateCampaignStatus(input);
      }),

    createLandingPage: protectedProcedure
      .input(z.object({
        name: z.string().min(3),
        slug: z.string().min(3),
        headline: z.string().min(5),
        body: z.string().min(10),
        ctaLabel: z.string().min(2),
        variant: z.enum(['A', 'B']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./marketingRepository');
        return await repo.createLandingPage(input);
      }),

    createExperiment: protectedProcedure
      .input(z.object({
        name: z.string().min(3),
        hypothesis: z.string().min(10),
        variantA: z.string().min(3),
        variantB: z.string().min(3),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./marketingRepository');
        return await repo.createExperiment(input);
      }),
  }),

  iot: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./iotRepository');
      return await repo.getIoTOverview();
    }),

    registerDevice: protectedProcedure
      .input(z.object({
        name: z.string().min(3),
        category: z.enum(['environmental_sensor', 'access_control', 'utility_meter']),
        location: z.string().min(3),
        status: z.enum(['online', 'offline', 'maintenance']),
        firmwareVersion: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./iotRepository');
        return await repo.registerIoTDevice(input);
      }),

    addEnvironmentalReading: protectedProcedure
      .input(z.object({
        deviceId: z.number(),
        temperatureCelsius: z.number(),
        humidityPercent: z.number(),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./iotRepository');
        return await repo.addEnvironmentalReading(input);
      }),

    addAccessControlEvent: protectedProcedure
      .input(z.object({
        deviceId: z.number(),
        actor: z.string().min(2),
        credentialType: z.enum(['badge', 'biometric', 'temporary_code']),
        outcome: z.enum(['granted', 'denied']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./iotRepository');
        return await repo.addAccessControlEvent(input);
      }),

    addUtilityMeterReading: protectedProcedure
      .input(z.object({
        deviceId: z.number(),
        meterType: z.enum(['electricity', 'water', 'gas']),
        usage: z.number(),
        unit: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./iotRepository');
        return await repo.addUtilityMeterReading(input);
      }),

    createMaintenanceAlert: protectedProcedure
      .input(z.object({
        deviceId: z.number(),
        severity: z.enum(['medium', 'high']),
        title: z.string().min(5),
        recommendation: z.string().min(10),
        predictedFailureWindow: z.string().min(3),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./iotRepository');
        return await repo.createMaintenanceAlert(input);
      }),
  }),

  utility: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./utilityRepository');
      return repo.getUtilityOverview();
    }),

    createConnection: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        utilityType: z.enum(['electricity', 'water', 'sewage', 'gas', 'telecom']),
        providerName: z.string().min(2),
        accountReference: z.string().min(2),
        status: z.enum(['pending', 'active', 'suspended', 'closed']),
        serviceAddress: z.string().min(5),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./utilityRepository');
        return repo.createUtilityConnection(input);
      }),

    createClearance: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        utilityTypes: z.array(z.string()).min(1),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./utilityRepository');
        return repo.createUtilityClearance(input);
      }),

    recordPayment: protectedProcedure
      .input(z.object({
        connectionId: z.number(),
        amount: z.number().positive(),
        paymentMethod: z.enum(['bank_transfer', 'card', 'wallet']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./utilityRepository');
        return repo.recordUtilityPayment(input);
      }),
  }),

  community: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./communityRepository');
      return repo.getCommunityOverview();
    }),

    createForumPost: protectedProcedure
      .input(z.object({
        title: z.string().min(3),
        category: z.string().min(2),
        author: z.string().min(2),
        excerpt: z.string().min(10),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./communityRepository');
        return repo.createForumPost(input);
      }),

    createTownHall: protectedProcedure
      .input(z.object({
        title: z.string().min(3),
        scheduledFor: z.string().min(5),
        venue: z.string().min(3),
        status: z.enum(['scheduled', 'completed']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./communityRepository');
        return repo.createTownHall(input);
      }),

    createFeedback: protectedProcedure
      .input(z.object({
        subject: z.string().min(3),
        submitter: z.string().min(2),
        channel: z.string().min(2),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./communityRepository');
        return repo.createFeedback(input);
      }),

    createPoll: protectedProcedure
      .input(z.object({
        question: z.string().min(5),
        options: z.array(z.string().min(1)).min(2),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./communityRepository');
        return repo.createPoll(input);
      }),

    createProposal: protectedProcedure
      .input(z.object({
        title: z.string().min(3),
        proposer: z.string().min(2),
        area: z.string().min(2),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./communityRepository');
        return repo.createProposal(input);
      }),

    createBudget: protectedProcedure
      .input(z.object({
        initiative: z.string().min(3),
        allocatedAmount: z.number().positive(),
        status: z.enum(['draft', 'voting', 'approved']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./communityRepository');
        return repo.createBudget(input);
      }),

    createNotification: protectedProcedure
      .input(z.object({
        title: z.string().min(3),
        message: z.string().min(5),
        audience: z.string().min(2),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./communityRepository');
        return repo.createCommunityNotification(input);
      }),
  }),

  heritage: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./heritageRepository');
      return repo.getHeritageOverview();
    }),

    createSite: protectedProcedure
      .input(z.object({
        siteName: z.string().min(3),
        designation: z.string().min(3),
        overlayZone: z.string().min(2),
        archaeologicalRequirement: z.string().min(5),
        monitoringStatus: z.enum(['active', 'review']),
        unescoReference: z.string().nullable(),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./heritageRepository');
        return repo.createHeritageSite(input);
      }),

    createClearance: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        siteName: z.string().min(3),
        impactAssessment: z.string().min(10),
        status: z.enum(['pending', 'approved', 'conditional']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./heritageRepository');
        return repo.createHeritageClearance(input);
      }),
  }),

  agricultural: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./agriculturalRepository');
      return repo.getAgriculturalOverview();
    }),

    createParcel: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        cropType: z.string().min(2),
        soilQuality: z.string().min(3),
        irrigationSystem: z.string().min(3),
        subsidyProgram: z.string().min(2),
        extensionOfficer: z.string().min(2),
        productivityIndex: z.number().min(0).max(100),
        weatherOutlook: z.string().min(3),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./agriculturalRepository');
        return repo.createAgriculturalParcel(input);
      }),
  }),

  coastal: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./coastalRepository');
      return repo.getCoastalOverview();
    }),

    createZone: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        erosionRisk: z.string().min(2),
        setbackMeters: z.number().min(0),
        beachAccessPlan: z.string().min(3),
        marineProtectedArea: z.string().min(2),
        developmentPermitStatus: z.string().min(3),
        seaLevelImpactAssessment: z.string().min(3),
        coastalInfrastructure: z.string().min(3),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./coastalRepository');
        return repo.createCoastalZone(input);
      }),
  }),

  forest: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./forestRepository');
      return repo.getForestOverview();
    }),

    createReserve: protectedProcedure
      .input(z.object({
        reserveName: z.string().min(3),
        boundaryDescription: z.string().min(3),
        deforestationStatus: z.string().min(3),
        loggingPermitStatus: z.string().min(3),
        reforestationPlan: z.string().min(3),
        carbonCreditEstimate: z.number().min(0),
        wildlifeCorridor: z.string().min(3),
        fireRiskLevel: z.string().min(2),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./forestRepository');
        return repo.createForestReserve(input);
      }),
  }),

  infrastructure: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./infrastructureRepository');
      return repo.getInfrastructureOverview();
    }),

    createProject: protectedProcedure
      .input(z.object({
        projectName: z.string().min(3),
        roadNetworkSegment: z.string().min(3),
        rightOfWayStatus: z.string().min(3),
        projectTrackingStatus: z.string().min(3),
        utilityCorridor: z.string().min(3),
        landAcquisitionStatus: z.string().min(3),
        compensationEstimate: z.number().min(0),
        impactAssessment: z.string().min(3),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./infrastructureRepository');
        return repo.createInfrastructureProject(input);
      }),
  }),

  dataGovernance: router({
    overview: protectedProcedure.query(async () => {
      const repo = await import('./dataGovernanceRepository');
      return repo.getDataGovernanceOverview();
    }),

    createRecord: protectedProcedure
      .input(z.object({
        domain: z.string().min(3),
        qualityScore: z.number().min(0).max(100),
        cleansingStatus: z.string().min(3),
        lineagePath: z.string().min(3),
        masterRecord: z.string().min(3),
        catalogEntry: z.string().min(3),
        governancePolicy: z.string().min(3),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./dataGovernanceRepository');
        return repo.createDataGovernanceRecord(input);
      }),
  }),

  // Parcel Management
  parcels: router({
    search: publicProcedure
      .input(z.object({
        query: z.string().optional(),
        state: z.string().optional(),
        lga: z.string().optional(),
        status: z.string().optional(),
        priceMin: z.number().optional(),
        priceMax: z.number().optional(),
        areaMin: z.number().optional(),
        areaMax: z.number().optional(),
        landUseType: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        try {
          return await parcelService.get('/api/v1/parcels', input);
        } catch (error) {
          const { getCachedParcelSearch } = await import('./productionQueryCache');
          return await getCachedParcelSearch(input);
        }
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        try {
          return await parcelService.get(`/api/v1/parcels/${input.id}`);
        } catch (error) {
          const { getCachedParcelById } = await import('./productionQueryCache');
          const parcel = await getCachedParcelById(input.id);
          if (!parcel) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcel not found' });
          }
          return parcel;
        }
      }),

    getByNumber: publicProcedure
      .input(z.object({ parcelNumber: z.string() }))
      .query(async ({ input }) => {
        try {
          return await parcelService.get(`/api/v1/parcels/number/${input.parcelNumber}`);
        } catch (error) {
          const { getCachedParcelByNumber } = await import('./productionQueryCache');
          const parcel = await getCachedParcelByNumber(input.parcelNumber);
          if (!parcel) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Parcel not found' });
          }
          return parcel;
        }
      }),

    create: protectedProcedure
      .input(z.object({
        surveyPlanNumber: z.string(),
        state: z.string(),
        lga: z.string(),
        ward: z.string().optional(),
        streetAddress: z.string().optional(),
        areaSquareMeters: z.number(),
        geometryGeoJSON: z.string(),
        landUseType: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await parcelService.post('/api/v1/parcels', {
            ...input,
            surveyorId: ctx.user.id,
          });
        } catch (error) {
          const created = await createParcel({
            ...input,
            surveyorId: String(ctx.user.id),
          });
          const { invalidateParcelQueryCaches } = await import('./productionQueryCache');
          await invalidateParcelQueryCaches(created.id, created.parcelNumber);
          return created;
        }
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.object({
          streetAddress: z.string().optional(),
          landUseType: z.string().optional(),
          notes: z.string().optional(),
        }),
      }))
      .mutation(async ({ input }) => {
        try {
          return await parcelService.put(`/api/v1/parcels/${input.id}`, input.data);
        } catch (error) {
          const updated = updateParcelInRepository(input.id, input.data);
          const { invalidateParcelQueryCaches } = await import('./productionQueryCache');
          await invalidateParcelQueryCaches(updated.id, updated.parcelNumber);
          return updated;
        }
      }),

    verify: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await parcelService.post(`/api/v1/parcels/${input.id}/verify`, {
            verifierId: ctx.user.id,
          });
        } catch (error) {
          const verified = verifyParcelInRepository(input.id, String(ctx.user.id));
          const { invalidateParcelQueryCaches } = await import('./productionQueryCache');
          await invalidateParcelQueryCaches(verified.id, verified.parcelNumber);
          return verified;
        }
      }),

    batchAssign: protectedProcedure
      .input(z.object({
        parcelIds: z.array(z.number()).min(1),
        surveyorId: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        try {
          return await parcelService.post('/api/v1/parcels/batch/assign', input);
        } catch (error) {
          const updated = batchAssignParcels(input.parcelIds, input.surveyorId);
          const { invalidateParcelQueryCaches } = await import('./productionQueryCache');
          for (const parcel of updated) {
            await invalidateParcelQueryCaches(parcel.id, parcel.parcelNumber);
          }
          return updated;
        }
      }),

    batchVerify: protectedProcedure
      .input(z.object({
        parcelIds: z.array(z.number()).min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await parcelService.post('/api/v1/parcels/batch/verify', {
            parcelIds: input.parcelIds,
            verifierId: ctx.user.id,
          });
        } catch (error) {
          const updated = batchVerifyParcels(input.parcelIds, String(ctx.user.id));
          const { invalidateParcelQueryCaches } = await import('./productionQueryCache');
          for (const parcel of updated) {
            await invalidateParcelQueryCaches(parcel.id, parcel.parcelNumber);
          }
          return updated;
        }
      }),

    geospatialSearch: publicProcedure
      .input(z.object({
        centerLat: z.number(),
        centerLng: z.number(),
        radiusKm: z.number().default(5),
        limit: z.number().default(50),
      }))
      .query(async ({ input }) => {
        try {
          return await parcelService.get('/api/v1/parcels/geospatial/search', input);
        } catch (error) {
          return geospatialParcelSearch(input);
        }
      }),

    recordOnBlockchain: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        return await blockchainService.post('/api/v1/blockchain/record/parcel', {
          parcelId: input.id,
        });
      }),
  }),

  // Title Management
  titles: router({
    search: publicProcedure
      .input(z.object({
        query: z.string().optional(),
        ownerId: z.number().optional(),
        parcelId: z.number().optional(),
        status: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        try {
          return await titleService.get('/api/v1/titles', input);
        } catch (error) {
          return await searchTitles(input);
        }
      }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        try {
          return await titleService.get(`/api/v1/titles/${input.id}`);
        } catch (error) {
          const title = await getTitleById(input.id);
          if (!title) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Title not found' });
          }
          return title;
        }
      }),

    getByNumber: publicProcedure
      .input(z.object({ titleNumber: z.string() }))
      .query(async ({ input }) => {
        try {
          return await titleService.get(`/api/v1/titles/number/${input.titleNumber}`);
        } catch (error) {
          const title = await getTitleByNumber(input.titleNumber);
          if (!title) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Title not found' });
          }
          return title;
        }
      }),

    getByOwner: protectedProcedure
      .query(async ({ ctx }) => {
        try {
          return await titleService.get('/api/v1/titles', { ownerId: ctx.user.id });
        } catch (error) {
          return await getTitlesByOwner(Number(ctx.user.id));
        }
      }),

    create: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        ownerId: z.number(),
        ownershipType: z.string(),
        ownershipPercentage: z.number().default(100),
        titleType: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          return await titleService.post('/api/v1/titles', input);
        } catch (error) {
          return await createTitle(input);
        }
      }),

    verify: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        try {
          return await blockchainService.post('/api/v1/blockchain/record/title', {
            titleId: input.id,
          });
        } catch (error) {
          return await verifyTitle(input.id);
        }
      }),
  }),

  // Transaction Management
  transactions: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        type: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        try {
          return await transactionService.get('/api/v1/transactions', input);
        } catch (error) {
          const { getCachedTransactionList } = await import('./productionQueryCache');
          return await getCachedTransactionList(input);
        }
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        try {
          return await transactionService.get(`/api/v1/transactions/${input.id}`);
        } catch (error) {
          const { getCachedTransactionById } = await import('./productionQueryCache');
          const transaction = await getCachedTransactionById(input.id);
          if (!transaction) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
          }
          return transaction;
        }
      }),

    getMyTransactions: protectedProcedure
      .query(async ({ ctx }) => {
        try {
          return await transactionService.get('/api/v1/transactions', {
            initiatorId: ctx.user.id,
          });
        } catch (error) {
          const fallback = await listTransactions({ page: 1, limit: 100 });
          return fallback.transactions.filter((transaction) => transaction.initiatorId === Number(ctx.user.id));
        }
      }),

    initiate: protectedProcedure
      .input(z.object({
        type: z.enum(['registration', 'transfer', 'subdivision', 'consolidation', 'mortgage', 'lease']),
        parcelId: z.number(),
        toOwnerId: z.number().optional(),
        transactionAmount: z.number().optional(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await transactionService.post('/api/v1/transactions', {
            ...input,
            initiatorId: ctx.user.id,
          });
        } catch (error) {
          const created = await createTransaction({
            type: input.type,
            parcelId: input.parcelId,
            initiatorId: Number(ctx.user.id),
            initiatorName: ctx.user.name || `User ${ctx.user.id}`,
            counterpartyName: input.toOwnerId ? `Owner ${input.toOwnerId}` : undefined,
            considerationAmount: input.transactionAmount ?? 0,
            notes: input.description,
          });
          const { invalidateTransactionQueryCaches } = await import('./productionQueryCache');
          await invalidateTransactionQueryCaches(created.id);

          return {
            ...created,
            toOwnerId: input.toOwnerId,
            transactionAmount: input.transactionAmount,
            description: input.description,
          };
        }
      }),

    approve: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        let result;
        try {
          result = await transactionService.post(`/api/v1/transactions/${input.id}/approve`, {
            approverId: ctx.user.id,
          });
        } catch (error) {
          result = await advanceTransaction(input.id, 'approve');
        }

        if (result.initiatorId) {
          const notification = notificationService.createTransactionApprovedNotification(
            result.initiatorId,
            input.id,
            (result as any).parcelNumber || `Parcel ${result.parcelId}`
          );
          notificationService.sendNotification(notification);
        }

        const { invalidateTransactionQueryCaches } = await import('./productionQueryCache');
        await invalidateTransactionQueryCaches(input.id);
        return result;
      }),

    reject: protectedProcedure
      .input(z.object({
        id: z.number(),
        reason: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        let result;
        try {
          result = await transactionService.post(`/api/v1/transactions/${input.id}/reject`, {
            rejectorId: ctx.user.id,
            reason: input.reason,
          });
        } catch (error) {
          result = await advanceTransaction(input.id, 'reject');
        }

        if (result.initiatorId) {
          const notification = notificationService.createTransactionRejectedNotification(
            result.initiatorId,
            input.id,
            (result as any).parcelNumber || `Parcel ${result.parcelId}`,
            input.reason
          );
          notificationService.sendNotification(notification);
        }

        const { invalidateTransactionQueryCaches } = await import('./productionQueryCache');
        await invalidateTransactionQueryCaches(input.id);
        return result;
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        try {
          return await transactionService.post(`/api/v1/transactions/${input.id}/complete`, {});
        } catch (error) {
          const completed = await advanceTransaction(input.id, 'complete');
          const { invalidateTransactionQueryCaches } = await import('./productionQueryCache');
          await invalidateTransactionQueryCaches(input.id);
          return completed;
        }
      }),
  }),

  // Payment Management
  payments: router({
    getByTransaction: protectedProcedure
      .input(z.object({ transactionId: z.number() }))
      .query(async ({ input }) => {
        try {
          return await paymentService.get('/api/v1/payments', {
            transactionId: input.transactionId,
          });
        } catch (error) {
          return {
            payments: await listPaymentsByTransaction(input.transactionId),
          };
        }
      }),

    process: protectedProcedure
      .input(z.object({
        transactionId: z.number(),
        amount: z.number(),
        currency: z.string().default('NGN'),
        method: z.enum(['mojaloop', 'tigerbeetle', 'card', 'bank_transfer', 'ussd']),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await paymentService.post('/api/v1/payments', {
            ...input,
            payerId: ctx.user.id,
          });
        } catch (error) {
          return await processPaymentRecord({
            transactionId: input.transactionId,
            payerId: Number(ctx.user.id),
            amount: input.amount,
            currency: input.currency,
            method: input.method,
          });
        }
      }),

    confirm: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        try {
          return await paymentService.post(`/api/v1/payments/${input.id}/confirm`, {});
        } catch (error) {
          return await confirmPaymentRecord(input.id);
        }
      }),

    downloadReceipt: protectedProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(async ({ input }) => {
        const buffer = await generatePaymentReceiptPdf(input.transactionId);
        const { payment } = await buildPaymentReceipt(input.transactionId);
        return {
          data: buffer.toString('base64'),
          filename: `${payment.receiptNumber || payment.reference}.pdf`,
          mimeType: 'application/pdf',
          payment,
        };
      }),
  }),

  // Document Management
  documents: router({
    list: publicProcedure
      .query(async () => {
        return await listAllDocuments();
      }),

    getByParcel: publicProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        try {
          return await documentService.get('/api/v1/documents', {
            parcelId: input.parcelId,
          });
        } catch (error) {
          return await getDocumentsByParcel(input.parcelId);
        }
      }),

    getByTransaction: protectedProcedure
      .input(z.object({ transactionId: z.number() }))
      .query(async ({ input }) => {
        try {
          return await documentService.get('/api/v1/documents', {
            transactionId: input.transactionId,
          });
        } catch (error) {
          return await getDocumentsByTransaction(input.transactionId);
        }
      }),

    upload: protectedProcedure
      .input(z.object({
        parcelId: z.number().optional(),
        titleId: z.number().optional(),
        transactionId: z.number().optional(),
        type: z.string(),
        title: z.string(),
        description: z.string().optional(),
        fileKey: z.string(),
        fileUrl: z.string(),
        fileName: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await documentService.post('/api/v1/documents', {
            ...input,
            uploadedBy: ctx.user.id,
          });
        } catch (error) {
          return await uploadDocumentRecord({
            ...input,
            uploadedBy: ctx.user.id,
          });
        }
      }),

    verify: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await documentService.post(`/api/v1/documents/${input.id}/verify`, {
            verifierId: ctx.user.id,
          });
        } catch (error) {
          return await verifyDocumentRecord({
            id: input.id,
            verifierId: ctx.user.id,
          });
        }
      }),
  }),

  // Blockchain Verification
  blockchain: router({
    verifyTransaction: publicProcedure
      .input(z.object({ hash: z.string() }))
      .query(async ({ input }) => {
        const { verifyBlockchainTransaction } = await import('./blockchainExplorerRepository');
        const repositoryResult = await verifyBlockchainTransaction(input.hash);
        if (repositoryResult.verified) {
          return repositoryResult;
        }

        try {
          const result = await fabricClient.verifyTransaction(input.hash);
          return {
            verified: true,
            hash: input.hash,
            blockNumber: result.blockNumber,
            timestamp: result.timestamp,
            parcelId: result.parcelId,
            transactionType: result.transactionType,
            metadata: result.metadata,
          };
        } catch (error) {
          try {
            const result = await blockchainService.get(`/api/v1/blockchain/verify/${input.hash}`);
            return {
              verified: true,
              hash: input.hash,
              ...result,
            };
          } catch {
            return repositoryResult;
          }
        }
      }),

    verify: publicProcedure
      .input(z.object({ txHash: z.string() }))
      .query(async ({ input }) => {
        try {
          return await fabricClient.verifyTransaction(input.txHash);
        } catch (error) {
          return await blockchainService.get(`/api/v1/blockchain/verify/${input.txHash}`);
        }
      }),

    submitTitleTransfer: protectedProcedure
      .input(z.object({
        parcelId: z.string(),
        fromOwner: z.string(),
        toOwner: z.string(),
        transactionId: z.string(),
        amount: z.number(),
      }))
      .mutation(async ({ input }) => {
        return await fabricClient.submitTitleTransfer(
          input.parcelId,
          input.fromOwner,
          input.toOwner,
          input.transactionId,
          input.amount
        );
      }),

    queryTitleHistory: publicProcedure
      .input(z.object({ parcelId: z.string() }))
      .query(async ({ input }) => {
        return await fabricClient.queryTitleHistory(input.parcelId);
      }),

    createEscrow: protectedProcedure
      .input(z.object({
        escrowId: z.string(),
        parcelId: z.string(),
        buyer: z.string(),
        seller: z.string(),
        amount: z.number(),
        releaseConditions: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        return await fabricClient.createEscrow(
          input.escrowId,
          input.parcelId,
          input.buyer,
          input.seller,
          input.amount,
          input.releaseConditions
        );
      }),

    releaseEscrow: protectedProcedure
      .input(z.object({
        escrowId: z.string(),
        approver: z.string(),
      }))
      .mutation(async ({ input }) => {
        return await fabricClient.releaseEscrow(input.escrowId, input.approver);
      }),

    getEscrowStatus: publicProcedure
      .input(z.object({ escrowId: z.string() }))
      .query(async ({ input }) => {
        return await fabricClient.getEscrowStatus(input.escrowId);
      }),
  }),

  // Reports & Analytics
  reports: router({
    generate: protectedProcedure
      .input(z.object({
        template: z.enum(['parcel_registry', 'transaction_summary', 'financial_overview']),
        format: z.enum(['pdf', 'excel', 'csv']),
        fields: z.array(z.string()),
        filters: z.record(z.string(), z.any()).optional(),
        sorting: z.object({
          field: z.string(),
          direction: z.enum(['asc', 'desc']),
        }).optional(),
        groupBy: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { generateReport } = await import('./reportGeneration');
        
        const buffer = await generateReport(input);
        
        // Convert buffer to base64 for transmission
        const base64 = buffer.toString('base64');
        
        return {
          data: base64,
          filename: `${input.template}_${new Date().toISOString().slice(0, 10)}.${input.format}`,
          mimeType: getMimeType(input.format),
        };
      }),
  }),

  // Drone Imagery Processing
  drone: router({
    submitImagery: protectedProcedure
      .input(z.object({
        images: z.array(z.string()),
        name: z.string(),
        parcelId: z.string().optional(),
        options: z.object({
          dsm: z.boolean().optional(),
          dtm: z.boolean().optional(),
          orthophoto: z.boolean().optional(),
          pointCloud: z.boolean().optional(),
          mesh: z.boolean().optional(),
          gcp: z.string().optional(),
          geoLocation: z.boolean().optional(),
        }).optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          return await odmService.submitDroneImagery(input);
        } catch (error) {
          return await createDroneProcessingTask(input);
        }
      }),

    getTaskStatus: protectedProcedure
      .input(z.object({ taskId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await odmService.getTaskStatus(input.taskId);
        } catch (error) {
          const task = await getDroneProcessingTask(input.taskId);
          if (!task) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Drone processing task not found' });
          }
          return task;
        }
      }),

    listTasks: protectedProcedure
      .query(async () => {
        try {
          return await odmService.listTasks();
        } catch (error) {
          return await listDroneProcessingTasks();
        }
      }),

    cancelTask: protectedProcedure
      .input(z.object({ taskId: z.string() }))
      .mutation(async ({ input }) => {
        try {
          await odmService.cancelTask(input.taskId);
          return { success: true };
        } catch (error) {
          const success = await cancelDroneProcessingTask(input.taskId);
          if (!success) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Drone processing task not found' });
          }
          return { success };
        }
      }),

    extractBuildingFootprints: protectedProcedure
      .input(z.object({ orthophotoUrl: z.string() }))
      .mutation(async ({ input }) => {
        try {
          return await odmService.extractBuildingFootprints(input.orthophotoUrl);
        } catch (error) {
          // Return mock data when AI service is not available
          return {
            detections: [],
            message: 'Building detection service unavailable',
          };
        }
      }),
  }),

  // Tax Assessment & Payment
  tax: router({
    calculateTax: protectedProcedure
      .input(z.object({
        parcelId: z.string(),
        propertyValue: z.number(),
        landArea: z.number(),
        landUseType: z.enum(['residential', 'commercial', 'industrial', 'agricultural', 'mixed']),
        state: z.string(),
        lga: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          return await firsService.calculatePropertyTax(input);
        } catch (error) {
          return await calculateTaxAssessment(input);
        }
      }),

    getTaxAssessment: protectedProcedure
      .input(z.object({ assessmentId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await firsService.getTaxAssessment(input.assessmentId);
        } catch (error) {
          const assessment = getTaxAssessmentFromRepository(input.assessmentId);
          if (!assessment) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax assessment not found' });
          }
          return assessment;
        }
      }),

    getTaxHistory: publicProcedure
      .input(z.object({ parcelId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await firsService.getTaxHistory(input.parcelId);
        } catch (error) {
          return await getTaxHistoryByParcel(input.parcelId);
        }
      }),

    submitPayment: protectedProcedure
      .input(z.object({
        assessmentId: z.string(),
        amount: z.number(),
        paymentMethod: z.enum(['bank_transfer', 'card', 'ussd', 'pos']),
      }))
      .mutation(async ({ input }) => {
        try {
          return await firsService.submitTaxPayment(
            input.assessmentId,
            input.amount,
            input.paymentMethod
          );
        } catch (error) {
          return await submitTaxPaymentRecord(
            input.assessmentId,
            input.amount,
            input.paymentMethod
          );
        }
      }),

    verifyTIN: publicProcedure
      .input(z.object({ tin: z.string() }))
      .query(async ({ input }) => {
        const remote = await firsService.verifyTIN(input.tin);
        return remote.valid ? remote : await verifyTinRecord(input.tin);
      }),

    generateClearance: protectedProcedure
      .input(z.object({
        parcelId: z.string(),
        ownerName: z.string(),
        ownerTin: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          return await firsService.generateTaxClearance(
            input.parcelId,
            input.ownerName,
            input.ownerTin
          );
        } catch (error) {
          return await generateTaxClearanceRecord(
            input.parcelId,
            input.ownerName,
            input.ownerTin
          );
        }
      }),

    verifyClearance: publicProcedure
      .input(z.object({ certificateId: z.string() }))
      .query(async ({ input }) => {
        try {
          return await firsService.verifyTaxClearance(input.certificateId);
        } catch (error) {
          const clearance = await verifyTaxClearanceRecord(input.certificateId);
          if (!clearance) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax clearance certificate not found' });
          }
          return clearance;
        }
      }),
  }),


  // Bulk Import
  bulkImport: router({
    parcels: protectedProcedure
      .input(z.array(z.object({
        parcel_id: z.string(),
        owner_name: z.string(),
        area: z.number(),
        coordinates: z.string(),
        land_use: z.string(),
        status: z.string(),
      })))
      .mutation(async ({ input }) => {
        return await bulkImportService.importParcels(input);
      }),

    documents: protectedProcedure
      .input(z.array(z.object({
        document_id: z.string(),
        parcel_id: z.string(),
        document_type: z.string(),
        file_url: z.string(),
        upload_date: z.string(),
      })))
      .mutation(async ({ input }) => {
        return await bulkImportService.importDocuments(input);
      }),

    transactions: protectedProcedure
      .input(z.array(z.object({
        transaction_id: z.string(),
        parcel_id: z.string(),
        type: z.string(),
        amount: z.number(),
        date: z.string(),
        status: z.string(),
      })))
      .mutation(async ({ input }) => {
        return await bulkImportService.importTransactions(input);
      }),

    export: protectedProcedure
      .input(z.object({
        type: z.enum(['parcels', 'documents', 'transactions', 'users']),
      }))
      .query(async ({ input }) => {
        return await bulkImportService.exportBulkData(input.type);
      }),
  }),

  // Comments
  comments: router({
    list: protectedProcedure
      .input(z.object({
        entityType: z.enum(['parcel', 'transaction']),
        entityId: z.string(),
      }))
      .query(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { comments, users } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const results = await db
          .select({
            id: comments.id,
            userId: comments.userId,
            userName: users.name,
            content: comments.content,
            createdAt: comments.createdAt,
            updatedAt: comments.updatedAt,
          })
          .from(comments)
          .leftJoin(users, eq(comments.userId, users.id))
          .where(
            and(
              eq(comments.entityType, input.entityType),
              eq(comments.entityId, input.entityId)
            )
          )
          .orderBy(comments.createdAt);

        return results.map(r => ({
          id: String(r.id),
          userId: r.userId,
          userName: r.userName || 'Unknown User',
          userAvatar: undefined,
          content: r.content,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          isEdited: r.updatedAt && r.createdAt && r.updatedAt.getTime() > r.createdAt.getTime(),
        }));
      }),

    add: protectedProcedure
      .input(z.object({
        entityType: z.enum(['parcel', 'transaction']),
        entityId: z.string(),
        content: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { comments } = await import('../drizzle/schema');

        const [result] = await db.insert(comments).values({
          userId: ctx.user.id,
          entityType: input.entityType,
          entityId: input.entityId,
          content: input.content,
        }).returning({ id: comments.id });

        const { notificationService } = await import('./notifications');
        const { users } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, ctx.user.id));
        
        notificationService.broadcastCommentAdded(input.entityType, input.entityId, {
          id: String(result.id),
          userId: ctx.user.id,
          userName: user?.name || 'Unknown User',
          content: input.content,
          createdAt: new Date(),
        });

        return { id: String(result.id) };
      }),

    edit: protectedProcedure
      .input(z.object({
        id: z.string(),
        content: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { comments } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const [comment] = await db
          .select({ entityType: comments.entityType, entityId: comments.entityId })
          .from(comments)
          .where(eq(comments.id, parseInt(input.id)));

        await db
          .update(comments)
          .set({ content: input.content })
          .where(
            and(
              eq(comments.id, parseInt(input.id)),
              eq(comments.userId, ctx.user.id)
            )
          );

        if (comment) {
          const { notificationService } = await import('./notifications');
          notificationService.broadcastCommentEdited(
            comment.entityType,
            comment.entityId,
            input.id,
            input.content
          );
        }

        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { comments } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const [comment] = await db
          .select({ entityType: comments.entityType, entityId: comments.entityId })
          .from(comments)
          .where(eq(comments.id, parseInt(input.id)));

        await db
          .delete(comments)
          .where(
            and(
              eq(comments.id, parseInt(input.id)),
              eq(comments.userId, ctx.user.id)
            )
          );

        if (comment) {
          const { notificationService } = await import('./notifications');
          notificationService.broadcastCommentDeleted(
            comment.entityType,
            comment.entityId,
            input.id
          );
        }

        return { success: true };
      }),
  }),

  // Activity Logs
  activityLogs: router({
    list: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(10),
      }))
      .query(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { activityLogs, users } = await import('../drizzle/schema');
        const { eq, desc } = await import('drizzle-orm');

        const results = await db
          .select({
            id: activityLogs.id,
            userId: activityLogs.userId,
            userName: users.name,
            type: activityLogs.type,
            description: activityLogs.description,
            metadata: activityLogs.metadata,
            createdAt: activityLogs.createdAt,
          })
          .from(activityLogs)
          .leftJoin(users, eq(activityLogs.userId, users.id))
          .orderBy(desc(activityLogs.createdAt))
          .limit(input.limit);

        return results.map(r => ({
          id: String(r.id),
          userId: r.userId,
          userName: r.userName || 'Unknown User',
          userAvatar: undefined,
          type: r.type as any,
          description: r.description,
          metadata: r.metadata as Record<string, any> | undefined,
          createdAt: r.createdAt,
        }));
      }),
  }),

  // Saved Searches
  savedSearches: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { savedSearches } = await import('../drizzle/schema');
        const { eq, desc } = await import('drizzle-orm');

        const results = await db
          .select()
          .from(savedSearches)
          .where(eq(savedSearches.userId, ctx.user.id))
          .orderBy(desc(savedSearches.createdAt));

        return results.map(r => ({
          id: String(r.id),
          name: r.name,
          query: r.query as Record<string, any>,
          isFavorite: r.isFavorite,
          createdAt: r.createdAt,
        }));
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        query: z.record(z.string(), z.any()),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { savedSearches } = await import('../drizzle/schema');

        const [result] = await db.insert(savedSearches).values({
          userId: ctx.user.id,
          name: input.name,
          query: input.query,
          isFavorite: false,
        }).returning({ id: savedSearches.id });

        return { id: String(result.id) };
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { savedSearches } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        await db
          .delete(savedSearches)
          .where(
            and(
              eq(savedSearches.id, parseInt(input.id)),
              eq(savedSearches.userId, ctx.user.id)
            )
          );

        return { success: true };
      }),

    toggleFavorite: protectedProcedure
      .input(z.object({
        id: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const { requireDb } = await import('./db');
        const db = await requireDb();



        const { savedSearches } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const [current] = await db
          .select({ isFavorite: savedSearches.isFavorite })
          .from(savedSearches)
          .where(
            and(
              eq(savedSearches.id, parseInt(input.id)),
              eq(savedSearches.userId, ctx.user.id)
            )
          );

        if (current) {
          await db
            .update(savedSearches)
            .set({ isFavorite: !current.isFavorite })
            .where(
              and(
                eq(savedSearches.id, parseInt(input.id)),
                eq(savedSearches.userId, ctx.user.id)
              )
            );
        }

        return { success: true };
      }),
  }),

  // Report Generation (merged with existing reports router)

  // Admin User Management (admin-only)
  admin: router({  
    // List all users with pagination
    listUsers: protectedProcedure
      .input(z.object({
        page: z.number().default(1),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        
        return await adminService.getAllUsers(input.page, input.limit);
      }),
    
    // Update user role
    updateUserRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        newRole: z.enum(['user', 'surveyor', 'registrar', 'admin']),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        
        // Prevent users from demoting themselves
        if (ctx.user.id === input.userId && input.newRole !== 'admin') {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Cannot change your own role' 
          });
        }
        
        return await adminService.updateUserRole(input.userId, input.newRole, ctx.user.id);
      }),
    
    // Suspend user account
    suspendUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        
        // Prevent users from suspending themselves
        if (ctx.user.id === input.userId) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Cannot suspend your own account' 
          });
        }
        
        return await adminService.suspendUser(input.userId, input.reason, ctx.user.id);
      }),
    
    // Activate suspended user
    activateUser: protectedProcedure
      .input(z.object({
        userId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        
        return await adminService.activateUser(input.userId, ctx.user.id);
      }),
    
    // Get user activity logs
    getUserActivity: protectedProcedure
      .input(z.object({
        userId: z.number().optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ ctx, input }) => {
        // Check if user is admin
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        
        return await adminService.getUserActivityLogs(input.userId, input.limit);
      }),
    
    // Get user statistics
    getUserStats: protectedProcedure
      .query(async ({ ctx }) => {
        // Check if user is admin
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        
        return await adminService.getUserStats();
      }),
  }),

  // Parcel Verification Workflow
  verification: router({
    // Create new verification request
    create: protectedProcedure
      .input(z.object({
        parcelId: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await verificationService.createVerificationRequest(
          input.parcelId,
          ctx.user.id,
          input.notes
        );
      }),

    // Submit verification request for review
    submit: protectedProcedure
      .input(z.object({
        requestId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await verificationService.submitVerificationRequest(
          input.requestId,
          ctx.user.id
        );
      }),

    // Assign reviewer (admin/registrar only)
    assignReviewer: protectedProcedure
      .input(z.object({
        requestId: z.number(),
        reviewerId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'registrar') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins and registrars can assign reviewers' });
        }
        
        return await verificationService.assignReviewer(
          input.requestId,
          input.reviewerId,
          ctx.user.id
        );
      }),

    // Approve verification request (reviewer only)
    approve: protectedProcedure
      .input(z.object({
        requestId: z.number(),
        blockchainTxHash: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'registrar') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins and registrars can approve verifications' });
        }
        
        return await verificationService.approveVerificationRequest(
          input.requestId,
          ctx.user.id,
          input.blockchainTxHash
        );
      }),

    // Reject verification request (reviewer only)
    reject: protectedProcedure
      .input(z.object({
        requestId: z.number(),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin' && ctx.user.role !== 'registrar') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins and registrars can reject verifications' });
        }
        
        return await verificationService.rejectVerificationRequest(
          input.requestId,
          ctx.user.id,
          input.reason
        );
      }),

    // Add document to verification request
    addDocument: protectedProcedure
      .input(z.object({
        requestId: z.number(),
        documentType: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await verificationService.addVerificationDocument(
          input.requestId,
          input.documentType,
          input.fileName,
          input.fileUrl,
          input.fileSize,
          input.mimeType,
          ctx.user.id
        );
      }),

    // Get verification request details
    getDetails: protectedProcedure
      .input(z.object({
        requestId: z.number(),
      }))
      .query(async ({ input }) => {
        return await verificationService.getVerificationRequestDetails(input.requestId);
      }),

    // List verification requests with filters
    list: protectedProcedure
      .input(z.object({
        status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected']).optional(),
        requesterId: z.number().optional(),
        reviewerId: z.number().optional(),
        parcelId: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        return await verificationService.listVerificationRequests(
          {
            status: input.status,
            requesterId: input.requesterId,
            reviewerId: input.reviewerId,
            parcelId: input.parcelId,
          },
          input.page,
          input.limit
        );
      }),

    // Get verification history
    getHistory: protectedProcedure
      .input(z.object({
        requestId: z.number(),
      }))
      .query(async ({ input }) => {
        return await verificationService.getVerificationHistory(input.requestId);
      }),
  }),

  // Advanced Reporting
  reporting: router({
    // Create scheduled report
    createScheduled: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        reportType: z.string(),
        frequency: z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']),
        cronExpression: z.string().optional(),
        format: z.enum(['pdf', 'excel', 'csv']),
        emailDelivery: z.boolean(),
        emailRecipients: z.array(z.string()).optional(),
        filters: z.record(z.string(), z.any()).optional(),
        selectedFields: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await reportingService.createScheduledReport({
          userId: ctx.user.id,
          ...input,
        });
      }),

    // Generate report immediately
    generate: protectedProcedure
      .input(z.object({
        reportType: z.string(),
        format: z.enum(['pdf', 'excel', 'csv']),
        filters: z.record(z.string(), z.any()).optional(),
        selectedFields: z.array(z.string()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await reportingService.generateReport(ctx.user.id, input);
      }),

    // List scheduled reports
    listScheduled: protectedProcedure
      .input(z.object({
        includeInactive: z.boolean().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await reportingService.listScheduledReports(
          ctx.user.id,
          input.includeInactive
        );
      }),

    // Get report history
    getHistory: protectedProcedure
      .input(z.object({
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await reportingService.getReportHistory(ctx.user.id, input.limit);
      }),

    // Delete scheduled report
    deleteScheduled: protectedProcedure
      .input(z.object({
        reportId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        return await reportingService.deleteScheduledReport(input.reportId, ctx.user.id);
      }),

    // Update scheduled report
    updateScheduled: protectedProcedure
      .input(z.object({
        reportId: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        frequency: z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']).optional(),
        cronExpression: z.string().optional(),
        format: z.enum(['pdf', 'excel', 'csv']).optional(),
        emailDelivery: z.boolean().optional(),
        emailRecipients: z.array(z.string()).optional(),
        filters: z.record(z.string(), z.any()).optional(),
        selectedFields: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { reportId, ...updates } = input;
        return await reportingService.updateScheduledReport(reportId, ctx.user.id, updates);
      }),

    // Get report templates
    getTemplates: protectedProcedure
      .query(async () => {
        return await reportingService.getReportTemplates();
      }),
  }),

  // Statistics & Analytics
  stats: router({
    dashboard: protectedProcedure
      .query(async () => {
        const parcelFallback = await searchParcelRepository({ page: 1, limit: 1000 });
        const titleFallback = await searchTitles({ page: 1, limit: 1000 });
        const transactionFallback = await listTransactions({ page: 1, limit: 1000 });

        const fallbackStats = {
          parcels: {
            total: parcelFallback.total,
            verified: parcelFallback.parcels.filter((parcel) => parcel.status === 'verified' || parcel.status === 'registered').length,
            pending: parcelFallback.parcels.filter((parcel) => parcel.status === 'pending_verification' || parcel.status === 'disputed').length,
          },
          titles: {
            total: titleFallback.total,
            active: titleFallback.titles.filter((title) => title.status === 'verified' || title.status === 'registered' || title.status === 'encumbered').length,
            pending: titleFallback.titles.filter((title) => title.status === 'pending_verification' || title.status === 'draft').length,
          },
          transactions: {
            total: transactionFallback.total,
            completed: transactionFallback.transactions.filter((transaction) => transaction.status === 'completed' || transaction.status === 'registered').length,
            pending: transactionFallback.transactions.filter((transaction) => transaction.status === 'draft' || transaction.status === 'pending_approval' || transaction.status === 'pending_payment' || transaction.status === 'in_review').length,
          },
        };

        try {
          const [parcels, titles, transactions] = await Promise.all([
            parcelService.get('/api/v1/parcels/stats').catch(() => null),
            titleService.get('/api/v1/titles/stats').catch(() => null),
            transactionService.get('/api/v1/transactions/stats').catch(() => null),
          ]);

          return {
            parcels: parcels && parcels.total > 0 ? parcels : fallbackStats.parcels,
            titles: titles && titles.total > 0 ? titles : fallbackStats.titles,
            transactions: transactions && transactions.total > 0 ? transactions : fallbackStats.transactions,
          };
        } catch (error) {
          return fallbackStats;
        }
      }),
  }),

  // Admin Notifications
  notifications: router({
    list: protectedProcedure
      .input(z.object({
        limit: z.number().default(50),
        unreadOnly: z.boolean().default(false),
      }))
      .query(async ({ ctx, input }) => {
        const db = await requireDb();

        const conditions = [eq(adminNotifications.recipientId, ctx.user.id)];
        if (input.unreadOnly) {
          conditions.push(eq(adminNotifications.read, false));
        }

        const notifications = await db
          .select()
          .from(adminNotifications)
          .where(and(...conditions))
          .orderBy(desc(adminNotifications.createdAt))
          .limit(input.limit);

        return notifications;
      }),

    getUnreadCount: protectedProcedure
      .query(async ({ ctx }) => {
        const db = await requireDb();

        const unread = await db
          .select()
          .from(adminNotifications)
          .where(
            and(
              eq(adminNotifications.recipientId, ctx.user.id),
              eq(adminNotifications.read, false)
            )
          );

        return unread.length;
      }),

    markAsRead: protectedProcedure
      .input(z.object({
        notificationId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();

        await db
          .update(adminNotifications)
          .set({ read: true, readAt: new Date() })
          .where(
            and(
              eq(adminNotifications.id, input.notificationId),
              eq(adminNotifications.recipientId, ctx.user.id)
            )
          );

        return { success: true };
      }),

    markAllAsRead: protectedProcedure
      .mutation(async ({ ctx }) => {
        const db = await requireDb();

        await db
          .update(adminNotifications)
          .set({ read: true, readAt: new Date() })
          .where(
            and(
              eq(adminNotifications.recipientId, ctx.user.id),
              eq(adminNotifications.read, false)
            )
          );

        return { success: true };
      }),
  }),

  // Email Management
  email: router({
    queueStats: protectedProcedure
      .query(async () => {
        const { getEmailQueueStats } = await import('./emailQueueService');
        return await getEmailQueueStats();
      }),

    processQueue: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Only admins can manually trigger queue processing
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { processEmailQueue } = await import('./emailQueueService');
        return await processEmailQueue();
      }),

    retryFailed: protectedProcedure
      .mutation(async ({ ctx }) => {
        // Only admins can retry failed emails
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { retryFailedEmails } = await import('./emailQueueService');
        return await retryFailedEmails();
      }),
  }),

  // Blockchain Explorer
  blockchainExplorer: router({
    state: publicProcedure
      .query(async () => {
        const { getBlockchainExplorerState } = await import('./blockchainExplorerRepository');
        return await getBlockchainExplorerState();
      }),
    search: publicProcedure
      .input(z.object({ query: z.string().min(1) }))
      .query(async ({ input }) => {
        const { findBlockchainTransaction } = await import('./blockchainExplorerRepository');
        const result = await findBlockchainTransaction(input.query);
        if (!result) {
          throw new Error('Transaction not found');
        }
        return result;
      }),
  }),

  // Building Visualization
  buildingVisualization: router({
    state: protectedProcedure
      .query(async () => {
        const { getBuildingVisualizationState } = await import('./buildingVisualizationRepository');
        return await getBuildingVisualizationState();
      }),
  }),

  // Collaboration
  collaboration: router({
    state: protectedProcedure
      .query(async () => {
        const { getCollaborationState } = await import('./collaborationRepository');
        return await getCollaborationState();
      }),
    sendMessage: protectedProcedure
      .input(z.object({ message: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const { addCollaborationMessage } = await import('./collaborationRepository');
        const sender = ctx.user.fullName || ctx.user.email || `User ${ctx.user.id}`;
        return await addCollaborationMessage(sender, input.message);
      }),
  }),

  // Government Integration
  governmentIntegration: router({
    state: protectedProcedure
      .query(async () => {
        const { getGovernmentIntegrationState } = await import('./governmentIntegrationRepository');
        const state = await getGovernmentIntegrationState();
        return {
          integrations: state.integrations.map((item) => ({ ...item, lastSync: new Date(item.lastSync) })),
          recentVerifications: state.recentVerifications.map((item) => ({ ...item, timestamp: new Date(item.timestamp) })),
        };
      }),
    verifyNin: protectedProcedure
      .input(z.object({ nin: z.string().length(11) }))
      .mutation(async ({ input, ctx }) => {
        const { verifyNin } = await import('./identityVerificationRepository');
        const { recordGovernmentVerification } = await import('./governmentIntegrationRepository');
        const profile = await verifyNin(ctx.user.id, input.nin);
        const verification = await recordGovernmentVerification({
          type: 'NIN Verification',
          identifier: input.nin,
          name: profile.fullName,
          status: profile.nin.status === 'verified' ? 'verified' : 'failed',
        });
        return { profile, verification };
      }),
    verifyBvn: protectedProcedure
      .input(z.object({ bvn: z.string().length(11) }))
      .mutation(async ({ input, ctx }) => {
        const { verifyBvn } = await import('./identityVerificationRepository');
        const { recordGovernmentVerification } = await import('./governmentIntegrationRepository');
        const profile = await verifyBvn(ctx.user.id, input.bvn);
        const verification = await recordGovernmentVerification({
          type: 'BVN Verification',
          identifier: input.bvn,
          name: profile.fullName,
          status: profile.bvn.status === 'verified' ? 'verified' : 'failed',
        });
        return { profile, verification };
      }),
    verifyCac: protectedProcedure
      .input(z.object({ cac: z.string().min(2) }))
      .mutation(async ({ input }) => {
        const { verifyCacRegistration } = await import('./governmentIntegrationRepository');
        return await verifyCacRegistration(input.cac);
      }),
    verifyTin: protectedProcedure
      .input(z.object({ tin: z.string().min(5) }))
      .mutation(async ({ input }) => {
        const { recordGovernmentVerification } = await import('./governmentIntegrationRepository');
        const remote = await firsService.verifyTIN(input.tin);
        const fallback = await verifyTinRecord(input.tin);
        const result = remote.valid ? remote : fallback;
        const verification = await recordGovernmentVerification({
          type: 'Tax Verification',
          identifier: input.tin,
          name: result.taxpayerName || 'Unknown Taxpayer',
          status: result.valid ? 'verified' : 'failed',
        });
        return { ...result, verification };
      }),
  }),

  // Survey Equipment
  surveyEquipment: router({
    state: protectedProcedure
      .query(async () => {
        const { getSurveyEquipmentState } = await import('./surveyEquipmentRepository');
        const state = await getSurveyEquipmentState();
        return {
          connectedDevices: state.connectedDevices.map((item) => ({ ...item, lastSync: new Date(item.lastSync) })),
          recentImports: state.recentImports.map((item) => ({ ...item, timestamp: new Date(item.timestamp) })),
          calibrationRecords: state.calibrationRecords.map((item) => ({ ...item, date: new Date(item.date), nextDue: new Date(item.nextDue) })),
        };
      }),
  }),

  // Workflow Designer
  workflowDesigner: router({
    state: protectedProcedure
      .query(async () => {
        const { getWorkflowDesignerState } = await import('./workflowDesignerRepository');
        const state = await getWorkflowDesignerState();
        return {
          ...state,
          activeWorkflows: state.activeWorkflows.map((item) => ({
            ...item,
            startedAt: new Date(item.startedAt),
          })),
        };
      }),
    create: protectedProcedure
      .input(z.object({
        workflowName: z.string().min(1),
        templateId: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { createWorkflowInstance } = await import('./workflowDesignerRepository');
        const created = await createWorkflowInstance(input);
        return {
          ...created,
          startedAt: new Date(created.startedAt),
        };
      }),
  }),

  // Compliance Dashboard
  complianceDashboard: router({
    state: protectedProcedure
      .query(async () => {
        const { getComplianceDashboardState } = await import('./complianceDashboardRepository');
        const state = await getComplianceDashboardState();
        return {
          ...state,
          regulations: state.regulations.map((item) => ({
            ...item,
            lastAudit: new Date(item.lastAudit),
            nextReview: new Date(item.nextReview),
          })),
          upcomingReports: state.upcomingReports.map((item) => ({
            ...item,
            dueDate: new Date(item.dueDate),
          })),
          recentAudits: state.recentAudits.map((item) => ({
            ...item,
            date: new Date(item.date),
          })),
        };
      }),
  }),

  // Backup & Recovery
  backupRecovery: router({
    state: protectedProcedure
      .query(async () => {
        const { getBackupRecoveryState } = await import('./backupRecoveryRepository');
        const state = await getBackupRecoveryState();
        return {
          ...state,
          schedule: {
            ...state.schedule,
            lastBackup: new Date(state.schedule.lastBackup),
            nextBackup: new Date(state.schedule.nextBackup),
          },
          recentBackups: state.recentBackups.map((backup) => ({
            ...backup,
            timestamp: new Date(backup.timestamp),
          })),
          recoveryPoints: state.recoveryPoints.map((point) => ({
            ...point,
            timestamp: new Date(point.timestamp),
          })),
        };
      }),

    initiateBackup: protectedProcedure
      .mutation(async () => {
        const { initiateBackupRun } = await import('./backupRecoveryRepository');
        const backup = await initiateBackupRun();
        return {
          ...backup,
          timestamp: new Date(backup.timestamp),
        };
      }),

    readiness: protectedProcedure
      .query(async () => {
        const { getBackupReadinessSummary } = await import('./backupRecoveryRepository');
        const summary = await getBackupReadinessSummary();
        return {
          ...summary,
          lastDrill: summary.lastDrill
            ? {
                ...summary.lastDrill,
                timestamp: new Date(summary.lastDrill.timestamp),
              }
            : null,
        };
      }),

    runRecoveryDrill: protectedProcedure
      .input(z.object({
        scenario: z.string(),
        outcome: z.enum(['passed', 'warning', 'failed']),
        recoveryTime: z.string(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { recordRecoveryDrill } = await import('./backupRecoveryRepository');
        const drill = await recordRecoveryDrill(input);
        return {
          ...drill,
          timestamp: new Date(drill.timestamp),
        };
      }),

    restore: protectedProcedure
      .input(z.object({ recoveryPointId: z.number() }))
      .mutation(async ({ input }) => {
        const { restoreFromRecoveryPoint } = await import('./backupRecoveryRepository');
        const result = await restoreFromRecoveryPoint(input.recoveryPointId);
        return {
          ...result,
          restoredAt: new Date(result.restoredAt),
        };
      }),
  }),

  // Identity Verification
  identityVerification: router({
    profile: protectedProcedure
      .query(async ({ ctx }) => {
        const { getIdentityProfile } = await import('./identityVerificationRepository');
        const profile = await getIdentityProfile(ctx.user.id);
        return {
          ...profile,
          nin: {
            ...profile.nin,
            verifiedAt: profile.nin.verifiedAt ? new Date(profile.nin.verifiedAt) : null,
          },
          bvn: {
            ...profile.bvn,
            verifiedAt: profile.bvn.verifiedAt ? new Date(profile.bvn.verifiedAt) : null,
          },
          documents: profile.documents.map((document) => ({
            ...document,
            uploadedAt: new Date(document.uploadedAt),
          })),
        };
      }),

    proofSummary: protectedProcedure
      .query(async ({ ctx }) => {
        const { getVerificationProofSummary } = await import('./identityVerificationRepository');
        const summary = getVerificationProofSummary(ctx.user.id);
        return {
          ...summary,
          proofs: {
            ...summary.proofs,
            nin: {
              ...summary.proofs.nin,
              verifiedAt: summary.proofs.nin.verifiedAt ? new Date(summary.proofs.nin.verifiedAt) : null,
            },
            bvn: {
              ...summary.proofs.bvn,
              verifiedAt: summary.proofs.bvn.verifiedAt ? new Date(summary.proofs.bvn.verifiedAt) : null,
            },
            documents: summary.proofs.documents.map((document) => ({
              ...document,
              uploadedAt: new Date(document.uploadedAt),
            })),
          },
          generatedAt: new Date(summary.generatedAt),
        };
      }),

    verifyNin: protectedProcedure
      .input(z.object({ nin: z.string().length(11) }))
      .mutation(async ({ input, ctx }) => {
        const { verifyNin } = await import('./identityVerificationRepository');
        const profile = await verifyNin(ctx.user.id, input.nin);
        return {
          status: profile.nin.status,
          fullName: profile.fullName,
          dateOfBirth: profile.dateOfBirth,
          gender: profile.gender,
          verifiedAt: profile.nin.verifiedAt ? new Date(profile.nin.verifiedAt) : null,
        };
      }),

    verifyBvn: protectedProcedure
      .input(z.object({ bvn: z.string().length(11) }))
      .mutation(async ({ input, ctx }) => {
        const { verifyBvn } = await import('./identityVerificationRepository');
        const profile = await verifyBvn(ctx.user.id, input.bvn);
        return {
          status: profile.bvn.status,
          fullName: profile.fullName,
          phoneNumber: profile.phoneNumber,
          verifiedAt: profile.bvn.verifiedAt ? new Date(profile.bvn.verifiedAt) : null,
        };
      }),

    uploadDocument: protectedProcedure
      .input(z.object({
        type: z.string().min(1),
        fileName: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const { uploadKycDocument } = await import('./identityVerificationRepository');
        const document = await uploadKycDocument(ctx.user.id, input);
        return {
          ...document,
          uploadedAt: new Date(document.uploadedAt),
        };
      }),
  }),

  // Verification Analytics
  verificationAnalytics: router({
    metrics: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { getVerificationMetrics } = await import('./verificationAnalyticsService');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getVerificationMetrics(startDate, endDate);
      }),

    reviewerPerformance: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { getReviewerPerformance } = await import('./verificationAnalyticsService');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getReviewerPerformance(startDate, endDate);
      }),

    bottlenecks: protectedProcedure
      .query(async () => {
        const { getBottleneckAnalysis } = await import('./verificationAnalyticsService');
        return await getBottleneckAnalysis();
      }),

    trends: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        interval: z.enum(['day', 'week', 'month']).optional(),
      }))
      .query(async ({ input }) => {
        const { getVerificationTrends } = await import('./verificationAnalyticsService');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getVerificationTrends(startDate, endDate, input.interval);
      }),

    processingTimeDistribution: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { getProcessingTimeDistribution } = await import('./verificationAnalyticsService');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getProcessingTimeDistribution(startDate, endDate);
      }),
  }),

  // Security Monitoring
  securityMonitoring: router({
    events: protectedProcedure
      .input(z.object({
        eventType: z.string().optional(),
        severity: z.string().optional(),
        userId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        const { getSecurityEvents } = await import('./securityMonitoringService');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getSecurityEvents(
          {
            eventType: input.eventType as any,
            severity: input.severity as any,
            userId: input.userId,
            startDate,
            endDate,
          },
          input.limit
        );
      }),

    blockedIPs: protectedProcedure
      .input(z.object({
        includeUnblocked: z.boolean().optional(),
      }))
      .query(async ({ input }) => {
        const { getBlockedIPs } = await import('./securityMonitoringService');
        return await getBlockedIPs(input.includeUnblocked);
      }),

    stats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const { getSecurityStats } = await import('./securityMonitoringService');
        const startDate = input.startDate ? new Date(input.startDate) : undefined;
        const endDate = input.endDate ? new Date(input.endDate) : undefined;
        return await getSecurityStats(startDate, endDate);
      }),

    responseOverview: protectedProcedure
      .query(async () => {
        const repo = await import('./securityResponseRepository');
        return await repo.getSecurityResponseOverview();
      }),

    createBehavioralSignal: protectedProcedure
      .input(z.object({
        userId: z.number(),
        userLabel: z.string().min(2),
        signalType: z.enum(['velocity', 'device_shift', 'location_jump', 'after_hours_access']),
        riskLevel: z.enum(['low', 'medium', 'high']),
        score: z.number().min(0).max(100),
        description: z.string().min(10),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./securityResponseRepository');
        return await repo.createBehavioralSignal(input);
      }),

    registerHoneypotEvent: protectedProcedure
      .input(z.object({
        sourceIp: z.string().min(3),
        endpoint: z.string().min(2),
        payloadSnippet: z.string().min(3),
        severity: z.enum(['medium', 'high', 'critical']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./securityResponseRepository');
        return await repo.registerHoneypotEvent(input);
      }),

    createIncidentFromHoneypot: protectedProcedure
      .input(z.object({ eventId: z.number() }))
      .mutation(async ({ input }) => {
        const repo = await import('./securityResponseRepository');
        return await repo.createIncidentFromHoneypot(input.eventId);
      }),

    updateIncidentStatus: protectedProcedure
      .input(z.object({
        incidentId: z.number(),
        status: z.enum(['open', 'investigating', 'contained', 'resolved']),
      }))
      .mutation(async ({ input }) => {
        const repo = await import('./securityResponseRepository');
        return await repo.updateIncidentStatus(input);
      }),

    blockIP: protectedProcedure
      .input(z.object({
        ipAddress: z.string(),
        reason: z.string(),
        durationMinutes: z.number().optional(),
        isPermanent: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can block IPs
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { blockIP } = await import('./securityMonitoringService');
        return await blockIP(input.ipAddress, input.reason, {
          blockedBy: ctx.user.id,
          durationMinutes: input.durationMinutes,
          isPermanent: input.isPermanent,
        });
      }),

    unblockIP: protectedProcedure
      .input(z.object({
        ipAddress: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admins can unblock IPs
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { unblockIP } = await import('./securityMonitoringService');
        return await unblockIP(input.ipAddress, ctx.user.id);
      }),
  }),

  // Document AI Processing
  documentAI: router({
    processDocument: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        documentUrl: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { processDocument } = await import('./documentAIService');
        return await processDocument(input.documentId, input.documentUrl, {
          userId: ctx.user.id,
        });
      }),

    getResults: protectedProcedure
      .input(z.object({
        documentId: z.number(),
      }))
      .query(async ({ input }) => {
        const { getDocumentProcessingResults } = await import('./documentAIService');
        return await getDocumentProcessingResults(input.documentId);
      }),

    updateValidation: protectedProcedure
      .input(z.object({
        resultId: z.number(),
        status: z.enum(['pending', 'approved', 'rejected', 'needs_review']),
      }))
      .mutation(async ({ ctx, input }) => {
        const { updateValidationStatus } = await import('./documentAIService');
        return await updateValidationStatus(input.resultId, input.status, ctx.user.id);
      }),

    compareDocuments: protectedProcedure
      .input(z.object({
        leftDocumentId: z.number(),
        rightDocumentId: z.number(),
      }))
      .query(async ({ input }) => {
        const { compareDocumentResults } = await import('./documentAIService');
        return await compareDocumentResults(input.leftDocumentId, input.rightDocumentId);
      }),

    summarizeDocument: protectedProcedure
      .input(z.object({
        documentId: z.number(),
      }))
      .query(async ({ input }) => {
        const { summarizeDocumentResults } = await import('./documentAIService');
        return await summarizeDocumentResults(input.documentId);
      }),

    verifySignature: protectedProcedure
      .input(z.object({
        documentId: z.number(),
      }))
      .query(async ({ input }) => {
        const { verifyDocumentSignature } = await import('./documentAIService');
        return await verifyDocumentSignature(input.documentId);
      }),
  }),

  // Field Data Sync
  fieldData: router({
    sync: protectedProcedure
      .input(z.object({
        parcelNumber: z.string(),
        location: z.object({ lat: z.number(), lng: z.number() }).nullable(),
        area: z.string(),
        boundaries: z.string(),
        notes: z.string(),
        photos: z.array(z.string()),
        timestamp: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { FieldDataService } = await import('./fieldDataService');
        return await FieldDataService.syncFieldData(ctx.user.id, input);
      }),

    getUserData: protectedProcedure
      .input(z.object({
        limit: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const { FieldDataService } = await import('./fieldDataService');
        return await FieldDataService.getUserFieldData(ctx.user.id, input.limit);
      }),

    getByParcel: protectedProcedure
      .input(z.object({
        parcelNumber: z.string(),
      }))
      .query(async ({ input }) => {
        const { FieldDataService } = await import('./fieldDataService');
        return await FieldDataService.getFieldDataByParcel(input.parcelNumber);
      }),

    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        const { FieldDataService } = await import('./fieldDataService');
        return await FieldDataService.getUserStats(ctx.user.id);
      }),

    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { FieldDataService } = await import('./fieldDataService');
        return await FieldDataService.deleteFieldData(input.id, ctx.user.id);
      }),
  }),

  // Property Photo AI
  propertyPhotoAI: router({
    analyzePhoto: protectedProcedure
      .input(z.object({
        imageUrl: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { PropertyPhotoAIService } = await import('./propertyPhotoAIService');
        return await PropertyPhotoAIService.analyzePropertyPhoto(input.imageUrl);
      }),

    analyzeMultiple: protectedProcedure
      .input(z.object({
        imageUrls: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        const { PropertyPhotoAIService } = await import('./propertyPhotoAIService');
        return await PropertyPhotoAIService.analyzeMultiplePhotos(input.imageUrls);
      }),

    mergeAnalyses: protectedProcedure
      .input(z.object({
        imageUrls: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        const { PropertyPhotoAIService } = await import('./propertyPhotoAIService');
        const analyses = await PropertyPhotoAIService.analyzeMultiplePhotos(input.imageUrls);
        return PropertyPhotoAIService.mergeAnalyses(analyses);
      }),
  }),


  blockchainTransactions: router({
    transferProperty: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        newOwnerAddress: z.string(),
        documentHash: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { getBlockchainService } = await import('./blockchainService');
          const service = getBlockchainService();
          return await service.transferProperty(
            input.parcelId,
            input.newOwnerAddress,
            input.documentHash
          );
        } catch (error) {
          const { createOfflinePropertyTransfer } = await import('./blockchainTransactionsRepository');
          return await createOfflinePropertyTransfer(input);
        }
      }),

    getPropertyOwner: protectedProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        const { getBlockchainService } = await import('./blockchainService');
        const service = getBlockchainService();
        return await service.getPropertyOwner(input.parcelId);
      }),

    getTransferHistory: protectedProcedure
      .input(z.object({ parcelId: z.number() }))
      .query(async ({ input }) => {
        const { getBlockchainService } = await import('./blockchainService');
        const service = getBlockchainService();
        return await service.getTransferHistory(input.parcelId);
      }),

    createEscrow: protectedProcedure
      .input(z.object({
        parcelId: z.number(),
        sellerAddress: z.string(),
        buyerAddress: z.string(),
        amount: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          const { getBlockchainService } = await import('./blockchainService');
          const service = getBlockchainService();
          return await service.createEscrow(
            input.parcelId,
            input.sellerAddress,
            input.buyerAddress,
            input.amount
          );
        } catch (error) {
          const { createOfflineEscrow } = await import('./blockchainTransactionsRepository');
          return await createOfflineEscrow(input);
        }
      }),

    depositToEscrow: protectedProcedure
      .input(z.object({
        escrowId: z.number(),
        amount: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { getBlockchainService } = await import('./blockchainService');
        const service = getBlockchainService();
        return await service.depositToEscrow(input.escrowId, input.amount);
      }),

    releaseEscrow: protectedProcedure
      .input(z.object({ escrowId: z.number() }))
      .mutation(async ({ input }) => {
        const { getBlockchainService } = await import('./blockchainService');
        const service = getBlockchainService();
        return await service.releaseEscrow(input.escrowId);
      }),

    estimateGas: protectedProcedure
      .input(z.object({
        transactionType: z.string(),
        params: z.any(),
      }))
      .query(async ({ input }) => {
        try {
          const { getBlockchainService } = await import('./blockchainService');
          const service = getBlockchainService();
          const gasCost = await service.estimateGas(input.transactionType, input.params);
          return gasCost.toString();
        } catch (error) {
          const { estimateOfflineGas } = await import('./blockchainTransactionsRepository');
          return estimateOfflineGas(input.transactionType);
        }
      }),

    getTransactionHistory: protectedProcedure
      .input(z.object({
        parcelId: z.number().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input }) => {
        try {
          const { getBlockchainService } = await import('./blockchainService');
          const service = getBlockchainService();
          return await service.getTransactionHistory(input.parcelId, input.limit);
        } catch (error) {
          const { listBlockchainTransactions } = await import('./blockchainTransactionsRepository');
          return await listBlockchainTransactions(input);
        }
      }),
  }),

  // Audit Trail Export
  audit: router({ exportCSV: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        userId: z.number().optional(),
        type: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { exportAuditLogsToCSV } = await import('./services/auditExportService');
        const csv = await exportAuditLogsToCSV({
          format: 'csv',
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          userId: input.userId,
          type: input.type,
        });
        return { csv };
      }),

    exportJSON: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        userId: z.number().optional(),
        type: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { exportAuditLogsToJSON } = await import('./services/auditExportService');
        const json = await exportAuditLogsToJSON({
          format: 'json',
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
          userId: input.userId,
          type: input.type,
        });
        return { json };
      }),

    getStats: protectedProcedure
      .input(z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { getAuditLogStats } = await import('./services/auditExportService');
        return await getAuditLogStats(
          input.startDate ? new Date(input.startDate) : undefined,
          input.endDate ? new Date(input.endDate) : undefined
        );
      }),
  }),

  // Data Aggregation Management
  aggregation: router({
    runDaily: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { runDailyAggregation } = await import('./dataAggregationScheduler');
        await runDailyAggregation();
        return { success: true, message: 'Daily aggregation completed' };
      }),

    backfill: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { backfillMetrics } = await import('./dataAggregationScheduler');
        const count = await backfillMetrics(input.startDate, input.endDate);
        return { success: true, daysProcessed: count };
      }),

    getMetrics: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
        }
        const { aggregateDailyMetrics } = await import('./dataAggregationScheduler');
        // For now, just return the most recent day's metrics
        const metrics = await aggregateDailyMetrics(input.endDate);
        return metrics;
      }),
  }),

  // API Key Management
  apiKeys: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        const { listApiKeys } = await import('./apiKeyService');
        return await listApiKeys(String(ctx.user.id));
      }),

    create: protectedProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { createApiKey } = await import('./apiKeyService');
        return await createApiKey(String(ctx.user.id), input.name);
      }),

    revoke: protectedProcedure
      .input(z.object({ keyId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { revokeApiKey } = await import('./apiKeyService');
        await revokeApiKey(String(ctx.user.id), input.keyId);
        return { success: true };
      }),

    rotate: protectedProcedure
      .input(z.object({ keyId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { rotateApiKey } = await import('./apiKeyService');
        return await rotateApiKey(String(ctx.user.id), input.keyId);
      }),

    getUsageStats: protectedProcedure
      .query(async ({ ctx }) => {
        const { getUsageStats } = await import('./apiKeyService');
        return await getUsageStats(String(ctx.user.id));
      }),
  }),

  // Mojaloop Payment Integration
  mojaloopPayments: router({
    // Initiate a new payment
    initiate: protectedProcedure
      .input(z.object({
        amount: z.string(),
        currency: z.string(),
        payerMsisdn: z.string(),
        payeeMsisdn: z.string(),
        propertyId: z.string().optional(),
        escrowContractAddress: z.string().optional(),
        purpose: z.string().optional(),
        note: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { initiatePropertyPayment } = await import('./mojaloopPaymentService');
        return await initiatePropertyPayment({
          userId: ctx.user.id,
          ...input,
        });
      }),

    // Execute a payment after quote approval
    execute: protectedProcedure
      .input(z.object({ transactionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { executePayment } = await import('./mojaloopPaymentService');
        return await executePayment(input.transactionId);
      }),

    // Get payment status
    getStatus: protectedProcedure
      .input(z.object({ transactionId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { getPaymentStatus } = await import('./mojaloopPaymentService');
        const status = await getPaymentStatus(input.transactionId);
        if (!status) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Payment transaction not found',
          });
        }
        return status;
      }),

    // Get user's payment history
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(10) }))
      .query(async ({ ctx, input }) => {
        const { getUserPaymentHistory } = await import('./mojaloopPaymentService');
        return await getUserPaymentHistory(ctx.user.id, input.limit);
      }),

    // Cancel a pending payment
    cancel: protectedProcedure
      .input(z.object({
        transactionId: z.string(),
        reason: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { cancelPayment } = await import('./mojaloopPaymentService');
        await cancelPayment(input.transactionId, input.reason);
        return { success: true };
      }),

    // Reconcile payment with blockchain
    reconcile: protectedProcedure
      .input(z.object({
        transactionId: z.string(),
        blockchainTxHash: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { reconcilePaymentWithEscrow } = await import('./mojaloopPaymentService');
        await reconcilePaymentWithEscrow(input.transactionId, input.blockchainTxHash);
        return { success: true };
      }),
  }),

  // Temporal Workflow Operations
  workflows: router({
    // Start a new property transaction workflow
    startTransaction: protectedProcedure
      .input(z.object({
        propertyId: z.string(),
        buyerId: z.string(),
        sellerId: z.string(),
        amount: z.string(),
        currency: z.string(),
        paymentMethod: z.enum(['mojaloop', 'card', 'bank_transfer']),
      }))
      .mutation(async ({ ctx, input }) => {
        const { startPropertyTransactionWorkflow } = await import('./temporalClient');
        const result = await startPropertyTransactionWorkflow(input);
        return result;
      }),

    // Approve payment for a workflow
    approvePayment: protectedProcedure
      .input(z.object({
        workflowId: z.string(),
        approvalCode: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { approvePaymentForWorkflow } = await import('./temporalClient');
        await approvePaymentForWorkflow(input.workflowId, input.approvalCode);
        return { success: true };
      }),

    // Cancel a workflow
    cancel: protectedProcedure
      .input(z.object({
        workflowId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { cancelWorkflow } = await import('./temporalClient');
        await cancelWorkflow(input.workflowId);
        return { success: true };
      }),

    // Get workflow state
    getState: protectedProcedure
      .input(z.object({
        workflowId: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const { getWorkflowState } = await import('./temporalClient');
        const state = await getWorkflowState(input.workflowId);
        return state;
      }),

    // Get workflow progress (0-100%)
    getProgress: protectedProcedure
      .input(z.object({
        workflowId: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const { getWorkflowProgress } = await import('./temporalClient');
        const progress = await getWorkflowProgress(input.workflowId);
        return { progress };
      }),

    // List all workflows for a property
    listByProperty: protectedProcedure
      .input(z.object({
        propertyId: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const { listPropertyWorkflows } = await import('./temporalClient');
        const workflows = await listPropertyWorkflows(input.propertyId);
        return workflows;
      }),

    // Wait for workflow completion
    waitForCompletion: protectedProcedure
      .input(z.object({
        workflowId: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const { waitForWorkflowCompletion } = await import('./temporalClient');
        const result = await waitForWorkflowCompletion(input.workflowId);
        return result;
      }),
  }),

  // Unified Transaction Dashboard
  dashboard: unifiedDashboardRouter,

  // Phase 4: Advanced Integration Systems
  phase4: phase4Router,

  // Executive Analytics
  executiveAnalytics: analyticsRouter,

  // Security Integration
  security: securityIntegrationRouter,
  search: searchRouter,
  ai: aiServicesRouter,
  marketplace: marketplaceRouter,
  financial: financialRouter,
  mortgagePayment: mortgagePaymentRouter,
  // Gap 2: NIMC/BVN Identity Verification
  identity: identityRouter,
  // Gap 5: Legal Framework — Digital Signatures & Gazette
  legal: legalRouter,
});

export type AppRouter = typeof appRouter;
