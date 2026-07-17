/**
 * Integration Health Dashboard
 * 
 * Real-time monitoring dashboard for external service integrations.
 * Shows health status, response times, and configuration for all services.
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Clock, Settings } from 'lucide-react';
import { toast } from 'sonner';

type ServiceStatus = 'up' | 'down' | 'degraded' | 'not_configured';

interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  responseTime?: number;
  message?: string;
  lastChecked: string;
  details?: Record<string, any>;
}

/**
 * Get status badge variant
 */
function getStatusBadge(status: ServiceStatus) {
  switch (status) {
    case 'up':
      return { variant: 'default' as const, icon: CheckCircle, color: 'text-green-500', label: 'Healthy' };
    case 'down':
      return { variant: 'destructive' as const, icon: XCircle, color: 'text-red-500', label: 'Down' };
    case 'degraded':
      return { variant: 'secondary' as const, icon: AlertCircle, color: 'text-yellow-500', label: 'Degraded' };
    case 'not_configured':
      return { variant: 'outline' as const, icon: Settings, color: 'text-gray-500', label: 'Not Configured' };
  }
}

/**
 * Format service name
 */
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

/**
 * Service Health Card
 */
function ServiceHealthCard({ service }: { service: ServiceHealth }) {
  const statusInfo = getStatusBadge(service.status);
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
            <CardTitle className="text-lg">{formatServiceName(service.name)}</CardTitle>
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        <CardDescription>
          Last checked: {new Date(service.lastChecked).toLocaleTimeString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {service.responseTime !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Response Time</span>
            <span className="font-medium">{service.responseTime}ms</span>
          </div>
        )}
        
        {service.message && (
          <div className="text-sm text-muted-foreground">
            {service.message}
          </div>
        )}
        
        {service.details && Object.keys(service.details).length > 0 && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Configuration</div>
            {Object.entries(service.details).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-mono text-xs">{String(value)}</span>
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

/**
 * Integration Health Dashboard
 */
export default function IntegrationHealthDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);

  // Fetch integration health
  const { data: health, isLoading, refetch } = trpc.integrationHealth.getStatus.useQuery(undefined, {
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch configuration
  const { data: config } = trpc.integrationHealth.getConfig.useQuery();

  // Manual refresh
  const refreshMutation = trpc.integrationHealth.refresh.useMutation({
    onSuccess: () => {
      refetch();
      toast.success('Integration health refreshed');
    },
    onError: (error) => {
      toast.error(`Refresh failed: ${error.message}`);
    },
  });

  // Countdown timer for auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 30;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Reset countdown on manual refresh
  useEffect(() => {
    if (health) {
      setCountdown(30);
    }
  }, [health]);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const overallStatusInfo = health ? getStatusBadge(
    health.overall === 'healthy' ? 'up' : 
    health.overall === 'degraded' ? 'degraded' : 'down'
  ) : null;

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Integration Health</h1>
          <p className="text-muted-foreground">
            Monitor external service connections and health status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {autoRefresh ? `Refreshing in ${countdown}s` : 'Auto-refresh disabled'}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Disable' : 'Enable'} Auto-refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Overall Status */}
      {health && overallStatusInfo && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <overallStatusInfo.icon className={`h-6 w-6 ${overallStatusInfo.color}`} />
                <div>
                  <CardTitle>Overall System Health</CardTitle>
                  <CardDescription>
                    Last updated: {new Date(health.timestamp).toLocaleString()}
                  </CardDescription>
                </div>
              </div>
              <Badge variant={overallStatusInfo.variant} className="text-lg px-4 py-2">
                {overallStatusInfo.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-500">
                  {health.services.filter(s => s.status === 'up').length}
                </div>
                <div className="text-sm text-muted-foreground">Healthy</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-500">
                  {health.services.filter(s => s.status === 'degraded').length}
                </div>
                <div className="text-sm text-muted-foreground">Degraded</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">
                  {health.services.filter(s => s.status === 'down').length}
                </div>
                <div className="text-sm text-muted-foreground">Down</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Service Health Cards */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Service Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {health?.services.map((service) => (
            <ServiceHealthCard key={service.name} service={service} />
          ))}
        </div>
      </div>

      {/* Configuration Status */}
      {config && (
        <>
          <Separator />
          <div>
            <h2 className="text-2xl font-bold mb-4">Configuration Status</h2>
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(config).map(([service, configured]) => (
                    <div key={service} className="flex items-center gap-2">
                      {configured ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
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
