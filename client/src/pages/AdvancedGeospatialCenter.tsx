import { Link } from 'wouter';
import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Map, Mountain, Radar, Trees, Waves } from 'lucide-react';

export default function AdvancedGeospatialCenter() {
  const [parcelId, setParcelId] = useState('1101');
  const [historicalYear, setHistoricalYear] = useState('2020');
  const [satelliteChangeNote, setSatelliteChangeNote] = useState('Recent imagery suggests additional impervious surface along the southwest edge.');
  const [vegetationIndex, setVegetationIndex] = useState(0.62);
  const [boundaryConflictRisk, setBoundaryConflictRisk] = useState('moderate');
  const { data: heatmap } = trpc.executiveAnalytics.getGeospatialHeatmap.useQuery({});
  const { data: parcelResults } = trpc.parcels.geospatialSearch.useQuery({ centerLat: 6.5244, centerLng: 3.3792, radiusKm: 5, limit: 10 });

  const hotspotCount = heatmap?.hotspots?.length ?? 0;
  const nearbyCount = parcelResults?.length ?? 0;
  const historicalSummary = useMemo(() => `Historical review baseline ${historicalYear}: parcel growth, hotspot intensity, and surrounding land-use shifts are compared against the current geospatial snapshot for parcel ${parcelId}.`, [historicalYear, parcelId]);
  const vegetationClass = vegetationIndex >= 0.6 ? 'High vegetation cover' : vegetationIndex >= 0.35 ? 'Moderate vegetation cover' : 'Low vegetation cover';

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Advanced Geospatial Center</h1>
        <p className="text-muted-foreground mt-2">Coordinate 3D visualization, historical change review, heatmaps, spatial conflict detection, drone boundary extraction review, vegetation analysis, and flood-risk interpretation from one geospatial workspace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Heatmap hotspots</p><p className="mt-2 text-2xl font-semibold">{hotspotCount}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Nearby parcels</p><p className="mt-2 text-2xl font-semibold">{nearbyCount}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Vegetation class</p><p className="mt-2 text-2xl font-semibold">{vegetationClass}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><Map className="inline mr-2 h-4 w-4" />Geospatial analysis controls</CardTitle><CardDescription>Adjust parcel focus, historical baseline, vegetation posture, and conflict review notes.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Parcel ID</Label><Input value={parcelId} onChange={(e) => setParcelId(e.target.value)} /></div>
              <div className="space-y-2"><Label>Historical baseline year</Label><Input value={historicalYear} onChange={(e) => setHistoricalYear(e.target.value)} /></div>
              <div className="space-y-2"><Label>Vegetation index</Label><Input type="number" step="0.01" value={vegetationIndex} onChange={(e) => setVegetationIndex(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Conflict risk</Label><Input value={boundaryConflictRisk} onChange={(e) => setBoundaryConflictRisk(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Satellite change detection note</Label><Input value={satelliteChangeNote} onChange={(e) => setSatelliteChangeNote(e.target.value)} /></div>
            <div className="flex flex-wrap gap-3">
              <Button asChild><Link href={`/building-3d-visualization?parcelId=${parcelId}`}>Open 3D Visualization</Link></Button>
              <Button variant="outline" asChild><Link href="/drone-processing">Open Drone Processing</Link></Button>
              <Button variant="outline" asChild><Link href="/geo-analytics">Open Geo Analytics</Link></Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Radar className="inline mr-2 h-4 w-4" />Analysis summary</CardTitle><CardDescription>Current geospatial interpretation using existing platform modules and analyst inputs.</CardDescription></CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1"><Mountain className="inline mr-2 h-4 w-4" />3D and flood-risk review</p><p>Parcel {parcelId} can be reviewed through the 3D visualization workspace for terrain, viewshed, flood layers, and solar context.</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Historical change review</p><p>{historicalSummary}</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Heatmap and clustering</p><p>{hotspotCount} current hotspot clusters detected by the executive analytics heatmap workflow.</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Spatial conflict detection</p><p>Boundary conflict posture is currently assessed as <Badge variant="outline" className="ml-2">{boundaryConflictRisk}</Badge> using parcel overlap review and dispute-oriented mapping workflows.</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1">Change detection and vegetation</p><p>{satelliteChangeNote}</p><p className="mt-2"><Trees className="inline mr-1 h-4 w-4" />Vegetation interpretation: {vegetationClass} (index {vegetationIndex.toFixed(2)}).</p></div>
            <div className="rounded-lg border p-4"><p className="font-medium text-foreground mb-1"><Waves className="inline mr-1 h-4 w-4" />Flood-risk insight</p><p>Flood-risk conditions should be interpreted alongside parcel terrain, environmental clearance data, and coastal or watershed overlays where applicable.</p></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
