import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Link, useRoute } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const calculateFee = (amount: number) => Math.max(2500, Math.min(amount * 0.0325, 5000000));

export default function PaymentProcessing() {
  const [, params] = useRoute("/payments/:transactionId");
  const transactionId = params?.transactionId ? parseInt(params.transactionId, 10) : undefined;

  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");

  const transactionQuery = trpc.transactions.getById.useQuery(
    { id: transactionId! },
    { enabled: !!transactionId }
  );

  const paymentHistoryQuery = trpc.payments.getByTransaction.useQuery(
    { transactionId: transactionId! },
    { enabled: !!transactionId }
  );

  const parcelQuery = trpc.parcels.getById.useQuery(
    { id: transactionQuery.data?.parcelId ?? 0 },
    { enabled: !!transactionQuery.data?.parcelId }
  );

  const processPayment = trpc.payments.process.useMutation();
  const downloadReceiptMutation = trpc.payments.downloadReceipt.useMutation();

  const latestPayment = useMemo(() => {
    const payments = (paymentHistoryQuery.data as any)?.payments ?? [];
    return payments.length > 0 ? payments[0] : null;
  }, [paymentHistoryQuery.data]);

  const baseAmount = transactionQuery.data?.considerationAmount ?? 0;
  const feeAmount = latestPayment?.feeAmount ?? calculateFee(baseAmount);
  const totalAmount = latestPayment?.totalAmount ?? (baseAmount ? baseAmount + feeAmount : 0);

  useEffect(() => {
    if (baseAmount > 0 && !amount) {
      setAmount(String(baseAmount));
    }
  }, [baseAmount, amount]);

  useEffect(() => {
    if (latestPayment?.status === "completed") {
      setPaymentComplete(true);
      setPaymentReference(latestPayment.reference);
      setPaymentMethod(latestPayment.method || "");
    }
  }, [latestPayment]);

  const handlePayment = async () => {
    if (!paymentMethod || !amount || !transactionId) {
      toast.error("Please select payment method and enter amount");
      return;
    }

    try {
      const result: any = await processPayment.mutateAsync({
        transactionId,
        amount: parseFloat(amount),
        currency: "NGN",
        method: paymentMethod as any,
      });

      const reference = result.reference || result.payment?.reference || `PAY-${transactionId}`;
      setPaymentReference(reference);
      setPaymentMethod(result.method || paymentMethod);

      if (result.status === "pending") {
        toast.success("Payment initiated. Complete the remittance using the provided reference.");
      } else {
        setPaymentComplete(true);
        toast.success("Payment processed successfully.");
      }

      await paymentHistoryQuery.refetch();
      await transactionQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment failed. Please try again.");
    }
  };

  const downloadReceipt = async () => {
    if (!transactionId) return;

    try {
      const result: any = await downloadReceiptMutation.mutateAsync({ transactionId });
      const binary = atob(result.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: result.mimeType || "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename || `payment-receipt-${transactionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Receipt downloaded successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download receipt.");
    }
  };

  if (transactionQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!transactionQuery.data || !transactionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-10 w-10 mx-auto mb-4 text-destructive" />
            <p className="text-muted-foreground">Transaction not found.</p>
            <Link href="/transactions/new">
              <Button className="mt-4">Back to Transactions</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const transaction = transactionQuery.data as any;
  const parcel = parcelQuery.data as any;
  const parcelLabel = parcel?.parcelNumber || `Parcel ID #${transaction.parcelId}`;
  const amountPaid = latestPayment?.totalAmount ?? totalAmount;
  const paymentPending = latestPayment?.status === "pending" && !paymentComplete;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Payment Processing</h1>
          <div className="w-24"></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {!paymentComplete ? (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Complete Payment</h1>
                <p className="text-muted-foreground">
                  Secure payment processing for registry fees, transaction remittance, and ledger-backed settlement.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                  {paymentPending && (
                    <Alert>
                      <Clock className="h-4 w-4" />
                      <AlertTitle>Payment Awaiting Confirmation</AlertTitle>
                      <AlertDescription>
                        Use reference <span className="font-mono font-semibold">{latestPayment?.reference}</span> to complete your remittance. The receipt will be available once the payment is confirmed.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Payment Details
                      </CardTitle>
                      <CardDescription>
                        Select your payment method and complete the transaction.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="paymentMethod">Payment Method</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger id="paymentMethod">
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mojaloop">Mojaloop Wallet</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="card">Credit/Debit Card</SelectItem>
                            <SelectItem value="ussd">USSD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="amount">Transaction Amount</Label>
                        <Input
                          id="amount"
                          type="number"
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          placeholder="Enter amount"
                        />
                      </div>

                      {paymentMethod === "mojaloop" && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>Mojaloop Payment</AlertTitle>
                          <AlertDescription>
                            The platform will generate a wallet settlement reference for cross-network payment completion.
                          </AlertDescription>
                        </Alert>
                      )}

                      {paymentMethod === "bank_transfer" && (
                        <div className="space-y-2 p-4 bg-muted rounded-lg text-sm">
                          <p className="font-semibold">Bank Transfer Details</p>
                          <p><strong>Bank:</strong> {latestPayment?.bankName || "First Bank of Nigeria"}</p>
                          <p><strong>Account Name:</strong> {latestPayment?.bankAccountName || "IDLR-PTS Collections"}</p>
                          <p><strong>Account Number:</strong> {latestPayment?.bankAccountNumber || "1234567890"}</p>
                          <p><strong>Reference:</strong> {latestPayment?.reference || `TXN-${transaction.id}`}</p>
                        </div>
                      )}

                      {paymentMethod === "card" && (
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="cardNumber">Card Number</Label>
                            <Input id="cardNumber" placeholder="1234 5678 9012 3456" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="expiry">Expiry Date</Label>
                              <Input id="expiry" placeholder="MM/YY" />
                            </div>
                            <div>
                              <Label htmlFor="cvv">CVV</Label>
                              <Input id="cvv" placeholder="123" type="password" />
                            </div>
                          </div>
                        </div>
                      )}

                      {paymentMethod === "ussd" && (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>USSD Payment</AlertTitle>
                          <AlertDescription>
                            Dial {latestPayment?.ussdCode || `*737*000*${transaction.id}#`} to complete payment from your registered bank profile.
                          </AlertDescription>
                        </Alert>
                      )}

                      <Separator />

                      <Button
                        onClick={handlePayment}
                        disabled={!paymentMethod || processPayment.isPending || !amount}
                        className="w-full gap-2"
                        size="lg"
                      >
                        {processPayment.isPending ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Processing Payment...
                          </>
                        ) : (
                          <>
                            <DollarSign className="h-5 w-5" />
                            Pay ₦{totalAmount.toLocaleString()}
                          </>
                        )}
                      </Button>

                      <p className="text-xs text-center text-muted-foreground">
                        Secured by ledger-backed reconciliation and property-transaction workflow controls.
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Order Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Transaction Type</p>
                        <p className="font-semibold capitalize">{String(transaction.type).replace(/_/g, " ")}</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Parcel</p>
                        <p className="font-mono text-sm">{parcelLabel}</p>
                      </div>

                      <div>
                        <p className="text-sm text-muted-foreground">Workflow Stage</p>
                        <p className="font-semibold capitalize">{String(transaction.workflowStage).replace(/_/g, " ")}</p>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Transaction Amount</span>
                          <span>₦{baseAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Processing Fee</span>
                          <span>₦{feeAmount.toLocaleString()}</span>
                        </div>
                        <Separator />
                        <div className="flex justify-between font-bold">
                          <span>Total</span>
                          <span>₦{totalAmount.toLocaleString()}</span>
                        </div>
                      </div>

                      <Alert>
                        <Clock className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          Payment should be completed promptly to avoid workflow delays in registry approval and title issuance.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Payment Successful</h2>
                <p className="text-muted-foreground mb-6">
                  Your payment has been recorded against the transaction workflow.
                </p>

                <div className="max-w-md mx-auto bg-muted/50 p-6 rounded-lg mb-6">
                  <div className="space-y-3 text-left">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Reference</span>
                      <span className="font-mono font-semibold">{paymentReference}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount Paid</span>
                      <span className="font-semibold">₦{amountPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Method</span>
                      <span className="capitalize">{paymentMethod.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Completed
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-center">
                  <Button onClick={downloadReceipt} variant="outline" className="gap-2" disabled={downloadReceiptMutation.isPending}>
                    {downloadReceiptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download Receipt
                  </Button>
                  <Link href={`/transactions/${transactionId}`}>
                    <Button className="gap-2">
                      View Transaction
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
