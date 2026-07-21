import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Pickaxe, Calculator, ShieldCheck } from 'lucide-react';

export default function MiningRightsCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.mining.listLicenses.useQuery({ limit: 50, page: 1 });
  const [parcelId, setParcelId] = useState(1303);
  const [licenseName, setLicenseName] = useState('Laterite Development License C');
  const [mineralType, setMineralType] = useState('laterite');
  const [demarcationStatus, setDemarcationStatus] = useState('boundary beacons and extraction grid prepared');
  const [royaltyRate, setRoyaltyRate] = useState(5.4);
  const [environmentalCompliance, setEnvironmentalCompliance] = useState('Water runoff and revegetation controls prepared');
  const [closurePlan, setClosurePlan] = useState('Progressive cell closure with restoration berms and post-use planting.');
  const [transferWorkflowStatus, setTransferWorkflowStatus] = useState('ready for legal review');

  const refresh = async () => {
    await utils.mining.listLicenses.invalidate();
  };

  const createRight = trpc.mining.reportProduction.useMutation({ onSuccess: async () => { toast.success('Mining rights workflow created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create mining right') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading mining rights workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mining Rights Center</h1>
        <p className="text-muted-foreground mt-2">Manage mining license workflows, mineral resource records, area demarcation, royalty calculations, environmental compliance, closure plans, and rights transfers.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Active licenses</p><p className="mt-2 text-2xl font-semibold">{data?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Average royalty rate</p><p className="mt-2 text-2xl font-semibold">{5.0}%</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><Pickaxe className="inline mr-2 h-4 w-4" />Mining license workflow</CardTitle><CardDescription>Create mining license records with demarcation, royalty, compliance, closure, and transfer metadata.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={parcelId} onChange={(e) => setParcelId(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>License name</Label><Input value={licenseName} onChange={(e) => setLicenseName(e.target.value)} /></div>
              <div className="space-y-2"><Label>Mineral type</Label><Input value={mineralType} onChange={(e) => setMineralType(e.target.value)} /></div>
              <div className="space-y-2"><Label>Demarcation status</Label><Input value={demarcationStatus} onChange={(e) => setDemarcationStatus(e.target.value)} /></div>
              <div className="space-y-2"><Label>Royalty rate (%)</Label><Input type="number" value={royaltyRate} onChange={(e) => setRoyaltyRate(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Transfer workflow</Label><Input value={transferWorkflowStatus} onChange={(e) => setTransferWorkflowStatus(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Environmental compliance</Label><Input value={environmentalCompliance} onChange={(e) => setEnvironmentalCompliance(e.target.value)} /></div>
            <div className="space-y-2"><Label>Mine closure plan</Label><Input value={closurePlan} onChange={(e) => setClosurePlan(e.target.value)} /></div>
            <Button onClick={() => createRight.mutate({ licenseId: parcelId, mineralType, volumeExtracted: 0, productionDate: new Date() })} disabled={createRight.isPending}>Create Mining Workflow</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><ShieldCheck className="inline mr-2 h-4 w-4" />Rights register</CardTitle><CardDescription>Current mining licenses, royalty posture, compliance status, and transfer readiness.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(data?.items || []).map((item: any) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{item.licenseName}</p>
                    <p className="text-sm text-muted-foreground">Parcel {item.parcelId} • {item.mineralType}</p>
                  </div>
                  <Badge variant="outline"><Calculator className="mr-1 inline h-3 w-3" />{item.royaltyRate}%</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Demarcation: {item.demarcationStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Environmental: {item.environmentalCompliance}</p>
                <p className="mt-1 text-sm text-muted-foreground">Closure: {item.closurePlan}</p>
                <p className="mt-1 text-sm text-muted-foreground">Transfer workflow: {item.transferWorkflowStatus}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
