import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { DollarSign, FileText, AlertTriangle, Download, Calendar, TrendingUp } from 'lucide-react';
import { generateCommissionStatementPDF } from '@/lib/pdfExport';

export default function CommissionManagementDashboard() {
  const [selectedBroker, setSelectedBroker] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [disputeReason, setDisputeReason] = useState('');
  const [selectedCommissionId, setSelectedCommissionId] = useState<string | null>(null);

  // Queries
  const brokersQuery = trpc.mortgageBroker.getMyProfile.useQuery();
  const commissionQuery = trpc.mortgageBroker.calculatePeriodCommission.useQuery(
    {
      brokerId: selectedBroker!,
      startDate,
      endDate,
    },
    { enabled: !!selectedBroker }
  );
  const historyQuery = trpc.mortgageBroker.getCommissionHistory.useQuery(
    { brokerId: selectedBroker!, limit: 10 },
    { enabled: !!selectedBroker }
  );

  // Mutations
  const generateStatement = trpc.mortgageBroker.generateStatement.useMutation({
    onSuccess: async (data) => {
      try {
        // Get commission details for PDF
        if (!commissionQuery.data) {
          toast.error('No commission data available');
          return;
        }

        // Generate PDF statement
        await generateCommissionStatementPDF(
          {
            brokerName: commissionQuery.data.brokerName,
            period: `${startDate} to ${endDate}`,
            totalCommission: data.totalCommission,
            commissions: commissionQuery.data.closedLoans.map((loan) => ({
              date: new Date(loan.closedDate).toLocaleDateString(),
              clientName: `Application #${loan.applicationId}`,
              loanAmount: loan.loanAmount,
              commissionAmount: loan.commissionAmount,
              status: 'Paid',
            })),
          },
          {
            filename: `commission-statement-${commissionQuery.data.brokerName.replace(/\s+/g, '-')}-${startDate}-${endDate}.pdf`,
          }
        );
        toast.success('Commission statement PDF generated successfully');
      } catch (error) {
        console.error('PDF generation error:', error);
        toast.error('Failed to generate PDF statement');
      }
    },
    onError: (error) => toast.error(`Failed to generate statement: ${error.message}`),
  });

  const disputeCommission = trpc.mortgageBroker.disputeCommission.useMutation({
    onSuccess: () => {
      toast.success('Dispute submitted successfully');
      setDisputeReason('');
      setSelectedCommissionId(null);
      historyQuery.refetch();
    },
    onError: (error) => toast.error(`Failed to submit dispute: ${error.message}`),
  });

  const handleGenerateStatement = () => {
    if (!selectedBroker) {
      toast.error('Please select a broker');
      return;
    }
    generateStatement.mutate({
      brokerId: selectedBroker,
      startDate,
      endDate,
    });
  };

  const handleDisputeSubmit = () => {
    if (!selectedCommissionId || !disputeReason.trim()) {
      toast.error('Please provide a reason for the dispute');
      return;
    }
    disputeCommission.mutate({
      commissionId: selectedCommissionId,
      reason: disputeReason,
    });
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Commission Management</h1>
        <p className="text-muted-foreground">View and manage broker commission statements</p>
      </div>

      {/* Broker Selection & Date Range */}
      <Card>
        <CardHeader>
          <CardTitle>Commission Calculator</CardTitle>
          <CardDescription>Calculate commissions for a specific period</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="broker">Broker</Label>
              <Input
                id="broker"
                type="number"
                placeholder="Enter Broker ID"
                value={selectedBroker || ''}
                onChange={(e) => setSelectedBroker(e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => commissionQuery.refetch()} disabled={!selectedBroker || commissionQuery.isFetching}>
            {commissionQuery.isFetching ? 'Calculating...' : 'Calculate Commission'}
          </Button>
        </CardContent>
      </Card>

      {/* Commission Summary */}
      {commissionQuery.data && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₦{(commissionQuery.data.totalCommission / 100).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">For selected period</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loans Closed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{commissionQuery.data.closedLoans?.length || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Total applications</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Commission</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₦{(commissionQuery.data.closedLoans?.length || 0) > 0 ? ((commissionQuery.data.totalCommission / commissionQuery.data.closedLoans.length) / 100).toLocaleString() : 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Per loan</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commission Rate</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">N/A</div>
              <p className="text-xs text-muted-foreground mt-1">Average rate</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Commission Details */}
      {commissionQuery.data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Commission Breakdown</CardTitle>
                <CardDescription>Detailed commission per loan</CardDescription>
              </div>
              <Button onClick={handleGenerateStatement} disabled={generateStatement.isPending}>
                <Download className="w-4 h-4 mr-2" />
                {generateStatement.isPending ? 'Generating...' : 'Download Statement'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {commissionQuery.data.closedLoans && commissionQuery.data.closedLoans.length > 0 ? (
                commissionQuery.data.closedLoans.map((loan: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <p className="font-medium">Application #{loan.applicationId}</p>
                      <p className="text-sm text-muted-foreground">
                        Loan Amount: ₦{(loan.loanAmount / 100).toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Closed: {new Date(loan.closedDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="text-lg font-bold">
                        ₦{(loan.commissionAmount / 100).toLocaleString()}
                      </p>
                      <Badge variant="secondary">{loan.commissionRate}% rate</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No commissions for this period</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Commission History */}
      <Card>
        <CardHeader>
          <CardTitle>Commission History</CardTitle>
          <CardDescription>Past commission payments and statements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {historyQuery.data && historyQuery.data.length > 0 ? (
              historyQuery.data.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-start gap-4">
                    <Calendar className="w-5 h-5 text-muted-foreground mt-1" />
                    <div className="space-y-1">
                      <p className="font-medium">{item.period}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.loanCount} loans • ₦{(item.totalAmount / 100).toLocaleString()}
                      </p>
                      <Badge variant={item.status === 'paid' ? 'default' : 'secondary'}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCommissionId(item.id)}
                      >
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Dispute
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Dispute Commission</DialogTitle>
                        <DialogDescription>
                          Submit a dispute for commission payment
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reason">Dispute Reason</Label>
                          <Textarea
                            id="reason"
                            placeholder="Explain why you're disputing this commission..."
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            rows={4}
                          />
                        </div>
                        <Button
                          onClick={handleDisputeSubmit}
                          disabled={disputeCommission.isPending}
                          className="w-full"
                        >
                          {disputeCommission.isPending ? 'Submitting...' : 'Submit Dispute'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">No commission history yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
