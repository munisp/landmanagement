/**
 * Smart Contract Post-Deployment Verification Script
 * 
 * This script verifies that deployed smart contracts are functioning correctly
 * and performs basic interaction tests.
 * 
 * Usage: npx tsx scripts/verify-deployment.ts --network mumbai --contracts contracts.json
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

interface DeployedContract {
  name: string;
  address: string;
  deployer: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

interface VerificationResult {
  passed: boolean;
  message: string;
  details?: string;
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

class DeploymentVerifier {
  private network: NetworkConfig;
  private provider: ethers.JsonRpcProvider;
  private contracts: DeployedContract[];
  private results: VerificationResult[] = [];

  constructor(networkName: string, contractsFile: string) {
    if (!networks[networkName]) {
      throw new Error(`Unknown network: ${networkName}`);
    }
    this.network = networks[networkName];
    this.provider = new ethers.JsonRpcProvider(this.network.rpcUrl);
    
    // Load deployed contracts
    if (!fs.existsSync(contractsFile)) {
      throw new Error(`Contracts file not found: ${contractsFile}`);
    }
    this.contracts = JSON.parse(fs.readFileSync(contractsFile, "utf-8"));
  }

  private log(message: string, color: keyof typeof colors = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  private addResult(result: VerificationResult) {
    this.results.push(result);
    const icon = result.passed ? "✓" : "✗";
    const color = result.passed ? "green" : "red";
    this.log(`${icon} ${result.message}`, color);
    if (result.details) {
      this.log(`  ${result.details}`, "cyan");
    }
  }

  /**
   * Verify contract exists at address and has code
   */
  async verifyContractCode(contract: DeployedContract): Promise<void> {
    try {
      const code = await this.provider.getCode(contract.address);
      
      if (code && code !== "0x") {
        this.addResult({
          passed: true,
          message: `${contract.name} has bytecode at address`,
          details: `${contract.address} (${code.length / 2 - 1} bytes)`,
        });
      } else {
        this.addResult({
          passed: false,
          message: `${contract.name} has no bytecode`,
          details: `Address ${contract.address} is not a contract`,
        });
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: `Failed to verify ${contract.name} bytecode`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Verify deployment transaction
   */
  async verifyTransaction(contract: DeployedContract): Promise<void> {
    try {
      const tx = await this.provider.getTransaction(contract.transactionHash);
      
      if (tx) {
        this.addResult({
          passed: true,
          message: `${contract.name} deployment transaction found`,
          details: `Block ${tx.blockNumber}, Gas used: ${tx.gasLimit.toString()}`,
        });

        // Verify transaction was successful
        const receipt = await this.provider.getTransactionReceipt(contract.transactionHash);
        if (receipt) {
          if (receipt.status === 1) {
            this.addResult({
              passed: true,
              message: `${contract.name} deployment successful`,
              details: `Gas used: ${receipt.gasUsed.toString()}, Effective gas price: ${ethers.formatUnits(receipt.gasPrice, "gwei")} gwei`,
            });
          } else {
            this.addResult({
              passed: false,
              message: `${contract.name} deployment failed`,
              details: `Transaction reverted`,
            });
          }
        }
      } else {
        this.addResult({
          passed: false,
          message: `${contract.name} deployment transaction not found`,
          details: `Transaction hash: ${contract.transactionHash}`,
        });
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: `Failed to verify ${contract.name} transaction`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Test PropertyTransfer contract functions
   */
  async testPropertyTransfer(contract: DeployedContract): Promise<void> {
    this.log(`\n🏠 Testing PropertyTransfer Contract...`, "bright");

    try {
      const artifact = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "artifacts/contracts/PropertyTransfer.sol/PropertyTransfer.json"),
          "utf-8"
        )
      );

      const contractInstance = new ethers.Contract(
        contract.address,
        artifact.abi,
        this.provider
      );

      // Test owner() function
      try {
        const owner = await contractInstance.owner();
        this.addResult({
          passed: true,
          message: `PropertyTransfer owner() readable`,
          details: `Owner: ${owner}`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `PropertyTransfer owner() failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test propertyCount() function
      try {
        const count = await contractInstance.propertyCount();
        this.addResult({
          passed: true,
          message: `PropertyTransfer propertyCount() readable`,
          details: `Count: ${count.toString()}`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `PropertyTransfer propertyCount() failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Check events
      try {
        const filter = contractInstance.filters.PropertyRegistered();
        const events = await contractInstance.queryFilter(filter, contract.blockNumber, "latest");
        this.addResult({
          passed: true,
          message: `PropertyTransfer events queryable`,
          details: `${events.length} PropertyRegistered events found`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `PropertyTransfer events query failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: `Failed to load PropertyTransfer artifact`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Test Escrow contract functions
   */
  async testEscrow(contract: DeployedContract): Promise<void> {
    this.log(`\n🔒 Testing Escrow Contract...`, "bright");

    try {
      const artifact = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "artifacts/contracts/Escrow.sol/Escrow.json"),
          "utf-8"
        )
      );

      const contractInstance = new ethers.Contract(
        contract.address,
        artifact.abi,
        this.provider
      );

      // Test owner() function
      try {
        const owner = await contractInstance.owner();
        this.addResult({
          passed: true,
          message: `Escrow owner() readable`,
          details: `Owner: ${owner}`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `Escrow owner() failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test escrowCount() function
      try {
        const count = await contractInstance.escrowCount();
        this.addResult({
          passed: true,
          message: `Escrow escrowCount() readable`,
          details: `Count: ${count.toString()}`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `Escrow escrowCount() failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Check events
      try {
        const filter = contractInstance.filters.EscrowCreated();
        const events = await contractInstance.queryFilter(filter, contract.blockNumber, "latest");
        this.addResult({
          passed: true,
          message: `Escrow events queryable`,
          details: `${events.length} EscrowCreated events found`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `Escrow events query failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: `Failed to load Escrow artifact`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Test MultiSigWallet contract functions
   */
  async testMultiSigWallet(contract: DeployedContract): Promise<void> {
    this.log(`\n🔐 Testing MultiSigWallet Contract...`, "bright");

    try {
      const artifact = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "artifacts/contracts/MultiSigWallet.sol/MultiSigWallet.json"),
          "utf-8"
        )
      );

      const contractInstance = new ethers.Contract(
        contract.address,
        artifact.abi,
        this.provider
      );

      // Test getOwners() function
      try {
        const owners = await contractInstance.getOwners();
        this.addResult({
          passed: true,
          message: `MultiSigWallet getOwners() readable`,
          details: `${owners.length} owners: ${owners.join(", ")}`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `MultiSigWallet getOwners() failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test required() function
      try {
        const required = await contractInstance.required();
        this.addResult({
          passed: true,
          message: `MultiSigWallet required() readable`,
          details: `Required confirmations: ${required.toString()}`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `MultiSigWallet required() failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Test transactionCount() function
      try {
        const count = await contractInstance.transactionCount();
        this.addResult({
          passed: true,
          message: `MultiSigWallet transactionCount() readable`,
          details: `Count: ${count.toString()}`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `MultiSigWallet transactionCount() failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }

      // Check events
      try {
        const filter = contractInstance.filters.Submission();
        const events = await contractInstance.queryFilter(filter, contract.blockNumber, "latest");
        this.addResult({
          passed: true,
          message: `MultiSigWallet events queryable`,
          details: `${events.length} Submission events found`,
        });
      } catch (error) {
        this.addResult({
          passed: false,
          message: `MultiSigWallet events query failed`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: `Failed to load MultiSigWallet artifact`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Generate deployment report
   */
  generateReport(): void {
    this.log(`\n📄 Generating Deployment Report...`, "bright");

    const report = {
      network: this.network.name,
      chainId: this.network.chainId,
      timestamp: new Date().toISOString(),
      contracts: this.contracts.map((c) => ({
        name: c.name,
        address: c.address,
        explorer: `${this.network.explorer}/address/${c.address}`,
        deployer: c.deployer,
        transactionHash: c.transactionHash,
        blockNumber: c.blockNumber,
      })),
      verification: {
        total: this.results.length,
        passed: this.results.filter((r) => r.passed).length,
        failed: this.results.filter((r) => !r.passed).length,
      },
    };

    const reportPath = path.join(process.cwd(), "deployment-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    this.addResult({
      passed: true,
      message: `Deployment report generated`,
      details: reportPath,
    });
  }

  /**
   * Run all verification checks
   */
  async runAll(): Promise<boolean> {
    this.log("\n" + "=".repeat(60), "bright");
    this.log("Smart Contract Post-Deployment Verification", "bright");
    this.log(`Network: ${this.network.name}`, "bright");
    this.log("=".repeat(60), "bright");

    this.log(`\n📋 Deployed Contracts:`, "bright");
    for (const contract of this.contracts) {
      this.log(`  • ${contract.name}: ${contract.address}`, "cyan");
    }

    // Verify each contract
    for (const contract of this.contracts) {
      this.log(`\n🔍 Verifying ${contract.name}...`, "bright");
      await this.verifyContractCode(contract);
      await this.verifyTransaction(contract);
    }

    // Test contract functions
    const propertyTransfer = this.contracts.find((c) => c.name === "PropertyTransfer");
    if (propertyTransfer) {
      await this.testPropertyTransfer(propertyTransfer);
    }

    const escrow = this.contracts.find((c) => c.name === "Escrow");
    if (escrow) {
      await this.testEscrow(escrow);
    }

    const multiSig = this.contracts.find((c) => c.name === "MultiSigWallet");
    if (multiSig) {
      await this.testMultiSigWallet(multiSig);
    }

    // Generate report
    this.generateReport();

    // Summary
    this.log("\n" + "=".repeat(60), "bright");
    this.log("Verification Summary", "bright");
    this.log("=".repeat(60), "bright");

    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;

    this.log(`\nTotal checks: ${total}`, "bright");
    this.log(`Passed: ${passed}`, "green");
    if (failed > 0) {
      this.log(`Failed: ${failed}`, "red");
    }

    const allPassed = failed === 0;
    if (allPassed) {
      this.log("\n✅ All verification checks passed!", "green");
      this.log(`\nContracts are deployed and functioning correctly.`, "bright");
      this.log(`\nNext steps:`, "bright");
      this.log(`1. Update environment variables with contract addresses`, "cyan");
      this.log(`2. Test end-to-end payment flow with escrow integration`, "cyan");
      this.log(`3. Monitor contracts on ${this.network.explorer}`, "cyan");
    } else {
      this.log("\n❌ Some verification checks failed!", "red");
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
  const contractsArg = args.find((arg) => arg.startsWith("--contracts="));

  const networkName = networkArg ? networkArg.split("=")[1] : "mumbai";
  const contractsFile = contractsArg ? contractsArg.split("=")[1] : "deployed-contracts.json";

  try {
    const verifier = new DeploymentVerifier(networkName, contractsFile);
    const success = await verifier.runAll();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}`);
    process.exit(1);
  }
}

main();
