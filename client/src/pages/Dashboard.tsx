import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { DashboardSkeleton } from "@/components/SkeletonLoaders";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ConnectedActivityFeed } from "@/components/ConnectedActivityFeed";
import { 
  Building2, 
  FileText, 
  TrendingUp, 
  Users, 
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Link } from "wouter";
import { getLoginUrl } from "@/const";

const emptyStats = {
  parcels: { total: 0, verified: 0, pending: 0 },
  titles: { total: 0, active: 0, pending: 0 },
  transactions: { total: 0, completed: 0, pending: 0 },
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { data: stats, isLoading } = trpc.stats.dashboard.useQuery();
  const { data: myTitles } = trpc.titles.getByOwner.useQuery();
  const { data: myTransactions } = trpc.transactions.getMyTransactions.useQuery();

  const effectiveTitles = myTitles?.titles ?? [];
  const effectiveTransactions = myTransactions?.transactions ?? [];
  const effectiveStats = stats ?? emptyStats;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-16">
          <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 shadow-2xl lg:p-12">
              <div className="mb-6 inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-2 text-sm font-medium text-blue-100">
                Secure institutional workspace
              </div>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-5xl">
                Registry dashboard and operational portal access
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                The dashboard is reserved for authenticated registry staff, institutional users, and approved platform operators. Sign in to continue to workflow tools, transaction monitoring, reporting, and administrative workspaces.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a href={getLoginUrl()}>
                  <Button size="lg" className="bg-blue-600 text-white hover:bg-blue-500">Sign in securely</Button>
                </a>
                <Link href="/">
                  <Button size="lg" variant="outline" className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800">Return to home</Button>
                </Link>
                <Link href="/search">
                  <Button size="lg" variant="ghost" className="text-blue-100 hover:bg-white/10">Search public records</Button>
                </Link>
              </div>
            </div>

            <Card className="border-slate-800 bg-slate-900/90 text-slate-100 shadow-2xl">
              <CardHeader>
                <CardTitle className="text-2xl text-white">What you can access after sign-in</CardTitle>
                <CardDescription className="text-slate-300">
                  A role-based operating environment for transaction processing, title workflows, compliance review, and executive visibility.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-slate-300">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="font-medium text-white">Operational dashboard</p>
                  <p className="mt-1">Track parcels, titles, cases, and workflow activity from a single view.</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="font-medium text-white">Institutional portal</p>
                  <p className="mt-1">Access analytics, compliance modules, document workflows, and service operations.</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="font-medium text-white">Public-facing services</p>
                  <p className="mt-1">Return to the public home page or public search experience for citizen self-service access.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-white">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="font-bold">IDLR-PTS</span>
            </div>
          </div>
        </header>
        <div className="container mx-auto px-4 py-8">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer">
                <Building2 className="h-6 w-6 text-primary" />
                <span className="font-bold">IDLR-PTS</span>
              </div>
            </Link>
            <nav className="flex gap-2">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">Dashboard</Button>
              </Link>
              <Link href="/search">
                <Button variant="ghost" size="sm">Search</Button>
              </Link>
              {user.role === 'surveyor' && (
                <Link href="/surveys">
                  <Button variant="ghost" size="sm">My Surveys</Button>
                </Link>
              )}
              {(user.role === 'registrar' || user.role === 'admin') && (
                <Link href="/admin">
                  <Button variant="ghost" size="sm">Administration</Button>
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
              {user.role}
            </span>
            <Button variant="outline" size="sm" onClick={() => logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Operational dashboard</h1>
        
        <PullToRefresh
          onRefresh={async () => {
            await Promise.all([
              trpc.useUtils().stats.dashboard.invalidate(),
              trpc.useUtils().titles.getByOwner.invalidate(),
              trpc.useUtils().transactions.getMyTransactions.invalidate(),
            ]);
          }}
        >
        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total parcels</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">
                  {effectiveStats.parcels.total}
                </div>
                <MapPin className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {effectiveStats.parcels.verified} verified
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Property titles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">
                  {effectiveStats.titles.total}
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {effectiveStats.titles.active} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">
                  {effectiveStats.transactions.total}
                </div>
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {effectiveStats.transactions.completed} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>My titles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">
                  {effectiveTitles.length}
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                properties owned
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Transactions & Activity Feed */}
        <div className="grid lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>My property titles</CardTitle>
              <CardDescription>Land parcels and title records assigned to your account</CardDescription>
            </CardHeader>
            <CardContent>
              {effectiveTitles.length > 0 ? (
                <div className="space-y-4">
                  {effectiveTitles.slice(0, 5).map((title: any) => (
                    <div key={title.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{title.titleNumber}</p>
                        <p className="text-sm text-muted-foreground">{title.titleType}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          title.status === 'registered' || title.status === 'verified' || title.status === 'encumbered'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {title.status}
                        </span>
                        <Link href={`/titles/${title.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No property titles are available for this account yet.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>Latest transaction activity and workflow progress</CardDescription>
            </CardHeader>
            <CardContent>
              {effectiveTransactions.length > 0 ? (
                <div className="space-y-4">
                  {effectiveTransactions.slice(0, 5).map((transaction: any) => (
                    <div key={transaction.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {transaction.status === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : transaction.status === 'pending_approval' ? (
                          <Clock className="h-5 w-5 text-yellow-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <p className="font-medium">{transaction.transactionNumber ?? `TXN-${String(transaction.id).padStart(4, '0')}`}</p>
                          <p className="text-sm text-muted-foreground">{transaction.type}</p>
                        </div>
                      </div>
                      <Link href={`/transactions/${transaction.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No recent transactions are available yet.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>Latest operational events across your workspace</CardDescription>
            </CardHeader>
            <CardContent>
              <ConnectedActivityFeed limit={5} />
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common tools to continue your daily registry work</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <Link href="/search">
                <Button variant="outline" className="w-full gap-2">
                  <MapPin className="h-4 w-4" />
                  Search Parcels
                </Button>
              </Link>
              <Link href="/transactions/new">
                <Button variant="outline" className="w-full gap-2">
                  <FileText className="h-4 w-4" />
                  Start Transaction
                </Button>
              </Link>
              <Link href="/document-validation">
                <Button variant="outline" className="w-full gap-2">
                  <FileText className="h-4 w-4" />
                  Document Workflow
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
        </PullToRefresh>
      </div>
    </div>
  );
}
