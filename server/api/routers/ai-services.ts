import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import { TRPCError } from '@trpc/server';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || `${AI_SERVICE_URL}/ocr`;
const FRAUD_SERVICE_URL = process.env.FRAUD_SERVICE_URL || `${AI_SERVICE_URL}/fraud`;

/**
 * Governance-owned block decision. The Python service scores; the platform
 * decides what score blocks a transaction. Operators tune the cutoff via
 * FRAUD_SCORE_BLOCK_THRESHOLD without redeploying the model.
 */
const FRAUD_SCORE_BLOCK_THRESHOLD = (() => {
  const raw = parseInt(process.env.FRAUD_SCORE_BLOCK_THRESHOLD || '80', 10);
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : 80;
})();
const AI_HEALTH_URL = process.env.AI_HEALTH_URL || `${AI_SERVICE_URL}/health`;

export const aiServicesRouter = router({
  /**
   * Process document with OCR
   */
  processDocument: protectedProcedure
    .input(
      z.object({
        documentUrl: z.string().url(),
        documentType: z.enum(['title_deed', 'survey', 'certificate', 'contract', 'other']),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Call Python OCR service
        const response = await fetch(`${OCR_SERVICE_URL}/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_url: input.documentUrl,
            document_type: input.documentType,
          }),
        });

        if (!response.ok) {
          throw new Error(`OCR service error: ${response.statusText}`);
        }

        const result = await response.json();
        return {
          success: true,
          extractedText: result.extracted_text,
          structuredData: result.structured_data,
          confidence: result.confidence,
          processingTime: result.processing_time,
        };
      } catch (error) {
        console.error('OCR processing error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to process document with OCR',
        });
      }
    }),

  /**
   * Analyze transaction for fraud
   */
  analyzeFraud: protectedProcedure
    .input(
      z.object({
        transactionId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { requireDb } = await import('../../db');
        const { registryTransactions } = await import('../../../drizzle/schema');
        const { eq } = await import('drizzle-orm');

        const db = await requireDb();

        const [transaction] = await db
          .select()
          .from(registryTransactions)
          .where(eq(registryTransactions.id, input.transactionId))
          .limit(1);

        if (!transaction) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Transaction not found',
          });
        }

        // Call Python fraud detection service
        const response = await fetch(`${FRAUD_SERVICE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Python fraud service reads camelCase feature keys
            transactionId: transaction.id,
            amount: transaction.considerationAmount,
            transactionType: transaction.type,
            createdAt: transaction.createdAt,
            fromUserId: transaction.initiatorId,
            toUserId: 0, // registry transactions track counterparty by name, not user id
            parcelId: transaction.parcelId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Fraud detection service error: ${response.statusText}`);
        }

        const result = await response.json();
        const fraudScore = Number(result.fraud_score) || 0;
        // Platform policy: the score threshold — not the model's own flag —
        // decides whether a transaction is blocked.
        const blocked = fraudScore >= FRAUD_SCORE_BLOCK_THRESHOLD;
        return {
          success: true,
          isFraudulent: Boolean(result.is_fraudulent) || blocked,
          fraudScore,
          riskLevel: result.risk_level,
          anomalies: result.anomalies,
          recommendation: blocked ? 'block' : result.recommendation,
          blocked,
          blockThreshold: FRAUD_SCORE_BLOCK_THRESHOLD,
        };
      } catch (error) {
        console.error('Fraud analysis error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to analyze transaction for fraud',
        });
      }
    }),

  /**
   * Scan multiple transactions for fraud patterns
   */
  scanTransactions: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        minAmount: z.number().optional(),
        userId: z.number().optional(),
        limit: z.number().default(100),
      })
    )
    .query(async ({ input }) => {
      try {
        const { requireDb } = await import('../../db');
        const { registryTransactions } = await import('../../../drizzle/schema');
        const { and, gte, lte, eq, desc } = await import('drizzle-orm');

        const db = await requireDb();

        // Build query conditions
        const conditions: any[] = [];
        if (input.startDate) {
          conditions.push(gte(registryTransactions.createdAt, new Date(input.startDate)));
        }
        if (input.endDate) {
          conditions.push(lte(registryTransactions.createdAt, new Date(input.endDate)));
        }
        if (input.minAmount) {
          conditions.push(gte(registryTransactions.considerationAmount, input.minAmount));
        }
        if (input.userId) {
          conditions.push(eq(registryTransactions.initiatorId, input.userId));
        }

        const txList = await db
          .select()
          .from(registryTransactions)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(registryTransactions.createdAt))
          .limit(input.limit);

        // Call Python fraud detection service for batch analysis
        const response = await fetch(`${FRAUD_SERVICE_URL}/scan-batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactions: txList.map(tx => ({
              // Python fraud service reads camelCase feature keys
              transactionId: tx.id,
              amount: tx.considerationAmount,
              transactionType: tx.type,
              createdAt: tx.createdAt,
              fromUserId: tx.initiatorId,
              toUserId: 0, // registry transactions track counterparty by name, not user id
              parcelId: tx.parcelId,
            })),
          }),
        });

        if (!response.ok) {
          throw new Error(`Fraud scan service error: ${response.statusText}`);
        }

        const result = await response.json();
        return {
          success: true,
          totalScanned: txList.length,
          suspiciousCount: result.suspicious_count,
          highRiskCount: result.high_risk_count,
          flaggedTransactions: result.flagged_transactions,
          patterns: result.patterns,
        };
      } catch (error) {
        console.error('Transaction scan error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to scan transactions for fraud',
        });
      }
    }),

  /**
   * Get OCR service health status
   */
  getOCRStatus: publicProcedure.query(async () => {
    try {
      const response = await fetch(AI_HEALTH_URL, {
        method: 'GET',
      });

      if (!response.ok) {
        return { status: 'offline', message: 'OCR service is not responding' };
      }

      const result = await response.json();
      return {
        status: 'online',
        version: result.version || '1.0.0',
        uptime: result.uptime || 0,
      };
    } catch (error) {
      return { status: 'offline', message: 'OCR service is not reachable' };
    }
  }),

  /**
   * Get fraud detection service health status
   */
  getFraudDetectionStatus: publicProcedure.query(async () => {
    try {
      const response = await fetch(AI_HEALTH_URL, {
        method: 'GET',
      });

      if (!response.ok) {
        return { status: 'offline', message: 'Fraud detection service is not responding' };
      }

      const result = await response.json();
      return {
        status: 'online',
        version: result.version || '1.0.0',
        modelAccuracy: result.model_accuracy || 0,
      };
    } catch (error) {
      return { status: 'offline', message: 'Fraud detection service is not reachable' };
    }
  }),
});
