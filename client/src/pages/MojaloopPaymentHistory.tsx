/**
 * Mojaloop Payment History Page
 * 
 * Displays user's payment transaction history from Mojaloop network.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, ExternalLink, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function MojaloopPaymentHistory() {
  const [, setLocation] = useLocation();
  const [limit, setLimit] = useState(10);

  const { data: payments, isLoading, refetch } = trpc.mojaloopPayments.getHistory.useQuery({ limit });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      pending: 'secondary',
      quote_received: 'outline',
      failed: 'destructive',
      rejected: 'destructive',
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const formatCurrency = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(num);
  };

  return (
    <div className="container max-w-6xl py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Payment History</h1>
          <p className="text-muted-foreground mt-2">
            View your Mojaloop payment transactions
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setLocation('/mojaloop/payments/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Payment
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>
            Your recent payment transactions through the Mojaloop network
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !payments || payments.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No payment transactions found</p>
              <Button onClick={() => setLocation('/mojaloop/payments/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Payment
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.transactionId}>
                    <TableCell className="font-mono text-sm">
                      {payment.transactionId.substring(0, 16)}...
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(payment.amount, payment.currency)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(payment.status)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(payment.createdAt, { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {payment.completedAt
                        ? formatDistanceToNow(payment.completedAt, { addSuffix: true })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(`/mojaloop/payments/${payment.transactionId}`)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {payments && payments.length >= limit && (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => setLimit(limit + 10)}
              >
                Load More
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
