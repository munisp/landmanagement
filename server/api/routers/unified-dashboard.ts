import { z } from 'zod';
import { router, protectedProcedure } from '../../_core/trpc';
import { requireDb } from '../../db';
import { transactions, parcels } from '../../../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { generateTransactionReport, type TransactionReportData } from '../../services/reportGenerationService';

interface SystemStatus {
  system: string;
  status: 'initiated' | 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  lastUpdated: Date;
  details?: string;
}

interface TransactionOverview {
  transactionId: string;
  parcelId: number;
  parcelAddress: string;
  transactionType: string;
  overallStatus: string;
  overallProgress: number;
  createdAt: Date;
  estimatedCompletion: Date;
  systems: SystemStatus[];
  blockchainTxHash?: string;
  paymentStatus?: string;
  paymentAmount?: string;
}

export const unifiedDashboardRouter = router({
  /**
   * Get unified transaction status for all transactions
   * Returns overview of all transactions with their system statuses
   */
  getUnifiedTransactionStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await requireDb();

      
      // Fetch all transactions for the user
      const userTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.toUserId, ctx.user.id))
        .orderBy(desc(transactions.createdAt))
        .limit(50);

      const transactionOverviews: TransactionOverview[] = [];

      for (const transaction of userTransactions) {
        // Build system status list based on transaction metadata
        const systems: SystemStatus[] = [];

        // Core systems that are always present
        // 1. Payment System
        systems.push({
          system: 'payment',
          status: transaction.status as any,
          progress: calculateProgress(transaction.status),
          lastUpdated: transaction.updatedAt || transaction.createdAt,
          details: `Amount: ${formatCurrency(transaction.amount, transaction.currency)}`,
        });

        // 2. Blockchain System
        if (transaction.blockchainTxHash) {
          systems.push({
            system: 'blockchain',
            status: transaction.status === 'completed' ? 'completed' : 'in_progress',
            progress: transaction.status === 'completed' ? 100 : 50,
            lastUpdated: transaction.updatedAt || transaction.createdAt,
            details: `Tx Hash: ${transaction.blockchainTxHash.substring(0, 10)}...`,
          });
        }

        // Additional systems can be added based on transaction metadata
        // These will be populated once the Phase 4 feature tables are added to the schema
        const metadata = transaction.metadata as any;
        if (metadata) {
          if (metadata.mortgageRequired) {
            systems.push({
              system: 'mortgage',
              status: metadata.mortgageStatus || 'pending',
              progress: calculateProgress(metadata.mortgageStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Mortgage application pending',
            });
          }

          if (metadata.taxClearanceRequired) {
            systems.push({
              system: 'tax',
              status: metadata.taxStatus || 'pending',
              progress: calculateProgress(metadata.taxStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Tax clearance pending',
            });
          }

          if (metadata.insuranceRequired) {
            systems.push({
              system: 'insurance',
              status: metadata.insuranceStatus || 'pending',
              progress: calculateProgress(metadata.insuranceStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Insurance verification pending',
            });
          }

          if (metadata.legalDocsRequired) {
            systems.push({
              system: 'legal',
              status: metadata.legalStatus || 'pending',
              progress: calculateProgress(metadata.legalStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Legal documents pending',
            });
          }

          if (metadata.surveyRequired) {
            systems.push({
              system: 'survey',
              status: metadata.surveyStatus || 'pending',
              progress: calculateProgress(metadata.surveyStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Cadastral survey pending',
            });
          }

          if (metadata.environmentalRequired) {
            systems.push({
              system: 'environmental',
              status: metadata.environmentalStatus || 'pending',
              progress: calculateProgress(metadata.environmentalStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Environmental assessment pending',
            });
          }

          if (metadata.publicNoticeRequired) {
            systems.push({
              system: 'public_notice',
              status: metadata.publicNoticeStatus || 'pending',
              progress: calculateProgress(metadata.publicNoticeStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Public notice pending',
            });
          }

          if (metadata.landUseRequired) {
            systems.push({
              system: 'land_use',
              status: metadata.landUseStatus || 'pending',
              progress: calculateProgress(metadata.landUseStatus || 'pending'),
              lastUpdated: transaction.updatedAt || transaction.createdAt,
              details: 'Land use compliance pending',
            });
          }
        }

        // Calculate overall progress
        const overallProgress = systems.length > 0
          ? Math.round(systems.reduce((sum, s) => sum + s.progress, 0) / systems.length)
          : 0;

        // Determine overall status
        const overallStatus = determineOverallStatus(systems);

        // Estimate completion date (30 days from creation if not completed)
        const estimatedCompletion = transaction.status === 'completed'
          ? transaction.updatedAt || transaction.createdAt
          : new Date(transaction.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

        transactionOverviews.push({
          transactionId: transaction.transactionId,
          parcelId: transaction.parcelId,
          parcelAddress: await (async () => {
            const result = await db.select({ address: parcels.address })
              .from(parcels)
              .where(eq(parcels.id, transaction.parcelId))
              .limit(1);
            const parcel = result[0];
            return parcel?.address || `Parcel #${transaction.parcelId}`;
          })(),
          transactionType: transaction.transactionType,
          overallStatus,
          overallProgress,
          createdAt: transaction.createdAt,
          estimatedCompletion,
          systems,
          blockchainTxHash: transaction.blockchainTxHash || undefined,
          paymentStatus: transaction.status,
          paymentAmount: formatCurrency(transaction.amount, transaction.currency),
        });
      }

      return transactionOverviews;
    } catch (error) {
      console.error('Error fetching unified transaction status:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch transaction status',
      });
    }
  }),

  /**
   * Get detailed status for a specific transaction
   */
  getTransactionDetail: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        const db = await requireDb();

        
        // Fetch transaction
        const transaction = await db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.transactionId, input.transactionId),
              eq(transactions.toUserId, ctx.user.id)
            )
          )
          .limit(1);

        if (transaction.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Transaction not found',
          });
        }

        const tx = transaction[0];

        // Build system status list (same logic as above)
        const systems: SystemStatus[] = [];

        // 1. Payment System
        systems.push({
          system: 'payment',
          status: tx.status as any,
          progress: calculateProgress(tx.status),
          lastUpdated: tx.updatedAt || tx.createdAt,
          details: `Amount: ${formatCurrency(tx.amount, tx.currency)}, Payment Method: ${tx.paymentMethod || 'Mojaloop'}`,
        });

        // 2. Blockchain System
        if (tx.blockchainTxHash) {
          systems.push({
            system: 'blockchain',
            status: tx.status === 'completed' ? 'completed' : 'in_progress',
            progress: tx.status === 'completed' ? 100 : 50,
            lastUpdated: tx.updatedAt || tx.createdAt,
            details: `Transaction Hash: ${tx.blockchainTxHash}`,
          });
        }

        // Additional systems from metadata
        const metadata = tx.metadata as any;
        if (metadata) {
          if (metadata.mortgageRequired) {
            systems.push({
              system: 'mortgage',
              status: metadata.mortgageStatus || 'pending',
              progress: calculateProgress(metadata.mortgageStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.mortgageDetails || 'Mortgage application pending',
            });
          }

          if (metadata.taxClearanceRequired) {
            systems.push({
              system: 'tax',
              status: metadata.taxStatus || 'pending',
              progress: calculateProgress(metadata.taxStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.taxDetails || 'Tax clearance pending',
            });
          }

          if (metadata.insuranceRequired) {
            systems.push({
              system: 'insurance',
              status: metadata.insuranceStatus || 'pending',
              progress: calculateProgress(metadata.insuranceStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.insuranceDetails || 'Insurance verification pending',
            });
          }

          if (metadata.legalDocsRequired) {
            systems.push({
              system: 'legal',
              status: metadata.legalStatus || 'pending',
              progress: calculateProgress(metadata.legalStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.legalDetails || 'Legal documents pending',
            });
          }

          if (metadata.surveyRequired) {
            systems.push({
              system: 'survey',
              status: metadata.surveyStatus || 'pending',
              progress: calculateProgress(metadata.surveyStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.surveyDetails || 'Cadastral survey pending',
            });
          }

          if (metadata.environmentalRequired) {
            systems.push({
              system: 'environmental',
              status: metadata.environmentalStatus || 'pending',
              progress: calculateProgress(metadata.environmentalStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.environmentalDetails || 'Environmental assessment pending',
            });
          }

          if (metadata.publicNoticeRequired) {
            systems.push({
              system: 'public_notice',
              status: metadata.publicNoticeStatus || 'pending',
              progress: calculateProgress(metadata.publicNoticeStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.publicNoticeDetails || 'Public notice pending',
            });
          }

          if (metadata.landUseRequired) {
            systems.push({
              system: 'land_use',
              status: metadata.landUseStatus || 'pending',
              progress: calculateProgress(metadata.landUseStatus || 'pending'),
              lastUpdated: tx.updatedAt || tx.createdAt,
              details: metadata.landUseDetails || 'Land use compliance pending',
            });
          }
        }

        const overallProgress = systems.length > 0
          ? Math.round(systems.reduce((sum, s) => sum + s.progress, 0) / systems.length)
          : 0;

        const overallStatus = determineOverallStatus(systems);

        const estimatedCompletion = tx.status === 'completed'
          ? tx.updatedAt || tx.createdAt
          : new Date(tx.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);

        return {
          transactionId: tx.transactionId,
          parcelId: tx.parcelId,
          parcelAddress: await (async () => {
            const result = await db.select({ address: parcels.address })
              .from(parcels)
              .where(eq(parcels.id, tx.parcelId))
              .limit(1);
            const parcel = result[0];
            return parcel?.address || `Parcel #${tx.parcelId}`;
          })(),
          transactionType: tx.transactionType,
          overallStatus,
          overallProgress,
          createdAt: tx.createdAt,
          estimatedCompletion,
          systems,
          blockchainTxHash: tx.blockchainTxHash || undefined,
          paymentStatus: tx.status,
          paymentAmount: formatCurrency(tx.amount, tx.currency),
        };
      } catch (error) {
        console.error('Error fetching transaction detail:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch transaction detail',
        });
      }
    }),

  /**
   * Export transaction report in PDF or Excel format
   */
  exportTransactionReport: protectedProcedure
    .input(
      z.object({
        transactionId: z.string(),
        format: z.enum(['pdf', 'excel']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const db = await requireDb();


        // Fetch transaction details
        const txResult = await db
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.transactionId, input.transactionId),
              eq(transactions.toUserId, ctx.user.id)
            )
          )
          .limit(1);

        if (txResult.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Transaction not found',
          });
        }

        const tx = txResult[0];

        // Fetch parcel address
        const parcelResult = await db.select({ address: parcels.address })
          .from(parcels)
          .where(eq(parcels.id, tx.parcelId))
          .limit(1);
        const parcelAddress = parcelResult[0]?.address || `Parcel #${tx.parcelId}`;

        // Build report data
        const reportData: TransactionReportData = {
          transactionId: tx.transactionId,
          parcelId: tx.parcelId.toString(),
          parcelAddress,
          transactionType: tx.transactionType,
          status: tx.status,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt || undefined,
          amount: tx.amount ? parseFloat(tx.amount.toString()) : undefined,
          buyer: tx.toUserId.toString(),
          seller: tx.fromUserId?.toString(),
          systems: [
            {
              name: 'Payment',
              status: tx.status as any,
              progress: tx.status === 'completed' ? 100 : 50,
            },
          ],
          blockchainTxHash: tx.blockchainTxHash || undefined,
          paymentStatus: tx.status,
        };

        // Generate report
        const url = await generateTransactionReport(reportData, input.format);
        const filename = url.split('/').pop() || `transaction_${input.transactionId}.${input.format}`;

        return {
          url,
          filename,
        };
      } catch (error) {
        console.error('Error exporting transaction report:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to export transaction report',
        });
      }
    }),
});

/**
 * Calculate progress percentage based on status
 */
function calculateProgress(status: string): number {
  switch (status) {
    case 'initiated':
    case 'pending':
      return 25;
    case 'in_progress':
      return 50;
    case 'completed':
      return 100;
    case 'failed':
    case 'cancelled':
      return 0;
    default:
      return 0;
  }
}

/**
 * Determine overall status based on system statuses
 */
function determineOverallStatus(systems: SystemStatus[]): string {
  if (systems.length === 0) return 'pending';

  const statuses = systems.map((s) => s.status);

  // If any system failed, overall is failed
  if (statuses.includes('failed')) return 'failed';

  // If any system cancelled, overall is cancelled
  if (statuses.includes('cancelled')) return 'cancelled';

  // If all systems completed, overall is completed
  if (statuses.every((s) => s === 'completed')) return 'completed';

  // If any system in progress, overall is in progress
  if (statuses.includes('in_progress')) return 'in_progress';

  // Otherwise, pending
  return 'pending';
}

/**
 * Format currency amount
 */
function formatCurrency(amount: number, currency: string): string {
  // Amount is stored in smallest unit (kobo for NGN)
  const majorAmount = amount / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency,
  }).format(majorAmount);
}
