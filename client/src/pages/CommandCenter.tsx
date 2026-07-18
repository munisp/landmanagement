import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radar, RefreshCw, Loader2, AlertTriangle, TrendingUp, Activity, Gauge } from "lucide-react";
import { trpc } from "@/lib/trpc";

const severityStyles: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 border-blue-200",
  watch: "bg-yellow-100 text-yellow-800 border-yellow-200",
  warning: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

const postureStyles: Record<string, string> = {
  strong: "bg-green-100 text-green-800 border-green-200",
  stable: "bg-blue-100 text-blue-800 border-blue-200",
  strained: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

export default function CommandCenter() {
  const { data: forecast, refetch, isLoading } = trpc.commandCenter.forecast.useQuery(undefined, {
    refetchInterval: 60000,
  });

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Radar className="h-8 w-8 text-primary" />
            Institutional Command Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Predictive operations: backlog, SLA, dispute escalation, bottlenecks, integrations, regional surges
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Posture header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1"><Gauge className="h-4 w-4" /> Operational posture</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <p className="text-3xl font-bold">{forecast?.postureScore ?? "—"}</p>
            {forecast && (
              <Badge variant="outline" className={postureStyles[forecast.posture]}>{forecast.posture.toUpperCase()}</Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Backlog projection (30d)</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{forecast?.predictions.backlogProjection.days30 ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>At-risk clearances</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{forecast?.predictions.atRiskClearances ?? "—"}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Disputes likely to escalate</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{forecast?.predictions.disputesLikelyToEscalate ?? "—"}</p></CardContent>
        </Card>
      </div>

      {/* Predictive signals */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Predictive signals</CardTitle>
          <CardDescription>
            Maturity level: {forecast?.maturityLevel ?? "—"} · generated {forecast ? new Date(forecast.generatedAt).toLocaleString() : "—"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(forecast?.signals ?? []).map((signal) => (
              <div key={signal.key} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    {signal.label}
                  </p>
                  <Badge variant="outline" className={severityStyles[signal.severity]}>{signal.severity}</Badge>
                </div>
                <p className="text-sm">{signal.summary}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Recommended action:</span> {signal.recommendedAction}
                </p>
              </div>
            ))}
            {(forecast?.signals ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground p-4">
                No adverse signals — operations are within expected parameters.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Predictions detail */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Backlog trajectory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-around text-center">
              {(["days7", "days14", "days30"] as const).map((key) => (
                <div key={key}>
                  <p className="text-2xl font-bold">{forecast?.predictions.backlogProjection[key] ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{key.replace("days", "")} days</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Watchlists</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="font-medium">Bottleneck stage:</span> {forecast?.predictions.bottleneckStage ?? "none detected"}</p>
            <p><span className="font-medium">Integrations down:</span> {forecast?.predictions.integrationsDown.length ? forecast.predictions.integrationsDown.join(", ") : "none"}</p>
            <p><span className="font-medium">Surge states:</span> {forecast?.predictions.surgeStates.length ? forecast.predictions.surgeStates.join(", ") : "none"}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
