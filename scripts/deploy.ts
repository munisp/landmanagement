import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Starting deployment of IDLR-PTS Smart Contracts...\n");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // Deploy PropertyTransfer
  console.log("📝 Deploying PropertyTransfer contract...");
  const PropertyTransfer = await ethers.getContractFactory("PropertyTransfer");
  const propertyTransfer = await PropertyTransfer.deploy();
  await propertyTransfer.waitForDeployment();
  const propertyTransferAddress = await propertyTransfer.getAddress();
  console.log("✅ PropertyTransfer deployed to:", propertyTransferAddress);

  // Deploy Escrow
  console.log("\n📝 Deploying Escrow contract...");
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("✅ Escrow deployed to:", escrowAddress);

  // Deploy MultiSig with initial signers
  console.log("\n📝 Deploying MultiSig contract...");
  const initialSigners = [deployer.address]; // Add more signers as needed
  const requiredSignatures = 1; // Adjust based on governance requirements
  
  const MultiSig = await ethers.getContractFactory("MultiSig");
  const multiSig = await MultiSig.deploy(initialSigners, requiredSignatures);
  await multiSig.waitForDeployment();
  const multiSigAddress = await multiSig.getAddress();
  console.log("✅ MultiSig deployed to:", multiSigAddress);
  console.log("   Initial signers:", initialSigners);
  console.log("   Required signatures:", requiredSignatures);

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("🎉 Deployment Complete!");
  console.log("=".repeat(70));
  console.log("\nContract Addresses:");
  console.log("-------------------");
  console.log("PropertyTransfer:", propertyTransferAddress);
  console.log("Escrow:", escrowAddress);
  console.log("MultiSig:", multiSigAddress);
  
  console.log("\n📋 Next Steps:");
  console.log("1. Update blockchainService.ts with these contract addresses");
  console.log("2. Verify contracts on Polygonscan:");
  console.log(`   npx hardhat verify --network polygonMumbai ${propertyTransferAddress}`);
  console.log(`   npx hardhat verify --network polygonMumbai ${escrowAddress}`);
  console.log(`   npx hardhat verify --network polygonMumbai ${multiSigAddress} '${JSON.stringify(initialSigners)}' ${requiredSignatures}`);
  console.log("3. Grant REGISTRAR_ROLE and ARBITER_ROLE to appropriate addresses");
  console.log("4. Test contract interactions from the frontend\n");

  // Save deployment info to file
  const fs = require('fs');
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      PropertyTransfer: propertyTransferAddress,
      Escrow: escrowAddress,
      MultiSig: multiSigAddress,
    },
  };

  fs.writeFileSync(
    'deployment-info.json',
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("💾 Deployment info saved to deployment-info.json\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
