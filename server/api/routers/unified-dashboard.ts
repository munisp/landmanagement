import { z } from 'zod';
import { router, protectedProcedure } from '../../_core/trpc';
import { requireDb } from '../../db';
import {
  registryTransactions,
  parcels,
  payments,
  agencyClearances,
  taxClearances,
  insurancePolicies,
  legalDocuments,
  cadastralSurveys,
  environmentalAssessments,
  publicNotices,
  landUsePlans,
  mortgageApplications,
  blockchainTransactions,
} from '../../../drizzle/schema';
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

type RegistryTx = typeof registryTransactions.$inferSelect;

/** Public code for a registry transaction (external reference or derived). */
function txCode(tx: RegistryTx): string {
  return tx.externalReference ?? `RT-${String(tx.id).padStart(6, '0')}`;
}

/** Map any domain status onto the dashboard's normalized status set. */
function normalizeStatus(status: string): SystemStatus['status'] {
  switch (status) {
    case 'completed':
    case 'approved':
    case 'registered':
    case 'confirmed':
    case 'verified':
    case 'paid':
    case 'cleared':
    case 'active':
      return 'completed';
    case 'rejected':
    case 'failed':
    case 'cancelled':
    case 'expired':
      return 'failed';
    case 'under_review':
    case 'in_progress':
    case 'pending_payment':
    case 'submitted':
      return 'in_progress';
    default:
      return 'pending';
  }
}

function calculateProgress(status: string): number {
  switch (normalizeStatus(status)) {
    case 'completed':
      return 100;
    case 'in_progress':
      return 50;
    case 'pending':
      return 25;
    default:
      return 0;
  }
}

function formatCurrency(amount: number, currency: string = 'NGN'): string {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amount);
}

function determineOverallStatus(systems: SystemStatus[]): string {
  if (systems.length === 0) return 'pending';
  if (systems.every((s) => s.status === 'completed')) return 'completed';
  if (systems.some((s) => s.status === 'failed')) return 'attention_required';
  return 'in_progress';
}

type Db = Awaited<ReturnType<typeof requireDb>>;

/**
 * Assemble the per-system status list for one registry transaction from the
 * REAL sub-system tables — nothing is synthesized from metadata blobs:
 *  - payment rail:      payments rows for this transaction
 *  - agency clearances: agency_clearances (integer FK)
 *  - phase-4 tracks:    tax/insurance/legal/survey/environmental/notice/land-use
 *                       rows keyed by the transaction's public code
 *  - mortgage:          applications referencing the transaction code
 *  - blockchain:        anchor records for the parcel
 */
async function buildSystems(db: Db, tx: RegistryTx): Promise<SystemStatus[]> {
  const systems: SystemStatus[] = [];
  const code = txCode(tx);
  const lastUpdated = tx.updatedAt ?? tx.createdAt;

  // 1. Core registry workflow (always present)
  systems.push({
    system: 'registry',
    status: normalizeStatus(tx.status),
    progress: calculateProgress(tx.status),
    lastUpdated,
    details: `Workflow stage: ${tx.workflowStage}; type: ${tx.type}`,
  });

  // 2. Payment rail
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, tx.id))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  const payment = paymentRows[0];
  systems.push({
    system: 'payment',
    status: normalizeStatus(payment?.status ?? tx.paymentStatus),
    progress: calculateProgress(payment?.status ?? tx.paymentStatus),
    lastUpdated: payment?.updatedAt ?? lastUpdated,
    details: payment
      ? `Amount: ${formatCurrency(payment.totalAmount, payment.currency)} via ${payment.method}`
      : `Payment status: ${tx.paymentStatus}`,
  });

  // 3. Agency clearances (integer FK)
  const clearances = await db
    .select()
    .from(agencyClearances)
    .where(eq(agencyClearances.transactionId, tx.id));
  for (const c of clearances) {
    systems.push({
      system: `clearance:${c.agency}`,
      status: normalizeStatus(c.status),
      progress: calculateProgress(c.status),
      lastUpdated: c.updatedAt ?? c.createdAt,
      details: c.decisionNotes ?? `Agency: ${c.agency}`,
    });
  }

  // 4. Phase-4 tracks keyed by the transaction's public code
  const tracks: Array<{ system: string; rows: Array<{ status: string; updatedAt: Date | null; createdAt: Date | null }> }> = [];
  tracks.push({ system: 'tax', rows: await db.select().from(taxClearances).where(eq(taxClearances.transactionId, code)) });
  tracks.push({ system: 'insurance', rows: await db.select().from(insurancePolicies).where(eq(insurancePolicies.transactionId, code)) });
  tracks.push({ system: 'legal', rows: await db.select().from(legalDocuments).where(eq(legalDocuments.transactionId, code)) });
  tracks.push({ system: 'survey', rows: await db.select().from(cadastralSurveys).where(eq(cadastralSurveys.transactionId, code)) });
  tracks.push({ system: 'environmental', rows: await db.select().from(environmentalAssessments).where(eq(environmentalAssessments.transactionId, code)) });
  tracks.push({ system: 'public_notice', rows: await db.select().from(publicNotices).where(eq(publicNotices.transactionId, code)) });
  tracks.push({ system: 'land_use', rows: await db.select().from(landUsePlans).where(eq(landUsePlans.transactionId, code)) });
  for (const track of tracks) {
    for (const row of track.rows) {
      systems.push({
        system: track.system,
        status: normalizeStatus(row.status),
        progress: calculateProgress(row.status),
        lastUpdated: row.updatedAt ?? row.createdAt ?? lastUpdated,
      });
    }
  }

  // 5. Mortgage linkage
  const mortgages = await db
    .select()
    .from(mortgageApplications)
    .where(eq(mortgageApplications.transactionId, code));
  for (const m of mortgages) {
    systems.push({
      system: 'mortgage',
      status: normalizeStatus(m.status),
      progress: calculateProgress(m.status),
      lastUpdated: m.updatedAt ?? m.createdAt,
      details: `Application ${m.applicationId}: ${m.status}`,
    });
  }

  // 6. Blockchain anchors for this parcel
  const [parcel] = await db
    .select({ parcelId: parcels.parcelId })
    .from(parcels)
    .where(eq(parcels.id, tx.parcelId))
    .limit(1);
  if (parcel) {
    const anchors = await db
      .select()
      .from(blockchainTransactions)
      .where(eq(blockchainTransactions.parcelId, parcel.parcelId))
      .orderBy(desc(blockchainTransactions.createdAt))
      .limit(1);
    const anchor = anchors[0];
    if (anchor) {
      systems.push({
        system: 'blockchain',
        status: normalizeStatus(anchor.status),
        progress: calculateProgress(anchor.status),
        lastUpdated: anchor.confirmedAt ?? anchor.createdAt,
        details: `Anchor tx: ${anchor.txHash}`,
      });
    }
  }

  return systems;
}

async function buildOverview(db: Db, tx: RegistryTx): Promise<TransactionOverview> {
  const systems = await buildSystems(db, tx);
  const overallProgress = systems.length > 0
    ? Math.round(systems.reduce((sum, s) => sum + s.progress, 0) / systems.length)
    : 0;
  const overallStatus = determineOverallStatus(systems);

  const [parcel] = await db
    .select({ address: parcels.address })
    .from(parcels)
    .where(eq(parcels.id, tx.parcelId))
    .limit(1);

  const [latestPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.transactionId, tx.id))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  const blockchain = systems.find((s) => s.system === 'blockchain');

  return {
    transactionId: txCode(tx),
    parcelId: tx.parcelId,
    parcelAddress: parcel?.address || `Parcel #${tx.parcelId}`,
    transactionType: tx.type,
    overallStatus,
    overallProgress,
    createdAt: tx.createdAt,
    estimatedCompletion: normalizeStatus(tx.status) === 'completed'
      ? tx.updatedAt ?? tx.createdAt
      : new Date(tx.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
    systems,
    blockchainTxHash: blockchain?.details?.replace('Anchor tx: ', ''),
    paymentStatus: latestPayment?.status ?? tx.paymentStatus,
    paymentAmount: latestPayment ? formatCurrency(latestPayment.totalAmount, latestPayment.currency) : undefined,
  };
}

async function getOwnedTransaction(db: Db, code: string, userId: number): Promise<RegistryTx> {
  const rows = await db
    .select()
    .from(registryTransactions)
    .where(eq(registryTransactions.initiatorId, userId));
  const tx = rows.find((r) => txCode(r) === code);
  if (!tx) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
  }
  return tx;
}

export const unifiedDashboardRouter = router({
  /**
   * Get unified transaction status across all integrated systems for the
   * current user's registry transactions.
   */
  getUnifiedTransactionStatus: protectedProcedure.query(async ({ ctx }) => {
    try {
      const db = await requireDb();
      const txs = await db
        .select()
        .from(registryTransactions)
        .where(eq(registryTransactions.initiatorId, ctx.user.id))
        .orderBy(desc(registryTransactions.createdAt))
        .limit(100);

      const overviews: TransactionOverview[] = [];
      for (const tx of txs) {
        overviews.push(await buildOverview(db, tx));
      }
      return overviews;
    } catch (error) {
      console.error('Error fetching unified transaction status:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch transaction status',
      });
    }
  }),

  /**
   * Get detailed status for a specific transaction (by public code).
   */
  getTransactionDetail: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        const db = await requireDb();
        const tx = await getOwnedTransaction(db, input.transactionId, ctx.user.id);
        return await buildOverview(db, tx);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('Error fetching transaction detail:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch transaction detail',
        });
      }
    }),

  /**
   * Export a transaction report (PDF or Excel).
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
        const tx = await getOwnedTransaction(db, input.transactionId, ctx.user.id);
        const overview = await buildOverview(db, tx);

        const reportData: TransactionReportData = {
          transactionId: overview.transactionId,
          parcelId: String(overview.parcelId),
          parcelAddress: overview.parcelAddress,
          transactionType: overview.transactionType,
          status: tx.status,
          createdAt: overview.createdAt,
          updatedAt: tx.updatedAt ?? undefined,
          amount: tx.considerationAmount || undefined,
          buyer: tx.initiatorName,
          seller: tx.counterpartyName ?? undefined,
          systems: overview.systems.map((s) => ({
            name: s.system,
            status: s.status,
            progress: s.progress,
          })),
          blockchainTxHash: overview.blockchainTxHash,
          paymentStatus: overview.paymentStatus,
        };

        const url = await generateTransactionReport(reportData, input.format);
        const filename = url.split('/').pop() || `transaction_${input.transactionId}.${input.format}`;

        return { url, filename };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('Error exporting transaction report:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to export transaction report',
        });
      }
    }),
});
