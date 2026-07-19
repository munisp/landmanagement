import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Waves, MapPinned, Ruler } from 'lucide-react';

export default function CoastalZoneCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.coastal.overview.useQuery();
  const [parcelId, setParcelId] = useState(1403);
  const [erosionRisk, setErosionRisk] = useState('high seasonal retreat');
  const [setbackMeters, setSetbackMeters] = useState(35);
  const [beachAccessPlan, setBeachAccessPlan] = useState('Maintain a 6m public access corridor and raised boardwalk path.');
  const [marineProtectedArea, setMarineProtectedArea] = useState('Coral nursery buffer zone');
  const [developmentPermitStatus, setDevelopmentPermitStatus] = useState('conditional review with dune setback enforcement');
  const [seaLevelImpactAssessment, setSeaLevelImpactAssessment] = useState('0.45m rise scenario requires elevated structure platform and flood-resilient utilities.');
  const [coastalInfrastructure, setCoastalInfrastructure] = useState('revetment maintenance, drainage gate upgrade, and coastal road shoulder reinforcement');

  const refresh = async () => {
    await utils.coastal.overview.invalidate();
  };

  const createZone = trpc.coastal.createZone.useMutation({ onSuccess: async () => { toast.success('Coastal zone workflow created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create coastal zone') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading coastal zone workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Coastal Zone Center</h1>
        <p className="text-muted-foreground mt-2">Track coastal erosion, setback enforcement, beach access, marine protected areas, permit readiness, sea-level impact, and coastal infrastructure constraints.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Tracked zones</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.trackedZones ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Average setback</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.averageSetback ?? 0}m</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><Waves className="inline mr-2 h-4 w-4" />Coastal zone workflow</CardTitle><CardDescription>Create coastal records with erosion, setback, access, protected-area, permit, sea-level, and infrastructure data.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={parcelId} onChange={(e) => setParcelId(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Erosion risk</Label><Input value={erosionRisk} onChange={(e) => setErosionRisk(e.target.value)} /></div>
              <div className="space-y-2"><Label>Setback (m)</Label><Input type="number" value={setbackMeters} onChange={(e) => setSetbackMeters(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Marine protected area</Label><Input value={marineProtectedArea} onChange={(e) => setMarineProtectedArea(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Beach access management</Label><Input value={beachAccessPlan} onChange={(e) => setBeachAccessPlan(e.target.value)} /></div>
            <div className="space-y-2"><Label>Coastal development permit</Label><Input value={developmentPermitStatus} onChange={(e) => setDevelopmentPermitStatus(e.target.value)} /></div>
            <div className="space-y-2"><Label>Sea-level impact assessment</Label><Input value={seaLevelImpactAssessment} onChange={(e) => setSeaLevelImpactAssessment(e.target.value)} /></div>
            <div className="space-y-2"><Label>Coastal infrastructure tracking</Label><Input value={coastalInfrastructure} onChange={(e) => setCoastalInfrastructure(e.target.value)} /></div>
            <Button onClick={() => createZone.mutate({ parcelId, erosionRisk, setbackMeters, beachAccessPlan, marineProtectedArea, developmentPermitStatus, seaLevelImpactAssessment, coastalInfrastructure })} disabled={createZone.isPending}>Create Coastal Workflow</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><MapPinned className="inline mr-2 h-4 w-4" />Zone register</CardTitle><CardDescription>Current coastal erosion posture, setback enforcement, protected areas, and infrastructure risk controls.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(data?.zones || []).map((item: any) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Parcel {item.parcelId}</p>
                    <p className="text-sm text-muted-foreground">{item.erosionRisk}</p>
                  </div>
                  <Badge variant="outline"><Ruler className="mr-1 inline h-3 w-3" />{item.setbackMeters}m</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Beach access: {item.beachAccessPlan}</p>
                <p className="mt-1 text-sm text-muted-foreground">Marine area: {item.marineProtectedArea}</p>
                <p className="mt-1 text-sm text-muted-foreground">Permit: {item.developmentPermitStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Sea-level: {item.seaLevelImpactAssessment}</p>
                <p className="mt-1 text-sm text-muted-foreground">Infrastructure: {item.coastalInfrastructure}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
