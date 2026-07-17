import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Clock, XCircle, FileText, Calendar, DollarSign, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { PaymentSchedule } from "@/components/PaymentSchedule";
import { MortgageDashboardLayout } from "@/components/MortgageDashboardLayout";
import { useState } from "react";

export default function MortgageDashboard() {
  const [selectedApp, setSelectedApp] = useState<number | null>(null);
  const applicationsQuery = trpc.financial.getUserMortgageApplications.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const creditScoreQuery = trpc.financial.getCreditScore.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const applications = (applicationsQuery.data as any[]) ?? [];
  const applicationsUnavailable = applicationsQuery.isError && !applicationsQuery.data;
  const derivedCreditScore = applications.length > 0
    ? {
        score: Math.round(
          applications.reduce((sum: number, app: any) => sum + Number(app.creditScore ?? 0), 0) / applications.length
        ),
        rating: applications.some((app: any) => app.status === "approved") ? "Profile established" : "In progress",
        factors: [
          `${applications.length} application${applications.length === 1 ? "" : "s"} on file`,
          applications.some((app: any) => app.status === "approved")
            ? "At least one application has cleared underwriting"
            : "Applications are still progressing through underwriting",
        ],
      }
    : null;
  const creditScore = creditScoreQuery.data ?? derivedCreditScore;
  const isLoading = applicationsQuery.isLoading && !applicationsQuery.data;

  const selectedApplication = applications?.find(app => app.id === selectedApp);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "rejected":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-yellow-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
      const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      under_review: "secondary",
      approved: "default",
      rejected: "destructive",
    };

    return (
      <Badge variant={variants[status] || "secondary"} className="capitalize">
        {status}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <MortgageDashboardLayout>
        <div className="space-y-6 p-6">
          <div className="space-y-2">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-5 w-[28rem]" />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </MortgageDashboardLayout>
    );
  }

  const stats = {
    total: applications?.length || 0,
    pending: applications?.filter((app: any) => app.status === "pending").length || 0,
    approved: applications?.filter((app: any) => app.status === "approved").length || 0,
    rejected: applications?.filter((app: any) => app.status === "rejected").length || 0,
  };

  return (
    <MortgageDashboardLayout>
      <div className="space-y-6 p-6">
      {applicationsUnavailable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Mortgage application records could not be loaded from the live service at the moment. New submissions remain available, and this dashboard will refresh when the service becomes reachable again.
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mortgage Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Track your mortgage applications and loan status
          </p>
        </div>
        <Link href="/mortgage-application">
          <Button>
            <FileText className="mr-2 h-4 w-4" />
            New Application
          </Button>
        </Link>
      </div>

      {/* Credit Score Card */}
      {creditScore && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Your Credit Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-4xl font-bold">{creditScore.score}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Rating: {creditScore.rating}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Factors</p>
                <p className="text-sm font-medium">{creditScore.factors.length} items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Applications List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Your Applications</h2>
        {applications && applications.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {applications.map((app: any) => (
              <Card key={app.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(app.status)}
                      <CardTitle className="text-lg">{app.applicationId ?? `Application #${app.id}`}</CardTitle>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>
                  <CardDescription className="flex items-center gap-1 mt-2">
                    <Calendar className="h-4 w-4" />
                    Applied: {formatDate(app.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Loan Amount:</span>
                      <span className="font-semibold">{formatCurrency(app.loanAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Interest Rate:</span>
                      <span className="font-semibold">{app.interestRate}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Term:</span>
                      <span className="font-semibold">{app.loanTermMonths} months</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monthly Payment:</span>
                      <span className="font-semibold">
                        {formatCurrency(app.monthlyPayment || 0)}
                      </span>
                    </div>
                  </div>

                  {app.status === "approved" && app.outstandingBalance && (
                    <div className="pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Outstanding:</span>
                        <span className="font-semibold text-primary">
                          {formatCurrency(app.outstandingBalance)}
                        </span>
                      </div>
                    </div>
                  )}

                  {app.status === "approved" && (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => setSelectedApp(app.id)}
                    >
                      View Payment Schedule
                    </Button>
                  )}

                  {app.status === "rejected" && app.rejectionReason && (
                    <div className="pt-3 border-t">
                      <p className="text-sm text-red-600">{app.rejectionReason}</p>
                    </div>
                  )}

                  <Button variant="outline" className="w-full mt-2">
                    View Details
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Applications Yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                You haven't submitted any mortgage applications yet.
              </p>
              <Link href="/mortgage-application">
                <Button>Apply for Mortgage</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment Schedule Dialog */}
      <Dialog open={selectedApp !== null} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Schedule</DialogTitle>
            <DialogDescription>
              {selectedApplication && (
                <span>
                  Parcel ID: {selectedApplication.parcelId} | Loan Amount: {formatCurrency(selectedApplication.loanAmount)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <PaymentSchedule
              loanAmount={selectedApplication.loanAmount}
              interestRate={parseFloat(selectedApplication.interestRate)}
              loanTermMonths={selectedApplication.loanTermMonths}
              startDate={selectedApplication.approvedAt ? new Date(selectedApplication.approvedAt) : new Date()}
            />
          )}
        </DialogContent>
      </Dialog>
      </div>
    </MortgageDashboardLayout>
  );
}
