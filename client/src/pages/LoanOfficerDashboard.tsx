import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { FileText, CheckCircle2, XCircle, Clock, TrendingUp, DollarSign, User, Building, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function LoanOfficerDashboard() {
  const [selectedTab, setSelectedTab] = useState<"pending" | "under_review" | "all">("pending");
  const [selectedApplication, setSelectedApplication] = useState<any | null>(null);
  const [reviewDialog, setReviewDialog] = useState(false);
  const [detailsDialog, setDetailsDialog] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  // Fetch all applications (in production, filter by loan officer assignment)
  const { data: applications, isLoading, refetch } = trpc.financial.getUserMortgageApplications.useQuery();
  const updateStatus = trpc.financial.updateMortgageApplicationStatus.useMutation();

  const filteredApplications = applications?.filter((app) => {
    if (selectedTab === "all") return true;
    return app.status === selectedTab;
  });

  const stats = {
    pending: applications?.filter((app) => app.status === "pending").length || 0,
    underReview: applications?.filter((app) => app.status === "under_review").length || 0,
    approved: applications?.filter((app) => app.status === "approved").length || 0,
    rejected: applications?.filter((app) => app.status === "rejected").length || 0,
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      under_review: "secondary",
      approved: "default",
      rejected: "destructive",
    };
    const colors: Record<string, string> = {
      pending: "text-yellow-600",
      under_review: "text-blue-600",
      approved: "text-green-600",
      rejected: "text-red-600",
    };
    return (
      <Badge variant={variants[status] || "outline"} className={colors[status]}>
        {status.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const handleReview = async () => {
    if (!selectedApplication || !reviewAction) return;

    try {
      await updateStatus.mutateAsync({
        applicationId: selectedApplication.applicationId,
        status: reviewAction === "approve" ? "approved" : "rejected",
        rejectionReason: reviewAction === "reject" ? rejectionReason : undefined,
      });

      toast.success("Application Updated", {
        description: `Application ${reviewAction === "approve" ? "approved" : "rejected"} successfully.`,
      });

      setReviewDialog(false);
      setSelectedApplication(null);
      setReviewAction(null);
      setRejectionReason("");
      setReviewNotes("");
      refetch();
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Failed to update application",
      });
    }
  };

  const handleStartReview = async (app: any) => {
    try {
      await updateStatus.mutateAsync({
        applicationId: app.applicationId,
        status: "under_review",
      });

      toast.success("Review Started", {
        description: "Application moved to under review.",
      });

      refetch();
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Failed to start review",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Loan Officer Dashboard</h1>
        <p className="text-muted-foreground">Review and manage mortgage applications</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Under Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.underReview}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Applications List */}
      <Card>
        <CardHeader>
          <CardTitle>Mortgage Applications</CardTitle>
          <CardDescription>Review and process mortgage loan applications</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)}>
            <TabsList>
              <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
              <TabsTrigger value="under_review">Under Review ({stats.underReview})</TabsTrigger>
              <TabsTrigger value="all">All Applications</TabsTrigger>
            </TabsList>

            <TabsContent value={selectedTab} className="space-y-4 mt-4">
              {filteredApplications && filteredApplications.length > 0 ? (
                filteredApplications.map((app) => (
                  <Card key={app.id} className="border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-3 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold">{app.applicationId}</h3>
                            {getStatusBadge(app.status)}
                          </div>

                          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            <div className="flex items-center gap-2 text-sm">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Loan Amount:</span>
                              <span className="font-semibold">{formatCurrency(app.loanAmount)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <TrendingUp className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Interest Rate:</span>
                              <span className="font-semibold">{app.interestRate}%</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Term:</span>
                              <span className="font-semibold">{app.loanTerm} months</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Monthly Payment:</span>
                              <span className="font-semibold">{formatCurrency(app.monthlyPayment)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Building className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Bank:</span>
                              <span className="font-semibold">{app.bankName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Applicant ID:</span>
                              <span className="font-semibold">{app.applicantId}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Submitted: {new Date(app.submittedAt).toLocaleDateString("en-NG", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 ml-4">
                          {app.status === "pending" && (
                            <Button
                              variant="outline"
                              onClick={() => handleStartReview(app)}
                              disabled={updateStatus.isPending}
                            >
                              Start Review
                            </Button>
                          )}
                          {(app.status === "pending" || app.status === "under_review") && (
                            <>
                              <Button
                                onClick={() => {
                                  setSelectedApplication(app);
                                  setReviewAction("approve");
                                  setReviewDialog(true);
                                }}
                                disabled={updateStatus.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => {
                                  setSelectedApplication(app);
                                  setReviewAction("reject");
                                  setReviewDialog(true);
                                }}
                                disabled={updateStatus.isPending}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedApplication(app);
                              setDetailsDialog(true);
                            }}
                          >
                            View Details
                          </Button>
                        </div>
                      </div>

                      {app.rejectionReason && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-sm text-red-800">
                            <strong>Rejection Reason:</strong> {app.rejectionReason}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Applications</h3>
                    <p className="text-muted-foreground text-center">
                      There are no applications in this category.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={detailsDialog} onOpenChange={setDetailsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>
              {selectedApplication && `Application ID: ${selectedApplication.applicationId}`}
            </DialogDescription>
          </DialogHeader>

          {selectedApplication && (
            <div className="grid gap-4 md:grid-cols-2 py-2 text-sm">
              <div>
                <p className="text-muted-foreground">Applicant ID</p>
                <p className="font-medium">{selectedApplication.applicantId}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <div className="mt-1">{getStatusBadge(selectedApplication.status)}</div>
              </div>
              <div>
                <p className="text-muted-foreground">Loan Amount</p>
                <p className="font-medium">{formatCurrency(selectedApplication.loanAmount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Monthly Payment</p>
                <p className="font-medium">{formatCurrency(selectedApplication.monthlyPayment)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Interest Rate</p>
                <p className="font-medium">{selectedApplication.interestRate}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Term</p>
                <p className="font-medium">{selectedApplication.loanTerm} months</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bank</p>
                <p className="font-medium">{selectedApplication.bankName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Submitted</p>
                <p className="font-medium">{new Date(selectedApplication.submittedAt).toLocaleString("en-NG")}</p>
              </div>
              {selectedApplication.rejectionReason && (
                <div className="md:col-span-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
                  <strong>Rejection Reason:</strong> {selectedApplication.rejectionReason}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Approve Application" : "Reject Application"}
            </DialogTitle>
            <DialogDescription>
              {selectedApplication && `Application ID: ${selectedApplication.applicationId}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {reviewAction === "reject" && (
              <div className="space-y-2">
                <Label htmlFor="reason">Rejection Reason *</Label>
                <Textarea
                  id="reason"
                  placeholder="Provide a detailed reason for rejection..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Review Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Add any internal notes about this review..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={updateStatus.isPending || (reviewAction === "reject" && !rejectionReason)}
              variant={reviewAction === "approve" ? "default" : "destructive"}
            >
              {updateStatus.isPending ? "Processing..." : reviewAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
