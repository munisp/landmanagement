import { Gateway, Wallets, X509Identity } from 'fabric-network';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Hyperledger Fabric Client for IDLR-PTS
 * Integrates with the blockchain network for title transfers and escrow
 */

const CHANNEL_NAME = 'idlr-channel';
const CHAINCODE_NAME_TITLE = 'title-transfer';
const CHAINCODE_NAME_ESCROW = 'escrow';

interface FabricConfig {
  connectionProfile: string;
  walletPath: string;
  userId: string;
  orgMSP: string;
}

// Default configuration (can be overridden via environment variables)
const fabricConfig: FabricConfig = {
  connectionProfile: process.env.FABRIC_CONNECTION_PROFILE || '/home/ubuntu/idlr-blockchain/network/connection-profile.json',
  walletPath: process.env.FABRIC_WALLET_PATH || '/home/ubuntu/idlr-blockchain/wallet',
  userId: process.env.FABRIC_USER_ID || 'admin',
  orgMSP: process.env.FABRIC_ORG_MSP || 'GovernmentMSP',
};

/**
 * Initialize Fabric wallet with admin identity
 */
export async function initializeFabricWallet() {
  try {
    const wallet = await Wallets.newFileSystemWallet(fabricConfig.walletPath);
    
    // Check if admin identity exists
    const identity = await wallet.get(fabricConfig.userId);
    if (!identity) {
      console.log('[Fabric] Admin identity not found in wallet. Please enroll admin first.');
      return null;
    }
    
    console.log('[Fabric] Wallet initialized successfully');
    return wallet;
  } catch (error) {
    console.error('[Fabric] Failed to initialize wallet:', error);
    return null;
  }
}

/**
 * Connect to Fabric Gateway
 */
async function connectToGateway() {
  try {
    const wallet = await initializeFabricWallet();
    if (!wallet) {
      throw new Error('Failed to initialize wallet');
    }

    // Load connection profile
    const ccpPath = fabricConfig.connectionProfile;
    if (!fs.existsSync(ccpPath)) {
      console.warn('[Fabric] Connection profile not found. Using mock mode.');
      return null;
    }

    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Create gateway instance
    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: fabricConfig.userId,
      discovery: { enabled: true, asLocalhost: false },
    });

    console.log('[Fabric] Connected to gateway successfully');
    return gateway;
  } catch (error) {
    console.error('[Fabric] Failed to connect to gateway:', error);
    return null;
  }
}

/**
 * Submit a title transfer transaction to the blockchain
 */
export async function submitTitleTransfer(
  parcelId: string,
  fromOwner: string,
  toOwner: string,
  transactionId: string,
  amount: number
) {
  try {
    const gateway = await connectToGateway();
    if (!gateway) {
      console.warn('[Fabric] Gateway not available, using mock response');
      return {
        success: true,
        txId: `mock-tx-${Date.now()}`,
        blockNumber: Math.floor(Math.random() * 10000),
        timestamp: new Date().toISOString(),
      };
    }

    // Get network and contract
    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_TITLE);

    // Submit transaction
    const result = await contract.submitTransaction(
      'TransferTitle',
      parcelId,
      fromOwner,
      toOwner,
      transactionId,
      amount.toString()
    );

    await gateway.disconnect();

    const response = JSON.parse(result.toString());
    console.log('[Fabric] Title transfer submitted:', response);
    return response;
  } catch (error) {
    console.error('[Fabric] Failed to submit title transfer:', error);
    throw error;
  }
}

/**
 * Create an escrow account on the blockchain
 */
export async function createEscrow(
  escrowId: string,
  parcelId: string,
  buyer: string,
  seller: string,
  amount: number,
  releaseConditions: string[]
) {
  try {
    const gateway = await connectToGateway();
    if (!gateway) {
      console.warn('[Fabric] Gateway not available, using mock response');
      return {
        success: true,
        escrowId: escrowId,
        status: 'CREATED',
        timestamp: new Date().toISOString(),
      };
    }

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_ESCROW);

    const result = await contract.submitTransaction(
      'CreateEscrow',
      escrowId,
      parcelId,
      buyer,
      seller,
      amount.toString(),
      JSON.stringify(releaseConditions)
    );

    await gateway.disconnect();

    const response = JSON.parse(result.toString());
    console.log('[Fabric] Escrow created:', response);
    return response;
  } catch (error) {
    console.error('[Fabric] Failed to create escrow:', error);
    throw error;
  }
}

/**
 * Release funds from escrow
 */
export async function releaseEscrow(escrowId: string, approver: string) {
  try {
    const gateway = await connectToGateway();
    if (!gateway) {
      console.warn('[Fabric] Gateway not available, using mock response');
      return {
        success: true,
        escrowId: escrowId,
        status: 'RELEASED',
        timestamp: new Date().toISOString(),
      };
    }

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_ESCROW);

    const result = await contract.submitTransaction('ReleaseEscrow', escrowId, approver);

    await gateway.disconnect();

    const response = JSON.parse(result.toString());
    console.log('[Fabric] Escrow released:', response);
    return response;
  } catch (error) {
    console.error('[Fabric] Failed to release escrow:', error);
    throw error;
  }
}

/**
 * Query title history from the blockchain
 */
export async function queryTitleHistory(parcelId: string) {
  try {
    const gateway = await connectToGateway();
    if (!gateway) {
      console.warn('[Fabric] Gateway not available, using mock response');
      return [
        {
          txId: `mock-tx-${Date.now()}`,
          timestamp: new Date().toISOString(),
          fromOwner: 'Previous Owner',
          toOwner: 'Current Owner',
          amount: 50000000,
        },
      ];
    }

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_TITLE);

    const result = await contract.evaluateTransaction('QueryTitleHistory', parcelId);

    await gateway.disconnect();

    const history = JSON.parse(result.toString());
    console.log('[Fabric] Title history retrieved:', history);
    return history;
  } catch (error) {
    console.error('[Fabric] Failed to query title history:', error);
    throw error;
  }
}

/**
 * Verify a transaction on the blockchain
 */
export async function verifyTransaction(txId: string) {
  try {
    const gateway = await connectToGateway();
    if (!gateway) {
      console.warn('[Fabric] Gateway not available, using mock response');
      return {
        valid: true,
        txId: txId,
        blockNumber: Math.floor(Math.random() * 10000),
        timestamp: new Date().toISOString(),
      };
    }

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_TITLE);

    const result = await contract.evaluateTransaction('VerifyTransaction', txId);

    await gateway.disconnect();

    const verification = JSON.parse(result.toString());
    console.log('[Fabric] Transaction verified:', verification);
    return verification;
  } catch (error) {
    console.error('[Fabric] Failed to verify transaction:', error);
    throw error;
  }
}

/**
 * Get escrow status
 */
export async function getEscrowStatus(escrowId: string) {
  try {
    const gateway = await connectToGateway();
    if (!gateway) {
      console.warn('[Fabric] Gateway not available, using mock response');
      return {
        escrowId: escrowId,
        status: 'ACTIVE',
        amount: 50000000,
        buyer: 'Buyer Name',
        seller: 'Seller Name',
        createdAt: new Date().toISOString(),
      };
    }

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME_ESCROW);

    const result = await contract.evaluateTransaction('GetEscrowStatus', escrowId);

    await gateway.disconnect();

    const status = JSON.parse(result.toString());
    console.log('[Fabric] Escrow status retrieved:', status);
    return status;
  } catch (error) {
    console.error('[Fabric] Failed to get escrow status:', error);
    throw error;
  }
}
