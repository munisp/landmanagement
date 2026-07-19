import { ethers } from 'ethers';
import { requireDb } from './db';
import { sql } from 'drizzle-orm';

// Property Transfer Smart Contract ABI (simplified)
const PROPERTY_TRANSFER_ABI = [
  "function transferProperty(uint256 parcelId, address newOwner, bytes32 documentHash) external returns (uint256)",
  "function getPropertyOwner(uint256 parcelId) external view returns (address)",
  "function getTransferHistory(uint256 parcelId) external view returns (tuple(address from, address to, uint256 timestamp, bytes32 documentHash)[])",
  "event PropertyTransferred(uint256 indexed parcelId, address indexed from, address indexed to, bytes32 documentHash, uint256 timestamp)"
];

// Multi-Signature Wallet ABI (simplified)
const MULTISIG_ABI = [
  "function submitTransaction(address destination, uint256 value, bytes data) external returns (uint256)",
  "function confirmTransaction(uint256 transactionId) external",
  "function executeTransaction(uint256 transactionId) external",
  "function getConfirmationCount(uint256 transactionId) external view returns (uint256)",
  "event Confirmation(address indexed sender, uint256 indexed transactionId)",
  "event Execution(uint256 indexed transactionId)"
];

// Escrow Smart Contract ABI (simplified)
const ESCROW_ABI = [
  "function createEscrow(uint256 parcelId, address seller, address buyer, uint256 amount) external returns (uint256)",
  "function depositFunds(uint256 escrowId) external payable",
  "function releaseToSeller(uint256 escrowId) external",
  "function refundToBuyer(uint256 escrowId) external",
  "function getEscrowStatus(uint256 escrowId) external view returns (uint8)",
  "event EscrowCreated(uint256 indexed escrowId, uint256 indexed parcelId, address seller, address buyer, uint256 amount)",
  "event FundsDeposited(uint256 indexed escrowId, uint256 amount)",
  "event FundsReleased(uint256 indexed escrowId, address recipient, uint256 amount)"
];

export interface BlockchainConfig {
  rpcUrl: string;
  chainId: number;
  propertyContractAddress?: string;
  multisigContractAddress?: string;
  escrowContractAddress?: string;
  privateKey?: string; // For server-side signing (use with caution)
}

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private propertyContract?: ethers.Contract;
  private multisigContract?: ethers.Contract;
  private escrowContract?: ethers.Contract;
  private config: BlockchainConfig;

  constructor(config: BlockchainConfig) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    
    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }

    if (config.propertyContractAddress) {
      this.propertyContract = new ethers.Contract(
        config.propertyContractAddress,
        PROPERTY_TRANSFER_ABI,
        this.signer || this.provider
      );
    }

    if (config.multisigContractAddress) {
      this.multisigContract = new ethers.Contract(
        config.multisigContractAddress,
        MULTISIG_ABI,
        this.signer || this.provider
      );
    }

    if (config.escrowContractAddress) {
      this.escrowContract = new ethers.Contract(
        config.escrowContractAddress,
        ESCROW_ABI,
        this.signer || this.provider
      );
    }
  }

  // Property Transfer Functions
  async transferProperty(parcelId: number, newOwnerAddress: string, documentHash: string): Promise<string> {
    if (!this.propertyContract || !this.signer) {
      throw new Error('Property contract not initialized or no signer available');
    }

    const tx = await this.propertyContract.transferProperty(
      parcelId,
      newOwnerAddress,
      ethers.id(documentHash) // Convert to bytes32
    );

    await this.recordTransaction({
      transactionHash: tx.hash,
      parcelId,
      transactionType: 'property_transfer',
      fromAddress: await this.signer.getAddress(),
      toAddress: newOwnerAddress,
      contractAddress: await this.propertyContract.getAddress(),
      status: 'pending',
      metadata: { documentHash }
    });

    const receipt = await tx.wait();
    
    await this.updateTransaction(tx.hash, {
      blockNumber: receipt!.blockNumber,
      gasUsed: receipt!.gasUsed.toString(),
      status: 'confirmed',
      confirmedAt: new Date()
    });

    return tx.hash;
  }

  async getPropertyOwner(parcelId: number): Promise<string> {
    if (!this.propertyContract) {
      throw new Error('Property contract not initialized');
    }

    return await this.propertyContract.getPropertyOwner(parcelId);
  }

  async getTransferHistory(parcelId: number): Promise<any[]> {
    if (!this.propertyContract) {
      throw new Error('Property contract not initialized');
    }

    const history = await this.propertyContract.getTransferHistory(parcelId);
    return history.map((entry: any) => ({
      from: entry.from,
      to: entry.to,
      timestamp: Number(entry.timestamp),
      documentHash: entry.documentHash
    }));
  }

  // Multi-Signature Functions
  async submitMultisigTransaction(destination: string, value: bigint, data: string): Promise<number> {
    if (!this.multisigContract || !this.signer) {
      throw new Error('Multisig contract not initialized or no signer available');
    }

    const tx = await this.multisigContract.submitTransaction(destination, value, data);
    const receipt = await tx.wait();

    // Extract transaction ID from event logs
    const event = receipt!.logs.find((log: any) => {
      try {
        const parsed = this.multisigContract!.interface.parseLog(log);
        return parsed?.name === 'Submission';
      } catch {
        return false;
      }
    });

    await this.recordTransaction({
      transactionHash: tx.hash,
      transactionType: 'multisig_submit',
      fromAddress: await this.signer.getAddress(),
      toAddress: destination,
      contractAddress: await this.multisigContract.getAddress(),
      value: ethers.formatEther(value),
      status: 'confirmed',
      blockNumber: receipt!.blockNumber,
      gasUsed: receipt!.gasUsed.toString(),
      confirmedAt: new Date()
    });

    return 0; // Return transaction ID from event
  }

  async confirmMultisigTransaction(transactionId: number): Promise<string> {
    if (!this.multisigContract || !this.signer) {
      throw new Error('Multisig contract not initialized or no signer available');
    }

    const tx = await this.multisigContract.confirmTransaction(transactionId);
    const receipt = await tx.wait();

    await this.recordTransaction({
      transactionHash: tx.hash,
      transactionType: 'multisig_confirm',
      fromAddress: await this.signer.getAddress(),
      contractAddress: await this.multisigContract.getAddress(),
      status: 'confirmed',
      blockNumber: receipt!.blockNumber,
      gasUsed: receipt!.gasUsed.toString(),
      metadata: { multisigTxId: transactionId },
      confirmedAt: new Date()
    });

    return tx.hash;
  }

  async getConfirmationCount(transactionId: number): Promise<number> {
    if (!this.multisigContract) {
      throw new Error('Multisig contract not initialized');
    }

    const count = await this.multisigContract.getConfirmationCount(transactionId);
    return Number(count);
  }

  // Escrow Functions
  async createEscrow(parcelId: number, sellerAddress: string, buyerAddress: string, amount: string): Promise<number> {
    if (!this.escrowContract || !this.signer) {
      throw new Error('Escrow contract not initialized or no signer available');
    }

    const amountWei = ethers.parseEther(amount);
    const tx = await this.escrowContract.createEscrow(parcelId, sellerAddress, buyerAddress, amountWei);
    const receipt = await tx.wait();

    await this.recordTransaction({
      transactionHash: tx.hash,
      parcelId,
      transactionType: 'escrow_create',
      fromAddress: await this.signer.getAddress(),
      toAddress: sellerAddress,
      contractAddress: await this.escrowContract.getAddress(),
      value: amount,
      status: 'confirmed',
      blockNumber: receipt!.blockNumber,
      gasUsed: receipt!.gasUsed.toString(),
      confirmedAt: new Date()
    });

    return 0; // Return escrow ID from event
  }

  async depositToEscrow(escrowId: number, amount: string): Promise<string> {
    if (!this.escrowContract || !this.signer) {
      throw new Error('Escrow contract not initialized or no signer available');
    }

    const amountWei = ethers.parseEther(amount);
    const tx = await this.escrowContract.depositFunds(escrowId, { value: amountWei });
    const receipt = await tx.wait();

    await this.recordTransaction({
      transactionHash: tx.hash,
      transactionType: 'escrow_deposit',
      fromAddress: await this.signer.getAddress(),
      contractAddress: await this.escrowContract.getAddress(),
      value: amount,
      status: 'confirmed',
      blockNumber: receipt!.blockNumber,
      gasUsed: receipt!.gasUsed.toString(),
      metadata: { escrowId },
      confirmedAt: new Date()
    });

    return tx.hash;
  }

  async releaseEscrow(escrowId: number): Promise<string> {
    if (!this.escrowContract || !this.signer) {
      throw new Error('Escrow contract not initialized or no signer available');
    }

    const tx = await this.escrowContract.releaseToSeller(escrowId);
    const receipt = await tx.wait();

    await this.recordTransaction({
      transactionHash: tx.hash,
      transactionType: 'escrow_release',
      fromAddress: await this.signer.getAddress(),
      contractAddress: await this.escrowContract.getAddress(),
      status: 'confirmed',
      blockNumber: receipt!.blockNumber,
      gasUsed: receipt!.gasUsed.toString(),
      metadata: { escrowId },
      confirmedAt: new Date()
    });

    return tx.hash;
  }

  // Gas Estimation
  async estimateGas(transactionType: string, params: any): Promise<bigint> {
    let gasEstimate: bigint;

    switch (transactionType) {
      case 'property_transfer':
        if (!this.propertyContract) throw new Error('Property contract not initialized');
        gasEstimate = await this.propertyContract.transferProperty.estimateGas(
          params.parcelId,
          params.newOwner,
          ethers.id(params.documentHash)
        );
        break;
      case 'escrow_create':
        if (!this.escrowContract) throw new Error('Escrow contract not initialized');
        gasEstimate = await this.escrowContract.createEscrow.estimateGas(
          params.parcelId,
          params.seller,
          params.buyer,
          ethers.parseEther(params.amount)
        );
        break;
      default:
        throw new Error(`Unknown transaction type: ${transactionType}`);
    }

    const feeData = await this.provider.getFeeData();
    const gasCost = gasEstimate * (feeData.gasPrice || BigInt(0));

    return gasCost;
  }

  // Database Operations
  private async recordTransaction(data: any): Promise<void> {
    const db = await requireDb();
    await db.execute(sql`
      INSERT INTO blockchain_transactions (
        transaction_hash, parcel_id, transaction_type, from_address, to_address,
        contract_address, block_number, gas_used, value, status, metadata, confirmed_at
      ) VALUES (
        ${data.transactionHash}, ${data.parcelId || null}, ${data.transactionType},
        ${data.fromAddress || null}, ${data.toAddress || null}, ${data.contractAddress || null},
        ${data.blockNumber || null}, ${data.gasUsed || null}, ${data.value || null},
        ${data.status}, ${JSON.stringify(data.metadata || {})}, ${data.confirmedAt || null}
      )
    `);
  }

  private async updateTransaction(txHash: string, updates: any): Promise<void> {
    const db = await requireDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.blockNumber !== undefined) {
      setClauses.push(`block_number = $${values.length + 1}`);
      values.push(updates.blockNumber);
    }
    if (updates.gasUsed !== undefined) {
      setClauses.push(`gas_used = $${values.length + 1}`);
      values.push(updates.gasUsed);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${values.length + 1}`);
      values.push(updates.status);
    }
    if (updates.confirmedAt !== undefined) {
      setClauses.push(`confirmed_at = $${values.length + 1}`);
      values.push(updates.confirmedAt);
    }

    values.push(txHash);

    await db.execute(sql.raw(`
      UPDATE blockchain_transactions
      SET ${setClauses.join(', ')}
      WHERE transaction_hash = $${values.length}
    `));
  }

  async getTransactionHistory(parcelId?: number, limit: number = 50): Promise<any[]> {
    const db = await requireDb();
    const query = parcelId
      ? sql`SELECT * FROM blockchain_transactions WHERE parcel_id = ${parcelId} ORDER BY created_at DESC LIMIT ${limit}`
      : sql`SELECT * FROM blockchain_transactions ORDER BY created_at DESC LIMIT ${limit}`;

    const result = await db.execute(query);
    return result as any[];
  }
}

// Default configuration (can be overridden via environment variables)
export const getBlockchainService = (): BlockchainService => {
  const config: BlockchainConfig = {
    rpcUrl: process.env.BLOCKCHAIN_RPC_URL || 'https://polygon-mumbai.g.alchemy.com/v2/demo', // Mumbai testnet
    chainId: parseInt(process.env.BLOCKCHAIN_CHAIN_ID || '80001'),
    propertyContractAddress: process.env.PROPERTY_CONTRACT_ADDRESS,
    multisigContractAddress: process.env.MULTISIG_CONTRACT_ADDRESS,
    escrowContractAddress: process.env.ESCROW_CONTRACT_ADDRESS,
    privateKey: process.env.BLOCKCHAIN_PRIVATE_KEY
  };

  return new BlockchainService(config);
};
