import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, AlertCircle, Clock, RefreshCw, Settings, ShieldAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type ServiceStatus = 'up' | 'down' | 'degraded' | 'not_configured';
type ReadinessStatus = 'healthy' | 'degraded' | 'unhealthy';
type JourneyStatus = 'passing' | 'warning' | 'failing';

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  responseTime?: number;
  message?: string;
  lastChecked: string;
  details?: Record<string, any>;
}

function getServiceStatusBadge(status: ServiceStatus) {
  switch (status) {
    case 'up':
      return { variant: 'default' as const, icon: CheckCircle, color: 'text-green-500', label: 'Healthy' };
    case 'down':
      return { variant: 'destructive' as const, icon: XCircle, color: 'text-red-500', label: 'Down' };
    case 'degraded':
      return { variant: 'secondary' as const, icon: AlertCircle, color: 'text-yellow-500', label: 'Degraded' };
    case 'not_configured':
    default:
      return { variant: 'outline' as const, icon: Settings, color: 'text-muted-foreground', label: 'Not Configured' };
  }
}

function getReadinessBadge(status: ReadinessStatus | JourneyStatus) {
  switch (status) {
    case 'healthy':
    case 'passing':
      return { variant: 'default' as const, label: status === 'healthy' ? 'Healthy' : 'Passing' };
    case 'degraded':
    case 'warning':
      return { variant: 'secondary' as const, label: status === 'degraded' ? 'Degraded' : 'Warning' };
    case 'unhealthy':
    case 'failing':
    default:
      return { variant: 'destructive' as const, label: status === 'unhealthy' ? 'Unhealthy' : 'Failing' };
  }
}

function formatServiceName(name: string): string {
  const names: Record<string, string> = {
    hyperledger_fabric: 'Hyperledger Fabric',
    mojaloop: 'Mojaloop',
    tigerbeetle: 'TigerBeetle',
    kafka: 'Apache Kafka',
    temporal: 'Temporal',
    elasticsearch: 'Elasticsearch',
    keycloak: 'Keycloak',
    apisix: 'APISIX',
    permify: 'Permify',
    dapr: 'Dapr',
    fluvio: 'Fluvio',
    openappsec: 'OpenAppSec',
    lakehouse: 'Lakehouse',
  };
  return names[name] || name;
}

function CrossLanguageSignalCard({
  title,
  configured,
  signal,
}: {
  title: string;
  configured: boolean;
  signal: Record<string, unknown> | null;
}) {
  const signalStatus = typeof signal?.status === 'string' ? String(signal.status) : configured ? 'configured' : 'not_configured';
  const badge = getReadinessBadge(signalStatus === 'healthy' ? 'healthy' : signalStatus === 'degraded' ? 'degraded' : signalStatus === 'not_configured' ? 'unhealthy' : 'degraded');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>
              {configured ? 'Endpoint configured for cross-language operations.' : 'Endpoint not configured in this environment.'}
            </CardDescription>
          </div>
          <Badge variant={badge.variant}>{configured ? badge.label : 'Not Configured'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {signal ? (
          Object.entries(signal).slice(0, 6).map(([key, value]) => (
            <div key={key} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</span>
              <span className="max-w-[60%] break-all text-right font-mono text-xs">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">No live signal has been received for this service yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const statusInfo = getServiceStatusBadge(service.status);
  const StatusIcon = statusInfo.icon;

  const testConnection = trpc.integrationHealth.testConnection.useMutation({
    onSuccess: () => {
      toast.success(`${formatServiceName(service.name)} connection test successful`);
    },
    onError: (error) => {
      toast.error(`Connection test failed: ${error.message}`);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
            <CardTitle className="text-lg">{formatServiceName(service.name)}</CardTitle>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        <CardDescription>Last checked: {new Date(service.lastChecked).toLocaleTimeString()}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {service.responseTime !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Response Time</span>
            <span className="font-medium">{service.responseTime}ms</span>
          </div>
        )}

        {service.message && <div className="text-sm text-muted-foreground">{service.message}</div>}

        {service.details && Object.keys(service.details).length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Configuration</div>
            {Object.entries(service.details).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="max-w-[55%] break-all text-right font-mono text-xs">{String(value)}</span>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => testConnection.mutate({ service: service.name as any })}
          disabled={testConnection.isPending}
        >
          {testConnection.isPending ? 'Testing...' : 'Test Connection'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function IntegrationHealthDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  const queryOptions = {
    refetchInterval: autoRefresh ? 30000 : false,
  } as const;

  const { data: health, isLoading, refetch } = trpc.integrationHealth.getStatus.useQuery(undefined, queryOptions);
  const { data: config } = trpc.integrationHealth.getConfig.useQuery();
  const { data: operations } = trpc.platformOperations.overview.useQuery(undefined, queryOptions);

  const refreshMutation = trpc.integrationHealth.refresh.useMutation({
    onSuccess: async () => {
      await Promise.all([refetch()]);
      toast.success('Integration health refreshed');
    },
    onError: (error) => {
      toast.error(`Refresh failed: ${error.message}`);
    },
  });

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  useEffect(() => {
    if (health || operations) {
      setCountdown(30);
    }
  }, [health, operations]);

  const serviceSummary = useMemo(() => {
    if (!health) {
      return { healthy: 0, degraded: 0, down: 0 };
    }

    return {
      healthy: health.services.filter((service) => service.status === 'up').length,
      degraded: health.services.filter((service) => service.status === 'degraded').length,
      down: health.services.filter((service) => service.status === 'down').length,
    };
  }, [health]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex h-64 items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const overallBadge = getReadinessBadge(
    operations?.overallStatus ?? (health?.overall === 'healthy' ? 'healthy' : health?.overall === 'degraded' ? 'degraded' : 'unhealthy')
  );

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trusted Middleware Readiness</h1>
          <p className="text-muted-foreground">
            Monitor service health, synthetic journeys, cross-language control signals, and operational trust posture.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {autoRefresh ? `Refreshing in ${countdown}s` : 'Auto-refresh disabled'}
          </div>
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? 'Disable' : 'Enable'} Auto-refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Platform Operations Overview</CardTitle>
                <CardDescription>
                  Last updated: {new Date(operations?.generatedAt ?? health?.timestamp ?? Date.now()).toLocaleString()}
                </CardDescription>
              </div>
            </div>
            <Badge variant={overallBadge.variant} className="px-4 py-2 text-lg">
              {overallBadge.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border p-4">
            <div className="text-3xl font-bold">{operations?.readinessScore ?? 0}</div>
            <p className="text-sm text-muted-foreground">Readiness Score</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-3xl font-bold text-green-600">{serviceSummary.healthy}</div>
            <p className="text-sm text-muted-foreground">Healthy Services</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-3xl font-bold text-yellow-600">{serviceSummary.degraded}</div>
            <p className="text-sm text-muted-foreground">Degraded Services</p>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-3xl font-bold text-red-600">{serviceSummary.down}</div>
            <p className="text-sm text-muted-foreground">Unavailable Services</p>
          </div>
        </CardContent>
      </Card>

      {operations && (
        <>
          <div>
            <h2 className="mb-4 text-2xl font-bold">Readiness Domains</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {operations.domains.map((domain) => {
                const badge = getReadinessBadge(domain.status);
                return (
                  <Card key={domain.name}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{domain.name}</CardTitle>
                          <CardDescription>{domain.summary}</CardDescription>
                        </div>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Score</span>
                        <span className="font-semibold">{domain.score}/100</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded border p-2">
                          <div className="font-semibold text-green-600">{domain.healthy}</div>
                          <div className="text-muted-foreground">Healthy</div>
                        </div>
                        <div className="rounded border p-2">
                          <div className="font-semibold text-yellow-600">{domain.degraded}</div>
                          <div className="text-muted-foreground">Degraded</div>
                        </div>
                        <div className="rounded border p-2">
                          <div className="font-semibold text-red-600">{domain.unhealthy}</div>
                          <div className="text-muted-foreground">Issues</div>
                        </div>
                      </div>
                      {domain.recommendedActions.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-medium">Recommended actions</div>
                          {domain.recommendedActions.map((action) => (
                            <div key={action} className="rounded border bg-muted/30 px-3 py-2 text-muted-foreground">
                              {action}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="mb-4 text-2xl font-bold">Synthetic Journeys</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {operations.syntheticJourneys.map((journey) => {
                const badge = getReadinessBadge(journey.status);
                return (
                  <Card key={journey.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{journey.name}</CardTitle>
                          <CardDescription>{journey.summary}</CardDescription>
                        </div>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Journey score</span>
                        <span className="font-semibold">{journey.score}/100</span>
                      </div>
                      <div>
                        <div className="font-medium">Dependencies</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {journey.dependencies.map((dependency) => (
                            <Badge key={dependency} variant="outline">{dependency}</Badge>
                          ))}
                        </div>
                      </div>
                      {journey.recommendedActions.length > 0 && (
                        <div className="space-y-1">
                          <div className="font-medium">Recommended actions</div>
                          {journey.recommendedActions.map((action) => (
                            <div key={action} className="rounded border bg-muted/30 px-3 py-2 text-muted-foreground">
                              {action}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="mb-4 text-2xl font-bold">Cross-Language Service Signals</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <CrossLanguageSignalCard
                title="Go Operations Bridge"
                configured={operations.externalServiceEndpoints.goBridgeConfigured}
                signal={operations.crossLanguageSignals.goBridge}
              />
              <CrossLanguageSignalCard
                title="Rust Control Plane"
                configured={operations.externalServiceEndpoints.rustControlPlaneConfigured}
                signal={operations.crossLanguageSignals.rustControlPlane}
              />
              <CrossLanguageSignalCard
                title="Python Lakehouse Intelligence"
                configured={operations.externalServiceEndpoints.pythonLakehouseConfigured}
                signal={operations.crossLanguageSignals.pythonLakehouse}
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Backup and Recovery Posture</CardTitle>
                <CardDescription>{operations.backupPosture.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Last backup</span><span>{new Date(operations.backupPosture.lastBackup).toLocaleString()}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Next backup</span><span>{new Date(operations.backupPosture.nextBackup).toLocaleString()}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Recovery points</span><span>{operations.backupPosture.recoveryPointCount}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Recent failures</span><span>{operations.backupPosture.recentFailureCount}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Public Trust and Abuse Defense</CardTitle>
                <CardDescription>{operations.abuseDefensePosture.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Tracked subjects</span><span>{operations.abuseDefensePosture.trackedSubjects}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Blocked subjects</span><span>{operations.abuseDefensePosture.blockedSubjects}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Challenge protection</span><span>{operations.abuseDefensePosture.captchaConfigured ? 'Configured' : 'Not configured'}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">CORS mode</span><span className="capitalize">{operations.abuseDefensePosture.corsMode}</span></div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Separator />

      <div>
        <h2 className="mb-4 text-2xl font-bold">Service Status</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {health?.services.map((service) => (
            <ServiceHealthCard key={service.name} service={service} />
          ))}
        </div>
      </div>

      {config && (
        <>
          <Separator />
          <div>
            <h2 className="mb-4 text-2xl font-bold">Configuration Status</h2>
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.entries(config).map(([service, configured]) => (
                    <div key={service} className="flex items-center gap-2">
                      {configured ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                      <span className="text-sm capitalize">{service.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
