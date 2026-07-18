import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScanSearch, Loader2, RefreshCw, CheckCircle2, Eye, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const severityStyles: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 border-blue-200",
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

const statusStyles: Record<string, string> = {
  open: "bg-red-50 text-red-700 border-red-200",
  acknowledged: "bg-yellow-50 text-yellow-700 border-yellow-200",
  resolved: "bg-green-50 text-green-700 border-green-200",
  dismissed: "bg-gray-50 text-gray-600 border-gray-200",
};

type StatusFilter = "open" | "acknowledged" | "resolved" | "dismissed" | undefined;

export default function RegistryIntegrityDashboard() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const { data: stats, refetch: refetchStats } = trpc.registryIntegrity.stats.useQuery();
  const { data: findingsData, refetch: refetchFindings, isLoading } = trpc.registryIntegrity.findings.useQuery({
    status: statusFilter,
    limit: 100,
  });

  const refreshAll = () => { refetchStats(); refetchFindings(); };

  const scanMutation = trpc.registryIntegrity.runScan.useMutation({
    onSuccess: (summary) => {
      toast.success(`Scan complete: ${summary.newFindings} new findings (${summary.deduplicated} deduplicated)`);
      refreshAll();
    },
    onError: (error) => toast.error(`Scan failed: ${error.message}`),
  });

  const acknowledgeMutation = trpc.registryIntegrity.acknowledge.useMutation({
    onSuccess: () => { toast.success("Finding acknowledged"); refreshAll(); },
    onError: (error) => toast.error(error.message),
  });
  const resolveMutation = trpc.registryIntegrity.resolve.useMutation({
    onSuccess: () => { toast.success("Finding resolved"); refreshAll(); },
    onError: (error) => toast.error(error.message),
  });
  const dismissMutation = trpc.registryIntegrity.dismiss.useMutation({
    onSuccess: () => { toast.success("Finding dismissed"); refreshAll(); },
    onError: (error) => toast.error(error.message),
  });

  const findings = findingsData?.findings ?? [];

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ScanSearch className="h-8 w-8 text-primary" />
            Registry Integrity Monitoring
          </h1>
          <p className="text-muted-foreground mt-1">
            Duplicate identity, overlapping geometry, ownership conflicts, valuation jumps, document fingerprints, timing anomalies
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAll}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
          <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}>
            {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScanSearch className="h-4 w-4 mr-2" />}
            Run scan
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(["open", "acknowledged", "resolved", "dismissed"] as const).map((status) => (
          <Card key={status} className="cursor-pointer" onClick={() => setStatusFilter(status)}>
            <CardHeader className="pb-2"><CardDescription className="capitalize">{status}</CardDescription></CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats?.byStatus?.[status] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex gap-2">
        {(["open", "acknowledged", "resolved", "dismissed", undefined] as const).map((status) => (
          <Button
            key={status ?? "all"}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status ?? "all"}
          </Button>
        ))}
      </div>

      {/* Findings queue */}
      <Card>
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardDescription>{findingsData?.total ?? 0} findings</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-3">
              {findings.map((finding) => (
                <div key={finding.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={severityStyles[finding.severity]}>{finding.severity}</Badge>
                      <Badge variant="outline">{finding.checkType.replace(/_/g, " ")}</Badge>
                      <Badge variant="outline" className={statusStyles[finding.status]}>{finding.status}</Badge>
                    </div>
                    <div className="flex gap-2">
                      {finding.status === "open" && (
                        <Button size="sm" variant="outline" onClick={() => acknowledgeMutation.mutate({ id: finding.id! })}>
                          <Eye className="h-3 w-3 mr-1" /> Acknowledge
                        </Button>
                      )}
                      {(finding.status === "open" || finding.status === "acknowledged") && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => resolveMutation.mutate({ id: finding.id!, notes: "Resolved via dashboard" })}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => dismissMutation.mutate({ id: finding.id!, notes: "Dismissed via dashboard" })}>
                            <XCircle className="h-3 w-3 mr-1" /> Dismiss
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm">{finding.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Detected {new Date(finding.detectedAt).toLocaleString()}
                    {finding.parcelId ? ` · Parcel #${finding.parcelId}` : ""}
                    {finding.scanRunId ? ` · ${finding.scanRunId}` : ""}
                  </p>
                </div>
              ))}
              {findings.length === 0 && (
                <p className="text-sm text-muted-foreground p-4">No findings in this state — the registry is clean or no scan has run yet.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
