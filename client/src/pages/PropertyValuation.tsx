import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Calculator, TrendingUp, FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";

export default function PropertyValuation() {
  const [valuationMethod, setValuationMethod] = useState("comparative");
  const [parcelId, setParcelId] = useState("");
  const [purpose, setPurpose] = useState("sale");
  const [notes, setNotes] = useState("");
  const [latestResult, setLatestResult] = useState<any>(null);

  const valuationHistoryQuery = trpc.valuations.history.useQuery();
  const marketInsightsQuery = trpc.valuations.marketInsights.useQuery(
    parcelId ? { parcelNumber: parcelId } : undefined as any
  );
  const calculateValuation = trpc.valuations.calculate.useMutation({
    onSuccess: (data) => {
      setLatestResult(data);
      toast.success("Valuation calculated successfully");
      valuationHistoryQuery.refetch();
      marketInsightsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Unable to calculate valuation");
    },
  });
  const createValuationDispute = trpc.valuations.createDispute.useMutation({
    onSuccess: () => {
      toast.success("Valuation dispute filed successfully.");
      setNotes("");
    },
    onError: (error) => {
      toast.error(error.message || "Unable to file valuation dispute.");
    },
  });

  const valuationHistory = useMemo(() => (valuationHistoryQuery.data as any)?.history ?? [], [valuationHistoryQuery.data]);
  const comparableSales = latestResult?.comparableSales ?? [];
  const parcel = latestResult?.parcel;
  const insights = (marketInsightsQuery.data as any) ?? {
    averagePricePerSqm: 0,
    valuationsThisMonth: 0,
    averageTurnaroundDays: 0,
    locationLabel: "Platform-wide",
  };

  const handleCalculate = async () => {
    if (!parcelId.trim()) {
      toast.error("Enter a parcel number to value.");
      return;
    }

    await calculateValuation.mutateAsync({
      parcelNumber: parcelId.trim(),
      method: valuationMethod as any,
      purpose: purpose as any,
    });
  };

  const requestProfessionalValuation = () => {
    toast.success(`Professional valuation request logged for ${parcelId || "selected parcel"}. ${notes ? "Supporting notes captured for the valuer." : ""}`.trim());
  };

  const fileValuationDispute = async () => {
    if (!latestResult?.parcel?.parcelNumber) {
      toast.error("Calculate a valuation before filing a dispute.");
      return;
    }

    const disputeNarrative = notes.trim()
      ? notes.trim()
      : `Requested review of valuation amount ₦${latestResult.estimatedValue.toLocaleString()} for ${latestResult.parcel.parcelNumber}.`;

    await createValuationDispute.mutateAsync({
      parcelNumber: latestResult.parcel.parcelNumber,
      description: disputeNarrative,
      requestedRelief: 'Independent review of the valuation result and supporting comparable sales.',
    });
  };

  const downloadReport = () => {
    if (!latestResult) {
      toast.error("Calculate a valuation before downloading a report.");
      return;
    }

    const report = {
      parcelNumber: latestResult.parcel?.parcelNumber,
      method: latestResult.method,
      purpose: latestResult.purpose,
      estimatedValue: latestResult.estimatedValue,
      valueRange: latestResult.valueRange,
      confidence: latestResult.confidence,
      valuationDate: latestResult.valuationDate,
      comparableSales: latestResult.comparableSales,
      factors: latestResult.factors,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${latestResult.parcel?.parcelNumber || "valuation"}-report.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("Valuation report downloaded.");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Property Valuation</h1>
          <div className="w-24"></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4">Property Valuation Module</h1>
            <p className="text-lg text-muted-foreground mb-6">
              Calculate parcel benchmark values using comparative sales, method-specific adjustments, and repository-backed market context.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calculator className="h-5 w-5" />
                    Calculate Valuation
                  </CardTitle>
                  <CardDescription>
                    Enter a parcel number and valuation objective to generate an instant estimate.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="parcelId">Parcel Number</Label>
                    <Input
                      id="parcelId"
                      placeholder="Enter parcel number (e.g., LG-VI-2024-001)"
                      value={parcelId}
                      onChange={(e) => setParcelId(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="method">Valuation Method</Label>
                    <Select value={valuationMethod} onValueChange={setValuationMethod}>
                      <SelectTrigger id="method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comparative">Comparative Sales Analysis</SelectItem>
                        <SelectItem value="income">Income Approach</SelectItem>
                        <SelectItem value="cost">Cost Approach</SelectItem>
                        <SelectItem value="avm">Automated Valuation Model (AVM)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="purpose">Purpose of Valuation</Label>
                    <Select value={purpose} onValueChange={setPurpose}>
                      <SelectTrigger id="purpose">
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sale">Sale/Purchase</SelectItem>
                        <SelectItem value="mortgage">Mortgage/Financing</SelectItem>
                        <SelectItem value="tax">Tax Assessment</SelectItem>
                        <SelectItem value="insurance">Insurance</SelectItem>
                        <SelectItem value="legal">Legal/Litigation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any additional information about the property..."
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <div className="flex gap-4">
                    <Button onClick={handleCalculate} className="gap-2" disabled={calculateValuation.isPending}>
                      {calculateValuation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                      Calculate Instant Valuation
                    </Button>
                    <Button variant="outline" onClick={requestProfessionalValuation} className="gap-2">
                      <FileText className="h-4 w-4" />
                      Request Professional Valuation
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {latestResult && (
                <Card className="border-2 border-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Estimated Property Value
                    </CardTitle>
                    <CardDescription>
                      Based on {latestResult.method} for {latestResult.purpose} purposes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-primary mb-4">
                      ₦{latestResult.estimatedValue.toLocaleString()}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Price per m²:</span>
                        <p className="font-semibold">₦{latestResult.pricePerSqm.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Confidence Level:</span>
                        <p className="font-semibold">{latestResult.confidence}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Value Range:</span>
                        <p className="font-semibold">
                          ₦{latestResult.valueRange.low.toLocaleString()} - ₦{latestResult.valueRange.high.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Valuation Date:</span>
                        <p className="font-semibold">{format(new Date(latestResult.valuationDate), "MMM dd, yyyy")}</p>
                      </div>
                    </div>
                    {parcel && (
                      <div className="grid grid-cols-2 gap-4 text-sm mt-6 pt-6 border-t">
                        <div>
                          <span className="text-muted-foreground">Parcel:</span>
                          <p className="font-semibold">{parcel.parcelNumber}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Area:</span>
                          <p className="font-semibold">{parcel.areaSquareMeters.toLocaleString()} m²</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Location:</span>
                          <p className="font-semibold">{parcel.lga}, {parcel.state}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Registry Status:</span>
                          <p className="font-semibold capitalize">{String(parcel.status).replace(/_/g, " ")}</p>
                        </div>
                      </div>
                    )}
                    <div className="mt-6 pt-6 border-t">
                      <h4 className="font-semibold mb-3">Factors Considered</h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {latestResult.factors.map((factor: string) => (
                          <li key={factor}>✓ {factor}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <Button className="flex-1 gap-2" onClick={downloadReport}>
                        <Download className="h-4 w-4" />
                        Download Valuation Report
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={fileValuationDispute}
                        disabled={createValuationDispute.isPending}
                      >
                        {createValuationDispute.isPending ? 'Filing Dispute...' : 'Dispute This Valuation'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Comparable Sales Analysis</CardTitle>
                  <CardDescription>
                    Recent repository-backed parcel benchmarks and transaction-linked comparable sales.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {comparableSales.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Calculate a valuation to view comparable sales for the selected parcel.</p>
                    ) : (
                      comparableSales.map((sale: any) => (
                        <div key={sale.parcelNumber} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-semibold">{sale.parcelNumber}</p>
                              <p className="text-sm text-muted-foreground">{sale.address}</p>
                            </div>
                            <Badge variant="outline">{format(new Date(sale.saleDate), "MMM dd, yyyy")}</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm mt-3">
                            <div>
                              <span className="text-muted-foreground">Area:</span>
                              <p className="font-semibold">{sale.area.toLocaleString()} m²</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Sale Price:</span>
                              <p className="font-semibold">₦{sale.salePrice.toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Price/m²:</span>
                              <p className="font-semibold">₦{sale.pricePerSqm.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Valuation History</CardTitle>
                  <CardDescription>
                    Recent parcel valuation activity recorded by the valuation service.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {valuationHistory.map((valuation: any) => (
                      <div key={valuation.id} className="border-b pb-4 last:border-0">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-sm">{valuation.parcelNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(valuation.date), "MMM dd, yyyy")}
                            </p>
                          </div>
                          <Badge variant={valuation.status === "approved" ? "default" : "secondary"}>
                            {valuation.status}
                          </Badge>
                        </div>
                        <p className="text-lg font-bold text-primary">₦{valuation.value.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {valuation.method} by {valuation.valuerName}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Market Insights</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Average Price ({insights.locationLabel})</p>
                    <p className="text-2xl font-bold">₦{insights.averagePricePerSqm.toLocaleString()}/m²</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Valuations (This Month)</p>
                    <p className="text-2xl font-bold">{insights.valuationsThisMonth.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Avg. Turnaround Time</p>
                    <p className="text-2xl font-bold">{insights.averageTurnaroundDays} days</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
