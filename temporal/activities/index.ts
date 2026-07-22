import { Context } from "@temporalio/activity";
import { and, eq, inArray } from "drizzle-orm";
import {
  blockchainTransactions,
  notificationInbox,
  parcels,
  registryTransactions,
  users,
} from "../../drizzle/schema";
import {
  cancelPayment,
  executePayment,
  getPaymentStatus,
  initiatePropertyPayment,
  refundCompletedPayment,
} from "../../server/mojaloopPaymentService";
import {
  createEscrowForPayment,
  getDefaultContractConfig,
  refundEscrowOnPaymentFailure,
  SmartContractIntegration,
} from "../../server/smartContractIntegration";
import { requireDb } from "../../server/db";
import {
  createLedgerTransfer as createTigerBeetleTransfer,
  ensureLedgerAccounts,
  reverseLedgerTransfer,
  verifyLedgerTransfer,
} from "../../server/tigerbeetleLedgerService";
import { queueEvent } from "../../server/eventBus";
import { sendNotification as deliverNotification } from "../../server/notificationDelivery";

function toUserId(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive application user ID`);
  return parsed;
}

function amountToMinorUnits(value: string): string {
  const decimals = Number(process.env.LEDGER_CURRENCY_DECIMALS || 2);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("LEDGER_CURRENCY_DECIMALS must be an integer between 0 and 9");
  }
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error("Transaction amount must be a positive decimal string");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Transaction amount cannot contain more than ${decimals} decimal places`);
  const result = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  if (BigInt(result) <= 0n) throw new Error("Transaction amount must be positive");
  return result;
}

async function requiredUser(id: number) {
  const db = await requireDb();
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new Error(`User ${id} was not found`);
  return rows[0];
}

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
  Context.current().log.info("Initiating Mojaloop payment", { propertyId: params.propertyId, payerId: params.payerId, payeeId: params.payeeId });
  if (params.paymentMethod !== "mojaloop") {
    throw new Error(`Unsupported payment method ${params.paymentMethod}; only the configured Mojaloop rail is accepted by this workflow`);
  }
  const payer = await requiredUser(toUserId(params.payerId, "payerId"));
  const payee = await requiredUser(toUserId(params.payeeId, "payeeId"));
  if (!payer.phone || !payee.phone) {
    throw new Error("Both buyer and seller require verified MSISDN numbers before a Mojaloop payment can be initiated");
  }

  const result = await initiatePropertyPayment({
    userId: payer.id,
    amount: params.amount,
    currency: params.currency,
    payerMsisdn: payer.phone,
    payeeMsisdn: payee.phone,
    propertyId: params.propertyId,
    purpose: "property_purchase",
    note: `Property purchase for ${params.propertyId}`,
  });
  return { paymentId: result.transactionId, transactionId: result.transactionId, status: "quote_received" };
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
  Context.current().log.info("Executing and verifying Mojaloop payment", { paymentId: params.paymentId });
  if (!params.approvalCode?.trim()) throw new Error("A payment approval code is required");
  const current = await getPaymentStatus(params.paymentId);
  if (!current) throw new Error("Payment status was not found");
  if (current.status === "quote_received") await executePayment(params.paymentId);
  const result = await getPaymentStatus(params.paymentId);
  if (!result) throw new Error("Payment status was not found after execution");
  return { status: result.status, errorMessage: result.errorDescription };
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
  Context.current().log.info("Executing Mojaloop compensation refund", { paymentId: params.paymentId });
  const original = await getPaymentStatus(params.paymentId);
  if (!original) throw new Error("Original payment was not found for refund");
  if (original.status === "quote_received" || original.status === "pending") {
    await cancelPayment(params.paymentId, params.reason);
    return { refundId: params.paymentId, status: "cancelled" };
  }
  const refund = await refundCompletedPayment({ transactionId: params.paymentId, reason: params.reason });
  return { refundId: refund.refundTransactionId, status: refund.status };
}

export interface CreateBlockchainEscrowParams {
  propertyId: string;
  buyer: string;
  seller: string;
  amount: string;
  paymentId: string;
}

export interface CreateBlockchainEscrowResult {
  transactionHash: string;
  escrowId: number;
  status: string;
}

export async function createBlockchainEscrow(params: CreateBlockchainEscrowParams): Promise<CreateBlockchainEscrowResult> {
  Context.current().log.info("Creating blockchain escrow", { propertyId: params.propertyId, paymentId: params.paymentId });
  const buyer = await requiredUser(toUserId(params.buyer, "buyer"));
  const seller = await requiredUser(toUserId(params.seller, "seller"));
  if (!buyer.walletAddress || !seller.walletAddress) {
    throw new Error("Both buyer and seller require verified wallet addresses before escrow can be created");
  }
  const result = await createEscrowForPayment({
    mojaloopTransactionId: params.paymentId,
    buyer: buyer.walletAddress,
    seller: seller.walletAddress,
    amount: params.amount,
    propertyId: params.propertyId,
    contractConfig: getDefaultContractConfig(),
  });
  return { transactionHash: result.transactionHash, escrowId: result.escrowId, status: "confirmed" };
}

export interface VerifyBlockchainTransactionParams { transactionHash: string; }
export interface VerifyBlockchainTransactionResult { status: string; blockNumber?: number; errorMessage?: string; }

export async function verifyBlockchainTransaction(params: VerifyBlockchainTransactionParams): Promise<VerifyBlockchainTransactionResult> {
  const verification = await new SmartContractIntegration(getDefaultContractConfig()).verifyTransaction(params.transactionHash);
  return {
    status: verification.confirmed ? "confirmed" : "pending",
    blockNumber: verification.blockNumber,
    errorMessage: verification.confirmed ? undefined : "Blockchain transaction has not yet been confirmed",
  };
}

export interface RefundEscrowParams {
  escrowId: number;
  paymentId: string;
  reason: string;
}
export interface RefundEscrowResult { refundTransactionHash: string; status: string; }

export async function refundEscrow(params: RefundEscrowParams): Promise<RefundEscrowResult> {
  Context.current().log.info("Refunding blockchain escrow", { escrowId: params.escrowId, paymentId: params.paymentId });
  const transactionHash = await refundEscrowOnPaymentFailure({
    mojaloopTransactionId: params.paymentId,
    escrowId: params.escrowId,
    contractConfig: getDefaultContractConfig(),
  });
  return { refundTransactionHash: transactionHash, status: "confirmed" };
}

export interface CreateLedgerTransferParams {
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
  paymentId: string;
  transactionHash: string;
  propertyId: string;
}
export interface CreateLedgerTransferResult { transferId: string; status: string; }

export async function createLedgerTransfer(params: CreateLedgerTransferParams): Promise<CreateLedgerTransferResult> {
  Context.current().log.info("Creating TigerBeetle ledger transfer", { paymentId: params.paymentId });
  const minorAmount = amountToMinorUnits(params.amount);
  await ensureLedgerAccounts([{ accountId: params.debitAccountId }, { accountId: params.creditAccountId }]);
  const result = await createTigerBeetleTransfer({
    transferReference: `property-payment:${params.paymentId}`,
    debitAccountId: params.debitAccountId,
    creditAccountId: params.creditAccountId,
    amount: minorAmount,
    metadataHash: `${params.propertyId}:${params.transactionHash}`,
  });
  return { transferId: result.transferId, status: "posted" };
}

export interface VerifyLedgerBalanceParams { accountId: string; expectedIncrease: string; transferId: string; }
export interface VerifyLedgerBalanceResult { verified: boolean; actualBalance: string; errorMessage?: string; }

export async function verifyLedgerBalance(params: VerifyLedgerBalanceParams): Promise<VerifyLedgerBalanceResult> {
  return verifyLedgerTransfer({
    transferId: params.transferId,
    creditAccountId: params.accountId,
    expectedAmount: amountToMinorUnits(params.expectedIncrease),
  });
}

export interface VoidLedgerTransferParams { transferId: string; reason: string; }
export interface VoidLedgerTransferResult { status: string; }

export async function voidLedgerTransfer(params: VoidLedgerTransferParams): Promise<VoidLedgerTransferResult> {
  const result = await reverseLedgerTransfer({
    transferId: params.transferId,
    reversalReference: `workflow-compensation:${params.transferId}:${params.reason}`,
  });
  return { status: `reversed:${result.reversalTransferId}` };
}

export interface TransferPropertyTitleParams {
  propertyId: string;
  fromOwnerId: string;
  toOwnerId: string;
  paymentId: string;
  transactionHash: string;
  transferId: string;
  amount?: string;
}
export interface TransferPropertyTitleResult { titleTransferId: string; status: string; }

export async function transferPropertyTitle(params: TransferPropertyTitleParams): Promise<TransferPropertyTitleResult> {
  Context.current().log.info("Transferring property title", { propertyId: params.propertyId });
  const db = await requireDb();
  const fromOwnerId = toUserId(params.fromOwnerId, "fromOwnerId");
  const toOwnerId = toUserId(params.toOwnerId, "toOwnerId");
  const [fromOwner, toOwner] = await Promise.all([requiredUser(fromOwnerId), requiredUser(toOwnerId)]);
  const result = await db.transaction(async (tx) => {
    const parcelRows = await tx.select().from(parcels).where(eq(parcels.parcelId, params.propertyId)).limit(1);
    const parcel = parcelRows[0];
    if (!parcel) throw new Error("Property was not found");
    if (parcel.ownerId !== fromOwnerId) throw new Error("Property ownership changed before title transfer could be finalized");
    const updated = await tx
      .update(parcels)
      .set({ ownerId: toOwnerId, lastTransferDate: new Date(), updatedAt: new Date() })
      .where(and(eq(parcels.parcelId, params.propertyId), eq(parcels.ownerId, fromOwnerId)))
      .returning({ id: parcels.id });
    if (!updated[0]) throw new Error("Property title transfer was not applied due to a concurrent ownership change");

    const consideration = params.amount ? Number(amountToMinorUnits(params.amount)) : 0;
    if (!Number.isSafeInteger(consideration)) throw new Error("Transaction consideration exceeds the supported safe integer range");
    const [transaction] = await tx.insert(registryTransactions).values({
      type: "transfer",
      parcelId: parcel.id,
      initiatorId: fromOwner.id,
      initiatorName: fromOwner.name || `user:${fromOwner.id}`,
      counterpartyName: toOwner.name || `user:${toOwner.id}`,
      status: "completed",
      workflowStage: "closed",
      paymentStatus: "paid",
      documentStatus: "verified",
      considerationAmount: consideration,
      externalReference: `title:${params.paymentId}:${fromOwner.id}:${toOwner.id}`,
      notes: `Mojaloop payment=${params.paymentId}; blockchain transaction=${params.transactionHash}; TigerBeetle transfer=${params.transferId}`,
    }).returning();
    return transaction;
  });
  return { titleTransferId: result.id.toString(), status: "completed" };
}

export interface SendNotificationParams { userId: string; type: string; message: string; metadata?: Record<string, unknown>; }
export interface SendNotificationResult { notificationId: string; status: string; }

export async function sendNotification(params: SendNotificationParams): Promise<SendNotificationResult> {
  const db = await requireDb();
  const recipients = params.userId === "admin"
    ? await db.select().from(users).where(inArray(users.role, ["admin"] as any))
    : [await requiredUser(toUserId(params.userId, "userId"))];
  if (!recipients.length) throw new Error("No notification recipient was found");

  const records = await db.insert(notificationInbox).values(recipients.map((recipient) => ({
    userId: recipient.id,
    type: params.type,
    title: params.type.replace(/_/g, " "),
    message: params.message,
    data: params.metadata ?? null,
  }))).returning();

  for (const recipient of recipients) {
    await queueEvent({
      backend: "dapr_pubsub",
      topic: "notification-requested",
      eventType: "notification.requested.v1",
      aggregateType: "notification",
      aggregateId: String(recipient.id),
      partitionKey: String(recipient.id),
      payload: { notificationId: records.find((record) => record.userId === recipient.id)?.id, userId: recipient.id, type: params.type, message: params.message, metadata: params.metadata ?? {} },
      deliveryStatus: "pending",
      availableAt: new Date(),
    });
    const delivery = await deliverNotification({ email: recipient.email || undefined, phone: recipient.phone || undefined, smsMessage: params.message });
    if (delivery.email?.success === false || delivery.sms?.success === false) {
      Context.current().log.warn("A notification delivery channel failed; durable inbox and outbox records remain available", { userId: recipient.id });
    }
  }
  return { notificationId: records[0].id.toString(), status: "queued" };
}
