import { createHash } from "crypto";
import {
  AccountFlags,
  CreateAccountError,
  CreateTransferError,
  TransferFlags,
  type Account,
  type Client as TigerBeetleClient,
  type Transfer,
} from "tigerbeetle-node";
import { externalClients } from "./_core/externalClients";

const LEDGER_ID = Number(process.env.TIGERBEETLE_LEDGER_ID || 1);
const DEFAULT_ACCOUNT_CODE = Number(process.env.TIGERBEETLE_ACCOUNT_CODE || 1);
const DEFAULT_TRANSFER_CODE = Number(process.env.TIGERBEETLE_TRANSFER_CODE || 1);
const PENDING_TIMEOUT_SECONDS = Number(process.env.TIGERBEETLE_PENDING_TIMEOUT_SECONDS || 3_600);

function deterministicId(namespace: string, value: string): bigint {
  const hash = createHash("sha256").update(`${namespace}:${value}`).digest("hex").slice(0, 32);
  const generated = BigInt(`0x${hash}`);
  return generated === 0n ? 1n : generated;
}

function asMinorUnits(value: string | bigint): bigint {
  const amount = typeof value === "bigint" ? value : BigInt(value);
  if (amount <= 0n) throw new Error("TigerBeetle transfer amount must be a positive integer in the smallest currency unit");
  return amount;
}

function requireLedgerId(value: number, variableName: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 0xffff_ffff) {
    throw new Error(`${variableName} must be a positive unsigned 32-bit integer`);
  }
  return value;
}

async function client(): Promise<TigerBeetleClient> {
  const wrapper = externalClients.tigerbeetle;
  if (!wrapper) {
    throw new Error("TigerBeetle is not configured; set TIGERBEETLE_CLUSTER_ID and TIGERBEETLE_REPLICAS");
  }
  if (!wrapper.isConnected()) await wrapper.connect();
  const connected = wrapper.getClient();
  if (!connected) throw new Error("TigerBeetle client was not initialized");
  return connected;
}

function assertAccountResult(errors: Array<{ index: number; result: CreateAccountError }>): void {
  const unexpected = errors.filter((error) => error.result !== CreateAccountError.exists);
  if (unexpected.length) {
    throw new Error(`TigerBeetle account creation rejected: ${unexpected.map((error) => `${error.index}:${CreateAccountError[error.result]}`).join(", ")}`);
  }
}

function assertTransferResult(errors: Array<{ index: number; result: CreateTransferError }>): void {
  const unexpected = errors.filter((error) => error.result !== CreateTransferError.exists);
  if (unexpected.length) {
    throw new Error(`TigerBeetle transfer rejected: ${unexpected.map((error) => `${error.index}:${CreateTransferError[error.result]}`).join(", ")}`);
  }
}

function accountRecord(params: { accountId: string; code?: number; ledger?: number }): Account {
  return {
    id: deterministicId("account", params.accountId),
    debits_pending: 0n,
    debits_posted: 0n,
    credits_pending: 0n,
    credits_posted: 0n,
    user_data_128: 0n,
    user_data_64: 0n,
    user_data_32: 0,
    reserved: 0,
    ledger: requireLedgerId(params.ledger ?? LEDGER_ID, "TIGERBEETLE_LEDGER_ID"),
    code: requireLedgerId(params.code ?? DEFAULT_ACCOUNT_CODE, "TIGERBEETLE_ACCOUNT_CODE"),
    flags: AccountFlags.history,
    timestamp: 0n,
  };
}

export async function ensureLedgerAccounts(accounts: Array<{ accountId: string; code?: number; ledger?: number }>): Promise<void> {
  if (!accounts.length) return;
  const errors = await (await client()).createAccounts(accounts.map(accountRecord));
  assertAccountResult(errors);
}

export async function createLedgerTransfer(params: {
  transferReference: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string | bigint;
  code?: number;
  ledger?: number;
  metadataHash?: string;
}): Promise<{ transferId: string }> {
  const transferId = deterministicId("transfer", params.transferReference);
  const transfer: Transfer = {
    id: transferId,
    debit_account_id: deterministicId("account", params.debitAccountId),
    credit_account_id: deterministicId("account", params.creditAccountId),
    amount: asMinorUnits(params.amount),
    pending_id: 0n,
    user_data_128: params.metadataHash ? deterministicId("metadata", params.metadataHash) : 0n,
    user_data_64: 0n,
    user_data_32: 0,
    timeout: 0,
    ledger: requireLedgerId(params.ledger ?? LEDGER_ID, "TIGERBEETLE_LEDGER_ID"),
    code: requireLedgerId(params.code ?? DEFAULT_TRANSFER_CODE, "TIGERBEETLE_TRANSFER_CODE"),
    flags: TransferFlags.none,
    timestamp: 0n,
  };
  const errors = await (await client()).createTransfers([transfer]);
  assertTransferResult(errors);
  return { transferId: transferId.toString() };
}

export async function createPendingLedgerTransfer(params: {
  transferReference: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string | bigint;
  code?: number;
  ledger?: number;
  timeoutSeconds?: number;
}): Promise<{ pendingTransferId: string }> {
  const pendingTransferId = deterministicId("pending-transfer", params.transferReference);
  const timeout = params.timeoutSeconds ?? PENDING_TIMEOUT_SECONDS;
  if (!Number.isInteger(timeout) || timeout < 1) throw new Error("TigerBeetle pending transfer timeout must be a positive integer in seconds");
  const transfer: Transfer = {
    id: pendingTransferId,
    debit_account_id: deterministicId("account", params.debitAccountId),
    credit_account_id: deterministicId("account", params.creditAccountId),
    amount: asMinorUnits(params.amount),
    pending_id: 0n,
    user_data_128: 0n,
    user_data_64: 0n,
    user_data_32: 0,
    timeout,
    ledger: requireLedgerId(params.ledger ?? LEDGER_ID, "TIGERBEETLE_LEDGER_ID"),
    code: requireLedgerId(params.code ?? DEFAULT_TRANSFER_CODE, "TIGERBEETLE_TRANSFER_CODE"),
    flags: TransferFlags.pending,
    timestamp: 0n,
  };
  const errors = await (await client()).createTransfers([transfer]);
  assertTransferResult(errors);
  return { pendingTransferId: pendingTransferId.toString() };
}

export async function lookupLedgerTransfer(transferReference: string, pending = false): Promise<Transfer | null> {
  const id = deterministicId(pending ? "pending-transfer" : "transfer", transferReference);
  const results = await (await client()).lookupTransfers([id]);
  return results[0] ?? null;
}


export async function verifyLedgerTransfer(params: {
  transferId: string;
  creditAccountId: string;
  expectedAmount: string | bigint;
}): Promise<{ verified: boolean; actualBalance: string; errorMessage?: string }> {
  let transferId: bigint;
  try {
    transferId = BigInt(params.transferId);
  } catch {
    throw new Error("TigerBeetle transfer ID must be an unsigned integer");
  }
  const ledgerClient = await client();
  const transfer = (await ledgerClient.lookupTransfers([transferId]))[0];
  if (!transfer) {
    return { verified: false, actualBalance: "0", errorMessage: "Ledger transfer was not found" };
  }

  const expectedCreditAccount = deterministicId("account", params.creditAccountId);
  const expectedAmount = asMinorUnits(params.expectedAmount);
  const account = (await ledgerClient.lookupAccounts([expectedCreditAccount]))[0];
  const verified = transfer.credit_account_id === expectedCreditAccount && transfer.amount === expectedAmount;
  return {
    verified,
    actualBalance: account ? account.credits_posted.toString() : "0",
    errorMessage: verified ? undefined : "Ledger transfer destination or amount does not match the expected settlement",
  };
}

export async function reverseLedgerTransfer(params: {
  transferId: string;
  reversalReference: string;
}): Promise<{ reversalTransferId: string }> {
  let originalTransferId: bigint;
  try {
    originalTransferId = BigInt(params.transferId);
  } catch {
    throw new Error("TigerBeetle transfer ID must be an unsigned integer");
  }
  const ledgerClient = await client();
  const original = (await ledgerClient.lookupTransfers([originalTransferId]))[0];
  if (!original) throw new Error("Original TigerBeetle transfer was not found for reversal");
  if ((original.flags & TransferFlags.pending) !== 0) {
    throw new Error("Pending TigerBeetle transfers must be voided with a pending-transfer operation, not reversed");
  }

  const reversalId = deterministicId("reversal-transfer", params.reversalReference);
  const errors = await ledgerClient.createTransfers([{
    id: reversalId,
    debit_account_id: original.credit_account_id,
    credit_account_id: original.debit_account_id,
    amount: original.amount,
    pending_id: 0n,
    user_data_128: original.id,
    user_data_64: 0n,
    user_data_32: 0,
    timeout: 0,
    ledger: original.ledger,
    code: original.code,
    flags: TransferFlags.none,
    timestamp: 0n,
  }]);
  assertTransferResult(errors);
  return { reversalTransferId: reversalId.toString() };
}
