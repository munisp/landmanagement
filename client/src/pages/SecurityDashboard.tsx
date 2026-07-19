import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Shield, AlertTriangle, Activity, DollarSign, Lock, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function SecurityDashboard() {
  // Fetch real security data from integrated services
  const { data: dashboardData, isLoading, refetch } = trpc.security.getDashboardData.useQuery();
  const { data: threats, isLoading: threatsLoading } = trpc.security.getThreats.useQuery();
  const { data: alerts, isLoading: alertsLoading } = trpc.security.getAlerts.useQuery({ timeRange: '24h' });
  const { data: violations, isLoading: violationsLoading } = trpc.security.getPolicyViolations.useQuery();
  const { data: costData, isLoading: costLoading } = trpc.security.getCostData.useQuery({ window: '7d' });

  const handleRefresh = () => {
    refetch();
    toast.success("Security data refreshed");
  };

  if (isLoading || threatsLoading || alertsLoading || violationsLoading || costLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading security dashboard...</p>
        </div>
      </div>
    );
  }

  const threatLevelColor = {
    low: 'bg-green-100 text-green-800 border-green-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    critical: 'bg-red-100 text-red-800 border-red-200'
  };

  const securityScore = Math.max(
    0,
    100 -
      (dashboardData?.metrics.activeThreats || 0) * 6 -
      (dashboardData?.metrics.highSeverityAlerts || 0) * 4 -
      (dashboardData?.metrics.policyViolations || 0) * 3 -
      (dashboardData?.metrics.costAnomalies || 0) * 2
  );

  const securityScoreTone =
    securityScore >= 85
      ? 'text-green-600'
      : securityScore >= 70
        ? 'text-yellow-600'
        : securityScore >= 50
          ? 'text-orange-600'
          : 'text-red-600';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" className="gap-2">
              ← Back to Admin
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Security Dashboard</h1>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className={threatLevelColor[dashboardData?.threatLevel || 'low']}
            >
              Threat Level: {(dashboardData?.threatLevel || 'low').toUpperCase()}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <Shield className="h-10 w-10" />
              Security & Threat Intelligence
            </h1>
            <p className="text-lg text-muted-foreground">
              Real-time security monitoring powered by OpenCTI, Wazuh, OPA, and Kubecost
            </p>
          </div>

          {/* Security Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Shield className={`h-5 w-5 ${securityScoreTone}`} />
                  <span className={`text-2xl font-bold ${securityScoreTone}`}>{securityScore}</span>
                </div>
                <p className="text-xs text-muted-foreground">Security Score</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <span className="text-2xl font-bold">{dashboardData?.metrics.activeThreats || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Active Threats</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="h-5 w-5 text-yellow-600" />
                  <span className="text-2xl font-bold">{dashboardData?.metrics.totalAlerts || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Security Alerts (24h)</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <Lock className="h-5 w-5 text-orange-600" />
                  <span className="text-2xl font-bold">{dashboardData?.metrics.policyViolations || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Policy Violations</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                  <span className="text-2xl font-bold">{dashboardData?.metrics.costAnomalies || 0}</span>
                </div>
                <p className="text-xs text-muted-foreground">Cost Anomalies</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* OpenCTI Threat Intelligence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Threat Intelligence (OpenCTI)
                </CardTitle>
                <CardDescription>
                  Recent threats from OpenCTI platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardData?.recentThreats && dashboardData.recentThreats.length > 0 ? (
                    dashboardData.recentThreats.map((threat: any) => (
                      <div key={threat.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">
                              {threat.type || 'unknown'}
                            </Badge>
                            <Badge variant="outline">
                              {threat.confidence}% confidence
                            </Badge>
                          </div>
                        </div>
                        <p className="font-medium text-sm">{threat.name}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {threat.description?.substring(0, 100)}...
                        </p>
                        {threat.labels && threat.labels.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {threat.labels.slice(0, 3).map((label: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No active threats detected
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Wazuh SIEM Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Security Alerts (Wazuh)
                </CardTitle>
                <CardDescription>
                  Recent alerts from Wazuh SIEM
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardData?.recentAlerts && dashboardData.recentAlerts.length > 0 ? (
                    dashboardData.recentAlerts.slice(0, 5).map((alert: any) => (
                      <div key={alert.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant={alert.rule.level >= 10 ? 'destructive' : 'secondary'}>
                            Level {alert.rule.level}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="font-medium text-sm">{alert.rule.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Agent: {alert.agent?.name || 'Unknown'} ({alert.agent?.ip || 'N/A'})
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No recent alerts
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* OPA Policy Violations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Policy Violations (OPA)
                </CardTitle>
                <CardDescription>
                  Recent policy violations from Open Policy Agent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardData?.recentViolations && dashboardData.recentViolations.length > 0 ? (
                    dashboardData.recentViolations.map((violation: any) => (
                      <div key={violation.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant={
                            violation.severity === 'critical' || violation.severity === 'high' 
                              ? 'destructive' 
                              : 'secondary'
                          }>
                            {violation.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(violation.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="font-medium text-sm">{violation.policy}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {violation.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          User: {violation.user} | Resource: {violation.resource}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No policy violations
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Kubecost Anomalies */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Cost Anomalies (Kubecost)
                </CardTitle>
                <CardDescription>
                  Unusual cost patterns detected by Kubecost
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardData?.costAnomalies && dashboardData.costAnomalies.length > 0 ? (
                    dashboardData.costAnomalies.map((anomaly: any) => (
                      <div key={anomaly.id} className="p-3 border rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant="destructive">
                            +{anomaly.deviation}%
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(anomaly.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="font-medium text-sm">{anomaly.namespace} / {anomaly.resource}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Expected: ${anomaly.expectedCost.toFixed(2)} | Actual: ${anomaly.actualCost.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Type: {anomaly.anomalyType}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No cost anomalies detected
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Agent Status */}
          {dashboardData?.metrics.agentStatus && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle>Wazuh Agent Status</CardTitle>
                <CardDescription>
                  Status of security monitoring agents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold">{dashboardData.metrics.agentStatus.total}</div>
                    <div className="text-xs text-muted-foreground">Total Agents</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg bg-green-50">
                    <div className="text-2xl font-bold text-green-700">{dashboardData.metrics.agentStatus.active}</div>
                    <div className="text-xs text-muted-foreground">Active</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg bg-red-50">
                    <div className="text-2xl font-bold text-red-700">{dashboardData.metrics.agentStatus.disconnected}</div>
                    <div className="text-xs text-muted-foreground">Disconnected</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg bg-gray-50">
                    <div className="text-2xl font-bold text-gray-700">{dashboardData.metrics.agentStatus.never_connected}</div>
                    <div className="text-xs text-muted-foreground">Never Connected</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
