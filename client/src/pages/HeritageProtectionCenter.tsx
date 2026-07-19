import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Landmark, ShieldCheck, MapPinned } from 'lucide-react';
import { toast } from 'sonner';

export default function HeritageProtectionCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.heritage.overview.useQuery();
  const [siteName, setSiteName] = useState('Colonial River Wharf');
  const [designation, setDesignation] = useState('State Heritage Site');
  const [overlayZone, setOverlayZone] = useState('Heritage Buffer Overlay C');
  const [archaeologicalRequirement, setArchaeologicalRequirement] = useState('Archaeological monitoring during excavation and salvage review if artifacts are found.');
  const [monitoringStatus, setMonitoringStatus] = useState<'active' | 'review'>('active');
  const [unescoReference, setUnescoReference] = useState('UNESCO-TENTATIVE-CRW-01');
  const [clearanceParcelId, setClearanceParcelId] = useState(1140);
  const [clearanceSiteName, setClearanceSiteName] = useState('Colonial River Wharf');
  const [impactAssessment, setImpactAssessment] = useState('Conditional approval recommended with a protected-view corridor, archaeological observation plan, and public interpretation signage.');
  const [clearanceStatus, setClearanceStatus] = useState<'pending' | 'approved' | 'conditional'>('conditional');

  const refresh = async () => {
    await utils.heritage.overview.invalidate();
  };

  const createSite = trpc.heritage.createSite.useMutation({ onSuccess: async () => { toast.success('Heritage site record created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create heritage site') });
  const createClearance = trpc.heritage.createClearance.useMutation({ onSuccess: async () => { toast.success('Heritage clearance workflow created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create heritage clearance') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading heritage protection workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Heritage Protection Center</h1>
        <p className="text-muted-foreground mt-2">Manage heritage-site records, overlay references, archaeological requirements, impact assessments, monitoring, clearance workflows, and UNESCO-linked review data.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Protected sites</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.protectedSites ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Active monitoring</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.activeMonitoring ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">UNESCO-linked sites</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.unescoLinked ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="database" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[720px]">
          <TabsTrigger value="database"><Landmark className="mr-2 h-4 w-4" />Database</TabsTrigger>
          <TabsTrigger value="clearance"><ShieldCheck className="mr-2 h-4 w-4" />Clearance</TabsTrigger>
          <TabsTrigger value="overlay"><MapPinned className="mr-2 h-4 w-4" />Overlay & Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="database">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Heritage site database</CardTitle><CardDescription>Create protected-site records with archaeological and UNESCO linkage metadata.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Site name</Label><Input value={siteName} onChange={(e) => setSiteName(e.target.value)} /></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div><div className="space-y-2"><Label>Overlay zone</Label><Input value={overlayZone} onChange={(e) => setOverlayZone(e.target.value)} /></div></div>
                <div className="space-y-2"><Label>Archaeological requirement</Label><Textarea rows={4} value={archaeologicalRequirement} onChange={(e) => setArchaeologicalRequirement(e.target.value)} /></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Monitoring status</Label><Input value={monitoringStatus} onChange={(e) => setMonitoringStatus(e.target.value as typeof monitoringStatus)} /></div><div className="space-y-2"><Label>UNESCO reference</Label><Input value={unescoReference} onChange={(e) => setUnescoReference(e.target.value)} /></div></div>
                <Button onClick={() => createSite.mutate({ siteName, designation, overlayZone, archaeologicalRequirement, monitoringStatus, unescoReference: unescoReference || null })} disabled={createSite.isPending}>Create Heritage Site</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Protected-site registry</CardTitle><CardDescription>Current site records and monitoring designations.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{(data?.sites || []).map((item: any) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.siteName}</p><p className="text-sm text-muted-foreground">{item.designation} • {item.overlayZone}</p></div><Badge variant={item.monitoringStatus === 'active' ? 'outline' : 'default'}>{item.monitoringStatus}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{item.archaeologicalRequirement}</p><p className="mt-1 text-xs text-muted-foreground">UNESCO: {item.unescoReference || 'Not linked'}</p></div>)}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clearance">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Heritage clearance workflow</CardTitle><CardDescription>Create heritage impact assessment and clearance decisions for regulated parcels.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={clearanceParcelId} onChange={(e) => setClearanceParcelId(Number(e.target.value))} /></div><div className="space-y-2"><Label>Site name</Label><Input value={clearanceSiteName} onChange={(e) => setClearanceSiteName(e.target.value)} /></div></div>
                <div className="space-y-2"><Label>Impact assessment</Label><Textarea rows={4} value={impactAssessment} onChange={(e) => setImpactAssessment(e.target.value)} /></div>
                <div className="space-y-2"><Label>Status</Label><Input value={clearanceStatus} onChange={(e) => setClearanceStatus(e.target.value as typeof clearanceStatus)} /></div>
                <Button onClick={() => createClearance.mutate({ parcelId: clearanceParcelId, siteName: clearanceSiteName, impactAssessment, status: clearanceStatus })} disabled={createClearance.isPending}>Create Heritage Clearance</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Clearance history</CardTitle><CardDescription>Heritage impact and clearance workflow results.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{(data?.clearances || []).map((item: any) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">Parcel {item.parcelId}</p><p className="text-sm text-muted-foreground">{item.siteName}</p></div><Badge>{item.status}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{item.impactAssessment}</p></div>)}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overlay">
          <Card>
            <CardHeader><CardTitle>Overlay, archaeology, and monitoring</CardTitle><CardDescription>View overlay references, archaeological requirements, monitoring posture, and UNESCO-linked coverage.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {(data?.sites || []).map((item: any) => (
                <div key={`overlay-${item.id}`} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between"><div><p className="font-medium">{item.siteName}</p><p className="text-sm text-muted-foreground">Overlay: {item.overlayZone}</p></div><Badge variant={item.monitoringStatus === 'active' ? 'outline' : 'secondary'}>{item.monitoringStatus}</Badge></div>
                  <p className="mt-2 text-sm text-muted-foreground">Archaeological requirement: {item.archaeologicalRequirement}</p>
                  <p className="mt-1 text-xs text-muted-foreground">UNESCO reference: {item.unescoReference || 'Not linked'}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
