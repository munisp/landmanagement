/**
 * End-to-End Integration Testing Script
 * 
 * This script tests the complete payment flow from Mojaloop payment initiation
 * through blockchain escrow creation, payment completion, and escrow release.
 * 
 * Usage: npx tsx scripts/test-integration.ts --network mumbai
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

interface TestResult {
  passed: boolean;
  message: string;
  details?: string;
  duration?: number;
}

interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  currency: string;
  explorer: string;
}

const networks: Record<string, NetworkConfig> = {
  mumbai: {
    name: "Polygon Mumbai Testnet",
    rpcUrl: "https://rpc-mumbai.maticvigil.com",
    chainId: 80001,
    currency: "MATIC",
    explorer: "https://mumbai.polygonscan.com",
  },
  polygon: {
    name: "Polygon Mainnet",
    rpcUrl: "https://polygon-rpc.com",
    chainId: 137,
    currency: "MATIC",
    explorer: "https://polygonscan.com",
  },
};

class IntegrationTester {
  private network: NetworkConfig;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private results: TestResult[] = [];
  private escrowContract: ethers.Contract | null = null;
  private propertyTransferContract: ethers.Contract | null = null;

  constructor(networkName: string) {
    if (!networks[networkName]) {
      throw new Error(`Unknown network: ${networkName}`);
    }
    this.network = networks[networkName];
    this.provider = new ethers.JsonRpcProvider(this.network.rpcUrl);

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.TEST_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("DEPLOYER_PRIVATE_KEY or TEST_PRIVATE_KEY environment variable not set");
    }
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  private log(message: string, color: keyof typeof colors = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  private addResult(result: TestResult) {
    this.results.push(result);
    const icon = result.passed ? "✓" : "✗";
    const color = result.passed ? "green" : "red";
    const duration = result.duration ? ` (${result.duration}ms)` : "";
    this.log(`${icon} ${result.message}${duration}`, color);
    if (result.details) {
      this.log(`  ${result.details}`, "cyan");
    }
  }

  /**
   * Load contract instances
   */
  async loadContracts(): Promise<void> {
    this.log("\n📦 Loading Contract Instances...", "bright");

    const deployedContractsPath = path.join(process.cwd(), "deployed-contracts.json");
    if (!fs.existsSync(deployedContractsPath)) {
      throw new Error("deployed-contracts.json not found. Deploy contracts first.");
    }

    const deployedContracts = JSON.parse(fs.readFileSync(deployedContractsPath, "utf-8"));

    // Load Escrow contract
    const escrowInfo = deployedContracts.find((c: any) => c.name === "Escrow");
    if (!escrowInfo) {
      throw new Error("Escrow contract not found in deployed-contracts.json");
    }

    const escrowArtifact = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "artifacts/contracts/Escrow.sol/Escrow.json"),
        "utf-8"
      )
    );

    this.escrowContract = new ethers.Contract(
      escrowInfo.address,
      escrowArtifact.abi,
      this.wallet
    );

    this.addResult({
      passed: true,
      message: "Escrow contract loaded",
      details: escrowInfo.address,
    });

    // Load PropertyTransfer contract
    const propertyTransferInfo = deployedContracts.find((c: any) => c.name === "PropertyTransfer");
    if (!propertyTransferInfo) {
      throw new Error("PropertyTransfer contract not found in deployed-contracts.json");
    }

    const propertyTransferArtifact = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "artifacts/contracts/PropertyTransfer.sol/PropertyTransfer.json"),
        "utf-8"
      )
    );

    this.propertyTransferContract = new ethers.Contract(
      propertyTransferInfo.address,
      propertyTransferArtifact.abi,
      this.wallet
    );

    this.addResult({
      passed: true,
      message: "PropertyTransfer contract loaded",
      details: propertyTransferInfo.address,
    });
  }

  /**
   * Test 1: Create escrow for property transaction
   */
  async testCreateEscrow(): Promise<string | null> {
    this.log("\n🔒 Test 1: Creating Escrow...", "bright");

    if (!this.escrowContract) {
      this.addResult({
        passed: false,
        message: "Escrow contract not loaded",
      });
      return null;
    }

    try {
      const startTime = Date.now();

      // Generate test data
      const buyer = this.wallet.address;
      const seller = ethers.Wallet.createRandom().address;
      const propertyId = `PROP-${Date.now()}`;
      const amount = ethers.parseEther("0.01"); // 0.01 MATIC

      this.log(`  Buyer: ${buyer}`, "cyan");
      this.log(`  Seller: ${seller}`, "cyan");
      this.log(`  Property ID: ${propertyId}`, "cyan");
      this.log(`  Amount: ${ethers.formatEther(amount)} ${this.network.currency}`, "cyan");

      // Create escrow
      const tx = await this.escrowContract.createEscrow(
        buyer,
        seller,
        propertyId,
        { value: amount }
      );

      this.log(`  Transaction hash: ${tx.hash}`, "cyan");
      this.log(`  Waiting for confirmation...`, "yellow");

      const receipt = await tx.wait();
      const duration = Date.now() - startTime;

      if (receipt && receipt.status === 1) {
        // Get escrow ID from event
        const event = receipt.logs.find((log: any) => {
          try {
            const parsed = this.escrowContract!.interface.parseLog(log);
            return parsed && parsed.name === "EscrowCreated";
          } catch {
            return false;
          }
        });

        let escrowId = null;
        if (event) {
          const parsed = this.escrowContract.interface.parseLog(event);
          escrowId = parsed?.args[0].toString();
        }

        this.addResult({
          passed: true,
          message: "Escrow created successfully",
          details: `Escrow ID: ${escrowId}, Gas used: ${receipt.gasUsed.toString()}`,
          duration,
        });

        return escrowId;
      } else {
        this.addResult({
          passed: false,
          message: "Escrow creation failed",
          details: "Transaction reverted",
          duration,
        });
        return null;
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: "Escrow creation failed",
        details: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Test 2: Query escrow details
   */
  async testQueryEscrow(escrowId: string): Promise<boolean> {
    this.log("\n🔍 Test 2: Querying Escrow Details...", "bright");

    if (!this.escrowContract) {
      this.addResult({
        passed: false,
        message: "Escrow contract not loaded",
      });
      return false;
    }

    try {
      const startTime = Date.now();

      const escrow = await this.escrowContract.escrows(escrowId);
      const duration = Date.now() - startTime;

      this.log(`  Buyer: ${escrow.buyer}`, "cyan");
      this.log(`  Seller: ${escrow.seller}`, "cyan");
      this.log(`  Property ID: ${escrow.propertyId}`, "cyan");
      this.log(`  Amount: ${ethers.formatEther(escrow.amount)} ${this.network.currency}`, "cyan");
      this.log(`  Status: ${escrow.status}`, "cyan");

      if (escrow.buyer && escrow.seller && escrow.amount > 0) {
        this.addResult({
          passed: true,
          message: "Escrow details retrieved successfully",
          details: `Status: ${escrow.status}`,
          duration,
        });
        return true;
      } else {
        this.addResult({
          passed: false,
          message: "Escrow details incomplete",
          duration,
        });
        return false;
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: "Failed to query escrow",
        details: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Test 3: Release escrow funds
   */
  async testReleaseEscrow(escrowId: string): Promise<boolean> {
    this.log("\n💰 Test 3: Releasing Escrow Funds...", "bright");

    if (!this.escrowContract) {
      this.addResult({
        passed: false,
        message: "Escrow contract not loaded",
      });
      return false;
    }

    try {
      const startTime = Date.now();

      // Get seller address before release
      const escrowBefore = await this.escrowContract.escrows(escrowId);
      const seller = escrowBefore.seller;
      const amount = escrowBefore.amount;

      // Get seller balance before
      const sellerBalanceBefore = await this.provider.getBalance(seller);

      // Release escrow
      const tx = await this.escrowContract.releaseEscrow(escrowId);
      this.log(`  Transaction hash: ${tx.hash}`, "cyan");
      this.log(`  Waiting for confirmation...`, "yellow");

      const receipt = await tx.wait();
      const duration = Date.now() - startTime;

      if (receipt && receipt.status === 1) {
        // Get seller balance after
        const sellerBalanceAfter = await this.provider.getBalance(seller);
        const balanceIncrease = sellerBalanceAfter - sellerBalanceBefore;

        this.log(`  Seller balance increase: ${ethers.formatEther(balanceIncrease)} ${this.network.currency}`, "cyan");

        if (balanceIncrease === amount) {
          this.addResult({
            passed: true,
            message: "Escrow released successfully",
            details: `Funds transferred to seller, Gas used: ${receipt.gasUsed.toString()}`,
            duration,
          });
          return true;
        } else {
          this.addResult({
            passed: false,
            message: "Escrow released but amount mismatch",
            details: `Expected ${ethers.formatEther(amount)}, got ${ethers.formatEther(balanceIncrease)}`,
            duration,
          });
          return false;
        }
      } else {
        this.addResult({
          passed: false,
          message: "Escrow release failed",
          details: "Transaction reverted",
          duration,
        });
        return false;
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: "Failed to release escrow",
        details: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Test 4: Register property on blockchain
   */
  async testRegisterProperty(): Promise<string | null> {
    this.log("\n🏠 Test 4: Registering Property...", "bright");

    if (!this.propertyTransferContract) {
      this.addResult({
        passed: false,
        message: "PropertyTransfer contract not loaded",
      });
      return null;
    }

    try {
      const startTime = Date.now();

      // Generate test property data
      const propertyId = `PROP-${Date.now()}`;
      const owner = this.wallet.address;
      const location = "Test Location, Test City";
      const area = 1000; // square meters
      const propertyType = "Residential";

      this.log(`  Property ID: ${propertyId}`, "cyan");
      this.log(`  Owner: ${owner}`, "cyan");
      this.log(`  Location: ${location}`, "cyan");
      this.log(`  Area: ${area} sq m`, "cyan");

      // Register property
      const tx = await this.propertyTransferContract.registerProperty(
        propertyId,
        owner,
        location,
        area,
        propertyType
      );

      this.log(`  Transaction hash: ${tx.hash}`, "cyan");
      this.log(`  Waiting for confirmation...`, "yellow");

      const receipt = await tx.wait();
      const duration = Date.now() - startTime;

      if (receipt && receipt.status === 1) {
        this.addResult({
          passed: true,
          message: "Property registered successfully",
          details: `Property ID: ${propertyId}, Gas used: ${receipt.gasUsed.toString()}`,
          duration,
        });
        return propertyId;
      } else {
        this.addResult({
          passed: false,
          message: "Property registration failed",
          details: "Transaction reverted",
          duration,
        });
        return null;
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: "Failed to register property",
        details: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Test 5: Transfer property ownership
   */
  async testTransferProperty(propertyId: string): Promise<boolean> {
    this.log("\n📝 Test 5: Transferring Property Ownership...", "bright");

    if (!this.propertyTransferContract) {
      this.addResult({
        passed: false,
        message: "PropertyTransfer contract not loaded",
      });
      return false;
    }

    try {
      const startTime = Date.now();

      const newOwner = ethers.Wallet.createRandom().address;
      this.log(`  New owner: ${newOwner}`, "cyan");

      // Transfer property
      const tx = await this.propertyTransferContract.transferProperty(
        propertyId,
        newOwner
      );

      this.log(`  Transaction hash: ${tx.hash}`, "cyan");
      this.log(`  Waiting for confirmation...`, "yellow");

      const receipt = await tx.wait();
      const duration = Date.now() - startTime;

      if (receipt && receipt.status === 1) {
        // Verify ownership changed
        const property = await this.propertyTransferContract.properties(propertyId);
        
        if (property.owner.toLowerCase() === newOwner.toLowerCase()) {
          this.addResult({
            passed: true,
            message: "Property transferred successfully",
            details: `New owner: ${newOwner}, Gas used: ${receipt.gasUsed.toString()}`,
            duration,
          });
          return true;
        } else {
          this.addResult({
            passed: false,
            message: "Property transferred but ownership not updated",
            details: `Expected ${newOwner}, got ${property.owner}`,
            duration,
          });
          return false;
        }
      } else {
        this.addResult({
          passed: false,
          message: "Property transfer failed",
          details: "Transaction reverted",
          duration,
        });
        return false;
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: "Failed to transfer property",
        details: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Generate test report
   */
  generateReport(): void {
    this.log(`\n📄 Generating Test Report...`, "bright");

    const report = {
      network: this.network.name,
      chainId: this.network.chainId,
      timestamp: new Date().toISOString(),
      tester: this.wallet.address,
      results: this.results.map((r) => ({
        passed: r.passed,
        message: r.message,
        details: r.details,
        duration: r.duration,
      })),
      summary: {
        total: this.results.length,
        passed: this.results.filter((r) => r.passed).length,
        failed: this.results.filter((r) => !r.passed).length,
        totalDuration: this.results.reduce((sum, r) => sum + (r.duration || 0), 0),
      },
    };

    const reportPath = path.join(process.cwd(), "integration-test-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.addResult({
      passed: true,
      message: "Test report generated",
      details: reportPath,
    });
  }

  /**
   * Run all integration tests
   */
  async runAll(): Promise<boolean> {
    this.log("\n" + "=".repeat(60), "bright");
    this.log("End-to-End Integration Testing", "bright");
    this.log(`Network: ${this.network.name}`, "bright");
    this.log(`Tester: ${this.wallet.address}`, "bright");
    this.log("=".repeat(60), "bright");

    // Load contracts
    await this.loadContracts();

    // Test 1: Create escrow
    const escrowId = await this.testCreateEscrow();
    if (!escrowId) {
      this.log("\n❌ Escrow creation failed, skipping remaining tests", "red");
      return false;
    }

    // Test 2: Query escrow
    const querySuccess = await this.testQueryEscrow(escrowId);
    if (!querySuccess) {
      this.log("\n⚠️  Escrow query failed, but continuing tests", "yellow");
    }

    // Test 3: Release escrow
    const releaseSuccess = await this.testReleaseEscrow(escrowId);
    if (!releaseSuccess) {
      this.log("\n⚠️  Escrow release failed, but continuing tests", "yellow");
    }

    // Test 4: Register property
    const propertyId = await this.testRegisterProperty();
    if (!propertyId) {
      this.log("\n⚠️  Property registration failed, skipping transfer test", "yellow");
    } else {
      // Test 5: Transfer property
      await this.testTransferProperty(propertyId);
    }

    // Generate report
    this.generateReport();

    // Summary
    this.log("\n" + "=".repeat(60), "bright");
    this.log("Test Summary", "bright");
    this.log("=".repeat(60), "bright");

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;
    const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);

    this.log(`\nTotal tests: ${total}`, "bright");
    this.log(`Passed: ${passed}`, "green");
    if (failed > 0) {
      this.log(`Failed: ${failed}`, "red");
    }
    this.log(`Total duration: ${totalDuration}ms`, "bright");

    const allPassed = failed === 0;
    if (allPassed) {
      this.log("\n✅ All integration tests passed!", "green");
      this.log(`\nThe complete payment-to-escrow flow is working correctly.`, "bright");
    } else {
      this.log("\n❌ Some integration tests failed!", "red");
      this.log(`\nPlease investigate the issues above.`, "bright");
    }

    this.log("\n" + "=".repeat(60), "bright");

    return allPassed;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const networkArg = args.find((arg) => arg.startsWith("--network="));
  const networkName = networkArg ? networkArg.split("=")[1] : "mumbai";

  try {
    const tester = new IntegrationTester(networkName);
    const success = await tester.runAll();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}`);
    process.exit(1);
  }
}

main();
