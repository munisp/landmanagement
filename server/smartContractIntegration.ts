/**
 * Smart Contract Integration Service
 * 
 * Integrates Mojaloop payments with Polygon blockchain smart contracts.
 * Handles escrow contract interactions and payment reconciliation.
 */

import { ethers } from 'ethers';
import { requireDb } from './db';
import { mojaloopTransactions, blockchainTransactions } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { reconcilePaymentWithEscrow } from './mojaloopPaymentService';

// Escrow Contract ABI (simplified)
const ESCROW_ABI = [
  'function createEscrow(address buyer, address seller, uint256 amount, string memory propertyId) external payable returns (uint256)',
  'function releaseEscrow(uint256 escrowId) external',
  'function refundEscrow(uint256 escrowId) external',
  'function getEscrowDetails(uint256 escrowId) external view returns (address, address, uint256, string, uint8)',
  'event EscrowCreated(uint256 indexed escrowId, address indexed buyer, address indexed seller, uint256 amount, string propertyId)',
  'event EscrowReleased(uint256 indexed escrowId)',
  'event EscrowRefunded(uint256 indexed escrowId)',
];

export interface SmartContractConfig {
  rpcUrl: string;
  chainId: number;
  escrowContractAddress: string;
  privateKey?: string; // Optional - for automated transactions
}

export interface EscrowDetails {
  buyer: string;
  seller: string;
  amount: bigint;
  propertyId: string;
  status: number; // 0: Active, 1: Released, 2: Refunded
}

/**
 * Smart Contract Integration Class
 */
export class SmartContractIntegration {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private signer?: ethers.Wallet;

  constructor(config: SmartContractConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(config.escrowContractAddress, ESCROW_ABI, this.signer);
    } else {
      this.contract = new ethers.Contract(config.escrowContractAddress, ESCROW_ABI, this.provider);
    }
  }

  /**
   * Create escrow for property transaction
   */
  async createEscrow(params: {
    buyer: string;
    seller: string;
    amount: string; // in wei
    propertyId: string;
  }): Promise<{
    escrowId: number;
    transactionHash: string;
  }> {
    if (!this.signer) {
      throw new Error('Signer required for creating escrow');
    }

    const tx = await this.contract.createEscrow(
      params.buyer,
      params.seller,
      ethers.parseEther(params.amount),
      params.propertyId,
      { value: ethers.parseEther(params.amount) }
    );

    const receipt = await tx.wait();

    // Parse EscrowCreated event
    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.contract.interface.parseLog(log);
        return parsed?.name === 'EscrowCreated';
      } catch {
        return false;
      }
    });

    if (!event) {
      throw new Error('EscrowCreated event not found');
    }

    const parsedEvent = this.contract.interface.parseLog(event);
    const escrowId = Number(parsedEvent?.args[0]);

    return {
      escrowId,
      transactionHash: receipt.hash,
    };
  }

  /**
   * Release escrow after payment confirmation
   */
  async releaseEscrow(escrowId: number): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for releasing escrow');
    }

    const tx = await this.contract.releaseEscrow(escrowId);
    const receipt = await tx.wait();

    return receipt.hash;
  }

  /**
   * Refund escrow if payment fails
   */
  async refundEscrow(escrowId: number): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for refunding escrow');
    }

    const tx = await this.contract.refundEscrow(escrowId);
    const receipt = await tx.wait();

    return receipt.hash;
  }

  /**
   * Get escrow details
   */
  async getEscrowDetails(escrowId: number): Promise<EscrowDetails> {
    const details = await this.contract.getEscrowDetails(escrowId);

    return {
      buyer: details[0],
      seller: details[1],
      amount: details[2],
      propertyId: details[3],
      status: details[4],
    };
  }

  /**
   * Verify transaction on blockchain
   */
  async verifyTransaction(transactionHash: string): Promise<{
    confirmed: boolean;
    blockNumber?: number;
    timestamp?: number;
  }> {
    const receipt = await this.provider.getTransactionReceipt(transactionHash);

    if (!receipt) {
      return { confirmed: false };
    }

    const block = await this.provider.getBlock(receipt.blockNumber);

    return {
      confirmed: receipt.status === 1,
      blockNumber: receipt.blockNumber,
      timestamp: block?.timestamp,
    };
  }
}

/**
 * Create escrow and link with Mojaloop payment
 */
export async function createEscrowForPayment(params: {
  mojaloopTransactionId: string;
  buyer: string;
  seller: string;
  amount: string;
  propertyId: string;
  contractConfig: SmartContractConfig;
}): Promise<{
  escrowId: number;
  transactionHash: string;
}> {
  const integration = new SmartContractIntegration(params.contractConfig);

  // Create escrow on blockchain
  const result = await integration.createEscrow({
    buyer: params.buyer,
    seller: params.seller,
    amount: params.amount,
    propertyId: params.propertyId,
  });

  // Update Mojaloop transaction with escrow details
  const db = await requireDb();

  await db
    .update(mojaloopTransactions)
    .set({
      escrowContractAddress: params.contractConfig.escrowContractAddress,
      blockchainTxHash: result.transactionHash,
      reconciledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mojaloopTransactions.transactionId, params.mojaloopTransactionId));

  // Get userId from Mojaloop transaction
  const mojaloopTx = await db.select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.transactionId, params.mojaloopTransactionId))
    .limit(1);
  const userId = mojaloopTx[0]?.userId || 0;

  // Create blockchain transaction record
  await db.insert(blockchainTransactions).values({
    txHash: result.transactionHash,
    userId,
    transactionType: 'escrow_creation',
    status: 'confirmed',
    blockNumber: 0, // Will be updated when verified
    fromAddress: params.buyer,
    toAddress: params.contractConfig.escrowContractAddress,
    contractAddress: params.contractConfig.escrowContractAddress,
    gasUsed: '0',
    metadata: {
      escrowId: result.escrowId,
      mojaloopTransactionId: params.mojaloopTransactionId,
      propertyId: params.propertyId,
    },
  });

  return result;
}

/**
 * Release escrow after Mojaloop payment completes
 */
export async function releaseEscrowOnPaymentComplete(params: {
  mojaloopTransactionId: string;
  escrowId: number;
  contractConfig: SmartContractConfig;
}): Promise<string> {
  const integration = new SmartContractIntegration(params.contractConfig);

  // Release escrow on blockchain
  const transactionHash = await integration.releaseEscrow(params.escrowId);

  // Update Mojaloop transaction
  const db = await requireDb();

  await db
    .update(mojaloopTransactions)
    .set({
      blockchainTxHash: transactionHash,
      reconciledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mojaloopTransactions.transactionId, params.mojaloopTransactionId));

  // Get userId from Mojaloop transaction
  const mojaloopTx = await db.select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.transactionId, params.mojaloopTransactionId))
    .limit(1);
  const userId = mojaloopTx[0]?.userId || 0;

  // Create blockchain transaction record
  await db.insert(blockchainTransactions).values({
    txHash: transactionHash,
    userId,
    transactionType: 'escrow_release',
    status: 'confirmed',
    blockNumber: 0,
    fromAddress: params.contractConfig.escrowContractAddress,
    toAddress: '0x0000000000000000000000000000000000000000',
    contractAddress: params.contractConfig.escrowContractAddress,
    gasUsed: '0',
    metadata: {
      escrowId: params.escrowId,
      mojaloopTransactionId: params.mojaloopTransactionId,
    },
  });

  return transactionHash;
}

/**
 * Refund escrow if Mojaloop payment fails
 */
export async function refundEscrowOnPaymentFailure(params: {
  mojaloopTransactionId: string;
  escrowId: number;
  contractConfig: SmartContractConfig;
}): Promise<string> {
  const integration = new SmartContractIntegration(params.contractConfig);

  // Refund escrow on blockchain
  const transactionHash = await integration.refundEscrow(params.escrowId);

  // Update Mojaloop transaction
  const db = await requireDb();

  await db
    .update(mojaloopTransactions)
    .set({
      blockchainTxHash: transactionHash,
      reconciledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mojaloopTransactions.transactionId, params.mojaloopTransactionId));

  // Get userId from Mojaloop transaction
  const mojaloopTx = await db.select()
    .from(mojaloopTransactions)
    .where(eq(mojaloopTransactions.transactionId, params.mojaloopTransactionId))
    .limit(1);
  const userId = mojaloopTx[0]?.userId || 0;

  // Create blockchain transaction record
  await db.insert(blockchainTransactions).values({
    txHash: transactionHash,
    userId,
    transactionType: 'escrow_refund',
    status: 'confirmed',
    blockNumber: 0,
    fromAddress: params.contractConfig.escrowContractAddress,
    toAddress: '0x0000000000000000000000000000000000000000',
    contractAddress: params.contractConfig.escrowContractAddress,
    gasUsed: '0',
    metadata: {
      escrowId: params.escrowId,
      mojaloopTransactionId: params.mojaloopTransactionId,
    },
  });

  return transactionHash;
}

/**
 * Get default smart contract configuration
 * In production, this should be loaded from environment variables or database
 */
export function getDefaultContractConfig(): SmartContractConfig {
  const rpcUrl = process.env.POLYGON_RPC_URL?.trim();
  const chainId = Number(process.env.POLYGON_CHAIN_ID);
  const escrowContractAddress = process.env.ESCROW_CONTRACT_ADDRESS?.trim();
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();

  if (!rpcUrl || !Number.isSafeInteger(chainId) || chainId <= 0 || !escrowContractAddress) {
    throw new Error("POLYGON_RPC_URL, POLYGON_CHAIN_ID, and ESCROW_CONTRACT_ADDRESS must be configured for blockchain escrow operations");
  }
  if (!ethers.isAddress(escrowContractAddress) || escrowContractAddress === ethers.ZeroAddress) {
    throw new Error("ESCROW_CONTRACT_ADDRESS must be a non-zero EVM address");
  }
  if (privateKey && !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hexadecimal private key");
  }

  return { rpcUrl, chainId, escrowContractAddress, privateKey };
}
