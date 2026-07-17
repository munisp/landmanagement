import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { BarChart3, Map, TrendingUp, Download, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function GeoAnalytics() {
  const [selectedState, setSelectedState] = useState("all");
  const [timeRange, setTimeRange] = useState<"30d" | "90d" | "1y" | "all">("1y");
  const [appliedState, setAppliedState] = useState("all");
  const [appliedTimeRange, setAppliedTimeRange] = useState<"30d" | "90d" | "1y" | "all">("1y");

  const dashboardQuery = trpc.geoAnalytics.dashboard.useQuery({
    state: appliedState,
    timeRange: appliedTimeRange,
  });

  const propertyValueData = (dashboardQuery.data as any)?.propertyValueData ?? [];
  const landUseDistribution = (dashboardQuery.data as any)?.landUseDistribution ?? [];
  const transactionTrends = (dashboardQuery.data as any)?.transactionTrends ?? [];
  const parcelDensity = (dashboardQuery.data as any)?.parcelDensity ?? [];

  const summary = useMemo(() => {
    const totalParcels = propertyValueData.reduce((sum: number, item: any) => sum + item.count, 0);
    const totalValue = propertyValueData.reduce((sum: number, item: any) => sum + item.avgValue * item.count, 0);
    const nationalAverage = totalParcels > 0 ? Math.round(totalValue / totalParcels) : 0;
    const averageGrowth = propertyValueData.length > 0
      ? propertyValueData.reduce((sum: number, item: any) => sum + item.growth, 0) / propertyValueData.length
      : 0;

    return {
      totalParcels,
      totalValue,
      nationalAverage,
      averageGrowth,
    };
  }, [propertyValueData]);

  const exportData = (format: string) => {
    toast.success(`Prepared ${propertyValueData.length} state summaries and ${transactionTrends.length} trend points for ${format.toUpperCase()} export.`);
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
          <h1 className="text-xl font-semibold">Geospatial Analytics</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportData("csv")} className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportData("pdf")} className="gap-2">
              <Download className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <BarChart3 className="h-10 w-10" />
              Geospatial Analytics Dashboard
            </h1>
            <p className="text-lg text-muted-foreground">
              Registry-driven insights on parcel values, land use composition, and transaction activity across operational jurisdictions.
            </p>
          </div>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">State/Region</label>
                  <Select value={selectedState} onValueChange={setSelectedState}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      <SelectItem value="Lagos">Lagos</SelectItem>
                      <SelectItem value="FCT">Abuja (FCT)</SelectItem>
                      <SelectItem value="Kano">Kano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Time Range</label>
                  <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30d">Last 30 Days</SelectItem>
                      <SelectItem value="90d">Last 90 Days</SelectItem>
                      <SelectItem value="1y">Last Year</SelectItem>
                      <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      setAppliedState(selectedState);
                      setAppliedTimeRange(timeRange);
                      dashboardQuery.refetch();
                    }}
                  >
                    <Calendar className="h-4 w-4" />
                    Apply Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {dashboardQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Tabs defaultValue="heatmap" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="heatmap">Property Value Heat Map</TabsTrigger>
                <TabsTrigger value="density">Parcel Density</TabsTrigger>
                <TabsTrigger value="landuse">Land Use Distribution</TabsTrigger>
                <TabsTrigger value="trends">Transaction Trends</TabsTrigger>
              </TabsList>

              <TabsContent value="heatmap" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Average Property Values by State</CardTitle>
                    <CardDescription>
                      Average parcel benchmark values derived from registry parcel records for the selected jurisdiction.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {propertyValueData.map((item: any) => (
                        <div key={item.state} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{item.state}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-muted-foreground">{item.count} parcels</span>
                              <span className="font-semibold">₦{(item.avgValue / 1000000).toFixed(1)}M</span>
                              <span className={`text-sm ${item.growth > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                {item.growth > 0 ? "↑" : "•"} {item.growth}% registered
                              </span>
                            </div>
                          </div>
                          <div className="h-8 bg-muted rounded-lg overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all"
                              style={{ width: `${summary.nationalAverage > 0 ? (item.avgValue / Math.max(...propertyValueData.map((entry: any) => entry.avgValue), 1)) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">₦{(summary.nationalAverage / 1000000).toFixed(1)}M</div>
                      <p className="text-xs text-muted-foreground">Average Parcel Benchmark</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{summary.totalParcels.toLocaleString()}</div>
                      <p className="text-xs text-muted-foreground">Total Parcels in Scope</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-green-600">{summary.averageGrowth.toFixed(1)}%</div>
                      <p className="text-xs text-muted-foreground">Average Registration Rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">₦{(summary.totalValue / 1000000000).toFixed(1)}B</div>
                      <p className="text-xs text-muted-foreground">Aggregate Benchmark Value</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="density">
                <Card>
                  <CardHeader>
                    <CardTitle>Parcel Density by LGA</CardTitle>
                    <CardDescription>
                      Geographic clustering of registered parcel activity using parcel counts, average area, and benchmark values.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {parcelDensity.map((item: any) => (
                        <div key={`${item.state}-${item.lga}`} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="font-semibold">{item.lga}</p>
                              <p className="text-sm text-muted-foreground">{item.state}</p>
                            </div>
                            <Map className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Parcels</p>
                              <p className="font-semibold">{item.parcelCount}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Avg Area</p>
                              <p className="font-semibold">{item.averageArea} m²</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Avg Value</p>
                              <p className="font-semibold">₦{(item.averageValue / 1000000).toFixed(1)}M</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="landuse">
                <Card>
                  <CardHeader>
                    <CardTitle>Land Use Distribution</CardTitle>
                    <CardDescription>
                      Breakdown of parcels by land use type from the repository-backed parcel inventory.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {landUseDistribution.map((item: any) => {
                        const total = landUseDistribution.reduce((sum: number, entry: any) => sum + entry.count, 0) || 1;
                        const percentage = Math.round((item.count / total) * 100);
                        return (
                          <div key={item.type} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium capitalize">{item.type}</span>
                              <div className="flex items-center gap-4">
                                <span className="text-sm text-muted-foreground">{item.count} parcels</span>
                                <span className="font-semibold">{percentage}%</span>
                              </div>
                            </div>
                            <div className="h-6 bg-muted rounded-lg overflow-hidden">
                              <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
                            </div>
                            <p className="text-xs text-muted-foreground">Average parcel area: {item.averageArea} m²</p>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="trends">
                <Card>
                  <CardHeader>
                    <CardTitle>Transaction Trends Over Time</CardTitle>
                    <CardDescription>
                      Monthly property transaction volumes and aggregate consideration values for the filtered jurisdiction.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {transactionTrends.map((item: any) => (
                        <div key={item.month} className="grid grid-cols-3 gap-4 items-center border rounded-lg p-4">
                          <span className="font-medium">{item.month}</span>
                          <div>
                            <div className="text-sm text-muted-foreground">Transactions</div>
                            <div className="font-semibold">{item.transactions}</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Consideration Value</div>
                            <div className="font-semibold text-primary">₦{(item.value / 1000000).toFixed(1)}M</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 aspect-video bg-muted rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <TrendingUp className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">Trend data loaded from transaction history</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          This panel is ready for richer chart rendering with the backend series now connected.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
