import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from '../../_core/trpc';
import { TRPCError } from '@trpc/server';

function requiredServiceUrl(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for AI services`);
  return value.replace(/\/$/, '');
}

function aiServiceUrls() {
  const base = requiredServiceUrl('AI_SERVICE_URL');
  return {
    ocr: (process.env.OCR_SERVICE_URL?.trim() || `${base}/ocr`).replace(/\/$/, ''),
    fraud: (process.env.FRAUD_SERVICE_URL?.trim() || `${base}/fraud`).replace(/\/$/, ''),
    health: (process.env.AI_HEALTH_URL?.trim() || `${base}/health`).replace(/\/$/, ''),
  };
}

/**
 * Governance-owned block decision. The Python service scores; the platform
 * decides what score blocks a transaction. Operators tune the cutoff via
 * FRAUD_SCORE_BLOCK_THRESHOLD without redeploying the model.
 */
function fraudScoreBlockThreshold(): number {
  const raw = Number(process.env.FRAUD_SCORE_BLOCK_THRESHOLD);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    throw new Error('FRAUD_SCORE_BLOCK_THRESHOLD must be configured as a number from 0 to 100');
  }
  return raw;
}

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
        const response = await fetch(`${aiServiceUrls().ocr}/process`, {
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
        const response = await fetch(`${aiServiceUrls().fraud}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Python fraud service reads camelCase feature keys
            transactionId: transaction.id,
            amount: transaction.considerationAmount,
            transactionType: transaction.type,
            createdAt: transaction.createdAt,
            fromUserId: transaction.initiatorId,
            counterpartyName: transaction.counterpartyName ?? null,
            parcelId: transaction.parcelId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Fraud detection service error: ${response.statusText}`);
        }

        const result = await response.json();
        const fraudScore = Number(result.fraud_score);
        if (!Number.isFinite(fraudScore)) throw new Error('Fraud service returned an invalid fraud_score');
        // Platform policy: the configured score threshold — not the model's own
        // flag — decides whether a transaction is blocked.
        const blocked = fraudScore >= fraudScoreBlockThreshold();
        return {
          success: true,
          isFraudulent: Boolean(result.is_fraudulent) || blocked,
          fraudScore,
          riskLevel: result.risk_level,
          anomalies: result.anomalies,
          recommendation: blocked ? 'block' : result.recommendation,
          blocked,
          blockThreshold: fraudScoreBlockThreshold(),
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
        const response = await fetch(`${aiServiceUrls().fraud}/scan-batch`, {
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
              counterpartyName: tx.counterpartyName ?? null,
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
      const response = await fetch(aiServiceUrls().health, {
        method: 'GET',
      });

      if (!response.ok) {
        return { status: 'offline', message: 'OCR service is not responding' };
      }

      const result = await response.json();
      return {
        status: 'online',
        version: result.version ?? null,
        uptime: result.uptime ?? null,
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
      const response = await fetch(aiServiceUrls().health, {
        method: 'GET',
      });

      if (!response.ok) {
        return { status: 'offline', message: 'Fraud detection service is not responding' };
      }

      const result = await response.json();
      return {
        status: 'online',
        version: result.version ?? null,
        modelAccuracy: result.model_accuracy ?? null,
      };
    } catch (error) {
      return { status: 'offline', message: 'Fraud detection service is not reachable' };
    }
  }),
});
