import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface PropertyTransactionWorkflowProps {
  propertyId: string;
  buyerId?: string;
  sellerId?: string;
}

export function PropertyTransactionWorkflow({ 
  propertyId, 
  buyerId, 
  sellerId 
}: PropertyTransactionWorkflowProps) {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    currency: 'NGN',
    paymentMethod: 'mojaloop' as 'mojaloop' | 'card' | 'bank_transfer',
    approvalCode: '',
  });

  const startMutation = trpc.workflows.startTransaction.useMutation({
    onSuccess: (data) => {
      setWorkflowId(data.workflowId);
      toast.success('Transaction workflow started successfully');
    },
    onError: (error) => {
      toast.error(`Failed to start workflow: ${error.message}`);
    },
  });

  const approveMutation = trpc.workflows.approvePayment.useMutation({
    onSuccess: () => {
      toast.success('Payment approved successfully');
      setFormData(prev => ({ ...prev, approvalCode: '' }));
    },
    onError: (error) => {
      toast.error(`Failed to approve payment: ${error.message}`);
    },
  });

  const cancelMutation = trpc.workflows.cancel.useMutation({
    onSuccess: () => {
      toast.success('Workflow cancelled successfully');
      setWorkflowId(null);
    },
    onError: (error) => {
      toast.error(`Failed to cancel workflow: ${error.message}`);
    },
  });

  const { data: state, isLoading: stateLoading } = trpc.workflows.getState.useQuery(
    { workflowId: workflowId! },
    { 
      enabled: !!workflowId, 
      refetchInterval: 2000,
      retry: 3,
    }
  );

  const { data: progressData } = trpc.workflows.getProgress.useQuery(
    { workflowId: workflowId! },
    { 
      enabled: !!workflowId, 
      refetchInterval: 2000,
      retry: 3,
    }
  );

  const handleStart = async () => {
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!buyerId || !sellerId) {
      toast.error('Buyer and seller information is required');
      return;
    }

    await startMutation.mutateAsync({
      propertyId,
      buyerId,
      sellerId,
      amount: formData.amount,
      currency: formData.currency,
      paymentMethod: formData.paymentMethod,
    });
  };

  const handleApprove = async () => {
    if (!workflowId) return;
    if (!formData.approvalCode) {
      toast.error('Please enter approval code');
      return;
    }

    await approveMutation.mutateAsync({
      workflowId,
      approvalCode: formData.approvalCode,
    });
  };

  const handleCancel = async () => {
    if (!workflowId) return;
    if (!confirm('Are you sure you want to cancel this transaction? This action cannot be undone.')) {
      return;
    }

    await cancelMutation.mutateAsync({ workflowId });
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'failed':
      case 'cancelled':
        return 'bg-red-500';
      case 'payment_processing':
      case 'blockchain_processing':
      case 'ledger_processing':
      case 'title_processing':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="h-5 w-5" />;
      case 'payment_processing':
      case 'blockchain_processing':
      case 'ledger_processing':
      case 'title_processing':
        return <Loader2 className="h-5 w-5 animate-spin" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      {!workflowId ? (
        <Card>
          <CardHeader>
            <CardTitle>Start Property Transaction</CardTitle>
            <CardDescription>
              Initiate a new property transaction workflow with automated payment, blockchain escrow, and ledger reconciliation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Transaction Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="1000000"
                  value={formData.amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  disabled={startMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, currency: value }))}
                  disabled={startMutation.isPending}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, paymentMethod: value }))}
                disabled={startMutation.isPending}
              >
                <SelectTrigger id="paymentMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mojaloop">Mojaloop (Instant Payment)</SelectItem>
                  <SelectItem value="card">Credit/Debit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This will initiate a multi-step transaction including payment processing, blockchain escrow creation, 
                ledger reconciliation, and property title transfer. You will be notified at each step.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleStart} 
              disabled={startMutation.isPending || !buyerId || !sellerId}
              className="w-full"
            >
              {startMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Transaction Workflow
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Transaction Workflow</CardTitle>
                  <CardDescription className="font-mono text-xs mt-1">
                    ID: {workflowId}
                  </CardDescription>
                </div>
                {state && (
                  <Badge className={getStatusColor(state.status)}>
                    <span className="flex items-center gap-2">
                      {getStatusIcon(state.status)}
                      {state.status?.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {stateLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {state && (
                <>
                  {/* Progress Bar */}
                  {progressData && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Overall Progress</span>
                        <span className="font-semibold">{progressData.progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progressData.progress} className="h-2" />
                    </div>
                  )}

                  {/* Current Step */}
                  {state.currentStep && (
                    <div className="space-y-2">
                      <Label>Current Step</Label>
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="font-medium">{state.currentStep}</span>
                      </div>
                    </div>
                  )}

                  {/* Completed Steps */}
                  {state.completedSteps && state.completedSteps.length > 0 && (
                    <div className="space-y-2">
                      <Label>Completed Steps</Label>
                      <div className="space-y-2">
                        {state.completedSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded-lg">
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm">{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Approval */}
                  {state.status === 'payment_processing' && (
                    <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <Label className="text-blue-900 dark:text-blue-100">Payment Approval Required</Label>
                      </div>
                      <div className="space-y-2">
                        <Input
                          placeholder="Enter approval code"
                          value={formData.approvalCode}
                          onChange={(e) => setFormData(prev => ({ ...prev, approvalCode: e.target.value }))}
                          disabled={approveMutation.isPending}
                        />
                        <Button 
                          onClick={handleApprove} 
                          disabled={approveMutation.isPending || !formData.approvalCode}
                          className="w-full"
                        >
                          {approveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Approve Payment
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {state.status === 'failed' && state.errorMessage && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Workflow Failed:</strong> {state.errorMessage}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Success Message */}
                  {state.status === 'completed' && (
                    <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <AlertDescription className="text-green-900 dark:text-green-100">
                        <strong>Transaction Completed Successfully!</strong> All steps have been executed and the property title has been transferred.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {state.status !== 'completed' && state.status !== 'failed' && (
                      <Button 
                        variant="destructive" 
                        onClick={handleCancel}
                        disabled={cancelMutation.isPending}
                        className="flex-1"
                      >
                        {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Cancel Workflow
                      </Button>
                    )}
                    {(state.status === 'completed' || state.status === 'failed') && (
                      <Button 
                        variant="outline" 
                        onClick={() => setWorkflowId(null)}
                        className="flex-1"
                      >
                        Start New Transaction
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
