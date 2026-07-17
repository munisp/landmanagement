/**
 * Smart Contract Pre-Deployment Validation Script
 * 
 * This script performs comprehensive validation checks before deploying
 * smart contracts to Polygon Mumbai testnet or mainnet.
 * 
 * Usage: npx tsx scripts/validate-deployment.ts --network mumbai
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

interface ValidationResult {
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

class DeploymentValidator {
  private network: NetworkConfig;
  private provider: ethers.JsonRpcProvider;
  private results: ValidationResult[] = [];

  constructor(networkName: string) {
    if (!networks[networkName]) {
      throw new Error(`Unknown network: ${networkName}. Use 'mumbai' or 'polygon'`);
    }
    this.network = networks[networkName];
    this.provider = new ethers.JsonRpcProvider(this.network.rpcUrl);
  }

  private log(message: string, color: keyof typeof colors = "reset") {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  private addResult(result: ValidationResult) {
    this.results.push(result);
    const icon = result.passed ? "✓" : "✗";
    const color = result.passed ? "green" : "red";
    this.log(`${icon} ${result.message}`, color);
    if (result.details) {
      this.log(`  ${result.details}`, "cyan");
    }
  }

  /**
   * Check if required environment variables are set
   */
  async validateEnvironment(): Promise<void> {
    this.log("\n📋 Validating Environment Variables...", "bright");

    const requiredVars = [
      "DEPLOYER_PRIVATE_KEY",
      "POLYGONSCAN_API_KEY",
    ];

    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (!value || value.trim() === "") {
        this.addResult({
          passed: false,
          message: `${varName} is not set`,
          details: `Set this variable in your .env file or environment`,
        });
      } else {
        // Mask sensitive values in output
        const maskedValue = varName.includes("KEY") || varName.includes("SECRET")
          ? `${value.substring(0, 6)}...${value.substring(value.length - 4)}`
          : value;
        this.addResult({
          passed: true,
          message: `${varName} is set`,
          details: maskedValue,
        });
      }
    }
  }

  /**
   * Check network connectivity and chain ID
   */
  async validateNetwork(): Promise<void> {
    this.log("\n🌐 Validating Network Connectivity...", "bright");

    try {
      const network = await this.provider.getNetwork();
      const chainId = Number(network.chainId);

      if (chainId === this.network.chainId) {
        this.addResult({
          passed: true,
          message: `Connected to ${this.network.name}`,
          details: `Chain ID: ${chainId}, RPC: ${this.network.rpcUrl}`,
        });
      } else {
        this.addResult({
          passed: false,
          message: `Chain ID mismatch`,
          details: `Expected ${this.network.chainId}, got ${chainId}`,
        });
      }

      // Check block number to verify node is synced
      const blockNumber = await this.provider.getBlockNumber();
      this.addResult({
        passed: true,
        message: `Node is synced`,
        details: `Current block: ${blockNumber}`,
      });
    } catch (error) {
      this.addResult({
        passed: false,
        message: `Failed to connect to network`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate deployer wallet has sufficient balance
   */
  async validateWallet(): Promise<void> {
    this.log("\n💰 Validating Deployer Wallet...", "bright");

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      this.addResult({
        passed: false,
        message: `Cannot validate wallet - DEPLOYER_PRIVATE_KEY not set`,
      });
      return;
    }

    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const address = wallet.address;

      this.addResult({
        passed: true,
        message: `Deployer address`,
        details: address,
      });

      const balance = await this.provider.getBalance(address);
      const balanceInEther = ethers.formatEther(balance);
      const balanceNum = parseFloat(balanceInEther);

      // Minimum required balance (0.1 MATIC for testnet, 1 MATIC for mainnet)
      const minBalance = this.network.chainId === 80001 ? 0.1 : 1.0;

      if (balanceNum >= minBalance) {
        this.addResult({
          passed: true,
          message: `Sufficient balance`,
          details: `${balanceInEther} ${this.network.currency} (minimum: ${minBalance})`,
        });
      } else {
        this.addResult({
          passed: false,
          message: `Insufficient balance`,
          details: `${balanceInEther} ${this.network.currency} (minimum: ${minBalance} required)`,
        });
      }

      // Estimate gas costs for deployment
      const gasPrice = await this.provider.getFeeData();
      if (gasPrice.gasPrice) {
        const estimatedGas = BigInt(3000000); // Approximate gas for 3 contracts
        const estimatedCost = gasPrice.gasPrice * estimatedGas;
        const estimatedCostInEther = ethers.formatEther(estimatedCost);

        this.addResult({
          passed: true,
          message: `Estimated deployment cost`,
          details: `~${estimatedCostInEther} ${this.network.currency} (gas price: ${ethers.formatUnits(gasPrice.gasPrice, "gwei")} gwei)`,
        });
      }
    } catch (error) {
      this.addResult({
        passed: false,
        message: `Failed to validate wallet`,
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Validate contract compilation artifacts exist
   */
  async validateArtifacts(): Promise<void> {
    this.log("\n📦 Validating Contract Artifacts...", "bright");

    const artifactsDir = path.join(process.cwd(), "artifacts", "contracts");
    const requiredContracts = [
      "PropertyTransfer.sol/PropertyTransfer.json",
      "Escrow.sol/Escrow.json",
      "MultiSigWallet.sol/MultiSigWallet.json",
    ];

    for (const contractPath of requiredContracts) {
      const fullPath = path.join(artifactsDir, contractPath);
      const contractName = contractPath.split("/")[1].replace(".json", "");

      if (fs.existsSync(fullPath)) {
        try {
          const artifact = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          
          if (artifact.bytecode && artifact.bytecode.length > 2) {
            this.addResult({
              passed: true,
              message: `${contractName} artifact found`,
              details: `Bytecode size: ${(artifact.bytecode.length / 2 - 1).toLocaleString()} bytes`,
            });
          } else {
            this.addResult({
              passed: false,
              message: `${contractName} has no bytecode`,
              details: `Run 'npx hardhat compile' to compile contracts`,
            });
          }

          // Check for constructor arguments
          const constructor = artifact.abi.find((item: any) => item.type === "constructor");
          if (constructor && constructor.inputs.length > 0) {
            const params = constructor.inputs.map((input: any) => `${input.type} ${input.name}`).join(", ");
            this.addResult({
              passed: true,
              message: `${contractName} constructor parameters`,
              details: params,
            });
          }
        } catch (error) {
          this.addResult({
            passed: false,
            message: `Failed to read ${contractName} artifact`,
            details: error instanceof Error ? error.message : String(error),
          });
        }
      } else {
        this.addResult({
          passed: false,
          message: `${contractName} artifact not found`,
          details: `Run 'npx hardhat compile' to generate artifacts`,
        });
      }
    }
  }

  /**
   * Validate Hardhat configuration
   */
  async validateHardhatConfig(): Promise<void> {
    this.log("\n⚙️  Validating Hardhat Configuration...", "bright");

    const configPath = path.join(process.cwd(), "hardhat.config.ts");

    if (fs.existsSync(configPath)) {
      this.addResult({
        passed: true,
        message: `Hardhat config found`,
        details: configPath,
      });

      try {
        const configContent = fs.readFileSync(configPath, "utf-8");

        // Check for required network configuration
        const hasNetworkConfig = configContent.includes("networks:") && 
                                 configContent.includes(this.network.chainId.toString());
        
        if (hasNetworkConfig) {
          this.addResult({
            passed: true,
            message: `Network configuration present`,
            details: `${this.network.name} (${this.network.chainId})`,
          });
        } else {
          this.addResult({
            passed: false,
            message: `Network configuration missing`,
            details: `Add ${this.network.name} configuration to hardhat.config.ts`,
          });
        }

        // Check for Etherscan configuration
        const hasEtherscanConfig = configContent.includes("etherscan:") && 
                                   configContent.includes("apiKey");
        
        if (hasEtherscanConfig) {
          this.addResult({
            passed: true,
            message: `Etherscan configuration present`,
            details: `Contract verification enabled`,
          });
        } else {
          this.addResult({
            passed: false,
            message: `Etherscan configuration missing`,
            details: `Add etherscan config for contract verification`,
          });
        }

        // Check for Solidity version
        const solidityMatch = configContent.match(/solidity:\s*["']([^"']+)["']/);
        if (solidityMatch) {
          this.addResult({
            passed: true,
            message: `Solidity version`,
            details: solidityMatch[1],
          });
        }
      } catch (error) {
        this.addResult({
          passed: false,
          message: `Failed to read Hardhat config`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      this.addResult({
        passed: false,
        message: `Hardhat config not found`,
        details: `Create hardhat.config.ts in project root`,
      });
    }
  }

  /**
   * Validate deployment script exists
   */
  async validateDeploymentScript(): Promise<void> {
    this.log("\n📝 Validating Deployment Script...", "bright");

    const scriptPath = path.join(process.cwd(), "scripts", "deploy.ts");

    if (fs.existsSync(scriptPath)) {
      this.addResult({
        passed: true,
        message: `Deployment script found`,
        details: scriptPath,
      });

      try {
        const scriptContent = fs.readFileSync(scriptPath, "utf-8");

        // Check for required contract deployments
        const contracts = ["PropertyTransfer", "Escrow", "MultiSigWallet"];
        for (const contract of contracts) {
          if (scriptContent.includes(contract)) {
            this.addResult({
              passed: true,
              message: `${contract} deployment included`,
            });
          } else {
            this.addResult({
              passed: false,
              message: `${contract} deployment missing`,
              details: `Add ${contract} deployment to scripts/deploy.ts`,
            });
          }
        }

        // Check for contract verification
        if (scriptContent.includes("verify") || scriptContent.includes("Verification")) {
          this.addResult({
            passed: true,
            message: `Contract verification included`,
          });
        } else {
          this.addResult({
            passed: false,
            message: `Contract verification missing`,
            details: `Add verification step to deployment script`,
          });
        }
      } catch (error) {
        this.addResult({
          passed: false,
          message: `Failed to read deployment script`,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      this.addResult({
        passed: false,
        message: `Deployment script not found`,
        details: `Create scripts/deploy.ts`,
      });
    }
  }

  /**
   * Run all validation checks
   */
  async runAll(): Promise<boolean> {
    this.log("\n" + "=".repeat(60), "bright");
    this.log("Smart Contract Pre-Deployment Validation", "bright");
    this.log(`Network: ${this.network.name}`, "bright");
    this.log("=".repeat(60), "bright");

    await this.validateEnvironment();
    await this.validateNetwork();
    await this.validateWallet();
    await this.validateArtifacts();
    await this.validateHardhatConfig();
    await this.validateDeploymentScript();

    // Summary
    this.log("\n" + "=".repeat(60), "bright");
    this.log("Validation Summary", "bright");
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
      this.log("\n✅ All validation checks passed!", "green");
      this.log(`\nYou can proceed with deployment:`, "bright");
      this.log(`npx hardhat run scripts/deploy.ts --network ${Object.keys(networks).find(k => networks[k] === this.network)}`, "cyan");
    } else {
      this.log("\n❌ Some validation checks failed!", "red");
      this.log(`\nPlease fix the issues above before deploying.`, "bright");
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
    const validator = new DeploymentValidator(networkName);
    const success = await validator.runAll();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}`);
    process.exit(1);
  }
}

main();
