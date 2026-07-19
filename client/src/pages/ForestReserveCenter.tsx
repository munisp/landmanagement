import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trees, Flame, Bird } from 'lucide-react';

export default function ForestReserveCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.forest.overview.useQuery();
  const [reserveName, setReserveName] = useState('Riverbend Conservation Forest');
  const [boundaryDescription, setBoundaryDescription] = useState('Wetland fringe to upland ridge reserve boundary with community patrol checkpoints.');
  const [deforestationStatus, setDeforestationStatus] = useState('Remote sensing review indicates low current loss with roadside pressure watch.');
  const [loggingPermitStatus, setLoggingPermitStatus] = useState('Community-managed logging permit draft under quota review');
  const [reforestationPlan, setReforestationPlan] = useState('Mixed native species replanting over degraded slope parcels and stream buffers.');
  const [carbonCreditEstimate, setCarbonCreditEstimate] = useState(3600);
  const [wildlifeCorridor, setWildlifeCorridor] = useState('Primates and bird migration corridor protected across watershed link.');
  const [fireRiskLevel, setFireRiskLevel] = useState('moderate');

  const refresh = async () => {
    await utils.forest.overview.invalidate();
  };

  const createReserve = trpc.forest.createReserve.useMutation({ onSuccess: async () => { toast.success('Forest reserve workflow created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create forest reserve') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading forest reserve workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Forest Reserve Center</h1>
        <p className="text-muted-foreground mt-2">Manage reserve boundaries, deforestation monitoring, logging permits, reforestation programs, carbon credits, wildlife corridors, and fire-risk assessment.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Tracked reserves</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.trackedReserves ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Average carbon credit estimate</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.averageCarbonCreditEstimate ?? 0}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><Trees className="inline mr-2 h-4 w-4" />Forest reserve workflow</CardTitle><CardDescription>Create reserve records with monitoring, permit, reforestation, carbon, wildlife, and fire-risk data.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Reserve name</Label><Input value={reserveName} onChange={(e) => setReserveName(e.target.value)} /></div>
            <div className="space-y-2"><Label>Boundary description</Label><Input value={boundaryDescription} onChange={(e) => setBoundaryDescription(e.target.value)} /></div>
            <div className="space-y-2"><Label>Deforestation monitoring</Label><Input value={deforestationStatus} onChange={(e) => setDeforestationStatus(e.target.value)} /></div>
            <div className="space-y-2"><Label>Logging permit workflow</Label><Input value={loggingPermitStatus} onChange={(e) => setLoggingPermitStatus(e.target.value)} /></div>
            <div className="space-y-2"><Label>Reforestation plan</Label><Input value={reforestationPlan} onChange={(e) => setReforestationPlan(e.target.value)} /></div>
            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Carbon credit estimate</Label><Input type="number" value={carbonCreditEstimate} onChange={(e) => setCarbonCreditEstimate(Number(e.target.value))} /></div><div className="space-y-2"><Label>Fire risk level</Label><Input value={fireRiskLevel} onChange={(e) => setFireRiskLevel(e.target.value)} /></div></div>
            <div className="space-y-2"><Label>Wildlife corridor protection</Label><Input value={wildlifeCorridor} onChange={(e) => setWildlifeCorridor(e.target.value)} /></div>
            <Button onClick={() => createReserve.mutate({ reserveName, boundaryDescription, deforestationStatus, loggingPermitStatus, reforestationPlan, carbonCreditEstimate, wildlifeCorridor, fireRiskLevel })} disabled={createReserve.isPending}>Create Forest Workflow</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Bird className="inline mr-2 h-4 w-4" />Reserve register</CardTitle><CardDescription>Current reserve boundaries, monitoring, permit, carbon, corridor, and fire-risk posture.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(data?.reserves || []).map((item: any) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.reserveName}</p>
                    <p className="text-sm text-muted-foreground">{item.boundaryDescription}</p>
                  </div>
                  <Badge variant="outline"><Flame className="mr-1 inline h-3 w-3" />{item.fireRiskLevel}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Deforestation: {item.deforestationStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Logging permit: {item.loggingPermitStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Reforestation: {item.reforestationPlan}</p>
                <p className="mt-1 text-sm text-muted-foreground">Carbon credits: {item.carbonCreditEstimate}</p>
                <p className="mt-1 text-sm text-muted-foreground">Wildlife corridor: {item.wildlifeCorridor}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
