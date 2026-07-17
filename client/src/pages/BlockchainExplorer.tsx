import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Search, ExternalLink, CheckCircle2, Clock, QrCode, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function BlockchainExplorer() {
  const [searchHash, setSearchHash] = useState("");
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const { data, isLoading } = trpc.blockchainExplorer.state.useQuery();
  const utils = trpc.useUtils();

  const handleSearch = async () => {
    if (!searchHash.trim()) return;
    try {
      const tx = await utils.blockchainExplorer.search.fetch({ query: searchHash.trim() });
      setSelectedTx(tx);
      toast.success("Transaction found on blockchain workflow");
    } catch {
      toast.error("Transaction not found");
    }
  };

  const generateQRCode = (txHash: string) => {
    navigator.clipboard.writeText(txHash);
    toast.success("Transaction hash copied for external verification");
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading blockchain explorer...
        </div>
      </div>
    );
  }

  const selected = selectedTx ?? data.transactions[0] ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">← Back to Home</Button>
          </Link>
          <h1 className="text-xl font-semibold">Blockchain Explorer</h1>
          <div className="w-24" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4">Blockchain Transaction Explorer</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Verify land registry transactions recorded through the platform blockchain workflow, including parcel transfers, registrations, and title issuance activity.
            </p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Transaction
              </CardTitle>
              <CardDescription>Enter transaction hash or parcel ID to verify the recorded blockchain activity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Input
                  placeholder="Enter transaction hash or parcel ID..."
                  value={searchHash}
                  onChange={(e) => setSearchHash(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} className="gap-2">
                  <Search className="h-4 w-4" />
                  Search
                </Button>
              </div>
            </CardContent>
          </Card>

          {selected && (
            <Card className="mb-8 border-2 border-primary">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selected.status === "confirmed" ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Clock className="h-5 w-5 text-yellow-500" />}
                      Transaction Details
                    </CardTitle>
                    <CardDescription className="font-mono text-xs mt-1">{selected.txHash}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => generateQRCode(selected.txHash)}>
                    <QrCode className="h-4 w-4" />
                    Copy Hash
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div><label className="text-sm text-muted-foreground">Block Number</label><p className="font-semibold">#{selected.blockNumber.toLocaleString()}</p></div>
                    <div><label className="text-sm text-muted-foreground">Timestamp</label><p className="font-semibold">{format(new Date(selected.timestamp), "MMM dd, yyyy HH:mm:ss")}</p></div>
                    <div><label className="text-sm text-muted-foreground">Transaction Type</label><p className="font-semibold">{selected.type.replace(/_/g, " ")}</p></div>
                    <div>
                      <label className="text-sm text-muted-foreground">Status</label>
                      <div className="mt-1">
                        <Badge variant={selected.status === "confirmed" ? "default" : "secondary"}>{selected.status}</Badge>
                        <span className="text-sm text-muted-foreground ml-2">({selected.confirmations} confirmations)</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div><label className="text-sm text-muted-foreground">Parcel ID</label><p className="font-semibold">{selected.parcelId}</p></div>
                    <div><label className="text-sm text-muted-foreground">From Address</label><p className="font-mono text-sm">{selected.from}</p></div>
                    <div><label className="text-sm text-muted-foreground">To Address</label><p className="font-mono text-sm">{selected.to}</p></div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-semibold mb-3">Transaction Data</h3>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <pre className="text-xs overflow-x-auto">{JSON.stringify(selected.data, null, 2)}</pre>
                  </div>
                </div>

                <div className="mt-6 flex gap-4">
                  <Button variant="outline" className="gap-2" asChild>
                    <a href={`/parcels/${selected.parcelId}`}>
                      <ExternalLink className="h-4 w-4" />
                      View Parcel
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Blockchain Transactions</CardTitle>
              <CardDescription>Latest land registry transactions recorded through the blockchain workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.transactions.map((tx) => (
                  <div key={tx.txHash} className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setSelectedTx(tx)}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {tx.status === "confirmed" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-yellow-500" />}
                        <span className="font-mono text-sm">{tx.txHash}</span>
                      </div>
                      <Badge variant="outline">{tx.type.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div><span className="text-muted-foreground">Block:</span><p className="font-semibold">#{tx.blockNumber.toLocaleString()}</p></div>
                      <div><span className="text-muted-foreground">Parcel:</span><p className="font-semibold">{tx.parcelId}</p></div>
                      <div><span className="text-muted-foreground">Time:</span><p className="font-semibold">{format(new Date(tx.timestamp), "HH:mm:ss")}</p></div>
                      <div><span className="text-muted-foreground">Confirmations:</span><p className="font-semibold">{tx.confirmations}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{data.latestBlock.toLocaleString()}</div><p className="text-xs text-muted-foreground">Latest Block</p></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{data.totalTransactions.toLocaleString()}</div><p className="text-xs text-muted-foreground">Total Transactions</p></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{data.verifiedParcels.toLocaleString()}</div><p className="text-xs text-muted-foreground">Verified Parcels</p></CardContent></Card>
            <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{data.uptime}</div><p className="text-xs text-muted-foreground">Uptime</p></CardContent></Card>
          </div>
        </div>
      </div>
    </div>
  );
}
