/**
 * Mojaloop Payment Status Page
 * 
 * Displays detailed status and information for a specific payment transaction.
 */

import { useRoute, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  ArrowLeft,
  Copy,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function MojaloopPaymentStatus() {
  const [, params] = useRoute('/mojaloop/payments/:transactionId');
  const [, setLocation] = useLocation();
  const transactionId = params?.transactionId;

  const { data: payment, isLoading, error } = trpc.mojaloopPayments.getStatus.useQuery(
    { transactionId: transactionId || '' },
    { enabled: !!transactionId, refetchInterval: 5000 } // Poll every 5 seconds
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-12 w-12 text-green-600" />;
      case 'failed':
      case 'rejected':
        return <XCircle className="h-12 w-12 text-red-600" />;
      case 'pending':
      case 'quote_received':
        return <Clock className="h-12 w-12 text-yellow-600" />;
      default:
        return <AlertCircle className="h-12 w-12 text-blue-600" />;
    }
  };

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Payment completed successfully';
      case 'failed':
        return 'Payment failed';
      case 'rejected':
        return 'Payment was rejected';
      case 'pending':
        return 'Payment is being processed';
      case 'quote_received':
        return 'Quote received, awaiting confirmation';
      case 'reserved':
        return 'Funds reserved, finalizing transfer';
      case 'committed':
        return 'Transfer committed, completing payment';
      default:
        return 'Payment status unknown';
    }
  };

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="container max-w-4xl py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error?.message || 'Payment transaction not found'}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" onClick={() => setLocation('/mojaloop/payments')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Payment History
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6">
        <Button variant="ghost" onClick={() => setLocation('/mojaloop/payments')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Payment History
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            {getStatusIcon(payment.status)}
            <div>
              <h2 className="text-2xl font-bold">{getStatusMessage(payment.status)}</h2>
              <p className="text-muted-foreground mt-1">
                Transaction ID: {payment.transactionId}
              </p>
            </div>
            <div className="text-4xl font-bold">
              {formatCurrency(payment.amount, payment.currency)}
            </div>
          </div>
        </CardContent>
      </Card>

      {payment.errorDescription && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Details</AlertTitle>
          <AlertDescription>
            {payment.errorCode && <span className="font-mono">{payment.errorCode}: </span>}
            {payment.errorDescription}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
          <CardDescription>
            Detailed information about this payment transaction
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Transaction ID</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm">{payment.transactionId}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(payment.transactionId)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge className="mt-1">
                {payment.status.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="font-semibold">{formatCurrency(payment.amount, payment.currency)}</p>
            </div>

            <div>
              <p className="text-sm text-muted-foreground">Currency</p>
              <p className="font-semibold">{payment.currency}</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm">
                {payment.createdAt.toLocaleString()}
                <br />
                <span className="text-muted-foreground">
                  ({formatDistanceToNow(payment.createdAt, { addSuffix: true })})
                </span>
              </p>
            </div>

            {payment.completedAt && (
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-sm">
                  {payment.completedAt.toLocaleString()}
                  <br />
                  <span className="text-muted-foreground">
                    ({formatDistanceToNow(payment.completedAt, { addSuffix: true })})
                  </span>
                </p>
              </div>
            )}
          </div>

          {['pending', 'quote_received'].includes(payment.status) && (
            <>
              <Separator />
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertTitle>Payment in Progress</AlertTitle>
                <AlertDescription>
                  This page will automatically update as the payment progresses.
                  You can safely close this page and return later.
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
