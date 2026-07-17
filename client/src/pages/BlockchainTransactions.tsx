import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function BlockchainTransactions() {
  const { t } = useTranslation();
  const [parcelId, setParcelId] = useState('');
  const [newOwnerAddress, setNewOwnerAddress] = useState('');
  const [documentHash, setDocumentHash] = useState('');
  const [escrowParcelId, setEscrowParcelId] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [escrowAmount, setEscrowAmount] = useState('');

  const { data: transactions, isLoading: loadingHistory, refetch } = trpc.blockchainTransactions.getTransactionHistory.useQuery({});
  const transferProperty = trpc.blockchainTransactions.transferProperty.useMutation();
  const createEscrow = trpc.blockchainTransactions.createEscrow.useMutation();
  const { data: gasEstimate, isLoading: estimatingGas } = trpc.blockchainTransactions.estimateGas.useQuery(
    {
      transactionType: 'property_transfer',
      params: { parcelId: parseInt(parcelId) || 0, newOwner: newOwnerAddress, documentHash }
    },
    { enabled: !!parcelId && !!newOwnerAddress && !!documentHash }
  );

  const handleTransferProperty = async () => {
    if (!parcelId || !newOwnerAddress || !documentHash) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      const txHash = await transferProperty.mutateAsync({
        parcelId: parseInt(parcelId),
        newOwnerAddress,
        documentHash
      });
      toast.success(`Property transfer initiated! Transaction: ${txHash}`);
      setParcelId('');
      setNewOwnerAddress('');
      setDocumentHash('');
      refetch();
    } catch (error: any) {
      toast.error(`Transfer failed: ${error.message}`);
    }
  };

  const handleCreateEscrow = async () => {
    if (!escrowParcelId || !sellerAddress || !buyerAddress || !escrowAmount) {
      toast.error('Please fill in all escrow fields');
      return;
    }

    try {
      const escrowId = await createEscrow.mutateAsync({
        parcelId: parseInt(escrowParcelId),
        sellerAddress,
        buyerAddress,
        amount: escrowAmount
      });
      toast.success(`Escrow created! ID: ${escrowId}`);
      setEscrowParcelId('');
      setSellerAddress('');
      setBuyerAddress('');
      setEscrowAmount('');
      refetch();
    } catch (error: any) {
      toast.error(`Escrow creation failed: ${error.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Blockchain Transactions</h1>
        <p className="text-muted-foreground mt-2">
          Manage property transfers and escrow using blockchain smart contracts
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Property Transfer Card */}
        <Card>
          <CardHeader>
            <CardTitle>Transfer Property</CardTitle>
            <CardDescription>
              Transfer property ownership using blockchain smart contract
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="parcelId">Parcel ID</Label>
              <Input
                id="parcelId"
                type="number"
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
                placeholder="Enter parcel ID"
              />
            </div>
            <div>
              <Label htmlFor="newOwner">New Owner Address</Label>
              <Input
                id="newOwner"
                value={newOwnerAddress}
                onChange={(e) => setNewOwnerAddress(e.target.value)}
                placeholder="0x..."
              />
            </div>
            <div>
              <Label htmlFor="documentHash">Document Hash</Label>
              <Input
                id="documentHash"
                value={documentHash}
                onChange={(e) => setDocumentHash(e.target.value)}
                placeholder="SHA256 hash of transfer document"
              />
            </div>
            {gasEstimate && !estimatingGas && (
              <div className="text-sm text-muted-foreground">
                Estimated gas cost: {(parseInt(gasEstimate) / 1e18).toFixed(6)} ETH
              </div>
            )}
            <Button
              onClick={handleTransferProperty}
              disabled={transferProperty.isPending}
              className="w-full"
            >
              {transferProperty.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transfer Property
            </Button>
          </CardContent>
        </Card>

        {/* Create Escrow Card */}
        <Card>
          <CardHeader>
            <CardTitle>Create Escrow</CardTitle>
            <CardDescription>
              Create a secure escrow for property transaction
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="escrowParcelId">Parcel ID</Label>
              <Input
                id="escrowParcelId"
                type="number"
                value={escrowParcelId}
                onChange={(e) => setEscrowParcelId(e.target.value)}
                placeholder="Enter parcel ID"
              />
            </div>
            <div>
              <Label htmlFor="seller">Seller Address</Label>
              <Input
                id="seller"
                value={sellerAddress}
                onChange={(e) => setSellerAddress(e.target.value)}
                placeholder="0x..."
              />
            </div>
            <div>
              <Label htmlFor="buyer">Buyer Address</Label>
              <Input
                id="buyer"
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                placeholder="0x..."
              />
            </div>
            <div>
              <Label htmlFor="amount">Amount (ETH)</Label>
              <Input
                id="amount"
                value={escrowAmount}
                onChange={(e) => setEscrowAmount(e.target.value)}
                placeholder="0.0"
              />
            </div>
            <Button
              onClick={handleCreateEscrow}
              disabled={createEscrow.isPending}
              className="w-full"
            >
              {createEscrow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Escrow
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>
            Recent blockchain transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : transactions && transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction Hash</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Parcel ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: any) => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-mono text-sm">
                      <a
                        href={`https://mumbai.polygonscan.com/tx/${tx.transaction_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        {tx.transaction_hash.slice(0, 10)}...{tx.transaction_hash.slice(-8)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                    <TableCell>{tx.transaction_type.replace('_', ' ')}</TableCell>
                    <TableCell>{tx.parcel_id || '-'}</TableCell>
                    <TableCell>{getStatusBadge(tx.status)}</TableCell>
                    <TableCell>{tx.block_number || '-'}</TableCell>
                    <TableCell>{new Date(tx.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
