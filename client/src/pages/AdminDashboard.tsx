import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Clock,
  CheckCircle2,
  FileText,
  Users,
  MapPin,
  TrendingUp,
  AlertCircle,
  BarChart3,
} from "lucide-react";

type TransactionRecord = {
  id: number;
  type?: string;
  status?: string;
  parcelNumber?: string;
  initiatorName?: string;
  considerationAmount?: number;
  createdAt?: string | Date;
};

type VerificationRecord = {
  id: number;
  parcelId?: string;
  status?: string;
  requesterName?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  notes?: string;
};

type ActivityRecord = {
  userId: number;
  userName: string | null;
  action: string;
  timestamp: string | Date;
  details?: Record<string, unknown>;
};

function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function getTransactionsArray(data: unknown): TransactionRecord[] {
  if (Array.isArray(data)) return data as TransactionRecord[];
  if (data && typeof data === "object") {
    const typed = data as Record<string, unknown>;
    if (Array.isArray(typed.transactions)) return typed.transactions as TransactionRecord[];
    if (Array.isArray(typed.items)) return typed.items as TransactionRecord[];
  }
  return [];
}

function getVerificationArray(data: unknown): VerificationRecord[] {
  if (Array.isArray(data)) return data as VerificationRecord[];
  if (data && typeof data === "object") {
    const typed = data as Record<string, unknown>;
    if (Array.isArray(typed.requests)) return typed.requests as VerificationRecord[];
    if (Array.isArray(typed.items)) return typed.items as VerificationRecord[];
  }
  return [];
}

function getParcelCount(data: unknown) {
  if (!data || typeof data !== "object") return 0;
  const typed = data as Record<string, unknown>;
  if (typeof typed.total === "number") return typed.total;
  if (Array.isArray(typed.parcels)) return typed.parcels.length;
  if (Array.isArray(typed.items)) return typed.items.length;
  return 0;
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const { data: userStats, isLoading: statsLoading } = trpc.admin.getUserStats.useQuery(undefined, {
    enabled: user?.role === "admin" || user?.role === "registrar",
  });

  const { data: activityLogs, isLoading: activityLoading } = trpc.admin.getUserActivity.useQuery(
    { limit: 8 },
    { enabled: user?.role === "admin" || user?.role === "registrar" }
  );

  const { data: transactionsData, isLoading: transactionsLoading } = trpc.transactions.list.useQuery(
    { page: 1, limit: 10, status: "pending" },
    { enabled: user?.role === "admin" || user?.role === "registrar" }
  );

  const { data: verificationData, isLoading: verificationLoading } = trpc.verification.list.useQuery(
    { page: 1, limit: 10, status: "submitted" },
    { enabled: user?.role === "admin" || user?.role === "registrar" }
  );

  const { data: parcelSearchData, isLoading: parcelsLoading } = trpc.parcels.search.useQuery(
    { query: "", page: 1, limit: 1 },
    { enabled: user?.role === "admin" || user?.role === "registrar" }
  );

  if (user?.role !== "admin" && user?.role !== "registrar") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground mb-4">
              You don&apos;t have permission to access the admin dashboard
            </p>
            <Link href="/dashboard">
              <Button>Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const transactionRecords = getTransactionsArray(transactionsData);
  const verificationRecords = getVerificationArray(verificationData);
  const recentActivity = (activityLogs ?? []) as ActivityRecord[];

  const currentMonth = new Date().getMonth();
  const monthlyRegistrations = transactionRecords.filter((transaction) => {
    const createdAt = transaction.createdAt ? new Date(transaction.createdAt) : null;
    return transaction.type === "registration" && createdAt && createdAt.getMonth() === currentMonth;
  }).length;

  const monthlyTransfers = transactionRecords.filter((transaction) => {
    const createdAt = transaction.createdAt ? new Date(transaction.createdAt) : null;
    return transaction.type === "transfer" && createdAt && createdAt.getMonth() === currentMonth;
  }).length;

  const approvalRate = transactionRecords.length
    ? Math.round((transactionRecords.filter((transaction) => transaction.status === "approved").length / transactionRecords.length) * 100)
    : 100;

  const avgVerificationAgeDays = verificationRecords.length
    ? (
        verificationRecords.reduce((sum, record) => {
          const createdAt = record.createdAt ? new Date(record.createdAt).getTime() : Date.now();
          return sum + Math.max(0, Date.now() - createdAt) / (1000 * 60 * 60 * 24);
        }, 0) / verificationRecords.length
      ).toFixed(1)
    : "0.0";

  const stats = {
    pendingTransactions: transactionRecords.length,
    pendingVerifications: verificationRecords.length,
    totalParcels: getParcelCount(parcelSearchData),
    totalUsers: userStats?.total ?? 0,
    monthlyRegistrations,
    monthlyTransfers,
  };

  const loading = statsLoading || activityLoading || transactionsLoading || verificationLoading || parcelsLoading;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage land registry operations</p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline">Back to Dashboard</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Transactions</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "…" : stats.pendingTransactions}</div>
              <p className="text-xs text-muted-foreground">Awaiting approval or completion</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Verifications</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "…" : stats.pendingVerifications}</div>
              <p className="text-xs text-muted-foreground">Require reviewer action</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Parcels</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "…" : stats.totalParcels.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Indexed and searchable records</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "…" : stats.totalUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">{userStats?.active ?? 0} active, {userStats?.suspended ?? 0} suspended</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="transactions" className="space-y-6">
          <TabsList>
            <TabsTrigger value="transactions">Pending Transactions</TabsTrigger>
            <TabsTrigger value="verifications">Pending Verifications</TabsTrigger>
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <Card>
              <CardHeader>
                <CardTitle>Pending Transaction Approvals</CardTitle>
                <CardDescription>Live workflow items requiring review or operational follow-up</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {transactionRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pending transactions were returned by the current backend.</p>
                  ) : (
                    transactionRecords.map((transaction) => (
                      <div key={transaction.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="capitalize">
                              {transaction.type ?? "transaction"}
                            </Badge>
                            <span className="font-medium">{transaction.parcelNumber ?? `Transaction #${transaction.id}`}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>Initiated by: {transaction.initiatorName ?? "Unknown initiator"}</p>
                            {typeof transaction.considerationAmount === "number" && transaction.considerationAmount > 0 ? (
                              <p>Amount: ₦ {transaction.considerationAmount.toLocaleString()}</p>
                            ) : null}
                            <p>Date: {formatDate(transaction.createdAt)}</p>
                          </div>
                        </div>
                        <Link href={`/transactions/${transaction.id}`}>
                          <Button>Review</Button>
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verifications">
            <Card>
              <CardHeader>
                <CardTitle>Pending Parcel Verifications</CardTitle>
                <CardDescription>Live verification requests awaiting registrar or admin review</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {verificationRecords.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pending verifications were returned by the current backend.</p>
                  ) : (
                    verificationRecords.map((record) => (
                      <div key={record.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{record.parcelId ?? `Verification #${record.id}`}</span>
                            <Badge variant="secondary" className="capitalize">{record.status ?? "submitted"}</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>Submitted by: {record.requesterName ?? "Unknown requester"}</p>
                            <p>Last update: {formatDate(record.updatedAt ?? record.createdAt)}</p>
                            {record.notes ? <p>Notes: {record.notes}</p> : null}
                          </div>
                        </div>
                        <Link href="/verification-workflow">
                          <Button>Verify</Button>
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Live authentication and administrative activity from the persisted audit surface</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No recent activity was returned by the current backend.</p>
                  ) : (
                    recentActivity.map((activity, index) => (
                      <div key={`${activity.userId}-${index}`} className="flex gap-4 pb-4 border-b last:border-0">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold">{activity.action.replace(/_/g, " ")}</h4>
                          <p className="text-sm text-muted-foreground">
                            {(activity.details?.email as string | undefined) ?? (activity.details?.failureReason as string | undefined) ?? "Administrative activity recorded"}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                            <span>{activity.userName ?? `User ${activity.userId}`}</span>
                            <span>{formatDate(activity.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Monthly Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">New Registrations</span>
                      <span className="text-2xl font-bold">{stats.monthlyRegistrations}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Property Transfers</span>
                      <span className="text-2xl font-bold">{stats.monthlyTransfers}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total Transactions in View</span>
                      <span className="text-2xl font-bold">{transactionRecords.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    System Health
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Observed Approval Rate</span>
                      <Badge variant="default">{approvalRate}%</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Average Verification Age</span>
                      <Badge variant="outline">{avgVerificationAgeDays} days</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Role Coverage</span>
                      <Badge variant="secondary">{Object.keys(userStats?.byRole ?? {}).length || 0} active roles</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
