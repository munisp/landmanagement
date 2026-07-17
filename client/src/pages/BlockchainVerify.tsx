import { useState } from "react";
import { Search, CheckCircle, XCircle, Clock, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function BlockchainVerify() {
  const [hash, setHash] = useState("");
  const [searchHash, setSearchHash] = useState("");

  const { data: verification, isLoading } = trpc.blockchain.verifyTransaction.useQuery(
    { hash: searchHash },
    { enabled: searchHash.length > 0 }
  );

  const handleSearch = () => {
    if (hash.trim()) {
      setSearchHash(hash.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Blockchain Verification Portal
              </h1>
              <p className="text-sm text-gray-600">
                Verify property transactions on the blockchain
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Search Section */}
          <Card className="p-8">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Enter Transaction Hash
                </h2>
                <p className="text-sm text-gray-600">
                  Enter the blockchain transaction hash to verify property transaction details
                </p>
              </div>

              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="0x1234567890abcdef..."
                  value={hash}
                  onChange={(e) => setHash(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="flex-1 font-mono text-sm"
                />
                <Button onClick={handleSearch} disabled={!hash.trim() || isLoading}>
                  <Search className="h-4 w-4 mr-2" />
                  Verify
                </Button>
              </div>

              <p className="text-xs text-gray-500">
                Transaction hashes are 66-character strings starting with "0x"
              </p>
            </div>
          </Card>

          {/* Results Section */}
          {isLoading && (
            <Card className="p-8">
              <div className="flex items-center justify-center gap-3 text-gray-600">
                <Clock className="h-5 w-5 animate-spin" />
                <span>Verifying transaction on blockchain...</span>
              </div>
            </Card>
          )}

          {verification && !isLoading && (
            <Card className="p-8">
              {verification.verified ? (
                <div className="space-y-6">
                  {/* Success Header */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-green-100 rounded-full">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Transaction Verified
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        This transaction has been recorded on the blockchain and is authentic
                      </p>
                    </div>
                  </div>

                  {/* Transaction Details */}
                  <div className="border-t pt-6 space-y-4">
                    <h4 className="font-semibold text-gray-900">Transaction Details</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-600">
                          Transaction Hash
                        </label>
                        <p className="text-sm font-mono text-gray-900 break-all mt-1">
                          {verification.hash}
                        </p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-600">
                          Block Number
                        </label>
                        <p className="text-sm text-gray-900 mt-1">
                          {verification.blockNumber || "Pending"}
                        </p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-600">
                          Timestamp
                        </label>
                        <p className="text-sm text-gray-900 mt-1">
                          {verification.timestamp
                            ? new Date(verification.timestamp).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-gray-600">
                          Status
                        </label>
                        <p className="text-sm text-gray-900 mt-1">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Confirmed
                          </span>
                        </p>
                      </div>
                    </div>

                    {verification.parcelId && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">
                          Parcel ID
                        </label>
                        <p className="text-sm text-gray-900 mt-1">
                          {verification.parcelId}
                        </p>
                      </div>
                    )}

                    {verification.transactionType && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">
                          Transaction Type
                        </label>
                        <p className="text-sm text-gray-900 mt-1 capitalize">
                          {verification.transactionType}
                        </p>
                      </div>
                    )}

                    {verification.metadata && (
                      <div>
                        <label className="text-sm font-medium text-gray-600">
                          Additional Details
                        </label>
                        <pre className="text-xs bg-gray-50 p-3 rounded mt-1 overflow-auto">
                          {JSON.stringify(verification.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Error Header */}
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-red-100 rounded-full">
                      <XCircle className="h-8 w-8 text-red-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-gray-900">
                        Transaction Not Found
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {verification.message ||
                          "This transaction hash could not be found on the blockchain"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <p className="text-sm text-gray-600">
                      Please check the transaction hash and try again. If you believe this is
                      an error, contact support.
                    </p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Info Section */}
          <Card className="p-6 bg-blue-50 border-blue-200">
            <h3 className="font-semibold text-gray-900 mb-3">About Blockchain Verification</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  All property transactions are recorded on an immutable blockchain ledger
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  Transaction hashes provide cryptographic proof of authenticity
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span>
                  Anyone can verify transactions without needing an account
                </span>
              </li>
            </ul>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-600">
          <p>
            Powered by Hyperledger Fabric • Integrated Digital Land Registry & Property Title
            System
          </p>
        </div>
      </footer>
    </div>
  );
}
