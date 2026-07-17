import { ethers } from "hardhat";

async function main() {
  console.log("🔍 Checking deployment wallet balance...\n");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  const balanceInMatic = ethers.formatEther(balance);

  console.log("Deployer address:", deployer.address);
  console.log("Balance:", balanceInMatic, "MATIC");

  // Estimate required MATIC for deployment
  const estimatedGasCost = 0.15; // Conservative estimate in MATIC

  if (parseFloat(balanceInMatic) < estimatedGasCost) {
    console.log("\n❌ Insufficient balance for deployment");
    console.log(`   Required: ~${estimatedGasCost} MATIC`);
    console.log(`   Current: ${balanceInMatic} MATIC`);
    console.log("\n💡 Get testnet MATIC from:");
    console.log("   - https://faucet.polygon.technology/");
    console.log("   - https://mumbaifaucet.com/");
    console.log("   - https://faucet.quicknode.com/polygon/mumbai");
    process.exit(1);
  } else {
    console.log("\n✅ Sufficient balance for deployment");
    console.log(`   Estimated cost: ~${estimatedGasCost} MATIC`);
    console.log(`   Remaining after deployment: ~${(parseFloat(balanceInMatic) - estimatedGasCost).toFixed(4)} MATIC`);
  }

  // Check network
  const network = await ethers.provider.getNetwork();
  console.log("\nNetwork:", network.name);
  console.log("Chain ID:", network.chainId.toString());

  if (network.chainId === 80001n) {
    console.log("✅ Connected to Polygon Mumbai Testnet");
  } else if (network.chainId === 137n) {
    console.log("⚠️  Connected to Polygon Mainnet");
    console.log("   Make sure you intend to deploy to mainnet!");
  } else {
    console.log("⚠️  Unknown network");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
