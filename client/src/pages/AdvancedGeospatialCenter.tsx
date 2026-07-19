import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapLibreParcelWorkbench } from '@/components/MapLibreParcelWorkbench';
import { AlertTriangle, BrainCircuit, Compass, Layers3, Map, MapPinned, Radar, Route, Satellite, Trees, Waves } from 'lucide-react';

export default function AdvancedGeospatialCenter() {
  const [parcelIdInput, setParcelIdInput] = useState('1');
  const [activeParcelId, setActiveParcelId] = useState(1);

  const workbenchQuery = trpc.geospatialIntelligence.parcelWorkbench.useQuery(
    { parcelId: activeParcelId },
    { retry: false }
  );
  const hotspotQuery = trpc.geospatialIntelligence.portfolioHotspots.useQuery();
  const runtimeStatusQuery = trpc.geospatialIntelligence.runtimeStatus.useQuery();

  const workbench = workbenchQuery.data as any;
  const innovations = workbench?.innovations ?? {};
  const innovationCards = useMemo(() => Object.values(innovations) as any[], [innovations]);
  const lakehouseInsights = workbench?.lakehouseSpatialWorkbench?.sedona_aligned_insights;
  const runtimeStatus = workbench?.runtimeStatus ?? runtimeStatusQuery.data;

  return (
    <div className="container space-y-6 py-8">
      <div>
        <h1 className="text-3xl font-bold">Advanced Geospatial Center</h1>
        <p className="mt-2 text-muted-foreground">
          A unified geospatial workbench for parcel intelligence, MapLibre-based review, Sedona-aligned spatial analytics, field route planning, and AI-assisted surveying insight.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Implemented innovations</p><p className="mt-2 text-2xl font-semibold">10</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Opportunity leaders</p><p className="mt-2 text-2xl font-semibold">{hotspotQuery.data?.opportunityLeaders?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Risk leaders</p><p className="mt-2 text-2xl font-semibold">{hotspotQuery.data?.riskLeaders?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Workbench parcel</p><p className="mt-2 text-2xl font-semibold">{workbench?.parcel?.parcelNumber ?? '—'}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Spatial runtime</p><p className="mt-2 text-2xl font-semibold">{runtimeStatus?.execution_mode ?? '—'}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle><Map className="mr-2 inline h-4 w-4" />Geospatial workbench controls</CardTitle>
            <CardDescription>Select a parcel and navigate to the linked geospatial workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Parcel ID</Label>
                <Input value={parcelIdInput} onChange={(e) => setParcelIdInput(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => setActiveParcelId(Number(parcelIdInput) || 1)}>
                  Load parcel workbench
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild><Link href={`/building-3d-visualization?parcelId=${activeParcelId}`}>Open 3D Visualization</Link></Button>
              <Button variant="outline" asChild><Link href="/geo-analytics">Open Geo Analytics</Link></Button>
              <Button variant="outline" asChild><Link href="/drone-processing">Open Drone Processing</Link></Button>
              <Button variant="outline" asChild><Link href={`/parcels/${activeParcelId}/map`}>Open Parcel Map</Link></Button>
            </div>
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              This workbench now integrates a dedicated MapLibre surface, Sedona-aligned lakehouse analytics, and AI/CV/NLP-ready photo-analysis hooks alongside the earlier geospatial intelligence features.
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline">MapLibre enabled</Badge>
              <Badge variant="outline">Sedona-aligned analytics</Badge>
              <Badge variant="outline">AI / CV / NLP enabled</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><Satellite className="mr-2 inline h-4 w-4" />MapLibre parcel workbench</CardTitle>
            <CardDescription>A live MapLibre-compatible parcel review surface with the anchor parcel and nearby context.</CardDescription>
          </CardHeader>
          <CardContent>
            <MapLibreParcelWorkbench
              parcel={workbench?.parcel ? { ...workbench.parcel, geometryGeoJSON: workbench?.parcel?.geometryGeoJSON } : undefined}
              nearbyParcels={workbench?.nearbyParcels ?? []}
              className="h-[460px] w-full rounded-xl border"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle><Radar className="mr-2 inline h-4 w-4" />Parcel intelligence summary</CardTitle>
            <CardDescription>Current parcel posture synthesized from the geospatial intelligence and lakehouse layers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4">
              <p className="mb-1 font-medium text-foreground"><MapPinned className="mr-2 inline h-4 w-4" />Current parcel profile</p>
              <p>
                {workbench?.parcel
                  ? `${workbench.parcel.parcelNumber} in ${workbench.parcel.lga}, ${workbench.parcel.state} is currently ${String(workbench.parcel.status).replace(/_/g, ' ')} with an estimated value of ₦${Number(workbench.parcel.estimatedValue || 0).toLocaleString()}.`
                  : 'Load a parcel to view its geospatial intelligence summary.'}
              </p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="mb-1 font-medium text-foreground"><Waves className="mr-2 inline h-4 w-4" />Environmental resilience</p>
              <p>{innovations.environmentalResilience?.explanation ?? 'Environmental resilience insight will appear here.'}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="mb-1 font-medium text-foreground"><Trees className="mr-2 inline h-4 w-4" />Development opportunity</p>
              <p>
                Best transition path: <Badge variant="outline" className="ml-2">{innovations.developmentOpportunity?.bestScenario ?? '—'}</Badge>
              </p>
              <p className="mt-2">Opportunity band: {innovations.developmentOpportunity?.opportunityBand ?? '—'}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="mb-1 font-medium text-foreground"><Route className="mr-2 inline h-4 w-4" />Field mission pack</p>
              <p>
                Complexity score: <Badge variant="outline" className="ml-2">{innovations.fieldMissionPack?.complexityScore ?? '—'}</Badge>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><BrainCircuit className="mr-2 inline h-4 w-4" />Sedona-aligned and AI runtime</CardTitle>
            <CardDescription>Operational status of the new spatial analytics and AI-enrichment layer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4">
              <p className="font-medium text-foreground">Runtime mode</p>
              <p className="mt-2">{runtimeStatus?.execution_mode ?? 'Unavailable'}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="font-medium text-foreground">Sedona Python</p>
                <p className="mt-2">{runtimeStatus?.sedona_python_available ? 'Available' : 'Not available in current runtime'}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="font-medium text-foreground">PySpark</p>
                <p className="mt-2">{runtimeStatus?.pyspark_available ? 'Available' : 'Not available in current runtime'}</p>
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium text-foreground">AI feature posture</p>
              <p className="mt-2">The backend now exposes geospatial photo-analysis hooks, EXIF-aware enrichment, and survey-oriented structured outputs through the geospatial intelligence layer.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle><Layers3 className="mr-2 inline h-4 w-4" />Ten geospatial innovations</CardTitle>
          <CardDescription>Each tile reflects a repository-feasible innovation surfaced from the parcel intelligence backend.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {innovationCards.map((innovation: any) => (
              <div key={innovation.title} className="rounded-xl border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-semibold text-foreground">{innovation.title}</p>
                  {'score' in innovation ? <Badge variant="outline">{innovation.score}</Badge> : null}
                </div>
                {'explanation' in innovation && innovation.explanation ? (
                  <p className="text-sm text-muted-foreground">{innovation.explanation}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {'count' in innovation ? `${innovation.count} comparable or supporting records detected.` : 'This innovation contributes to parcel-level geospatial decision support.'}
                  </p>
                )}
                {'band' in innovation && innovation.band ? <p className="mt-2 text-sm text-foreground capitalize">Band: {innovation.band}</p> : null}
                {'opportunityBand' in innovation && innovation.opportunityBand ? <p className="mt-2 text-sm text-foreground capitalize">Opportunity: {innovation.opportunityBand}</p> : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle><Compass className="mr-2 inline h-4 w-4" />Recommended field route</CardTitle>
            <CardDescription>Nearest-neighbor route pack for parcel review and nearby context checks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(innovations.fieldMissionPack?.recommendedStops ?? []).map((stop: any) => (
              <div key={`${stop.id}-${stop.stopOrder}`} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium">Stop {stop.stopOrder}</span>
                <span className="text-sm text-muted-foreground">{stop.parcelNumber}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><AlertTriangle className="mr-2 inline h-4 w-4" />Sedona-aligned hotspot board</CardTitle>
            <CardDescription>Lakehouse clustering, nearest-neighbor, and hotspot context combined with portfolio opportunity and risk ranking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="font-medium text-foreground">Cluster count</p>
                <p className="mt-2 text-2xl font-semibold">{lakehouseInsights?.cluster_count ?? 0}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="font-medium text-foreground">Hotspot score</p>
                <p className="mt-2 text-2xl font-semibold">{lakehouseInsights?.hotspot_score ?? 0}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 font-medium text-foreground">Nearest neighbors</p>
              <div className="space-y-2">
                {(lakehouseInsights?.nearest_neighbors ?? []).map((item: any) => (
                  <div key={`neighbor-${item.parcel_id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{item.parcel_number}</span>
                    <Badge variant="outline">{item.distance_km} km</Badge>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
