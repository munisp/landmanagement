import { Gateway, Wallets } from "fabric-network";
import * as fs from "node:fs";

/**
 * Hyperledger Fabric client for title transfers and escrow. Every operation is
 * submitted to or queried from the configured Fabric network; unavailable
 * configuration or gateways are surfaced as errors and never synthesized.
 */

const CHANNEL_NAME = "idlr-channel";
const CHAINCODE_NAME_TITLE = "title-transfer";
const CHAINCODE_NAME_ESCROW = "escrow";

interface FabricConfig {
  connectionProfile: string;
  walletPath: string;
  userId: string;
  orgMSP: string;
}

function fabricConfig(): FabricConfig {
  const config = {
    connectionProfile: process.env.FABRIC_CONNECTION_PROFILE?.trim() ?? "",
    walletPath: process.env.FABRIC_WALLET_PATH?.trim() ?? "",
    userId: process.env.FABRIC_USER_ID?.trim() ?? "",
    orgMSP: process.env.FABRIC_ORG_MSP?.trim() ?? "",
  };
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(`Fabric integration is not configured: ${missing.join(", ")}`);
  }
  return config;
}

async function initializeFabricWallet() {
  const config = fabricConfig();
  const wallet = await Wallets.newFileSystemWallet(config.walletPath);
  const identity = await wallet.get(config.userId);
  if (!identity) {
    throw new Error(`Fabric identity ${config.userId} is not present in the configured wallet`);
  }
  return { wallet, config };
}

async function connectToGateway(): Promise<Gateway> {
  const { wallet, config } = await initializeFabricWallet();
  if (!fs.existsSync(config.connectionProfile)) {
    throw new Error(`Fabric connection profile does not exist: ${config.connectionProfile}`);
  }

  const connectionProfile = JSON.parse(fs.readFileSync(config.connectionProfile, "utf8"));
  const gateway = new Gateway();
  try {
    await gateway.connect(connectionProfile, {
      wallet,
      identity: config.userId,
      discovery: { enabled: true, asLocalhost: false },
    });
    return gateway;
  } catch (error) {
    gateway.disconnect();
    throw new Error(`Fabric gateway connection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function withGateway<T>(operation: (gateway: Gateway) => Promise<T>): Promise<T> {
  const gateway = await connectToGateway();
  try {
    return await operation(gateway);
  } finally {
    gateway.disconnect();
  }
}

function parseContractJson(payload: Uint8Array, operation: string): any {
  try {
    return JSON.parse(Buffer.from(payload).toString("utf8"));
  } catch (error) {
    throw new Error(`Fabric ${operation} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function submitTitleTransfer(
  parcelId: string,
  fromOwner: string,
  toOwner: string,
  transactionId: string,
  amount: number,
): Promise<any> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Title transfer amount must be positive");
  return withGateway(async (gateway) => {
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_TITLE);
    const result = await contract.submitTransaction(
      "TransferTitle",
      parcelId,
      fromOwner,
      toOwner,
      transactionId,
      amount.toString(),
    );
    return parseContractJson(result, "TransferTitle");
  });
}

export async function createEscrow(
  escrowId: string,
  parcelId: string,
  buyer: string,
  seller: string,
  amount: number,
  releaseConditions: string[],
): Promise<any> {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Escrow amount must be positive");
  if (!releaseConditions.length) throw new Error("Escrow release conditions are required");
  return withGateway(async (gateway) => {
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_ESCROW);
    const result = await contract.submitTransaction(
      "CreateEscrow",
      escrowId,
      parcelId,
      buyer,
      seller,
      amount.toString(),
      JSON.stringify(releaseConditions),
    );
    return parseContractJson(result, "CreateEscrow");
  });
}

export async function releaseEscrow(escrowId: string, approver: string): Promise<any> {
  return withGateway(async (gateway) => {
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_ESCROW);
    const result = await contract.submitTransaction("ReleaseEscrow", escrowId, approver);
    return parseContractJson(result, "ReleaseEscrow");
  });
}

export async function queryTitleHistory(parcelId: string): Promise<any[]> {
  return withGateway(async (gateway) => {
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_TITLE);
    const result = await contract.evaluateTransaction("QueryTitleHistory", parcelId);
    const history = parseContractJson(result, "QueryTitleHistory");
    if (!Array.isArray(history)) throw new Error("Fabric QueryTitleHistory returned a non-array response");
    return history;
  });
}

export async function verifyTransaction(txId: string): Promise<any> {
  return withGateway(async (gateway) => {
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_TITLE);
    const result = await contract.evaluateTransaction("VerifyTransaction", txId);
    return parseContractJson(result, "VerifyTransaction");
  });
}

export async function getEscrowStatus(escrowId: string): Promise<any> {
  return withGateway(async (gateway) => {
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_ESCROW);
    const result = await contract.evaluateTransaction("GetEscrowStatus", escrowId);
    return parseContractJson(result, "GetEscrowStatus");
  });
}
