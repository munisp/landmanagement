import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ClipboardCheck, Database, HandHeart, Landmark, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ContextPill, MetricTile, PageHero, WorkspaceEmptyState } from '@/components/ExperiencePrimitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc';

function gateTone(status: string): 'success' | 'attention' | 'neutral' {
  if (status === 'approved') return 'success';
  if (status === 'evidence_submitted') return 'attention';
  if (status === 'expired' || status === 'rejected') return 'attention';
  return 'neutral';
}

export default function NationwideRolloutControl() {
  const utils = trpc.useUtils();
  const jurisdictions = trpc.nationwideRollout.listJurisdictions.useQuery(undefined, { refetchInterval: 30_000 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [jurisdictionForm, setJurisdictionForm] = useState({ code: '', name: '', administrativeLevel: 'state' as const, authoritativeRecordStatement: '', legalMandateReference: '', serviceFallbackDescription: '' });
  const [assistedForm, setAssistedForm] = useState({ requesterReference: '', serviceChannel: 'in_person' as const, requestedService: '' });

  const selected = useMemo(() => jurisdictions.data?.find((item) => item.jurisdiction.id === selectedId) ?? jurisdictions.data?.[0] ?? null, [jurisdictions.data, selectedId]);
  useEffect(() => {
    if (selected && selectedId !== selected.jurisdiction.id) setSelectedId(selected.jurisdiction.id);
  }, [selected, selectedId]);

  const createJurisdiction = trpc.nationwideRollout.createJurisdiction.useMutation({
    onSuccess: async (result) => {
      toast.success(`Jurisdiction ${result.jurisdiction.name} created with every national rollout gate initialized.`);
      setSelectedId(result.jurisdiction.id);
      setJurisdictionForm({ code: '', name: '', administrativeLevel: 'state', authoritativeRecordStatement: '', legalMandateReference: '', serviceFallbackDescription: '' });
      await utils.nationwideRollout.listJurisdictions.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const setStatus = trpc.nationwideRollout.setJurisdictionStatus.useMutation({
    onSuccess: async () => {
      toast.success('Jurisdiction stage updated');
      await utils.nationwideRollout.listJurisdictions.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const openAssistedService = trpc.nationwideRollout.createAssistedServiceCase.useMutation({
    onSuccess: async () => {
      toast.success('Assisted-service case opened with a recorded consent boundary.');
      setAssistedForm({ requesterReference: '', serviceChannel: 'in_person', requestedService: '' });
      await utils.nationwideRollout.listJurisdictions.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <main className="space-y-8 pb-12">
      <PageHero
        eyebrow="National service assurance"
        title="Nationwide Rollout Control"
        description="Operate staged land-service expansion with evidence gates, non-authoritative migration lineage, independent recovery review, and inclusive assisted-service continuity."
        actions={<ContextPill tone="attention">Authoritative expansion remains statutory, not automated</ContextPill>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Selected jurisdiction readiness metrics">
        <MetricTile icon={ShieldCheck} label="Pilot readiness" value={jurisdictions.isLoading ? 'Checking' : selected?.readiness.readyForShadowRegister ? 'Ready' : selected ? 'Blocked' : 'Unavailable'} detail={jurisdictions.isLoading ? 'Loading evidence-gate status.' : selected?.readiness.readyForShadowRegister ? 'All required evidence gates are approved.' : selected ? `${selected.readiness.blockers.length} required evidence gates remain.` : 'Sign in to load governed rollout evidence.'} tone={selected?.readiness.readyForShadowRegister ? 'emerald' : 'amber'} />
        <MetricTile icon={Database} label="Import batches" value={selected?.metrics.importBatches ?? 0} detail="Lineage-preserved batches; no automatic register writes." tone="slate" />
        <MetricTile icon={ClipboardCheck} label="Open reconciliation" value={selected?.metrics.openReconciliations ?? 0} detail="Exceptions require a documented human resolution." tone={(selected?.metrics.openReconciliations ?? 0) > 0 ? 'amber' : 'emerald'} />
        <MetricTile icon={HandHeart} label="Assisted service" value={selected?.metrics.openAssistedServiceCases ?? 0} detail="In-person, accessibility, phone, kiosk, and outreach continuity." tone="slate" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="workspace-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5 text-primary" />Jurisdictions</CardTitle>
            <CardDescription>Start in rehearsal. The system can unlock shadow-register work only after required evidence is approved.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {jurisdictions.isLoading ? <p className="text-sm text-muted-foreground">Loading rollout jurisdictions…</p> : null}
            {jurisdictions.isError ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">Rollout evidence is unavailable in this session. Sign in with an authorized registry or administrator role, then retry.</div> : null}
            {(jurisdictions.data ?? []).map((item) => (
              <button key={item.jurisdiction.id} type="button" onClick={() => setSelectedId(item.jurisdiction.id)} className={`w-full rounded-xl border p-4 text-left transition ${selected?.jurisdiction.id === item.jurisdiction.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                <div className="flex items-center justify-between gap-3"><span className="font-semibold">{item.jurisdiction.name}</span><Badge variant="outline">{item.jurisdiction.status.replaceAll('_', ' ')}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground">{item.jurisdiction.code} · {item.jurisdiction.administrativeLevel}</p>
              </button>
            ))}
            {!jurisdictions.isLoading && !jurisdictions.isError && !jurisdictions.data?.length ? <WorkspaceEmptyState icon={Landmark} title="No rollout jurisdiction yet" description="Create a rehearsable jurisdiction and capture the legal record statement, fallback service, and independent gate evidence before any pilot activity." /> : null}
          </CardContent>
        </Card>

        <Card className="workspace-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" />Create a rehearsable jurisdiction</CardTitle>
            <CardDescription>This records rollout scope only. It does not create statutory authority or make any platform record authoritative.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => {
              event.preventDefault();
              createJurisdiction.mutate({ ...jurisdictionForm, legalMandateReference: jurisdictionForm.legalMandateReference || undefined });
            }}>
              <div className="space-y-2"><Label htmlFor="jurisdiction-code">Code</Label><Input id="jurisdiction-code" value={jurisdictionForm.code} onChange={(event) => setJurisdictionForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="NG-LA" required /></div>
              <div className="space-y-2"><Label htmlFor="jurisdiction-name">Jurisdiction name</Label><Input id="jurisdiction-name" value={jurisdictionForm.name} onChange={(event) => setJurisdictionForm((current) => ({ ...current, name: event.target.value }))} placeholder="Lagos pilot" required /></div>
              <div className="space-y-2"><Label>Administrative level</Label><Select value={jurisdictionForm.administrativeLevel} onValueChange={(value: typeof jurisdictionForm.administrativeLevel) => setJurisdictionForm((current) => ({ ...current, administrativeLevel: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="state">State</SelectItem><SelectItem value="lga">Local government area</SelectItem><SelectItem value="ward">Ward</SelectItem><SelectItem value="customary_area">Customary area</SelectItem><SelectItem value="national">National</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="mandate">Legal authority reference</Label><Input id="mandate" type="url" value={jurisdictionForm.legalMandateReference} onChange={(event) => setJurisdictionForm((current) => ({ ...current, legalMandateReference: event.target.value }))} placeholder="https://…" /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="authoritative-statement">Authoritative record statement</Label><Textarea id="authoritative-statement" value={jurisdictionForm.authoritativeRecordStatement} onChange={(event) => setJurisdictionForm((current) => ({ ...current, authoritativeRecordStatement: event.target.value }))} placeholder="Name the authoritative registry and the boundary of this platform’s role during pilot." required /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="fallback">Fallback service</Label><Textarea id="fallback" value={jurisdictionForm.serviceFallbackDescription} onChange={(event) => setJurisdictionForm((current) => ({ ...current, serviceFallbackDescription: event.target.value }))} placeholder="Describe the human, phone, or in-person fallback if digital service is unavailable." required /></div>
              <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={createJurisdiction.isPending}>{createJurisdiction.isPending ? 'Creating controls…' : 'Create rollout controls'}</Button></div>
            </form>
          </CardContent>
        </Card>
      </section>

      {selected ? <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="workspace-card">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />{selected.jurisdiction.name} evidence gates</CardTitle><CardDescription>Only approved, unexpired evidence permits a shadow-register stage. An app action cannot set authoritative expansion.</CardDescription></div><ContextPill tone={selected.readiness.readyForShadowRegister ? 'success' : 'attention'}>{selected.readiness.readyForShadowRegister ? 'Ready for shadow register' : 'Evidence incomplete'}</ContextPill></div>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selected.readiness.gates.map((gate) => <div key={gate.code} className="rounded-xl border border-border bg-card/60 p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium capitalize">{gate.code.replaceAll('_', ' ')}</span><ContextPill tone={gateTone(gate.status)}>{gate.status.replaceAll('_', ' ')}</ContextPill></div><p className="mt-2 text-xs text-muted-foreground">{gate.expiresAt ? `Evidence expires ${new Date(gate.expiresAt).toLocaleDateString()}` : 'Awaiting independently reviewable evidence.'}</p></div>)}
          </CardContent>
        </Card>
        <Card className="workspace-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><HandHeart className="h-5 w-5 text-primary" />Assisted service continuity</CardTitle><CardDescription>Record a consented, non-digital service handoff. Do not enter personal data in this operational reference field.</CardDescription></CardHeader>
          <CardContent><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); openAssistedService.mutate({ jurisdictionId: selected.jurisdiction.id, ...assistedForm }); }}><div className="space-y-2"><Label htmlFor="requester-reference">Requester reference</Label><Input id="requester-reference" value={assistedForm.requesterReference} onChange={(event) => setAssistedForm((current) => ({ ...current, requesterReference: event.target.value }))} placeholder="Case reference only" required /></div><div className="space-y-2"><Label>Service channel</Label><Select value={assistedForm.serviceChannel} onValueChange={(value: typeof assistedForm.serviceChannel) => setAssistedForm((current) => ({ ...current, serviceChannel: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="in_person">In person</SelectItem><SelectItem value="phone">Phone</SelectItem><SelectItem value="community_kiosk">Community kiosk</SelectItem><SelectItem value="accessibility_assistance">Accessibility assistance</SelectItem><SelectItem value="mobile_outreach">Mobile outreach</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="requested-service">Requested service</Label><Input id="requested-service" value={assistedForm.requestedService} onChange={(event) => setAssistedForm((current) => ({ ...current, requestedService: event.target.value }))} placeholder="e.g., record-search assistance" required /></div><Button type="submit" className="w-full" disabled={openAssistedService.isPending}>{openAssistedService.isPending ? 'Opening case…' : 'Open assisted-service case'}</Button></form></CardContent>
        </Card>
      </section> : null}

      {selected ? <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /><div><h2 className="font-semibold">Pilot safety boundary</h2><p className="mt-1 text-sm text-muted-foreground">Import acceptance, reconciliation, and drill evidence are decision support and audit controls. They never create, amend, transfer, or adjudicate a land right. Any limited-authoritative or expanded stage requires statutory approval outside this application.</p>{selected.jurisdiction.status === 'rehearsal' && selected.readiness.readyForShadowRegister ? <Button className="mt-4" variant="outline" onClick={() => setStatus.mutate({ jurisdictionId: selected.jurisdiction.id, status: 'shadow_register' })}><CheckCircle2 className="mr-2 h-4 w-4" />Enable shadow register</Button> : null}</div></div></section> : null}
    </main>
  );
}
