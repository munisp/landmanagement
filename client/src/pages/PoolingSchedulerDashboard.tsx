import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Clock, Play, Pause, Settings, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function PoolingSchedulerDashboard() {
  const [strategy, setStrategy] = useState<'balanced' | 'riskBased' | 'maturityBased'>('balanced');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [enabled, setEnabled] = useState(false);
  const [cronExpression, setCronExpression] = useState('0 0 2 * * *'); // 2 AM daily

  // Queries
  const statusQuery = trpc.secondaryMarket.getSchedulerStatus.useQuery();
  const logsQuery = trpc.secondaryMarket.getSchedulerLogs.useQuery({ limit: 20 });

  // Mutations
  const updateConfig = trpc.secondaryMarket.updateSchedulerConfig.useMutation({
    onSuccess: () => {
      toast.success('Scheduler configuration updated');
      statusQuery.refetch();
    },
    onError: (error) => toast.error(`Failed to update config: ${error.message}`),
  });

  const startScheduler = trpc.secondaryMarket.startScheduler.useMutation({
    onSuccess: () => {
      toast.success('Scheduler started');
      statusQuery.refetch();
    },
    onError: (error) => toast.error(`Failed to start: ${error.message}`),
  });

  const stopScheduler = trpc.secondaryMarket.stopScheduler.useMutation({
    onSuccess: () => {
      toast.success('Scheduler stopped');
      statusQuery.refetch();
    },
    onError: (error) => toast.error(`Failed to stop: ${error.message}`),
  });



  const handleSaveConfig = () => {
    updateConfig.mutate({
      strategy,
      frequency,
      enabled,
    });
  };

  const handleToggleScheduler = () => {
    if (statusQuery.data?.running) {
      stopScheduler.mutate();
    } else {
      startScheduler.mutate();
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Automated Loan Pooling Scheduler</h1>
          <p className="text-muted-foreground">Configure and monitor automated loan pool creation</p>
        </div>
        <Badge variant={statusQuery.data?.running ? 'default' : 'secondary'} className="text-lg px-4 py-2">
          {statusQuery.data?.running ? (
            <>
              <Activity className="w-4 h-4 mr-2 animate-pulse" />
              Running
            </>
          ) : (
            <>
              <Pause className="w-4 h-4 mr-2" />
              Stopped
            </>
          )}
        </Badge>
      </div>

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Run</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statusQuery.data?.nextScheduledRun ? new Date(statusQuery.data.nextScheduledRun).toLocaleString() : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Scheduled execution time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Run</CardTitle>
            <CheckCircle2 className="h-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statusQuery.data?.lastRun ? new Date(statusQuery.data.lastRun).toLocaleString() : 'Never'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Check logs for execution details
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Runs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground mt-1">
              Check logs for execution history
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Scheduler Configuration
          </CardTitle>
          <CardDescription>Configure pooling strategy and schedule</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="strategy">Pooling Strategy</Label>
              <Select value={strategy} onValueChange={(v: any) => setStrategy(v)}>
                <SelectTrigger id="strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Balanced (Mixed Risk)</SelectItem>
                  <SelectItem value="riskBased">Risk-Based (Stratified)</SelectItem>
                  <SelectItem value="maturityBased">Maturity-Based (Timeline)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {strategy === 'balanced' && 'Creates pools with mixed risk profiles for diversification'}
                {strategy === 'riskBased' && 'Groups loans by similar risk tiers'}
                {strategy === 'maturityBased' && 'Organizes pools by maturity dates'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="frequency">Run Frequency</Label>
              <Select value={frequency} onValueChange={(v: any) => setFrequency(v)}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">How often the scheduler runs automatically</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cron">Cron Expression</Label>
              <Input
                id="cron"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 0 2 * * *"
              />
              <p className="text-sm text-muted-foreground">
                Format: seconds minutes hours day month dayOfWeek
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="enabled" className="flex items-center gap-2">
                <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
                Enable Scheduler
              </Label>
              <p className="text-sm text-muted-foreground">
                {enabled ? 'Scheduler will run automatically' : 'Scheduler is disabled'}
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Button onClick={handleSaveConfig} disabled={updateConfig.isPending}>
              {updateConfig.isPending ? 'Saving...' : 'Save Configuration'}
            </Button>
            <Button variant="outline" onClick={handleToggleScheduler} disabled={startScheduler.isPending || stopScheduler.isPending}>
              {statusQuery.data?.running ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Scheduler
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Scheduler
                </>
              )}
            </Button>

          </div>
        </CardContent>
      </Card>

      {/* Execution Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Logs</CardTitle>
          <CardDescription>Recent scheduler runs and results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {logsQuery.data && logsQuery.data.length > 0 ? (
              logsQuery.data.map((log: any, idx: number) => (
                <div key={idx} className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="mt-1">
                    {log.status === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{log.strategy} Strategy</p>
                      <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>
                        {log.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                    {log.poolsCreated > 0 && (
                      <p className="text-sm">
                        Created {log.poolsCreated} pool(s) with {log.loansProcessed} loan(s)
                      </p>
                    )}
                    {log.error && (
                      <p className="text-sm text-red-600">{log.error}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">No execution logs yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
