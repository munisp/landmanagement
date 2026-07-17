import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingDown, DollarSign } from "lucide-react";

interface PaymentScheduleProps {
  loanAmount: number;
  interestRate: number;
  loanTermMonths: number;
  startDate?: Date;
}

interface PaymentDetail {
  paymentNumber: number;
  paymentDate: Date;
  principal: number;
  interest: number;
  totalPayment: number;
  remainingBalance: number;
  status: 'paid' | 'upcoming' | 'overdue';
}

export function PaymentSchedule({
  loanAmount,
  interestRate,
  loanTermMonths,
  startDate = new Date(),
}: PaymentScheduleProps) {
  // Calculate monthly payment using amortization formula
  const monthlyRate = interestRate / 100 / 12;
  const monthlyPayment =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, loanTermMonths)) /
    (Math.pow(1 + monthlyRate, loanTermMonths) - 1);

  // Generate amortization schedule
  const schedule: PaymentDetail[] = [];
  let remainingBalance = loanAmount;
  const currentDate = new Date();

  for (let i = 1; i <= loanTermMonths; i++) {
    const interestPayment = remainingBalance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    remainingBalance -= principalPayment;

    const paymentDate = new Date(startDate);
    paymentDate.setMonth(paymentDate.getMonth() + i);

    let status: 'paid' | 'upcoming' | 'overdue' = 'upcoming';
    if (paymentDate < currentDate) {
      status = 'paid'; // In real app, check actual payment records
    } else if (paymentDate.getTime() < currentDate.getTime() + 7 * 24 * 60 * 60 * 1000) {
      status = 'upcoming';
    }

    schedule.push({
      paymentNumber: i,
      paymentDate,
      principal: principalPayment,
      interest: interestPayment,
      totalPayment: monthlyPayment,
      remainingBalance: Math.max(0, remainingBalance),
      status,
    });
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      paid: "default",
      upcoming: "secondary",
      overdue: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  // Calculate totals
  const totalPrincipal = schedule.reduce((sum, payment) => sum + payment.principal, 0);
  const totalInterest = schedule.reduce((sum, payment) => sum + payment.interest, 0);
  const totalPayments = totalPrincipal + totalInterest;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Monthly Payment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlyPayment)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Total Interest
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalInterest)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((totalInterest / loanAmount) * 100).toFixed(1)}% of loan amount
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Total Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalPayments)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Over {loanTermMonths} months
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Amortization Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Schedule</CardTitle>
          <CardDescription>
            Detailed breakdown of principal and interest for each payment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Total Payment</TableHead>
                  <TableHead className="text-right">Remaining Balance</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((payment) => (
                  <TableRow key={payment.paymentNumber}>
                    <TableCell className="font-medium">{payment.paymentNumber}</TableCell>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(payment.principal)}
                    </TableCell>
                    <TableCell className="text-right text-orange-600">
                      {formatCurrency(payment.interest)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(payment.totalPayment)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatCurrency(payment.remainingBalance)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(payment.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
