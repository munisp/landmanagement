/**
 * Property Transaction Workflow
 * 
 * Orchestrates the complete property transaction lifecycle:
 * 1. Payment processing through Mojaloop
 * 2. Blockchain escrow creation on Polygon
 * 3. Ledger reconciliation in TigerBeetle
 * 4. Title transfer and ownership update
 * 
 * Implements saga pattern with compensation for failures
 */

import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  sleep,
} from '@temporalio/workflow';
import type * as activities from '../activities';

// Proxy activities with timeout and retry configuration
const {
  initiatePayment,
  verifyPaymentStatus,
  createBlockchainEscrow,
  verifyBlockchainTransaction,
  createLedgerTransfer,
  verifyLedgerBalance,
  transferPropertyTitle,
  sendNotification,
  // Compensation activities
  refundPayment,
  refundEscrow,
  voidLedgerTransfer,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    maximumAttempts: 3,
  },
});

// Workflow input parameters
export interface PropertyTransactionInput {
  propertyId: string;
  buyerId: string;
  sellerId: string;
  amount: string;
  currency: string;
  paymentMethod: 'mojaloop' | 'card' | 'bank_transfer';
}

// Workflow state
export interface PropertyTransactionState {
  status: 'pending' | 'payment_processing' | 'escrow_created' | 'ledger_updated' | 'title_transferred' | 'completed' | 'failed' | 'compensating';
  paymentId?: string;
  transactionHash?: string;
  transferId?: string;
  titleTransferId?: string;
  errorMessage?: string;
  currentStep: string;
  completedSteps: string[];
  startTime: Date;
  endTime?: Date;
}

// Signals for external control
export const approvePaymentSignal = defineSignal<[string]>('approvePayment');
export const cancelTransactionSignal = defineSignal('cancelTransaction');

// Queries for workflow state
export const getStateQuery = defineQuery<PropertyTransactionState>('getState');
export const getProgressQuery = defineQuery<number>('getProgress');

/**
 * Main Property Transaction Workflow
 */
export async function propertyTransactionWorkflow(
  input: PropertyTransactionInput
): Promise<PropertyTransactionState> {
  // Initialize workflow state
  const state: PropertyTransactionState = {
    status: 'pending',
    currentStep: 'Initializing transaction',
    completedSteps: [],
    startTime: new Date(),
  };

  let cancelled = false;
  let paymentApproved = false;
  let approvalCode: string | undefined;

  // Set up signal handlers
  setHandler(cancelTransactionSignal, () => {
    cancelled = true;
  });

  setHandler(approvePaymentSignal, (code: string) => {
    paymentApproved = true;
    approvalCode = code;
  });

  // Set up query handlers
  setHandler(getStateQuery, () => state);
  setHandler(getProgressQuery, () => {
    const totalSteps = 5;
    return (state.completedSteps.length / totalSteps) * 100;
  });

  try {
    // Step 1: Initiate Payment
    state.status = 'payment_processing';
    state.currentStep = 'Initiating payment through Mojaloop';
    
    await sendNotification({
      userId: input.buyerId,
      type: 'transaction_started',
      message: `Property transaction initiated for property ${input.propertyId}`,
      metadata: { propertyId: input.propertyId, amount: input.amount },
    });

    const paymentResult = await initiatePayment({
      amount: input.amount,
      currency: input.currency,
      payerId: input.buyerId,
      payeeId: input.sellerId,
      propertyId: input.propertyId,
      paymentMethod: input.paymentMethod,
    });

    state.paymentId = paymentResult.paymentId;
    state.completedSteps.push('payment_initiated');

    // Wait for payment approval (with timeout)
    state.currentStep = 'Waiting for payment approval';
    
    const approved = await condition(() => paymentApproved || cancelled, '10 minutes');
    
    if (cancelled) {
      throw new Error('Transaction cancelled by user');
    }

    if (!approved) {
      throw new Error('Payment approval timeout');
    }

    // Verify payment status
    state.currentStep = 'Verifying payment status';
    
    const paymentStatus = await verifyPaymentStatus({
      paymentId: state.paymentId!,
      approvalCode: approvalCode!,
    });

    if (paymentStatus.status !== 'completed') {
      throw new Error(`Payment failed: ${paymentStatus.errorMessage}`);
    }

    state.completedSteps.push('payment_completed');

    await sendNotification({
      userId: input.buyerId,
      type: 'payment_completed',
      message: `Payment of ${input.amount} ${input.currency} completed successfully`,
      metadata: { paymentId: state.paymentId },
    });

    // Step 2: Create Blockchain Escrow
    state.status = 'escrow_created';
    state.currentStep = 'Creating blockchain escrow';

    const escrowResult = await createBlockchainEscrow({
      propertyId: input.propertyId,
      buyer: input.buyerId,
      seller: input.sellerId,
      amount: input.amount,
      paymentId: state.paymentId!,
    });

    state.transactionHash = escrowResult.transactionHash;
    state.completedSteps.push('escrow_created');

    // Wait for blockchain confirmation
    state.currentStep = 'Waiting for blockchain confirmation';
    
    await sleep('30 seconds'); // Average block time

    const blockchainStatus = await verifyBlockchainTransaction({
      transactionHash: state.transactionHash!,
    });

    if (blockchainStatus.status !== 'confirmed') {
      throw new Error(`Blockchain transaction failed: ${blockchainStatus.errorMessage}`);
    }

    state.completedSteps.push('blockchain_confirmed');

    await sendNotification({
      userId: input.buyerId,
      type: 'escrow_created',
      message: `Escrow created on blockchain: ${state.transactionHash}`,
      metadata: { transactionHash: state.transactionHash },
    });

    // Step 3: Create Ledger Transfer
    state.status = 'ledger_updated';
    state.currentStep = 'Recording transaction in financial ledger';

    const ledgerResult = await createLedgerTransfer({
      debitAccountId: input.buyerId,
      creditAccountId: input.sellerId,
      amount: input.amount,
      paymentId: state.paymentId!,
      transactionHash: state.transactionHash!,
      propertyId: input.propertyId,
    });

    state.transferId = ledgerResult.transferId;
    state.completedSteps.push('ledger_updated');

    // Verify ledger balance
    state.currentStep = 'Verifying ledger balance';
    
    const balanceStatus = await verifyLedgerBalance({
      accountId: input.sellerId,
      expectedIncrease: input.amount,
      transferId: state.transferId!,
    });

    if (!balanceStatus.verified) {
      throw new Error(`Ledger balance verification failed: ${balanceStatus.errorMessage}`);
    }

    state.completedSteps.push('ledger_verified');

    // Step 4: Transfer Property Title
    state.status = 'title_transferred';
    state.currentStep = 'Transferring property title';

    const titleResult = await transferPropertyTitle({
      propertyId: input.propertyId,
      fromOwnerId: input.sellerId,
      toOwnerId: input.buyerId,
      paymentId: state.paymentId!,
      transactionHash: state.transactionHash!,
      transferId: state.transferId!,
    });

    state.titleTransferId = titleResult.titleTransferId;
    state.completedSteps.push('title_transferred');

    // Step 5: Complete Transaction
    state.status = 'completed';
    state.currentStep = 'Transaction completed successfully';
    state.endTime = new Date();

    await sendNotification({
      userId: input.buyerId,
      type: 'transaction_completed',
      message: `Property ${input.propertyId} successfully transferred to your ownership`,
      metadata: {
        propertyId: input.propertyId,
        paymentId: state.paymentId,
        transactionHash: state.transactionHash,
        transferId: state.transferId,
        titleTransferId: state.titleTransferId,
      },
    });

    await sendNotification({
      userId: input.sellerId,
      type: 'transaction_completed',
      message: `Property ${input.propertyId} sold successfully. Funds transferred to your account`,
      metadata: {
        propertyId: input.propertyId,
        amount: input.amount,
        currency: input.currency,
      },
    });

    return state;

  } catch (error) {
    // Compensation logic (saga rollback)
    state.status = 'compensating';
    state.errorMessage = error instanceof Error ? error.message : 'Unknown error';
    state.currentStep = 'Rolling back transaction';

    await sendNotification({
      userId: input.buyerId,
      type: 'transaction_failed',
      message: `Transaction failed: ${state.errorMessage}`,
      metadata: { propertyId: input.propertyId },
    });

    // Compensate in reverse order
    try {
      // Rollback title transfer (if completed)
      if (state.completedSteps.includes('title_transferred')) {
        await transferPropertyTitle({
          propertyId: input.propertyId,
          fromOwnerId: input.buyerId,
          toOwnerId: input.sellerId,
          paymentId: state.paymentId!,
          transactionHash: state.transactionHash!,
          transferId: state.transferId!,
        });
      }

      // Void ledger transfer (if completed)
      if (state.completedSteps.includes('ledger_updated')) {
        await voidLedgerTransfer({
          transferId: state.transferId!,
          reason: state.errorMessage,
        });
      }

      // Refund escrow (if created)
      if (state.completedSteps.includes('escrow_created')) {
        await refundEscrow({
          transactionHash: state.transactionHash!,
          recipient: input.buyerId,
          reason: state.errorMessage,
        });
      }

      // Refund payment (if completed)
      if (state.completedSteps.includes('payment_completed')) {
        await refundPayment({
          paymentId: state.paymentId!,
          amount: input.amount,
          recipient: input.buyerId,
          reason: state.errorMessage,
        });
      }

      state.status = 'failed';
      state.currentStep = 'Transaction rolled back successfully';
      state.endTime = new Date();

      await sendNotification({
        userId: input.buyerId,
        type: 'transaction_refunded',
        message: `Transaction rolled back. Refund processed for ${input.amount} ${input.currency}`,
        metadata: { paymentId: state.paymentId },
      });

    } catch (compensationError) {
      // Compensation failed - requires manual intervention
      state.currentStep = 'Compensation failed - manual intervention required';
      
      await sendNotification({
        userId: 'admin',
        type: 'compensation_failed',
        message: `URGENT: Compensation failed for transaction ${state.paymentId}. Manual intervention required.`,
        metadata: {
          propertyId: input.propertyId,
          paymentId: state.paymentId,
          transactionHash: state.transactionHash,
          originalError: state.errorMessage,
          compensationError: compensationError instanceof Error ? compensationError.message : 'Unknown compensation error',
        },
      });
    }

    return state;
  }
}

/**
 * Query Workflow - Check transaction status without executing workflow
 */
export async function queryPropertyTransactionWorkflow(
  workflowId: string
): Promise<PropertyTransactionState> {
  // This is a query-only workflow that retrieves state
  // Implementation handled by Temporal client
  return {} as PropertyTransactionState;
}
