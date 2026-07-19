import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Route, Map, Wallet, ClipboardList } from 'lucide-react';

export default function InfrastructureDevelopmentCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.infrastructure.overview.useQuery();
  const [projectName, setProjectName] = useState('Southern Mobility Corridor Upgrade');
  const [roadNetworkSegment, setRoadNetworkSegment] = useState('Corridor Segment S1-S3');
  const [rightOfWayStatus, setRightOfWayStatus] = useState('boundary survey and compensation matrix under review');
  const [projectTrackingStatus, setProjectTrackingStatus] = useState('design and permitting');
  const [utilityCorridor, setUtilityCorridor] = useState('stormwater, fiber, and medium-voltage shared alignment');
  const [landAcquisitionStatus, setLandAcquisitionStatus] = useState('parcel outreach and valuation ongoing');
  const [compensationEstimate, setCompensationEstimate] = useState(165000000);
  const [impactAssessment, setImpactAssessment] = useState('Moderate access disruption requiring phased works, resettlement support, and drainage protection.');

  const refresh = async () => {
    await utils.infrastructure.overview.invalidate();
  };

  const createProject = trpc.infrastructure.createProject.useMutation({ onSuccess: async () => { toast.success('Infrastructure project workflow created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create infrastructure project') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading infrastructure workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Infrastructure Development Center</h1>
        <p className="text-muted-foreground mt-2">Track road network mapping, right-of-way management, infrastructure projects, utility corridors, land acquisition, compensation, and impact assessments.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Tracked projects</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.trackedProjects ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total compensation estimate</p><p className="mt-2 text-2xl font-semibold">₦{(data?.metrics?.totalCompensationEstimate ?? 0).toLocaleString()}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><ClipboardList className="inline mr-2 h-4 w-4" />Infrastructure project workflow</CardTitle><CardDescription>Create project records with mapping, corridor, acquisition, compensation, and impact details.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Project name</Label><Input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Road network segment</Label><Input value={roadNetworkSegment} onChange={(e) => setRoadNetworkSegment(e.target.value)} /></div><div className="space-y-2"><Label>Right-of-way status</Label><Input value={rightOfWayStatus} onChange={(e) => setRightOfWayStatus(e.target.value)} /></div></div>
            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Project tracking status</Label><Input value={projectTrackingStatus} onChange={(e) => setProjectTrackingStatus(e.target.value)} /></div><div className="space-y-2"><Label>Utility corridor</Label><Input value={utilityCorridor} onChange={(e) => setUtilityCorridor(e.target.value)} /></div></div>
            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Land acquisition status</Label><Input value={landAcquisitionStatus} onChange={(e) => setLandAcquisitionStatus(e.target.value)} /></div><div className="space-y-2"><Label>Compensation estimate</Label><Input type="number" value={compensationEstimate} onChange={(e) => setCompensationEstimate(Number(e.target.value))} /></div></div>
            <div className="space-y-2"><Label>Infrastructure impact assessment</Label><Input value={impactAssessment} onChange={(e) => setImpactAssessment(e.target.value)} /></div>
            <Button onClick={() => createProject.mutate({ projectName, roadNetworkSegment, rightOfWayStatus, projectTrackingStatus, utilityCorridor, landAcquisitionStatus, compensationEstimate, impactAssessment })} disabled={createProject.isPending}>Create Infrastructure Workflow</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Map className="inline mr-2 h-4 w-4" />Project register</CardTitle><CardDescription>Current mapped projects, right-of-way posture, corridor planning, acquisition progress, and compensation profile.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(data?.projects || []).map((item: any) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.projectName}</p>
                    <p className="text-sm text-muted-foreground"><Route className="inline mr-1 h-3 w-3" />{item.roadNetworkSegment}</p>
                  </div>
                  <Badge variant="outline"><Wallet className="mr-1 inline h-3 w-3" />₦{item.compensationEstimate.toLocaleString()}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Right-of-way: {item.rightOfWayStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Tracking: {item.projectTrackingStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Utility corridor: {item.utilityCorridor}</p>
                <p className="mt-1 text-sm text-muted-foreground">Acquisition: {item.landAcquisitionStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Impact: {item.impactAssessment}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
