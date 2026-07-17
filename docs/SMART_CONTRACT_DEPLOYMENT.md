# Smart Contract Deployment Guide

## Overview

This guide walks you through deploying the IDLR-PTS smart contracts (PropertyTransfer, Escrow, MultiSig) to Polygon Mumbai testnet and mainnet.

---

## Prerequisites

### 1. MetaMask Wallet Setup

1. Install [MetaMask browser extension](https://metamask.io/)
2. Create a new wallet or import an existing one
3. **IMPORTANT**: Use a dedicated deployment wallet (not your main wallet with significant funds)

### 2. Add Polygon Mumbai Testnet to MetaMask

**Network Details:**
- Network Name: `Polygon Mumbai Testnet`
- RPC URL: `https://rpc-mumbai.maticvigil.com`
- Chain ID: `80001`
- Currency Symbol: `MATIC`
- Block Explorer: `https://mumbai.polygonscan.com`

**Steps:**
1. Open MetaMask → Click network dropdown → "Add Network"
2. Enter the details above
3. Click "Save"

### 3. Get Testnet MATIC

You need MATIC tokens to pay for gas fees on deployment.

**Faucets:**
- Official Polygon Faucet: https://faucet.polygon.technology/
- Alchemy Faucet: https://mumbaifaucet.com/
- QuickNode Faucet: https://faucet.quicknode.com/polygon/mumbai

**Steps:**
1. Copy your wallet address from MetaMask
2. Visit one of the faucets above
3. Paste your address and request testnet MATIC
4. Wait 1-2 minutes for tokens to arrive
5. Verify balance in MetaMask (should show ~0.5-1 MATIC)

### 4. Get Polygonscan API Key

Required for contract verification on Polygonscan.

**Steps:**
1. Visit https://polygonscan.com/
2. Sign up for a free account
3. Go to "API Keys" section
4. Click "Add" to create a new API key
5. Copy the API key (you'll need this later)

---

## Deployment Steps

### Step 1: Export Private Key from MetaMask

**⚠️ SECURITY WARNING**: Never share your private key. Store it securely and delete it after deployment.

1. Open MetaMask
2. Click the three dots (⋮) next to your account
3. Select "Account Details"
4. Click "Export Private Key"
5. Enter your MetaMask password
6. Copy the private key (64-character hexadecimal string)

### Step 2: Set Environment Variables

Navigate to your project directory and set the required environment variables:

```bash
cd /home/ubuntu/idlr-pts-platform

# Set deployer private key (without 0x prefix)
export DEPLOYER_PRIVATE_KEY="your_private_key_here"

# Set Polygonscan API key
export POLYGONSCAN_API_KEY="your_polygonscan_api_key_here"

# Optional: Set custom RPC URL (if default is slow)
export POLYGON_MUMBAI_RPC_URL="https://rpc-mumbai.maticvigil.com"
```

**Alternative: Use .env file**

Create a `.env` file in the project root:

```bash
DEPLOYER_PRIVATE_KEY=your_private_key_here
POLYGONSCAN_API_KEY=your_polygonscan_api_key_here
POLYGON_MUMBAI_RPC_URL=https://rpc-mumbai.maticvigil.com
```

Then load it:
```bash
source .env
```

### Step 3: Verify Setup

Check that your wallet has sufficient MATIC:

```bash
npx hardhat run scripts/check-balance.ts --network polygonMumbai
```

Expected output:
```
Deployer address: 0x...
Balance: 0.5 MATIC
✅ Sufficient balance for deployment
```

### Step 4: Deploy Contracts

Run the deployment script:

```bash
npx hardhat run scripts/deploy.ts --network polygonMumbai
```

**Expected Output:**
```
🚀 Starting deployment of IDLR-PTS Smart Contracts...

Deploying contracts with account: 0x...
Account balance: 0.5 ETH

📝 Deploying PropertyTransfer contract...
✅ PropertyTransfer deployed to: 0x...

📝 Deploying Escrow contract...
✅ Escrow deployed to: 0x...

📝 Deploying MultiSig contract...
✅ MultiSig deployed to: 0x...
   Initial signers: [0x...]
   Required signatures: 1

======================================================================
🎉 Deployment Complete!
======================================================================

Contract Addresses:
-------------------
PropertyTransfer: 0x...
Escrow: 0x...
MultiSig: 0x...

💾 Deployment info saved to deployment-info.json
```

**Deployment Time**: ~2-5 minutes depending on network congestion

**Gas Costs** (approximate):
- PropertyTransfer: ~0.05 MATIC
- Escrow: ~0.04 MATIC
- MultiSig: ~0.03 MATIC
- **Total**: ~0.12 MATIC

### Step 5: Verify Contracts on Polygonscan

After deployment, verify your contracts to make them publicly readable:

```bash
# Verify PropertyTransfer
npx hardhat verify --network polygonMumbai <PROPERTY_TRANSFER_ADDRESS>

# Verify Escrow
npx hardhat verify --network polygonMumbai <ESCROW_ADDRESS>

# Verify MultiSig
npx hardhat verify --network polygonMumbai <MULTISIG_ADDRESS> '["<DEPLOYER_ADDRESS>"]' 1
```

Replace `<PROPERTY_TRANSFER_ADDRESS>`, `<ESCROW_ADDRESS>`, `<MULTISIG_ADDRESS>`, and `<DEPLOYER_ADDRESS>` with the actual addresses from the deployment output.

**Expected Output:**
```
Successfully submitted source code for contract
contracts/PropertyTransfer.sol:PropertyTransfer at 0x...
for verification on the block explorer. Waiting for verification result...

Successfully verified contract PropertyTransfer on Etherscan.
https://mumbai.polygonscan.com/address/0x...#code
```

### Step 6: Update Application Configuration

Update the contract addresses in your application:

1. Open `server/blockchainService.ts`
2. Update the contract addresses:

```typescript
const PROPERTY_TRANSFER_ADDRESS = '0x...'; // From deployment output
const ESCROW_ADDRESS = '0x...';
const MULTISIG_ADDRESS = '0x...';
```

3. Save the file and restart your server

### Step 7: Grant Roles (Optional)

If you need to grant roles to other addresses:

**Grant REGISTRAR_ROLE:**
```bash
npx hardhat run scripts/grant-role.ts --network polygonMumbai
```

Or use Hardhat console:
```bash
npx hardhat console --network polygonMumbai
```

Then run:
```javascript
const PropertyTransfer = await ethers.getContractFactory("PropertyTransfer");
const contract = PropertyTransfer.attach("0x..."); // Your contract address

// Grant REGISTRAR_ROLE
const REGISTRAR_ROLE = await contract.REGISTRAR_ROLE();
await contract.grantRole(REGISTRAR_ROLE, "0x..."); // Registrar address

console.log("✅ REGISTRAR_ROLE granted");
```

---

## Verification

### Test Contract Interactions

1. Visit Mumbai Polygonscan: https://mumbai.polygonscan.com/
2. Search for your contract address
3. Go to "Contract" → "Read Contract"
4. Try reading public functions (e.g., `name()`, `symbol()`)
5. Go to "Write Contract" → "Connect to Web3"
6. Connect MetaMask and try a test transaction

### Check Deployment Info

View the saved deployment information:

```bash
cat deployment-info.json
```

Expected format:
```json
{
  "network": "maticmum",
  "chainId": "80001",
  "deployer": "0x...",
  "timestamp": "2026-02-19T...",
  "contracts": {
    "PropertyTransfer": "0x...",
    "Escrow": "0x...",
    "MultiSig": "0x..."
  }
}
```

---

## Mainnet Deployment

**⚠️ WARNING**: Mainnet deployment requires real MATIC tokens and cannot be reversed.

### Prerequisites

1. **Real MATIC tokens**: Purchase from exchanges (Binance, Coinbase, etc.)
2. **Security audit**: Have contracts audited by professional auditors
3. **Thorough testing**: Test all functions on testnet first
4. **Insurance**: Consider smart contract insurance

### Steps

1. Add Polygon Mainnet to MetaMask:
   - Network Name: `Polygon Mainnet`
   - RPC URL: `https://polygon-rpc.com`
   - Chain ID: `137`
   - Currency Symbol: `MATIC`
   - Block Explorer: `https://polygonscan.com`

2. Transfer MATIC to deployment wallet (~1 MATIC recommended)

3. Deploy to mainnet:
```bash
npx hardhat run scripts/deploy.ts --network polygon
```

4. Verify contracts:
```bash
npx hardhat verify --network polygon <CONTRACT_ADDRESS>
```

---

## Troubleshooting

### Error: "insufficient funds for intrinsic transaction cost"

**Solution**: Get more testnet MATIC from faucets

### Error: "nonce too low"

**Solution**: Reset MetaMask account:
1. MetaMask → Settings → Advanced
2. Click "Reset Account"
3. Try deployment again

### Error: "contract verification failed"

**Solution**: 
1. Wait 1-2 minutes after deployment
2. Ensure constructor arguments match exactly
3. Check Solidity compiler version matches hardhat.config.ts

### Deployment hangs or times out

**Solution**:
1. Try a different RPC URL
2. Increase gas price in hardhat.config.ts:
```typescript
polygonMumbai: {
  url: "...",
  accounts: [...],
  gasPrice: 35000000000, // 35 Gwei
}
```

### "UNPREDICTABLE_GAS_LIMIT" error

**Solution**: The contract may have an issue. Check:
1. Constructor parameters are valid
2. Contract compiles without warnings
3. No infinite loops or excessive gas usage

---

## Security Best Practices

1. **Never commit private keys** to version control
2. **Use hardware wallets** for mainnet deployments
3. **Test thoroughly** on testnet before mainnet
4. **Audit contracts** before mainnet deployment
5. **Use multi-sig** for contract ownership on mainnet
6. **Monitor contracts** for unusual activity
7. **Have emergency pause** mechanisms
8. **Keep deployment wallet separate** from operational funds

---

## Resources

- **Polygon Documentation**: https://docs.polygon.technology/
- **Hardhat Documentation**: https://hardhat.org/docs
- **OpenZeppelin Contracts**: https://docs.openzeppelin.com/contracts/
- **Polygonscan**: https://polygonscan.com/
- **Mumbai Testnet Explorer**: https://mumbai.polygonscan.com/

---

## Support

If you encounter issues:

1. Check Hardhat console output for error messages
2. Verify network connectivity and RPC URL
3. Ensure sufficient MATIC balance
4. Check Polygonscan for transaction status
5. Review Hardhat documentation for specific errors

---

## Next Steps After Deployment

1. ✅ Update `server/blockchainService.ts` with contract addresses
2. ✅ Test contract interactions from the frontend
3. ✅ Grant appropriate roles (REGISTRAR_ROLE, ARBITER_ROLE)
4. ✅ Set up monitoring for contract events
5. ✅ Configure frontend to display contract data
6. ✅ Test end-to-end workflows (property registration, transfers, escrow)
7. ✅ Document contract ABIs for API consumers
8. ✅ Set up automated tests for contract interactions

---

**Deployment Date**: _To be filled after deployment_  
**Network**: Polygon Mumbai Testnet  
**Deployer**: _Your wallet address_  
**Contract Addresses**: _See deployment-info.json_
