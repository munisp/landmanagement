import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { Database, HardDrive, Cloud, CheckCircle2, AlertTriangle, Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function BackupRecovery() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.backupRecovery.state.useQuery();

  const initiateBackupMutation = trpc.backupRecovery.initiateBackup.useMutation({
    onSuccess: async () => {
      await utils.backupRecovery.state.invalidate();
      toast.success("Backup completed successfully");
    },
    onError: (error) => toast.error(error.message || "Failed to run backup"),
  });

  const restoreMutation = trpc.backupRecovery.restore.useMutation({
    onSuccess: async (result) => {
      await utils.backupRecovery.state.invalidate();
      toast.success(`Recovery workflow registered for ${result.name}`);
    },
    onError: (error) => toast.error(error.message || "Failed to restore backup"),
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading backup and recovery state...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" className="gap-2">
              ← Back to Admin
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Backup & Disaster Recovery</h1>
          <Button
            onClick={() => initiateBackupMutation.mutate()}
            disabled={initiateBackupMutation.isPending}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {initiateBackupMutation.isPending ? "Running Backup..." : "Backup Now"}
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <Database className="h-10 w-10" />
              Backup & Disaster Recovery
            </h1>
            <p className="text-lg text-muted-foreground">
              Automated backups, point-in-time recovery, and geo-redundant storage for business continuity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-2xl font-bold">Active</span>
                </div>
                <p className="text-xs text-muted-foreground">Backup Status</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Cloud className="h-5 w-5 text-blue-600" />
                  <span className="text-2xl font-bold">{data.storageMetrics.totalBackupSize}</span>
                </div>
                <p className="text-xs text-muted-foreground">Total Backup Size</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <HardDrive className="h-5 w-5 text-purple-600" />
                  <span className="text-2xl font-bold">{data.recoveryPoints.length}</span>
                </div>
                <p className="text-xs text-muted-foreground">Recovery Points</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Database className="h-5 w-5 text-orange-600" />
                  <span className="text-2xl font-bold">{data.schedule.retention}</span>
                </div>
                <p className="text-xs text-muted-foreground">Retention Period</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Backup Schedule</CardTitle>
                <CardDescription>Automated backup configuration and schedule</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Frequency</span><span className="font-medium">{data.schedule.frequency}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Last Backup</span><span className="font-medium">{new Date(data.schedule.lastBackup).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Next Backup</span><span className="font-medium">{new Date(data.schedule.nextBackup).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Retention</span><span className="font-medium">{data.schedule.retention}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Storage Location</span><span className="font-medium text-right">{data.schedule.location}</span></div>
                </div>

                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <p className="font-medium text-green-900">Geo-Redundant Storage</p>
                  </div>
                  <p className="text-sm text-green-700">
                    Backups are replicated across multiple storage locations for continuity even when primary infrastructure is unavailable.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Storage Metrics</CardTitle>
                <CardDescription>Backup storage usage and cost analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Storage Usage</span>
                    <span className="font-medium">{data.storageMetrics.usagePercentage}%</span>
                  </div>
                  <Progress value={data.storageMetrics.usagePercentage} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.storageMetrics.totalBackupSize} of {data.storageMetrics.availableSpace} used
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Total Size</p>
                    <p className="text-xl font-bold">{data.storageMetrics.totalBackupSize}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-sm text-muted-foreground mb-1">Monthly Cost</p>
                    <p className="text-xl font-bold">{data.storageMetrics.estimatedCostMonth}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Recent Backups</CardTitle>
              <CardDescription>Backup history with status and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recentBackups.map((backup) => (
                  <div key={backup.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-2 rounded-full ${backup.status === 'completed' ? 'bg-green-500' : backup.status === 'in_progress' ? 'bg-blue-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="font-medium">{backup.type}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(backup.timestamp).toLocaleString()} • {backup.size} • {backup.duration}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={backup.status === 'completed' ? 'outline' : 'secondary'}>{backup.status}</Badge>
                      <Button size="sm" variant="ghost" className="gap-2" disabled>
                        <Download className="h-3 w-3" />
                        Managed Copy
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Point-in-Time Recovery</CardTitle>
              <CardDescription>Available recovery points for disaster recovery</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recoveryPoints.map((point) => (
                  <div key={point.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{point.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(point.timestamp).toLocaleString()} • {point.size}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={point.type === 'manual' ? 'default' : 'outline'}>{point.type}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restoreMutation.mutate({ recoveryPointId: point.id })}
                        disabled={restoreMutation.isPending}
                        className="gap-2"
                      >
                        <Download className="h-3 w-3" />
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-900">Important: Disaster Recovery</p>
                    <p className="text-sm text-yellow-800 mt-1">
                      Restoring from a recovery point replaces current operational data with the selected snapshot. Confirm operational readiness before initiating a production restore.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
