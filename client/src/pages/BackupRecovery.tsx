import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from 'wouter';
import { AlertTriangle, CheckCircle2, Cloud, Database, Download, HardDrive, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

export default function BackupRecovery() {
  const utils = trpc.useUtils();
  const [drillScenario, setDrillScenario] = useState('Primary database region failover');
  const [drillRecoveryTime, setDrillRecoveryTime] = useState('20m');
  const [drillNotes, setDrillNotes] = useState('');

  const { data, isLoading } = trpc.backupRecovery.state.useQuery();
  const { data: readiness } = trpc.backupRecovery.readiness.useQuery();

  const invalidateAll = async () => {
    await Promise.all([
      utils.backupRecovery.state.invalidate(),
      utils.backupRecovery.readiness.invalidate(),
    ]);
  };

  const initiateBackupMutation = trpc.backupRecovery.initiateBackup.useMutation({
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Backup completed successfully');
    },
    onError: (error) => toast.error(error.message || 'Failed to run backup'),
  });

  const restoreMutation = trpc.backupRecovery.restore.useMutation({
    onSuccess: async (result) => {
      await invalidateAll();
      toast.success(`Recovery workflow registered for ${result.name}`);
    },
    onError: (error) => toast.error(error.message || 'Failed to restore backup'),
  });

  const runDrillMutation = trpc.backupRecovery.runRecoveryDrill.useMutation({
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Recovery drill recorded successfully');
      setDrillNotes('');
    },
    onError: (error) => toast.error(error.message || 'Failed to record recovery drill'),
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading backup and recovery state...
        </div>
      </div>
    );
  }

  const healthBadgeVariant = readiness?.failedBackups ? 'destructive' : 'default';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/admin">
            <Button variant="ghost" className="gap-2">
              ← Back to Admin
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Backup & Disaster Recovery</h1>
          <Button onClick={() => initiateBackupMutation.mutate()} disabled={initiateBackupMutation.isPending} className="gap-2">
            <Upload className="h-4 w-4" />
            {initiateBackupMutation.isPending ? 'Running Backup...' : 'Backup Now'}
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <h1 className="mb-4 flex items-center gap-3 text-4xl font-bold">
              <Database className="h-10 w-10" />
              Backup & Disaster Recovery
            </h1>
            <p className="text-lg text-muted-foreground">
              Automated backups, point-in-time recovery, restore-drill instrumentation, and geo-redundant storage for business continuity.
            </p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-2 flex items-center justify-between">
                  <ShieldCheck className="h-5 w-5 text-green-600" />
                  <Badge variant={healthBadgeVariant}>{readiness?.failedBackups ? 'Attention' : 'Healthy'}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Operational Readiness</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="mb-2 flex items-center justify-between">
                  <Cloud className="h-5 w-5 text-blue-600" />
                  <span className="text-2xl font-bold">{data.storageMetrics.totalBackupSize}</span>
                </div>
                <p className="text-xs text-muted-foreground">Total Backup Size</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="mb-2 flex items-center justify-between">
                  <HardDrive className="h-5 w-5 text-purple-600" />
                  <span className="text-2xl font-bold">{data.recoveryPoints.length}</span>
                </div>
                <p className="text-xs text-muted-foreground">Recovery Points</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="mb-2 flex items-center justify-between">
                  <Database className="h-5 w-5 text-orange-600" />
                  <span className="text-2xl font-bold">{data.schedule.retention}</span>
                </div>
                <p className="text-xs text-muted-foreground">Retention Period</p>
              </CardContent>
            </Card>
          </div>

          <div className="mb-8 grid gap-8 lg:grid-cols-2">
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
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Storage Location</span><span className="text-right font-medium">{data.schedule.location}</span></div>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
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
                <CardTitle>Readiness Summary</CardTitle>
                <CardDescription>Replication, monitoring, alerting, and restore-drill posture</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Replication</p>
                    <p className="font-semibold capitalize">{readiness?.replicationStatus || data.automationHealth.replicationStatus}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Monitoring</p>
                    <p className="font-semibold capitalize">{readiness?.monitoringStatus || data.automationHealth.monitoringStatus}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Alerting</p>
                    <p className="font-semibold capitalize">{readiness?.alertingStatus || data.automationHealth.alertingStatus}</p>
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                  <p className="font-medium">Most recent restore drill</p>
                  <p className="text-muted-foreground">
                    {readiness?.lastDrill
                      ? `${readiness.lastDrill.scenario} completed ${new Date(readiness.lastDrill.timestamp).toLocaleString()} in ${readiness.lastDrill.recoveryTime}.`
                      : 'No restore drill has been recorded yet.'}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  Alert channels: {(readiness?.alertChannels || data.alertChannels).join(', ')}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mb-8 grid gap-8 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Storage Metrics</CardTitle>
                <CardDescription>Backup storage usage and cost analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Storage Usage</span>
                    <span className="font-medium">{data.storageMetrics.usagePercentage}%</span>
                  </div>
                  <Progress value={data.storageMetrics.usagePercentage} className="h-2" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {data.storageMetrics.totalBackupSize} of {data.storageMetrics.availableSpace} used
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4">
                    <p className="mb-1 text-sm text-muted-foreground">Total Size</p>
                    <p className="text-xl font-bold">{data.storageMetrics.totalBackupSize}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="mb-1 text-sm text-muted-foreground">Monthly Cost</p>
                    <p className="text-xl font-bold">{data.storageMetrics.estimatedCostMonth}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recovery Drill Controls</CardTitle>
                <CardDescription>Record repository-level restore drills and readiness evidence.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="drill-scenario">Scenario</Label>
                  <Input id="drill-scenario" value={drillScenario} onChange={(e) => setDrillScenario(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="drill-time">Recovery Time</Label>
                  <Input id="drill-time" value={drillRecoveryTime} onChange={(e) => setDrillRecoveryTime(e.target.value)} placeholder="e.g. 18m" />
                </div>
                <div>
                  <Label htmlFor="drill-notes">Notes</Label>
                  <Input id="drill-notes" value={drillNotes} onChange={(e) => setDrillNotes(e.target.value)} placeholder="Summarize what was validated during the drill" />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => runDrillMutation.mutate({ scenario: drillScenario, recoveryTime: drillRecoveryTime, outcome: 'passed', notes: drillNotes || undefined })}
                    disabled={runDrillMutation.isPending}
                  >
                    Record Passed Drill
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runDrillMutation.mutate({ scenario: drillScenario, recoveryTime: drillRecoveryTime, outcome: 'warning', notes: drillNotes || undefined })}
                    disabled={runDrillMutation.isPending}
                  >
                    Record Warning Drill
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Recent Backup Alerts</CardTitle>
              <CardDescription>Operational messages from backup automation, replication, and restore verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{alert.message}</p>
                    <p className="text-sm text-muted-foreground">{new Date(alert.timestamp).toLocaleString()}</p>
                  </div>
                  <Badge variant={alert.severity === 'critical' ? 'destructive' : alert.severity === 'warning' ? 'secondary' : 'outline'}>
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Recent Backups</CardTitle>
              <CardDescription>Backup history with status and performance metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recentBackups.map((backup) => (
                  <div key={backup.id} className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-4">
                      <div className={`h-2 w-2 rounded-full ${backup.status === 'completed' ? 'bg-green-500' : backup.status === 'in_progress' ? 'bg-blue-500' : 'bg-red-500'}`} />
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

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Recovery Drill History</CardTitle>
              <CardDescription>Most recent restore-validation drills captured in the repository workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recoveryDrills.map((drill) => (
                <div key={drill.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{drill.scenario}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(drill.timestamp).toLocaleString()} • Recovery time: {drill.recoveryTime}
                    </p>
                    {drill.notes && <p className="mt-1 text-sm text-muted-foreground">{drill.notes}</p>}
                  </div>
                  <Badge variant={drill.outcome === 'failed' ? 'destructive' : drill.outcome === 'warning' ? 'secondary' : 'outline'}>
                    {drill.outcome}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Point-in-Time Recovery</CardTitle>
              <CardDescription>Available recovery points for disaster recovery</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recoveryPoints.map((point) => (
                  <div key={point.id} className="flex items-center justify-between rounded-lg border p-4">
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

              <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-900">Important: Disaster Recovery</p>
                    <p className="mt-1 text-sm text-yellow-800">
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
