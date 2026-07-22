/**
 * Mojaloop Payment Service
 * 
 * High-level service for handling property-related payments through Mojaloop.
 * Orchestrates the complete payment flow: quote → transfer → reconciliation.
 */

import { requireDb } from './db';
import { mojaloopTransactions, users } from '../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';
import {
  MojaloopClient,
  getMojaloopClient,
  generateTransactionId,
  generateQuoteId,
  generateTransferId,
  type QuoteRequest,
  type TransferRequest,
  type Money,
  type PartyIdentifier,
} from './mojaloopClient';

export interface InitiatePaymentParams {
  userId: number;
  amount: string;
  currency: string;
  payerMsisdn: string; // Payer's phone number
  payeeMsisdn: string; // Payee's phone number
  propertyId?: string;
  escrowContractAddress?: string;
  purpose?: string;
  note?: string;
}

export interface PaymentStatus {
  transactionId: string;
  status: string;
  amount: string;
  currency: string;
  createdAt: Date;
  completedAt?: Date;
  errorCode?: string;
  errorDescription?: string;
}

/**
 * Initiate a property payment through Mojaloop
 */
export async function initiatePropertyPayment(params: InitiatePaymentParams): Promise<{
  transactionId: string;
  quoteId: string;
  quotedAmount: string;
  fees: string;
  expiration: string;
}> {
  const db = await requireDb();

  // Generate unique IDs
  const transactionId = generateTransactionId();
  const quoteId = generateQuoteId();

  // Get user details
  const userResults = await db
    .select()
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (userResults.length === 0) {
    throw new Error('User not found');
  }

  const user = userResults[0];

  // Get Mojaloop client
  const client = await getMojaloopClient();

  // Create quote request
  const quoteRequest: QuoteRequest = {
    quoteId,
    transactionId,
    payer: {
      partyIdType: 'MSISDN',
      partyIdentifier: params.payerMsisdn,
      personalInfo: {
        name: user.name || undefined,
      },
    },
    payee: {
      partyIdType: 'MSISDN',
      partyIdentifier: params.payeeMsisdn,
    },
    amountType: 'SEND',
    amount: {
      currency: params.currency,
      amount: params.amount,
    },
    transactionType: {
      scenario: 'TRANSFER',
      initiator: 'PAYER',
      initiatorType: 'CONSUMER',
    },
    note: params.note,
    expiration: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes from now
  };

  // Request quote from Mojaloop
  const quoteResponse = await client.requestQuote(quoteRequest);

  // Save transaction to database
  await db.insert(mojaloopTransactions).values({
    transactionId,
    quoteId,
    userId: params.userId,
    propertyId: params.propertyId || null,
    escrowContractAddress: params.escrowContractAddress || null,
    amount: parseFloat(params.amount),
    currency: params.currency,
    payerFspId: process.env.MOJALOOP_PAYER_FSP_ID || 'default-fsp',
    payerPartyIdType: 'MSISDN',
    payerPartyIdentifier: params.payerMsisdn,
    payerName: user.name || null,
    payeeFspId: process.env.MOJALOOP_PAYEE_FSP_ID || 'default-fsp', // In production, lookup from party API
    payeePartyIdType: 'MSISDN',
    payeePartyIdentifier: params.payeeMsisdn,
    status: 'quote_received',
    quoteAmount: parseFloat(quoteResponse.transferAmount.amount),
    quoteFees: quoteResponse.payeeFspFee ? parseFloat(quoteResponse.payeeFspFee.amount) : null,
    quoteExpiration: new Date(quoteResponse.expiration),
    transferCondition: quoteResponse.condition,
    note: params.note || null,
    transactionType: 'property_purchase',
    purpose: params.purpose || null,
  });

  return {
    transactionId,
    quoteId,
    quotedAmount: quoteResponse.transferAmount.amount,
    fees: quoteResponse.payeeFspFee?.amount || '0',
    expiration: quoteResponse.expiration,
  };
}

/**
 * Execute a payment after quote approval
 */
export async function executePayment(transactionId: string): Promise<{
  transferId: string;
  status: string;
}> {
  const db = await requireDb();

  // Get transaction details
  const transactions = await db
    .select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.transactionId, transactionId))
    .limit(1);

  if (transactions.length === 0) {
    throw new Error('Transaction not found');
  }

  const transaction = transactions[0];

  // Verify transaction is in correct state
  if (transaction.status !== 'quote_received') {
    throw new Error(`Cannot execute payment in status: ${transaction.status}`);
  }

  // Check if quote has expired
  if (transaction.quoteExpiration && new Date(transaction.quoteExpiration) < new Date()) {
    await db
      .update(mojaloopTransactions)
      .set({ status: 'failed', errorDescription: 'Quote expired' })
      .where(eq(mojaloopTransactions.transactionId, transactionId));
    
    throw new Error('Quote has expired. Please request a new quote.');
  }

  // Get Mojaloop client
  const client = await getMojaloopClient();

  // Generate transfer ID
  const transferId = generateTransferId();

  // Generate ILP packet and condition
  const { ilpPacket, fulfilment } = client.generateIlpPacketAndCondition(
    { currency: transaction.currency, amount: transaction.quoteAmount?.toString() || transaction.amount.toString() },
    { partyIdType: transaction.payeePartyIdType as any, partyIdentifier: transaction.payeePartyIdentifier }
  );

  // Prepare transfer request
  const transferRequest: TransferRequest = {
    transferId,
    payerFsp: transaction.payerFspId,
    payeeFsp: transaction.payeeFspId,
    amount: {
      currency: transaction.currency,
      amount: transaction.quoteAmount?.toString() || transaction.amount.toString(),
    },
    ilpPacket,
    condition: transaction.transferCondition || '',
    expiration: transaction.quoteExpiration?.toISOString() || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };

  // Prepare transfer
  await client.prepareTransfer(transferRequest);

  // Update transaction status
  await db
    .update(mojaloopTransactions)
    .set({
      transferId,
      status: 'reserved',
      transferState: 'RESERVED',
      transferFulfilment: fulfilment,
      updatedAt: new Date(),
    })
    .where(eq(mojaloopTransactions.transactionId, transactionId));

  // Commit transfer
  const transferResponse = await client.commitTransfer(transferId, fulfilment);

  // Update transaction to completed
  await db
    .update(mojaloopTransactions)
    .set({
      status: 'completed',
      transferState: transferResponse.transferState,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mojaloopTransactions.transactionId, transactionId));

  return {
    transferId,
    status: 'completed',
  };
}

/**
 * Get payment status
 */
export async function getPaymentStatus(transactionId: string): Promise<PaymentStatus | null> {
  const db = await requireDb();


  const transactions = await db
    .select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.transactionId, transactionId))
    .limit(1);

  if (transactions.length === 0) {
    return null;
  }

  const transaction = transactions[0];

  return {
    transactionId: transaction.transactionId,
    status: transaction.status,
    amount: transaction.amount.toString(),
    currency: transaction.currency,
    createdAt: new Date(transaction.createdAt),
    completedAt: transaction.completedAt ? new Date(transaction.completedAt) : undefined,
    errorCode: transaction.errorCode || undefined,
    errorDescription: transaction.errorDescription || undefined,
  };
}

/**
 * Get user's payment history
 */
export async function getUserPaymentHistory(userId: number, limit: number = 10): Promise<PaymentStatus[]> {
  const db = await requireDb();


  const transactions = await db
    .select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.userId, userId))
    .orderBy(desc(mojaloopTransactions.createdAt))
    .limit(limit);

  return transactions.map(tx => ({
    transactionId: tx.transactionId,
    status: tx.status,
    amount: tx.amount.toString(),
    currency: tx.currency,
    createdAt: new Date(tx.createdAt),
    completedAt: tx.completedAt ? new Date(tx.completedAt) : undefined,
    errorCode: tx.errorCode || undefined,
    errorDescription: tx.errorDescription || undefined,
  }));
}

/**
 * Cancel a pending payment
 */
export async function cancelPayment(transactionId: string, reason: string): Promise<void> {
  const db = await requireDb();


  const transactions = await db
    .select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.transactionId, transactionId))
    .limit(1);

  if (transactions.length === 0) {
    throw new Error('Transaction not found');
  }

  const transaction = transactions[0];

  // Only allow cancellation of pending/quote_received transactions
  if (!['pending', 'quote_received'].includes(transaction.status)) {
    throw new Error(`Cannot cancel payment in status: ${transaction.status}`);
  }

  await db
    .update(mojaloopTransactions)
    .set({
      status: 'rejected',
      errorDescription: `Cancelled by user: ${reason}`,
      updatedAt: new Date(),
    })
    .where(eq(mojaloopTransactions.transactionId, transactionId));
}

/**
 * Reconcile payment with blockchain escrow
 */
export async function reconcilePaymentWithEscrow(
  transactionId: string,
  blockchainTxHash: string
): Promise<void> {
  const db = await requireDb();


  await db
    .update(mojaloopTransactions)
    .set({
      blockchainTxHash,
      reconciledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mojaloopTransactions.transactionId, transactionId));
}


/**
 * Execute a full Mojaloop refund as a new, linked transfer. Mojaloop settlement
 * is immutable, so a completed payment is reversed by sending a compensating
 * transfer from the original payee back to the original payer.
 */
export async function refundCompletedPayment(params: {
  transactionId: string;
  reason: string;
}): Promise<{ refundTransactionId: string; transferId: string; status: "completed" }> {
  const db = await requireDb();
  const originals = await db
    .select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.transactionId, params.transactionId))
    .limit(1);
  const original = originals[0];
  if (!original) throw new Error("Original Mojaloop transaction was not found");
  if (original.status !== "completed") {
    throw new Error(`Only completed Mojaloop transactions can be refunded; current status is ${original.status}`);
  }

  const existing = await db
    .select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.reversalOfTransactionId, original.transactionId))
    .limit(1);
  if (existing[0]?.status === "completed" && existing[0].transferId) {
    return { refundTransactionId: existing[0].transactionId, transferId: existing[0].transferId, status: "completed" };
  }
  if (existing[0]) {
    throw new Error(`A refund transaction already exists in status ${existing[0].status}; inspect it before retrying`);
  }

  const client = await getMojaloopClient();
  const refundTransactionId = generateTransactionId();
  const quoteId = generateQuoteId();
  const amount = original.quoteAmount?.toString() || original.amount.toString();
  const expiration = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const quote = await client.requestQuote({
    quoteId,
    transactionId: refundTransactionId,
    payer: {
      partyIdType: original.payeePartyIdType as PartyIdentifier["partyIdType"],
      partyIdentifier: original.payeePartyIdentifier,
      personalInfo: { name: original.payeeName || undefined },
    },
    payee: {
      partyIdType: original.payerPartyIdType as PartyIdentifier["partyIdType"],
      partyIdentifier: original.payerPartyIdentifier,
      personalInfo: { name: original.payerName || undefined },
    },
    amountType: "SEND",
    amount: { currency: original.currency, amount },
    transactionType: { scenario: "REFUND", initiator: "PAYEE", initiatorType: "BUSINESS" },
    note: `Refund for ${original.transactionId}: ${params.reason}`,
    expiration,
  });

  const transferId = generateTransferId();
  const { ilpPacket, fulfilment } = client.generateIlpPacketAndCondition(
    { currency: original.currency, amount: quote.transferAmount.amount },
    { partyIdType: original.payerPartyIdType as PartyIdentifier["partyIdType"], partyIdentifier: original.payerPartyIdentifier },
  );

  await db.insert(mojaloopTransactions).values({
    transactionId: refundTransactionId,
    reversalOfTransactionId: original.transactionId,
    quoteId,
    userId: original.userId,
    propertyId: original.propertyId,
    escrowContractAddress: original.escrowContractAddress,
    amount: Number(quote.transferAmount.amount),
    currency: original.currency,
    payerFspId: original.payeeFspId,
    payerPartyIdType: original.payeePartyIdType,
    payerPartyIdentifier: original.payeePartyIdentifier,
    payerName: original.payeeName,
    payeeFspId: original.payerFspId,
    payeePartyIdType: original.payerPartyIdType,
    payeePartyIdentifier: original.payerPartyIdentifier,
    payeeName: original.payerName,
    status: "pending",
    quoteAmount: Number(quote.transferAmount.amount),
    quoteFees: quote.payeeFspFee ? Number(quote.payeeFspFee.amount) : null,
    quoteExpiration: new Date(quote.expiration),
    transferCondition: quote.condition,
    note: `Refund for ${original.transactionId}: ${params.reason}`,
    transactionType: "transfer",
    purpose: "property_payment_refund",
  });

  const transferRequest: TransferRequest = {
    transferId,
    payerFsp: original.payeeFspId,
    payeeFsp: original.payerFspId,
    amount: { currency: original.currency, amount: quote.transferAmount.amount },
    ilpPacket,
    condition: quote.condition,
    expiration: quote.expiration,
  };
  await client.prepareTransfer(transferRequest);
  await db
    .update(mojaloopTransactions)
    .set({ transferId, status: "reserved", transferState: "RESERVED", transferFulfilment: fulfilment, updatedAt: new Date() })
    .where(eq(mojaloopTransactions.transactionId, refundTransactionId));

  const response = await client.commitTransfer(transferId, fulfilment);
  if (response.transferState !== "COMMITTED") {
    await db
      .update(mojaloopTransactions)
      .set({ status: "failed", transferState: response.transferState, errorDescription: "Mojaloop refund was not committed", updatedAt: new Date() })
      .where(eq(mojaloopTransactions.transactionId, refundTransactionId));
    throw new Error(`Mojaloop refund was not committed: ${response.transferState}`);
  }
  await db
    .update(mojaloopTransactions)
    .set({ status: "completed", transferState: response.transferState, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(mojaloopTransactions.transactionId, refundTransactionId));

  return { refundTransactionId, transferId, status: "completed" };
}
