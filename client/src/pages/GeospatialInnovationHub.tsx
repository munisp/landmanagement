import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, BellRing, BookOpenCheck, Boxes, ExternalLink, Eye, Globe2, Loader2, MapPinned, Play, RadioTower, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const INNOVATIONS = [
  ["01", "Spatial Evidence Quality", "Scores declared geometry validity, positional accuracy, lineage completeness, and measurement-CRS conformance without presenting a legal certification."],
  ["02", "Multi-Hazard Profile", "Computes transparent parcel-to-hazard overlay exposure from declared, provenance-bearing hazard sources."],
  ["03", "COG Readiness", "Inspects actual raster tiling, overviews, georeferencing, and makes HTTP range-read claims only after separate verification."],
  ["04", "STAC Asset Catalog", "Validates and persists STAC-compatible collection and item metadata for imagery, LiDAR, field, and derived assets."],
  ["05", "OGC Feature Discovery", "Provides a protected GeoJSON feature discovery subset with explicit CRS, evidence, and non-authoritative-boundary notices."],
  ["06", "Vectorized Change Alerts", "Turns co-registered imagery differences into reviewable polygons with mapping-unit, threshold, and valid-coverage evidence."],
  ["07", "Accessibility Equity Lens", "Measures reachable destinations and inter-group impedance gaps from supplied network data without inferring sensitive demographics."],
  ["08", "Field Geofence Verification", "Audits accuracy-filtered GPS tracks against declared parcel buffers; it supports provenance, not survey certification."],
  ["09", "Raster Zonal Statistics", "Calculates real masked-pixel statistics for registered zones and raster assets with CRS and nodata accounting."],
  ["10", "Privacy-Governed Releases", "Generalizes geometry, requires approval, and publishes only non-authoritative, revocable spatial releases."],
] as const;

function JsonInput({ value, onChange, label, help }: { value: string; onChange: (value: string) => void; label: string; help: string }) {
  return <div className="space-y-2"><Label>{label}</Label><textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-24 w-full rounded-md border bg-background p-3 font-mono text-xs" aria-label={label} /><p className="text-xs text-muted-foreground">{help}</p></div>;
}

export default function GeospatialInnovationHub() {
  const utils = trpc.useUtils();
  const [collectionKey, setCollectionKey] = useState("");
  const [collectionTitle, setCollectionTitle] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionLicense, setCollectionLicense] = useState("CC-BY-4.0");
  const [spatialExtent, setSpatialExtent] = useState('{"bbox":[[-180,-90,180,90]]}');
  const [temporalExtent, setTemporalExtent] = useState('{"interval":[[null,null]]}');
  const [monitorType, setMonitorType] = useState<"change_vectorization" | "hazard_profile" | "field_geofence" | "zonal_statistics">("change_vectorization");
  const [monitorParcelId, setMonitorParcelId] = useState("");
  const [monitorSchedule, setMonitorSchedule] = useState("manual-authorized-trigger");
  const [monitorSettings, setMonitorSettings] = useState("{}");
  const [alertResolution, setAlertResolution] = useState<Record<number, string>>({});

  const catalogQuery = trpc.geoInnovations.listStacCollections.useQuery();
  const monitorsQuery = trpc.geoInnovations.listMonitors.useQuery({});
  const alertsQuery = trpc.geoInnovations.listChangeAlerts.useQuery({ limit: 100 });
  const releasesQuery = trpc.geoInnovations.listPublicReleases.useQuery({ limit: 100 });

  const invalidate = async () => Promise.all([
    utils.geoInnovations.listStacCollections.invalidate(),
    utils.geoInnovations.listMonitors.invalidate(),
    utils.geoInnovations.listChangeAlerts.invalidate(),
    utils.geoInnovations.listPublicReleases.invalidate(),
  ]);

  const createCollection = trpc.geoInnovations.createStacCollection.useMutation({
    onSuccess: async () => { toast.success("STAC-compatible collection persisted."); setCollectionKey(""); setCollectionTitle(""); setCollectionDescription(""); await invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const createMonitor = trpc.geoInnovations.createMonitor.useMutation({
    onSuccess: async () => { toast.success("Evidence-gated monitor created. It executes only through the authorized workflow runtime."); await invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const monitorStatus = trpc.geoInnovations.setMonitorStatus.useMutation({ onSuccess: invalidate, onError: (error) => toast.error(error.message) });
  const acknowledgeAlert = trpc.geoInnovations.acknowledgeChangeAlert.useMutation({ onSuccess: invalidate, onError: (error) => toast.error(error.message) });
  const resolveAlert = trpc.geoInnovations.resolveChangeAlert.useMutation({ onSuccess: invalidate, onError: (error) => toast.error(error.message) });
  const approveRelease = trpc.geoInnovations.approvePublicRelease.useMutation({ onSuccess: invalidate, onError: (error) => toast.error(error.message) });
  const publishRelease = trpc.geoInnovations.publishPublicRelease.useMutation({ onSuccess: invalidate, onError: (error) => toast.error(error.message) });
  const revokeRelease = trpc.geoInnovations.revokePublicRelease.useMutation({ onSuccess: invalidate, onError: (error) => toast.error(error.message) });

  const operationalCounts = useMemo(() => ({
    openAlerts: (alertsQuery.data ?? []).filter((alert: any) => ["open", "acknowledged", "investigating"].includes(alert.status)).length,
    activeMonitors: (monitorsQuery.data ?? []).filter((monitor: any) => monitor.status === "active").length,
    publishedReleases: (releasesQuery.data ?? []).filter((release: any) => release.status === "published").length,
  }), [alertsQuery.data, monitorsQuery.data, releasesQuery.data]);

  const submitCollection = () => {
    try {
      createCollection.mutate({
        collectionKey: collectionKey.trim(),
        title: collectionTitle.trim(),
        description: collectionDescription.trim(),
        license: collectionLicense.trim(),
        spatialExtent: JSON.parse(spatialExtent),
        temporalExtent: JSON.parse(temporalExtent),
      });
    } catch {
      toast.error("Spatial and temporal extent fields must contain valid JSON.");
    }
  };
  const submitMonitor = () => {
    try {
      createMonitor.mutate({
        parcelId: monitorParcelId ? Number(monitorParcelId) : undefined,
        innovationType: monitorType,
        scheduleHint: monitorSchedule,
        settings: JSON.parse(monitorSettings),
      });
    } catch {
      toast.error("Monitor settings must contain valid JSON.");
    }
  };

  return <div className="min-h-screen bg-background">
    <header className="border-b bg-card"><div className="container mx-auto flex items-center justify-between px-4 py-4"><Link href="/geoai-operations"><Button variant="ghost">← GeoAI Operations</Button></Link><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Evidence, access, and approval gated</div></div></header>
    <main className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <section className="space-y-3"><div className="flex items-start gap-3"><Sparkles className="mt-1 h-9 w-9 text-primary" /><div><h1 className="text-3xl font-bold">Geospatial Innovation Hub</h1><p className="max-w-4xl text-muted-foreground">A governed workspace for spatial quality, hazard evidence, interoperable assets, monitoring, alerts, equity analysis, field provenance, zonal statistics, and privacy-safe release—not a source of unreviewed legal conclusions.</p></div></div><Card className="border-amber-300 bg-amber-50"><CardContent className="flex gap-3 pt-6 text-sm text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" /> Every innovation remains evidence-gated. Use the GeoAI run composer to create a validated analysis manifest; use this workspace to catalog assets, operate monitors, review alert lifecycle, and govern releases.</CardContent></Card></section>

      <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Open / under-review alerts</CardDescription><CardTitle className="text-3xl">{operationalCounts.openAlerts}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Active evidence monitors</CardDescription><CardTitle className="text-3xl">{operationalCounts.activeMonitors}</CardTitle></CardHeader></Card><Card><CardHeader className="pb-2"><CardDescription>Published privacy releases</CardDescription><CardTitle className="text-3xl">{operationalCounts.publishedReleases}</CardTitle></CardHeader></Card></div>

      <Tabs defaultValue="portfolio" className="space-y-5"><TabsList className="grid w-full grid-cols-2 gap-1 md:grid-cols-5"><TabsTrigger value="portfolio">Portfolio</TabsTrigger><TabsTrigger value="catalog">Catalog</TabsTrigger><TabsTrigger value="monitoring">Monitoring</TabsTrigger><TabsTrigger value="alerts">Alerts & Releases</TabsTrigger><TabsTrigger value="interoperability">Interoperability</TabsTrigger></TabsList>
        <TabsContent value="portfolio" className="space-y-4"><div className="grid gap-4 lg:grid-cols-2">{INNOVATIONS.map(([number, title, detail]) => <Card key={number}><CardHeader><CardTitle className="flex items-center gap-2"><Badge variant="outline">{number}</Badge>{title}</CardTitle><CardDescription>{detail}</CardDescription></CardHeader><CardContent><Link href="/geoai-operations"><Button size="sm" variant="outline"><Play className="mr-2 h-3 w-3" /> Create a policy-gated run</Button></Link></CardContent></Card>)}</div></TabsContent>
        <TabsContent value="catalog" className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Boxes className="h-5 w-5" /> Register STAC Collection</CardTitle><CardDescription>Collection metadata is persisted only after structural validation. Asset Item registration is performed by the evidence workflow using declared immutable source IDs.</CardDescription></CardHeader><CardContent className="space-y-3"><div><Label>Collection key</Label><Input value={collectionKey} onChange={(e) => setCollectionKey(e.target.value)} placeholder="verified-imagery" /></div><div><Label>Title</Label><Input value={collectionTitle} onChange={(e) => setCollectionTitle(e.target.value)} placeholder="Verified imagery" /></div><div><Label>Description</Label><Input value={collectionDescription} onChange={(e) => setCollectionDescription(e.target.value)} placeholder="Purpose, coverage, lineage, and access constraints" /></div><div><Label>License</Label><Input value={collectionLicense} onChange={(e) => setCollectionLicense(e.target.value)} /></div><JsonInput label="Spatial extent" value={spatialExtent} onChange={setSpatialExtent} help="STAC-compatible spatial extent JSON." /><JsonInput label="Temporal extent" value={temporalExtent} onChange={setTemporalExtent} help="STAC-compatible temporal interval JSON." /><Button disabled={createCollection.isPending} onClick={submitCollection}>{createCollection.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BookOpenCheck className="mr-2 h-4 w-4" />}Register collection</Button></CardContent></Card><Card><CardHeader><CardTitle>Registered collections</CardTitle><CardDescription>Collections are internal catalog metadata; protected STAC discovery exposes only authorized records.</CardDescription></CardHeader><CardContent className="space-y-3">{catalogQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : catalogQuery.error ? <p className="text-destructive">{catalogQuery.error.message}</p> : (catalogQuery.data ?? []).length ? (catalogQuery.data as any[]).map((collection) => <div className="rounded border p-3" key={collection.id}><p className="font-medium">{collection.title}</p><p className="text-xs text-muted-foreground">{collection.collectionKey} · {collection.license}</p><p className="mt-1 text-sm">{collection.description}</p></div>) : <p className="text-muted-foreground">No STAC collections are registered.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="monitoring" className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><RadioTower className="h-5 w-5" /> Evidence monitor</CardTitle><CardDescription>A monitor stores approved settings and schedules. It cannot fabricate a result; authorized workflow execution still requires real source assets and policy validation.</CardDescription></CardHeader><CardContent className="space-y-3"><div><Label>Innovation</Label><select className="h-10 w-full rounded-md border bg-background px-3" value={monitorType} onChange={(e) => setMonitorType(e.target.value as any)}><option value="change_vectorization">Vectorized change alerts</option><option value="hazard_profile">Multi-hazard profile</option><option value="field_geofence">Field geofence verification</option><option value="zonal_statistics">Raster zonal statistics</option></select></div><div><Label>Parcel ID (optional)</Label><Input value={monitorParcelId} onChange={(e) => setMonitorParcelId(e.target.value)} inputMode="numeric" /></div><div><Label>Schedule hint</Label><Input value={monitorSchedule} onChange={(e) => setMonitorSchedule(e.target.value)} /></div><JsonInput label="Evidence settings" value={monitorSettings} onChange={setMonitorSettings} help="Store asset references, thresholds, and declared trigger requirements; never paste secret credentials." /><Button onClick={submitMonitor} disabled={createMonitor.isPending}>{createMonitor.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}Create monitor</Button></CardContent></Card><Card><CardHeader><CardTitle>Monitor status</CardTitle><CardDescription>Pause or disable a monitor without deleting its audit history.</CardDescription></CardHeader><CardContent className="space-y-3">{monitorsQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (monitorsQuery.data ?? []).length ? (monitorsQuery.data as any[]).map((monitor) => <div key={monitor.id} className="rounded border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{monitor.innovationType.replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{monitor.subscriptionKey} · {monitor.scheduleHint}</p></div><Badge variant="outline">{monitor.status}</Badge></div><div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => monitorStatus.mutate({ subscriptionId: monitor.id, status: monitor.status === "active" ? "paused" : "active" })}>{monitor.status === "active" ? "Pause" : "Resume"}</Button><Button size="sm" variant="ghost" onClick={() => monitorStatus.mutate({ subscriptionId: monitor.id, status: "disabled" })}>Disable</Button></div></div>) : <p className="text-muted-foreground">No evidence monitors are registered.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="alerts" className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Evidence-bearing change alerts</CardTitle><CardDescription>Alert geometry is provisional until acknowledged, investigated, and resolved by an authorized reviewer.</CardDescription></CardHeader><CardContent className="space-y-3">{alertsQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (alertsQuery.data ?? []).length ? (alertsQuery.data as any[]).map((alert) => <div key={alert.id} className="rounded border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{alert.alertType.replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{alert.alertKey}</p></div><div className="flex gap-2"><Badge variant="outline">{alert.severity}</Badge><Badge variant="outline">{alert.status}</Badge></div></div><p className="mt-2 text-sm">{alert.summary}</p>{["open", "acknowledged"].includes(alert.status) && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => acknowledgeAlert.mutate({ alertId: alert.id, status: "investigating" })}>Investigate</Button><Input className="h-8 max-w-xs" value={alertResolution[alert.id] ?? ""} onChange={(e) => setAlertResolution((prior) => ({ ...prior, [alert.id]: e.target.value }))} placeholder="Resolution evidence note" /><Button size="sm" disabled={(alertResolution[alert.id] ?? "").trim().length < 8} onClick={() => resolveAlert.mutate({ alertId: alert.id, status: "resolved", resolutionNotes: alertResolution[alert.id] })}>Resolve</Button></div>}</div>) : <p className="text-muted-foreground">No persisted change alerts.</p>}</CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Privacy-governed releases</CardTitle><CardDescription>Only privacy-release runs may create a draft. A separate authorized approval and publication decision is required before public access.</CardDescription></CardHeader><CardContent className="space-y-3">{releasesQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (releasesQuery.data ?? []).length ? (releasesQuery.data as any[]).map((release) => <div key={release.id} className="rounded border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-medium">{release.privacyMethod.replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{release.releaseKey}</p></div><Badge variant="outline">{release.status}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{release.legalNotice}</p><div className="mt-3 flex flex-wrap gap-2">{release.status === "draft" && <Button size="sm" onClick={() => approveRelease.mutate({ releaseId: release.id })}>Approve release</Button>}{release.status === "approved" && <Button size="sm" onClick={() => publishRelease.mutate({ releaseId: release.id })}>Publish approved release</Button>}{release.status === "published" && <Button size="sm" variant="destructive" onClick={() => revokeRelease.mutate({ releaseId: release.id })}>Revoke release</Button>}</div></div>) : <p className="text-muted-foreground">No public-release records. Create and complete a privacy_release analysis run before requesting one.</p>}</CardContent></Card></TabsContent>
        <TabsContent value="interoperability" className="grid gap-5 lg:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Globe2 className="h-5 w-5" /> Protected OGC Feature discovery</CardTitle><CardDescription>Signed-in users may query a minimal GeoJSON parcel collection. Output expressly excludes owner, title, transaction, and sensitive evidence fields.</CardDescription></CardHeader><CardContent className="space-y-3"><a href="/api/geo/ogc/features" target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" /> Open protected API landing</Button></a><a href="/api/geo/ogc/features/collections/parcels/items" target="_blank" rel="noreferrer"><Button variant="outline"><MapPinned className="mr-2 h-4 w-4" /> Open parcel collection</Button></a><p className="text-xs text-muted-foreground">Browser access uses your current authenticated session. API clients require a valid bearer token and the same strict GeoAI view permission.</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-5 w-5" /> STAC-compatible metadata</CardTitle><CardDescription>Catalog discovery exposes structural item metadata rather than bypassing governed asset, evidence, or privacy policy.</CardDescription></CardHeader><CardContent className="space-y-3"><a href="/api/geo/stac" target="_blank" rel="noreferrer"><Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" /> Open catalog landing</Button></a><a href="/api/geo/stac/collections" target="_blank" rel="noreferrer"><Button variant="outline"><Boxes className="mr-2 h-4 w-4" /> Open catalog collections</Button></a><p className="text-xs text-muted-foreground">Item publication is secured through the GeoAI asset and review lifecycle. A valid STAC shape is not a claim of evidentiary sufficiency.</p></CardContent></Card></TabsContent>
      </Tabs>
    </main>
  </div>;
}
