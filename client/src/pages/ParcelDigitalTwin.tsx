import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Box, Loader2, Play, FlaskConical, Sun, Waves, Building2, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const bandStyles: Record<string, string> = {
  excellent: "bg-green-100 text-green-800 border-green-200",
  good: "bg-blue-100 text-blue-800 border-blue-200",
  marginal: "bg-yellow-100 text-yellow-800 border-yellow-200",
  poor: "bg-red-100 text-red-800 border-red-200",
};

export default function ParcelDigitalTwin() {
  const [parcelId, setParcelId] = useState("");
  const [valuationChangePct, setValuationChangePct] = useState("10");
  const [floodRiskLevel, setFloodRiskLevel] = useState<"none" | "low" | "moderate" | "high" | "severe">("low");
  const [irradiance, setIrradiance] = useState("5.2");

  const { data: twin, refetch: refetchTwin } = trpc.parcelDigitalTwin.twin.useQuery(
    { parcelId: Number(parcelId) || 0 },
    { enabled: Number(parcelId) > 0 }
  );

  const scenarioMutation = trpc.parcelDigitalTwin.runScenario.useMutation({
    onError: (error) => toast.error(`Scenario failed: ${error.message}`),
  });

  const result = scenarioMutation.data;

  const handleRun = () => {
    const id = Number(parcelId);
    if (!id || id <= 0) {
      toast.error("Enter a valid parcel ID");
      return;
    }
    scenarioMutation.mutate({
      parcelId: id,
      scenario: {
        name: `Lab run ${new Date().toLocaleTimeString()}`,
        valuationChangePct: Number(valuationChangePct) || 0,
        floodRiskLevel,
        solarIrradianceKwhM2Day: Number(irradiance) || 5.2,
      },
    });
  };

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Box className="h-8 w-8 text-primary" />
          Parcel Digital Twin & Scenario Lab
        </h1>
        <p className="text-muted-foreground mt-1">
          Valuation sensitivity, flood exposure, solar yield, zoning and development feasibility simulation
        </p>
      </div>

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Scenario parameters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="space-y-2">
            <Label>Parcel ID</Label>
            <Input value={parcelId} onChange={(e) => setParcelId(e.target.value)} placeholder="e.g. 1" />
          </div>
          <div className="space-y-2">
            <Label>Market shift (%)</Label>
            <Input type="number" value={valuationChangePct} onChange={(e) => setValuationChangePct(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Flood risk level</Label>
            <select
              className="w-full border rounded-md h-9 px-3 bg-background"
              value={floodRiskLevel}
              onChange={(e) => setFloodRiskLevel(e.target.value as any)}
            >
              {["none", "low", "moderate", "high", "severe"].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Solar irradiance (kWh/m²/day)</Label>
            <Input type="number" step="0.1" value={irradiance} onChange={(e) => setIrradiance(e.target.value)} />
          </div>
          <Button onClick={handleRun} disabled={scenarioMutation.isPending}>
            {scenarioMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Run scenario
          </Button>
        </CardContent>
      </Card>

      {/* Twin profile */}
      {twin && (
        <Card>
          <CardHeader>
            <CardTitle>Digital twin — {twin.parcelNumber}</CardTitle>
            <CardDescription>
              {twin.state} · {twin.lga} · {twin.landUseType} · {twin.areaSquareMeters.toLocaleString()} m² · status {twin.status}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground">Estimated value</p><p className="text-lg font-bold">{twin.estimatedValue === null ? 'Not yet appraised' : `₦${twin.estimatedValue.toLocaleString()}`}</p></div>
            <div><p className="text-muted-foreground">Open disputes</p><p className="text-lg font-bold">{twin.openDisputes}</p></div>
            <div><p className="text-muted-foreground">Transactions</p><p className="text-lg font-bold">{twin.transactionCount}</p></div>
            <div><p className="text-muted-foreground">Elevation / amenity signal</p><p className="text-lg font-bold">{twin.elevationSignal} / {twin.amenitySignal}</p></div>
          </CardContent>
        </Card>
      )}

      {/* Scenario result */}
      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Scenario value</CardDescription></CardHeader>
              <CardContent>
                <p className="text-xl font-bold">₦{result.valuation.scenarioValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{result.valuation.deltaPct}% vs baseline</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Waves className="h-4 w-4" /> Flood exposure</CardDescription></CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{result.flood.exposureScore}/100</p>
                <p className="text-xs text-muted-foreground">EAL ₦{result.flood.expectedAnnualLoss.toLocaleString()}/yr</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Sun className="h-4 w-4" /> Solar yield</CardDescription></CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{result.solar.annualYieldKwh.toLocaleString()} kWh/yr</p>
                <p className="text-xs text-muted-foreground">payback {result.solar.paybackYears ?? "—"} yrs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Building2 className="h-4 w-4" /> Feasibility</CardDescription></CardHeader>
              <CardContent className="flex items-center gap-2">
                <p className="text-xl font-bold">{result.feasibility.score}</p>
                <Badge variant="outline" className={bandStyles[result.feasibility.band]}>{result.feasibility.band}</Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Model explanations</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="font-medium">Valuation:</span> {result.valuation.explanation}</p>
              <p><span className="font-medium">Flood:</span> {result.flood.explanation}</p>
              <p><span className="font-medium">Solar:</span> {result.solar.explanation}</p>
              <p><span className="font-medium">Zoning:</span> {result.zoning.explanation} (approval probability {result.zoning.approvalProbabilityPct}%)</p>
              <p><span className="font-medium">Infrastructure:</span> {result.infrastructure.explanation}</p>
              <p className="pt-2 border-t"><span className="font-medium">Recommendation:</span> {result.feasibility.recommendation}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
