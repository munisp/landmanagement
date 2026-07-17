import { ArrowRight, FileText, MapPin, Search, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function formatStatus(status?: string | null) {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ");
}

export default function TransactionLauncher() {
  const titlesQuery = trpc.titles.getByOwner.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const titles = (titlesQuery.data as any)?.titles ?? (Array.isArray(titlesQuery.data) ? titlesQuery.data : []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="container mx-auto px-4 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Transaction initiation</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Choose a parcel or title to begin a transaction</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Transactions in the IDLR platform begin from a known parcel or title record. Select one of your linked records below or continue to the broader parcel search workspace.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button variant="outline">Return to dashboard</Button>
            </Link>
            <Link href="/search">
              <Button className="gap-2">
                <Search className="h-4 w-4" />
                Search parcels
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-slate-200 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle>Your eligible records</CardTitle>
              <CardDescription>
                Use an existing title or linked parcel as the starting point for a registration, transfer, mortgage, lease, subdivision, or consolidation workflow.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {titlesQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : titles.length > 0 ? (
                <div className="space-y-4">
                  {titles.map((title: any) => {
                    const parcelId = typeof title.parcelId === "number" ? title.parcelId : null;
                    return (
                      <div key={title.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-3">
                              <h2 className="text-lg font-semibold text-slate-950">{title.titleNumber || `Title #${title.id}`}</h2>
                              <Badge variant="secondary" className="capitalize">{formatStatus(title.status)}</Badge>
                            </div>
                            <p className="text-sm text-slate-600">
                              {title.titleType || "Property title"}
                              {parcelId ? ` · Linked parcel ${parcelId}` : " · Parcel link unavailable"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Link href={`/titles/${title.id}`}>
                              <Button variant="outline" className="gap-2">
                                <FileText className="h-4 w-4" />
                                Open title
                              </Button>
                            </Link>
                            {parcelId ? (
                              <Link href={`/transactions/initiate/${parcelId}`}>
                                <Button className="gap-2">
                                  Start transaction
                                  <ArrowRight className="h-4 w-4" />
                                </Button>
                              </Link>
                            ) : (
                              <Button disabled>Parcel required</Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-lg font-medium text-slate-950">No linked title records were returned for this account.</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Continue to parcel search to identify the correct record, or open the verification workflow if the parcel has not yet been fully prepared for transaction processing.
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    <Link href="/search">
                      <Button>Search parcels</Button>
                    </Link>
                    <Link href="/verification">
                      <Button variant="outline">Open verification workflow</Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm bg-slate-950 text-white">
            <CardHeader>
              <CardTitle>Supported transaction paths</CardTitle>
              <CardDescription className="text-slate-300">
                Start from a validated parcel or title to keep the downstream workflow and audit trail intact.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <ShieldCheck className="h-4 w-4 text-emerald-300" />
                  Registration and title correction
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Begin formal title lifecycle activity from a known record with preserved ownership history.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <MapPin className="h-4 w-4 text-blue-300" />
                  Transfer, mortgage, lease, and subdivision
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Use parcel-linked routing so valuation, documents, and approvals remain attached to the same asset record.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Search className="h-4 w-4 text-amber-300" />
                  Search-first workflow
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-300">If you do not yet know the parcel identifier, start with the public or authenticated search experience and continue from there.</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
