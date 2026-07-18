import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, AlertTriangle, Loader2, RefreshCw, Play, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const bandStyles: Record<string, string> = {
  low: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-800 border-red-200",
};

export default function TitleRiskCopilot() {
  const [parcelId, setParcelId] = useState("");
  const { data: summary, refetch: refetchSummary } = trpc.titleRisk.portfolioSummary.useQuery();
  const { data: recent, refetch: refetchRecent } = trpc.titleRisk.list.useQuery({ limit: 25 });

  const assessMutation = trpc.titleRisk.assess.useMutation({
    onSuccess: () => {
      toast.success("Title risk assessment completed");
      refetchSummary();
      refetchRecent();
    },
    onError: (error) => toast.error(`Assessment failed: ${error.message}`),
  });

  const latest = assessMutation.data;

  const handleAssess = () => {
    const id = Number(parcelId);
    if (!id || id <= 0) {
      toast.error("Enter a valid parcel ID");
      return;
    }
    assessMutation.mutate({ parcelId: id });
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            Title Risk Copilot
          </h1>
          <p className="text-muted-foreground mt-1">
            Continuous title-chain anomaly, dispute, encumbrance, and valuation risk scoring
          </p>
        </div>
        <Button variant="outline" onClick={() => { refetchSummary(); refetchRecent(); }}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Portfolio summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total assessments</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{summary?.totalAssessments ?? 0}</p></CardContent>
        </Card>
        {(["low", "medium", "high", "critical"] as const).map((band) => (
          <Card key={band}>
            <CardHeader className="pb-2">
              <CardDescription className="capitalize">{band} risk</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline" className={bandStyles[band]}>
                {summary?.byBand?.[band] ?? 0}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Assessment runner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Play className="h-5 w-5" /> Run assessment</CardTitle>
          <CardDescription>Score a parcel before registration, transfer, mortgage perfection, or auction release</CardDescription>
        </CardHeader>
        <CardContent className="flex items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="parcelId">Parcel ID</Label>
            <Input
              id="parcelId"
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
              placeholder="e.g. 1"
              className="w-48"
            />
          </div>
          <Button onClick={handleAssess} disabled={assessMutation.isPending}>
            {assessMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Assess title risk
          </Button>
        </CardContent>
      </Card>

      {/* Latest result */}
      {latest && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5" />
                Parcel #{latest.parcelId} — score {latest.overallScore}/100
              </CardTitle>
              <Badge variant="outline" className={bandStyles[latest.riskBand]}>{latest.riskBand.toUpperCase()}</Badge>
            </div>
            <CardDescription>Assessed {new Date(latest.assessedAt).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              {latest.factors.map((factor) => (
                <div key={factor.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{factor.label}</span>
                    <span className="text-muted-foreground">{factor.score}/100 (weight {factor.weight}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${factor.score >= 75 ? "bg-red-500" : factor.score >= 50 ? "bg-orange-500" : factor.score >= 25 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${factor.score}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{factor.explanation}</p>
                </div>
              ))}
            </div>

            {latest.drivers.length > 0 && (
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" /> Key risk drivers
                </h3>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {latest.drivers.map((driver, i) => <li key={i}>{driver}</li>)}
                </ul>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Recommendations</h3>
              <ul className="list-disc list-inside text-sm space-y-1">
                {latest.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent assessments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent assessments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(recent?.assessments ?? []).map((a) => (
              <div key={a.id} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <p className="font-medium">Parcel #{a.parcelId}{a.transactionId ? ` · Tx #${a.transactionId}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.assessedAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{a.overallScore}</span>
                  <Badge variant="outline" className={bandStyles[a.riskBand]}>{a.riskBand}</Badge>
                </div>
              </div>
            ))}
            {(recent?.assessments ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No assessments yet — run one above.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
