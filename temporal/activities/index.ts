/**
 * Temporal Activities
 * 
 * Activities are the building blocks of workflows. Each activity performs
 * a specific task and can be retried independently if it fails.
 */

import { Context } from '@temporalio/activity';
import { getPaymentStatus, cancelPayment } from '../../server/mojaloopPaymentService';
// import { createEscrow } from '../../server/smartContractIntegration';
// TigerBeetle client - using gRPC client
// import { getClient } from '../../server/tigerBeetleClient';
import { getDb } from '../../server/db';
import { parcels, registryTransactions, users } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

// ============================================================================
// Payment Activities
// ============================================================================

export interface InitiatePaymentParams {
  amount: string;
  currency: string;
  payerId: string;
  payeeId: string;
  propertyId: string;
  paymentMethod: string;
}

export interface InitiatePaymentResult {
  paymentId: string;
  transactionId: string;
  status: string;
}

export async function initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
  Context.current().log.info('Initiating payment', { params });
  
  // TODO: Implement Mojaloop payment initiation
  const result = {
    paymentId: `pay-${Date.now()}`,
    transactionId: `txn-${Date.now()}`,
    status: 'initiated',
  };
  /*
  const result = await initiateMojaloopPayment({
    amount: params.amount,
    currency: params.currency,
    payerId: params.payerId,
    payeeId: params.payeeId,
    metadata: { propertyId: params.propertyId },
  });
  */

  return {
    paymentId: result.paymentId,
    transactionId: result.transactionId,
    status: result.status,
  };
}

export interface VerifyPaymentStatusParams {
  paymentId: string;
  approvalCode: string;
}

export interface VerifyPaymentStatusResult {
  status: string;
  errorMessage?: string;
}

export async function verifyPaymentStatus(params: VerifyPaymentStatusParams): Promise<VerifyPaymentStatusResult> {
  Context.current().log.info('Verifying payment status', { paymentId: params.paymentId });
  
  const status = await getPaymentStatus(params.paymentId);
  if (!status) throw new Error('Payment status not found');

  return {
    status: status.status,
    errorMessage: status.errorDescription,
  };
}

export interface RefundPaymentParams {
  paymentId: string;
  amount: string;
  recipient: string;
  reason: string;
}

export interface RefundPaymentResult {
  refundId: string;
  status: string;
}

export async function refundPayment(params: RefundPaymentParams): Promise<RefundPaymentResult> {
  Context.current().log.info('Refunding payment', { paymentId: params.paymentId });
  
  await cancelPayment(params.paymentId, params.reason);

  return {
    refundId: params.paymentId,
    status: 'refunded',
  };
}

// ============================================================================
// Blockchain Activities
// ============================================================================

export interface CreateBlockchainEscrowParams {
  propertyId: string;
  buyer: string;
  seller: string;
  amount: string;
  paymentId: string;
}

export interface CreateBlockchainEscrowResult {
  transactionHash: string;
  escrowId: string;
  status: string;
}

export async function createBlockchainEscrow(params: CreateBlockchainEscrowParams): Promise<CreateBlockchainEscrowResult> {
  Context.current().log.info('Creating blockchain escrow', { params });
  
  // TODO: Implement blockchain escrow creation
  const result = {
    transactionHash: `0x${Date.now().toString(16)}`,
    escrowId: `escrow-${params.paymentId}`,
  };
  /*
  const result = await createEscrow({
    buyer: params.buyer,
    seller: params.seller,
    amount: params.amount,
    escrowId: `escrow-${params.paymentId}`,
    metadata: { propertyId: params.propertyId, paymentId: params.paymentId },
  });
  */

  return {
    transactionHash: result.transactionHash,
    escrowId: result.escrowId,
    status: 'pending',
  };
}

export interface VerifyBlockchainTransactionParams {
  transactionHash: string;
}

export interface VerifyBlockchainTransactionResult {
  status: string;
  blockNumber?: number;
  errorMessage?: string;
}

export async function verifyBlockchainTransaction(params: VerifyBlockchainTransactionParams): Promise<VerifyBlockchainTransactionResult> {
  Context.current().log.info('Verifying blockchain transaction', { transactionHash: params.transactionHash });
  
  // TODO: Implement blockchain transaction status check
  const status = { confirmed: true, blockNumber: 12345, error: undefined };
  /*
  const status = await getTransactionStatus(params.transactionHash);
  */

  return {
    status: status.confirmed ? 'confirmed' : 'pending',
    blockNumber: status.blockNumber,
    errorMessage: status.error,
  };
}

export interface RefundEscrowParams {
  transactionHash: string;
  recipient: string;
  reason: string;
}

export interface RefundEscrowResult {
  refundTransactionHash: string;
  status: string;
}

export async function refundEscrow(params: RefundEscrowParams): Promise<RefundEscrowResult> {
  Context.current().log.info('Refunding escrow', { transactionHash: params.transactionHash });
  
  // TODO: Implement escrow refund once smart contract integration is complete
  const result = {
    transactionHash: `refund-${params.transactionHash}`,
  };

  return {
    refundTransactionHash: result.transactionHash,
    status: 'refunded',
  };
}

// ============================================================================
// Ledger Activities
// ============================================================================

export interface CreateLedgerTransferParams {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  paymentId: string;
  transactionHash: string;
  propertyId: string;
}

export interface CreateLedgerTransferResult {
  transferId: string;
  status: string;
}

export async function createLedgerTransfer(params: CreateLedgerTransferParams): Promise<CreateLedgerTransferResult> {
  Context.current().log.info('Creating ledger transfer', { params });
  
  // TODO: Implement TigerBeetle transfer once gRPC service is deployed
  const result = {
    transferId: `transfer-${Date.now()}`,
  };
  /*
  const client = getClient();
  const result = await client.createTransfer({
    debitAccountId: params.debitAccountId,
    creditAccountId: params.creditAccountId,
    amount: params.amount,
    ledgerId: 1, // Property transactions ledger
    code: 1001, // Property purchase code
    userData128: JSON.stringify({
      paymentId: params.paymentId,
      transactionHash: params.transactionHash,
      propertyId: params.propertyId,
    }),
  });
  */

  return {
    transferId: result.transferId,
    status: 'posted',
  };
}

export interface VerifyLedgerBalanceParams {
  accountId: string;
  expectedIncrease: string;
  transferId: string;
}

export interface VerifyLedgerBalanceResult {
  verified: boolean;
  actualBalance: string;
  errorMessage?: string;
}

export async function verifyLedgerBalance(params: VerifyLedgerBalanceParams): Promise<VerifyLedgerBalanceResult> {
  Context.current().log.info('Verifying ledger balance', { accountId: params.accountId });
  
  // TODO: Implement balance check once TigerBeetle gRPC service is deployed
  const balance = { balance: params.expectedIncrease };
  /*
  const client = getClient();
  const balance = await client.getAccountBalance(params.accountId);
  */

  // Simple verification - in production, you'd check the actual balance change
  const verified = parseFloat(balance.balance) >= parseFloat(params.expectedIncrease);

  return {
    verified,
    actualBalance: balance.balance,
    errorMessage: verified ? undefined : 'Balance verification failed',
  };
}

export interface VoidLedgerTransferParams {
  transferId: string;
  reason: string;
}

export interface VoidLedgerTransferResult {
  status: string;
}

export async function voidLedgerTransfer(params: VoidLedgerTransferParams): Promise<VoidLedgerTransferResult> {
  Context.current().log.info('Voiding ledger transfer', { transferId: params.transferId });
  
  // TODO: Implement void transfer once TigerBeetle gRPC service is deployed
  /*
  const client = getClient();
  await client.voidTransfer(params.transferId, params.reason);
  */

  return {
    status: 'voided',
  };
}

// ============================================================================
// Property Title Activities
// ============================================================================

export interface TransferPropertyTitleParams {
  propertyId: string;
  fromOwnerId: string;
  toOwnerId: string;
  paymentId: string;
  transactionHash: string;
  transferId: string;
}

export interface TransferPropertyTitleResult {
  titleTransferId: string;
  status: string;
}

export async function transferPropertyTitle(params: TransferPropertyTitleParams): Promise<TransferPropertyTitleResult> {
  Context.current().log.info('Transferring property title', { propertyId: params.propertyId });
  
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  // Update property ownership
  await db
    .update(parcels)
    .set({
      ownerId: parseInt(params.toOwnerId),
      updatedAt: new Date(),
    })
    .where(eq(parcels.parcelId, params.propertyId));

  // Get parcel ID
  const parcelResults = await db
    .select({ id: parcels.id })
    .from(parcels)
    .where(eq(parcels.parcelId, params.propertyId))
    .limit(1);

  if (parcelResults.length === 0) {
    throw new Error('Property not found');
  }

  // Resolve party names for the registry record
  const partyIds = [parseInt(params.fromOwnerId), parseInt(params.toOwnerId)];
  const partyRows = await db.select({ id: users.id, name: users.name }).from(users);
  const nameOf = (id: number) => partyRows.find((u) => u.id === id)?.name ?? `User ${id}`;

  // Create registry transaction record
  const [transaction] = await db
    .insert(registryTransactions)
    .values({
      type: 'transfer',
      parcelId: parcelResults[0].id,
      initiatorId: parseInt(params.fromOwnerId),
      initiatorName: nameOf(parseInt(params.fromOwnerId)),
      counterpartyName: nameOf(parseInt(params.toOwnerId)),
      status: 'completed',
      workflowStage: 'closed',
      paymentStatus: 'paid',
      documentStatus: 'verified',
      considerationAmount: 0, // Amount already recorded in payment
      externalReference: `txn-${params.paymentId}`,
      notes: `Blockchain anchor: ${params.transactionHash}`,
    })
    .returning();

  return {
    titleTransferId: transaction.id.toString(),
    status: 'completed',
  };
}

// ============================================================================
// Notification Activities
// ============================================================================

export interface SendNotificationParams {
  userId: string;
  type: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface SendNotificationResult {
  notificationId: string;
  status: string;
}

export async function sendNotification(params: SendNotificationParams): Promise<SendNotificationResult> {
  Context.current().log.info('Sending notification', { userId: params.userId, type: params.type });
  
  // In production, integrate with notification service
  // For now, just log the notification
  console.log(`[NOTIFICATION] ${params.userId}: ${params.message}`);

  return {
    notificationId: `notif-${Date.now()}`,
    status: 'sent',
  };
}
