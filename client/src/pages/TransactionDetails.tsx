import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { TransactionDetailsSkeleton } from "@/components/SkeletonLoaders";
import { ConnectedCommentThread } from "@/components/ConnectedCommentThread";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { useAuth } from "@/_core/hooks/useAuth";
import { 
  ArrowLeft, 
  Check, 
  X, 
  Clock, 
  FileText, 
  User,
  Calendar,
  Loader2,
  DollarSign,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import DocumentUpload from "@/components/DocumentUpload";

export default function TransactionDetails() {
  const [, params] = useRoute("/transactions/:id");
  const { user } = useAuth();
  const transactionId = params?.id ? parseInt(params.id) : null;

  const { data: transaction, isLoading, refetch } = trpc.transactions.getById.useQuery(
    { id: transactionId! },
    { enabled: !!transactionId }
  );

  const approveMutation = trpc.transactions.approve.useMutation({
    onSuccess: () => {
      toast.success('Transaction approved successfully');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to approve: ${error.message}`);
    },
  });

  const rejectMutation = trpc.transactions.reject.useMutation({
    onSuccess: () => {
      toast.success('Transaction rejected');
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <TransactionDetailsSkeleton />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Transaction not found</p>
            <Link href="/dashboard">
              <Button className="mt-4">Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canApprove = user?.role === 'admin' || user?.role === 'registrar';
  const isPending = transaction.status === 'pending_approval';

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any }> = {
      'pending_approval': { variant: 'outline', icon: Clock },
      'approved': { variant: 'default', icon: Check },
      'rejected': { variant: 'destructive', icon: X },
      'completed': { variant: 'default', icon: Check },
      'cancelled': { variant: 'secondary', icon: X },
    };

    const config = variants[status] || { variant: 'outline', icon: AlertCircle };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const handleApprove = async () => {
    if (!confirm('Are you sure you want to approve this transaction?')) return;
    await approveMutation.mutateAsync({ id: transactionId! });
  };

  const handleReject = async () => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;
    await rejectMutation.mutateAsync({ id: transactionId!, reason });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Title Section */}
          <div className="mb-6">
            {/* Presence Indicator */}
            <div className="mb-4">
              <PresenceIndicator pageId={`transaction-${transactionId}`} />
            </div>
            
            <div className="flex items-start justify-between mb-2">
              <div>
                <h1 className="text-3xl font-bold">Transaction #{transaction.id}</h1>
                <p className="text-muted-foreground mt-1">
                  {transaction.type.replace('_', ' ')} Transaction
                </p>
              </div>
              {getStatusBadge(transaction.status)}
            </div>
            
            {canApprove && isPending && (
              <div className="flex gap-2 mt-4">
                <Button 
                  onClick={handleApprove} 
                  className="gap-2"
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Approve Transaction
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleReject}
                  className="gap-2"
                  disabled={rejectMutation.isPending}
                >
                  {rejectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Reject
                </Button>
              </div>
            )}
          </div>

          {/* Transaction Details */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Transaction Information</CardTitle>
                <CardDescription>Core details about this transaction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Transaction Type</h4>
                    <p className="font-medium capitalize">{transaction.type.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Status</h4>
                    {getStatusBadge(transaction.status)}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Initiated By</h4>
                    <p className="font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {transaction.initiatorName || `User #${transaction.initiatorId}`}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Initiated On</h4>
                    <p className="font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(transaction.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {transaction.transactionAmount && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Transaction Amount</h4>
                      <p className="font-medium flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        ₦ {transaction.transactionAmount.toLocaleString()}
                      </p>
                    </div>
                  )}
                  {transaction.description && (
                    <div className="md:col-span-2">
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Description</h4>
                      <p className="text-sm">{transaction.description}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Parcel Information */}
            <Card>
              <CardHeader>
                <CardTitle>Related Parcel</CardTitle>
                <CardDescription>Land parcel involved in this transaction</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Parcel Number:</span>
                    <p className="font-medium">LG-VI-2024-001</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Location:</span>
                    <p className="font-medium">Victoria Island, Lagos</p>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Area:</span>
                    <p className="font-medium">1,200.5 m²</p>
                  </div>
                </div>
                <Link href={`/parcels/${transaction.parcelId}`}>
                  <Button variant="outline" size="sm" className="mt-4 gap-2">
                    <FileText className="h-4 w-4" />
                    View Parcel Details
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Transaction Timeline</CardTitle>
                <CardDescription>History of actions and status changes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      date: transaction.createdAt,
                      action: 'Transaction Initiated',
                      user: transaction.initiatorName || `User #${transaction.initiatorId}`,
                      status: 'completed',
                    },
                    ...(transaction.status !== 'pending_approval' ? [{
                      date: transaction.updatedAt,
                      action: transaction.status === 'approved' ? 'Transaction Approved' : 
                              transaction.status === 'rejected' ? 'Transaction Rejected' :
                              'Status Updated',
                      user: 'Registrar',
                      status: 'completed',
                    }] : []),
                  ].map((event, idx) => (
                    <div key={idx} className="flex gap-4 pb-4 border-b last:border-0">
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          event.status === 'completed' ? 'bg-green-100' : 'bg-gray-100'
                        }`}>
                          {event.status === 'completed' ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-gray-600" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold">{event.action}</h4>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(event.date).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {event.user}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {isPending && (
                    <div className="flex gap-4 pb-4">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-yellow-100">
                          <Clock className="h-4 w-4 text-yellow-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold">Awaiting Approval</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          Transaction is pending review by a registrar
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Supporting Documents
                </CardTitle>
                <CardDescription>Documents attached to this transaction</CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentUpload
                  transactionId={transactionId!}
                  maxFiles={5}
                  onUploadComplete={() => {
                    toast.success('Documents uploaded successfully');
                  }}
                />
              </CardContent>
            </Card>

            {/* Comments & Discussion */}
            <Card>
              <CardHeader>
                <CardTitle>Comments & Discussion</CardTitle>
                <CardDescription>Collaborate with team members on this transaction</CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectedCommentThread entityType="transaction" entityId={transactionId!.toString()} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
