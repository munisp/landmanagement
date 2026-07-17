/**
 * Payment Initiation Page
 * 
 * Allows users to initiate Mojaloop payments for property transactions.
 * Handles quote requests, displays fees, and confirms payment execution.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, AlertCircle, CheckCircle2, DollarSign, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface QuoteDetails {
  transactionId: string;
  quoteId: string;
  quotedAmount: string;
  fees: string;
  expiration: string;
}

export default function PaymentInitiation() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<'form' | 'quote' | 'executing'>('form');
  const [quoteDetails, setQuoteDetails] = useState<QuoteDetails | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Form state
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [payerMsisdn, setPayerMsisdn] = useState('');
  const [payeeMsisdn, setPayeeMsisdn] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [note, setNote] = useState('');

  const initiateMutation = trpc.mojaloopPayments.initiate.useMutation({
    onSuccess: (data) => {
      setQuoteDetails(data);
      setStep('quote');
      toast.success('Quote received successfully');
    },
    onError: (error) => {
      toast.error(`Failed to get quote: ${error.message}`);
    },
  });

  const executeMutation = trpc.mojaloopPayments.execute.useMutation({
    onSuccess: (data) => {
      toast.success('Payment completed successfully!');
      setLocation(`/payments/status/${quoteDetails?.transactionId}`);
    },
    onError: (error) => {
      toast.error(`Payment failed: ${error.message}`);
      setStep('quote');
    },
  });

  const handleRequestQuote = () => {
    if (!amount || !payerMsisdn || !payeeMsisdn) {
      toast.error('Please fill in all required fields');
      return;
    }

    initiateMutation.mutate({
      amount,
      currency,
      payerMsisdn,
      payeeMsisdn,
      propertyId: propertyId || undefined,
      purpose: purpose || undefined,
      note: note || undefined,
    });
  };

  const handleExecutePayment = () => {
    if (!quoteDetails) return;
    
    setShowConfirmDialog(false);
    setStep('executing');
    executeMutation.mutate({ transactionId: quoteDetails.transactionId });
  };

  const formatCurrency = (amount: string, curr: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
    }).format(num);
  };

  const getExpirationTime = (expiration: string) => {
    const expiryDate = new Date(expiration);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins > 0 ? `${diffMins} minutes` : 'Expired';
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Initiate Payment</h1>
        <p className="text-muted-foreground mt-2">
          Make secure payments through the Mojaloop network for property transactions
        </p>
      </div>

      {step === 'form' && (
        <Card>
          <CardHeader>
            <CardTitle>Payment Details</CardTitle>
            <CardDescription>
              Enter the payment information to request a quote
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="1000.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency *</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                    <SelectItem value="KES">KES - Kenyan Shilling</SelectItem>
                    <SelectItem value="TZS">TZS - Tanzanian Shilling</SelectItem>
                    <SelectItem value="UGX">UGX - Ugandan Shilling</SelectItem>
                    <SelectItem value="GHS">GHS - Ghanaian Cedi</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payerMsisdn">Your Phone Number (Payer) *</Label>
              <Input
                id="payerMsisdn"
                type="tel"
                placeholder="+2348012345678"
                value={payerMsisdn}
                onChange={(e) => setPayerMsisdn(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Include country code (e.g., +234 for Nigeria)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payeeMsisdn">Recipient Phone Number (Payee) *</Label>
              <Input
                id="payeeMsisdn"
                type="tel"
                placeholder="+2348087654321"
                value={payeeMsisdn}
                onChange={(e) => setPayeeMsisdn(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="propertyId">Property ID (Optional)</Label>
              <Input
                id="propertyId"
                placeholder="PROP-001"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose (Optional)</Label>
              <Input
                id="purpose"
                placeholder="Property purchase payment"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note (Optional)</Label>
              <Textarea
                id="note"
                placeholder="Additional notes about this payment..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Secure Payment</AlertTitle>
              <AlertDescription>
                Your payment will be processed through the Mojaloop network with end-to-end encryption.
                You'll receive a quote with fees before confirming the payment.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <Button
                onClick={handleRequestQuote}
                disabled={initiateMutation.isPending}
                className="flex-1"
              >
                {initiateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Request Quote
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/payments')}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'quote' && quoteDetails && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Quote Received
            </CardTitle>
            <CardDescription>
              Review the quote details and confirm to proceed with payment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Original Amount</p>
                <p className="text-2xl font-bold">{formatCurrency(amount, currency)}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Transaction Fees</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(quoteDetails.fees, currency)}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <p className="text-lg font-semibold">Total Amount</p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(quoteDetails.quotedAmount, currency)}
                </p>
              </div>
            </div>

            <Alert>
              <Clock className="h-4 w-4" />
              <AlertTitle>Quote Expiration</AlertTitle>
              <AlertDescription>
                This quote expires in {getExpirationTime(quoteDetails.expiration)}.
                Please confirm the payment before expiration.
              </AlertDescription>
            </Alert>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction ID:</span>
                <span className="font-mono">{quoteDetails.transactionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quote ID:</span>
                <span className="font-mono">{quoteDetails.quoteId}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => setShowConfirmDialog(true)}
                className="flex-1"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Confirm Payment
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep('form')}
              >
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'executing' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <h3 className="text-xl font-semibold">Processing Payment</h3>
              <p className="text-muted-foreground max-w-md">
                Your payment is being processed through the Mojaloop network.
                This may take a few moments...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to proceed with this payment?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between">
              <span>Total Amount:</span>
              <span className="font-bold">
                {quoteDetails && formatCurrency(quoteDetails.quotedAmount, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Recipient:</span>
              <span className="font-mono text-sm">{payeeMsisdn}</span>
            </div>
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                This action cannot be undone. Funds will be transferred immediately.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExecutePayment}>
              Confirm & Pay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
