import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  DollarSign,
  Calendar,
  CreditCard,
  Download,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export default function BorrowerPaymentPortal() {
  const [selectedApplication, setSelectedApplication] = useState<number | null>(null);
  const [extraPaymentDialog, setExtraPaymentDialog] = useState(false);
  const [extraPaymentAmount, setExtraPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [earlyPayoffDialog, setEarlyPayoffDialog] = useState(false);

  // Get user's mortgage applications
  const { data: applications, isLoading: appsLoading } = trpc.financial.getUserMortgageApplications.useQuery();

  // Get payment schedule for selected application
  const { data: schedule, refetch: refetchSchedule } = trpc.mortgagePayment.getSchedule.useQuery(
    { applicationId: selectedApplication! },
    { enabled: !!selectedApplication }
  );

  // Get payment history
  const { data: paymentHistory } = trpc.mortgagePayment.getPaymentHistory.useQuery(
    { applicationId: selectedApplication! },
    { enabled: !!selectedApplication }
  );

  // Get auto-debit mandate
  const { data: mandate } = trpc.mortgagePayment.getMandate.useQuery(
    { applicationId: selectedApplication! },
    { enabled: !!selectedApplication }
  );

  // Get early payoff calculation
  const { data: earlyPayoff } = trpc.mortgagePayment.calculateEarlyPayoff.useQuery(
    { applicationId: selectedApplication! },
    { enabled: !!selectedApplication && earlyPayoffDialog }
  );

  // Get refinancing options
  const { data: refinancing } = trpc.mortgagePayment.calculateRefinancing.useQuery(
    { applicationId: selectedApplication! },
    { enabled: !!selectedApplication }
  );

  const makeExtraPaymentMutation = trpc.mortgagePayment.makeExtraPayment.useMutation();
  const processEarlyPayoffMutation = trpc.mortgagePayment.processEarlyPayoff.useMutation();

  // Select first approved application by default
  if (!selectedApplication && applications && applications.length > 0) {
    const approved = applications.find((app: any) => app.status === "approved" || app.status === "disbursed");
    if (approved) {
      setSelectedApplication(approved.id);
    }
  }

  const handleExtraPayment = async () => {
    if (!selectedApplication || !extraPaymentAmount) return;

    try {
      const result = await makeExtraPaymentMutation.mutateAsync({
        applicationId: selectedApplication,
        amount: parseFloat(extraPaymentAmount),
        paymentMethod,
      });

      toast.success("Extra Payment Processed", {
        description: `Payment of ₦${parseFloat(extraPaymentAmount).toLocaleString()} applied to principal. Interest saved: ₦${result.interestSaved.toLocaleString()}`,
      });

      setExtraPaymentDialog(false);
      setExtraPaymentAmount("");
      refetchSchedule();
    } catch (error: any) {
      toast.error("Payment Failed", {
        description: error.message || "Failed to process extra payment",
      });
    }
  };

  const handleEarlyPayoff = async () => {
    if (!selectedApplication) return;

    try {
      await processEarlyPayoffMutation.mutateAsync({
        applicationId: selectedApplication,
        paymentMethod,
      });

      toast.success("Mortgage Paid Off", {
        description: "Your mortgage has been fully paid off. Congratulations!",
      });

      setEarlyPayoffDialog(false);
      refetchSchedule();
    } catch (error: any) {
      toast.error("Payoff Failed", {
        description: error.message || "Failed to process early payoff",
      });
    }
  };

  if (appsLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!applications || applications.length === 0) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>No Mortgage Applications</CardTitle>
            <CardDescription>You don't have any mortgage applications yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => (window.location.href = "/mortgage-application")}>
              Apply for Mortgage
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedApp = applications.find((app: any) => app.id === selectedApplication);
  const upcomingPayments = schedule?.filter((s: any) => !s.isPaid).slice(0, 3) || [];
  const nextPayment = upcomingPayments[0];

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Payment Portal</h1>
        <p className="text-muted-foreground">Manage your mortgage payments and view payment history</p>
      </div>

      {/* Application Selector */}
      {applications.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select Mortgage</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedApplication?.toString()}
              onValueChange={(value) => setSelectedApplication(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a mortgage" />
              </SelectTrigger>
              <SelectContent>
                {applications.map((app: any) => (
                  <SelectItem key={app.id} value={app.id.toString()}>
                    {app.applicationId} - ₦{app.loanAmount.toLocaleString()} ({app.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {selectedApp && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Loan Amount</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₦{selectedApp.loanAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {selectedApp.interestRate}% APR • {selectedApp.loanTerm} months
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Payment</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₦{selectedApp.monthlyPayment.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {nextPayment ? `Due ${new Date(nextPayment.dueDate).toLocaleDateString()}` : "All paid"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Remaining Balance</CardTitle>
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₦{(nextPayment?.remainingBalance || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {schedule?.filter((s: any) => !s.isPaid).length || 0} payments remaining
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Auto-Debit Status</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {mandate?.status === "active" ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {mandate ? `${mandate.bankName} - ${mandate.accountNumber}` : "Not set up"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="upcoming" className="space-y-4">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming Payments</TabsTrigger>
              <TabsTrigger value="history">Payment History</TabsTrigger>
              <TabsTrigger value="options">Payment Options</TabsTrigger>
            </TabsList>

            {/* Upcoming Payments */}
            <TabsContent value="upcoming" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Next 3 Payments</CardTitle>
                  <CardDescription>Your upcoming payment schedule</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {upcomingPayments.map((payment: any) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              Payment #{payment.paymentNumber}
                            </span>
                            <Badge variant={payment.paymentNumber === nextPayment?.paymentNumber ? "default" : "secondary"}>
                              {payment.paymentNumber === nextPayment?.paymentNumber ? "Next" : "Upcoming"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Due: {new Date(payment.dueDate).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Principal: ₦{payment.principalAmount.toLocaleString()} • Interest: ₦
                            {payment.interestAmount.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">₦{payment.totalAmount.toLocaleString()}</div>
                          <p className="text-xs text-muted-foreground">
                            Balance: ₦{payment.remainingBalance.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment History */}
            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>All your past payments</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {paymentHistory && paymentHistory.length > 0 ? (
                      paymentHistory.map((payment: any) => (
                        <div
                          key={payment.id}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="font-medium">{payment.transactionId}</span>
                              <Badge
                                variant={
                                  payment.status === "completed"
                                    ? "default"
                                    : payment.status === "pending"
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {payment.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {new Date(payment.createdAt).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Method: {payment.paymentMethod}
                              {payment.paymentGateway && ` via ${payment.paymentGateway}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold">₦{payment.amount.toLocaleString()}</div>
                            <Button variant="ghost" size="sm" className="mt-1">
                              <Download className="h-4 w-4 mr-1" />
                              Receipt
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No payment history yet</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Payment Options */}
            <TabsContent value="options" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Extra Payment */}
                <Card>
                  <CardHeader>
                    <CardTitle>Make Extra Payment</CardTitle>
                    <CardDescription>Pay extra toward principal to save on interest</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm">
                        Making extra payments reduces your principal balance and saves you money on interest
                        over the life of the loan.
                      </p>
                    </div>
                    <Dialog open={extraPaymentDialog} onOpenChange={setExtraPaymentDialog}>
                      <DialogTrigger asChild>
                        <Button className="w-full">
                          <DollarSign className="h-4 w-4 mr-2" />
                          Make Extra Payment
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Make Extra Payment</DialogTitle>
                          <DialogDescription>
                            Enter the amount you want to pay toward your principal balance
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="extra-amount">Amount (₦)</Label>
                            <Input
                              id="extra-amount"
                              type="number"
                              placeholder="10000"
                              value={extraPaymentAmount}
                              onChange={(e) => setExtraPaymentAmount(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="payment-method">Payment Method</Label>
                            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                              <SelectTrigger id="payment-method">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                <SelectItem value="debit_card">Debit Card</SelectItem>
                                <SelectItem value="paystack">Paystack</SelectItem>
                                <SelectItem value="flutterwave">Flutterwave</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={handleExtraPayment} className="w-full">
                            Process Payment
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>

                {/* Early Payoff */}
                <Card>
                  <CardHeader>
                    <CardTitle>Pay Off Mortgage Early</CardTitle>
                    <CardDescription>Calculate and process full payoff amount</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm">
                        Pay off your entire mortgage balance early and save on future interest payments.
                      </p>
                    </div>
                    <Dialog open={earlyPayoffDialog} onOpenChange={setEarlyPayoffDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          <TrendingDown className="h-4 w-4 mr-2" />
                          Calculate Payoff
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Early Payoff Calculator</DialogTitle>
                          <DialogDescription>Review your early payoff details</DialogDescription>
                        </DialogHeader>
                        {earlyPayoff && (
                          <div className="space-y-4">
                            <div className="space-y-2 p-4 bg-muted rounded-lg">
                              <div className="flex justify-between">
                                <span className="text-sm">Remaining Principal:</span>
                                <span className="font-medium">
                                  ₦{earlyPayoff.remainingPrincipal.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm">Accrued Interest:</span>
                                <span className="font-medium">
                                  ₦{earlyPayoff.accruedInterest.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm">Early Payoff Fee (2%):</span>
                                <span className="font-medium">
                                  ₦{earlyPayoff.earlyPayoffFee.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between pt-2 border-t">
                                <span className="font-semibold">Total Payoff Amount:</span>
                                <span className="font-bold text-lg">
                                  ₦{earlyPayoff.totalPayoffAmount.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between text-green-600">
                                <span className="text-sm">Interest Savings:</span>
                                <span className="font-medium">
                                  ₦{earlyPayoff.savingsFromEarlyPayoff.toLocaleString()}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="payoff-method">Payment Method</Label>
                              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                <SelectTrigger id="payoff-method">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                                  <SelectItem value="debit_card">Debit Card</SelectItem>
                                  <SelectItem value="paystack">Paystack</SelectItem>
                                  <SelectItem value="flutterwave">Flutterwave</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button onClick={handleEarlyPayoff} className="w-full">
                              Process Payoff
                            </Button>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>

                {/* Refinancing */}
                {refinancing && refinancing.refinanceOptions.length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle>Refinancing Options</CardTitle>
                      <CardDescription>Lower your interest rate and monthly payment</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 md:grid-cols-3">
                        {refinancing.refinanceOptions.map((option: any, index: number) => (
                          <div key={index} className="p-4 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Option {index + 1}</span>
                              <Badge variant="secondary">{option.newRate}% APR</Badge>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">New Payment:</span>
                                <span className="font-medium">
                                  ₦{option.newMonthlyPayment.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Term:</span>
                                <span>{option.newTerm} months</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Closing Costs:</span>
                                <span>₦{option.closingCosts.toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between text-sm text-green-600">
                                <span>Interest Savings:</span>
                                <span className="font-medium">
                                  ₦{option.totalInterestSavings.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Break-even:</span>
                                <span>{option.breakEvenMonths} months</span>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="w-full mt-2">
                              Apply for Refinancing
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
