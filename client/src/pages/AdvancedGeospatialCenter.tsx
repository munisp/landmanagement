import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Compass, Layers3, Map, MapPinned, Radar, Route, Trees, Waves } from 'lucide-react';

export default function AdvancedGeospatialCenter() {
  const [parcelIdInput, setParcelIdInput] = useState('1');
  const [activeParcelId, setActiveParcelId] = useState(1);

  const workbenchQuery = trpc.geospatialIntelligence.parcelWorkbench.useQuery(
    { parcelId: activeParcelId },
    { retry: false }
  );
  const hotspotQuery = trpc.geospatialIntelligence.portfolioHotspots.useQuery();

  const workbench = workbenchQuery.data as any;
  const innovations = workbench?.innovations ?? {};
  const innovationCards = useMemo(() => Object.values(innovations) as any[], [innovations]);

  return (
    <div className="container space-y-6 py-8">
      <div>
        <h1 className="text-3xl font-bold">Advanced Geospatial Center</h1>
        <p className="mt-2 text-muted-foreground">
          A unified geospatial workbench for parcel intelligence, field route planning, boundary conflict watch, scenario simulation, hotspot prioritization, and map-driven decision support.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Implemented innovations</p><p className="mt-2 text-2xl font-semibold">10</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Opportunity leaders</p><p className="mt-2 text-2xl font-semibold">{hotspotQuery.data?.opportunityLeaders?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Risk leaders</p><p className="mt-2 text-2xl font-semibold">{hotspotQuery.data?.riskLeaders?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Workbench parcel</p><p className="mt-2 text-2xl font-semibold">{workbench?.parcel?.parcelNumber ?? '—'}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
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
              The workbench aggregates ten innovations: nearby comparables, adjacency pressure, boundary conflict watch, access index, environmental resilience, land-use transition scoring, amenity uplift, field mission routing, transaction heat, and overall geospatial readiness.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle><Radar className="mr-2 inline h-4 w-4" />Parcel intelligence summary</CardTitle>
            <CardDescription>Current parcel posture synthesized from the new geospatial intelligence layer.</CardDescription>
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
            <CardTitle><AlertTriangle className="mr-2 inline h-4 w-4" />Portfolio hotspot boards</CardTitle>
            <CardDescription>Quick visibility into geospatial opportunity and risk concentration across the registry portfolio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 font-medium text-foreground">Opportunity leaders</p>
              <div className="space-y-2">
                {(hotspotQuery.data?.opportunityLeaders ?? []).slice(0, 5).map((item: any) => (
                  <div key={`opp-${item.parcelId}`} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{item.parcelNumber}</span>
                    <Badge variant="outline">{item.opportunityScore}</Badge>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-medium text-foreground">Risk leaders</p>
              <div className="space-y-2">
                {(hotspotQuery.data?.riskLeaders ?? []).slice(0, 5).map((item: any) => (
                  <div key={`risk-${item.parcelId}`} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{item.parcelNumber}</span>
                    <Badge variant="secondary">{item.riskScore}</Badge>
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
