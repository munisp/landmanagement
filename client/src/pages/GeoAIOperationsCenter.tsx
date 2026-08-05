import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, Loader2, Map, Play, RefreshCw, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const evidenceTone: Record<string, string> = {
  verified: "bg-emerald-100 text-emerald-800",
  provisional: "bg-amber-100 text-amber-800",
  insufficient_evidence: "bg-slate-100 text-slate-700",
  rejected: "bg-rose-100 text-rose-800",
};

function EvidenceBadge({ value }: { value: string }) {
  return <Badge className={evidenceTone[value] ?? "bg-slate-100 text-slate-700"}>{value.replace(/_/g, " ")}</Badge>;
}

export default function GeoAIOperationsCenter() {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [manifestJson, setManifestJson] = useState("");
  const [showReport, setShowReport] = useState(false);
  const utils = trpc.useUtils();
  const runsQuery = trpc.geoai.listRuns.useQuery({ limit: 100 });
  const presentationQuery = trpc.geoai.getPresentation.useQuery(
    { runId: selectedRunId ?? 0 },
    { enabled: selectedRunId !== null },
  );
  const reportQuery = trpc.geoai.getEvidenceReport.useQuery(
    { runId: selectedRunId ?? 0 },
    { enabled: selectedRunId !== null && showReport },
  );
  const arcgisQuery = trpc.geoai.listArcgisOperations.useQuery({ limit: 50 });

  const invalidate = async () => {
    await Promise.all([
      utils.geoai.listRuns.invalidate(),
      selectedRunId ? utils.geoai.getPresentation.invalidate({ runId: selectedRunId }) : Promise.resolve(),
      selectedRunId ? utils.geoai.getEvidenceReport.invalidate({ runId: selectedRunId }) : Promise.resolve(),
      utils.geoai.listArcgisOperations.invalidate(),
    ]);
  };

  const createRun = trpc.geoai.createRun.useMutation({
    onSuccess: async (result) => {
      setSelectedRunId(result.run.id);
      setManifestJson("");
      toast.success("GeoAI analysis run created with its required verification gates.");
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const queueRun = trpc.geoai.queueRun.useMutation({
    onSuccess: async () => { toast.success("GeoAI analysis run queued."); await invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const approveRun = trpc.geoai.reviewRun.useMutation({
    onSuccess: async () => { toast.success("GeoAI evidence review recorded."); await invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const executeArcgis = trpc.geoai.executeArcgisOperation.useMutation({
    onSuccess: async () => { toast.success("Approved ArcGIS operation submitted to the configured control plane."); await invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const refreshArcgis = trpc.geoai.refreshArcgisOperation.useMutation({
    onSuccess: async () => { toast.success("ArcGIS operation status refreshed."); await invalidate(); },
    onError: (error) => toast.error(error.message),
  });

  const selectedRun = useMemo(
    () => (runsQuery.data ?? []).find((run: any) => run.id === selectedRunId),
    [runsQuery.data, selectedRunId],
  );
  const presentation = presentationQuery.data as any;

  const submitManifest = () => {
    try {
      const manifest = JSON.parse(manifestJson);
      createRun.mutate({ manifest });
    } catch {
      toast.error("Provide a valid GeoAI analysis manifest JSON document.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/advanced-geospatial-center"><Button variant="ghost">← Geospatial Center</Button></Link>
          <div className="flex items-center gap-2"><Link href="/geospatial-innovations"><Button size="sm" variant="outline"><Sparkles className="mr-2 h-4 w-4" /> Innovation Hub</Button></Link><div className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" /> Evidence-gated operations</div></div>
        </div>
      </header>

      <main className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
        <section>
          <div className="mb-3 flex items-center gap-3">
            <Workflow className="h-9 w-9 text-primary" />
            <div><h1 className="text-3xl font-bold">GeoAI Operations Center</h1><p className="text-muted-foreground">Run spatial analysis with source provenance, policy gates, uncertainty, review, and controlled external operations.</p></div>
          </div>
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="flex gap-3 pt-6 text-sm text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" /> A result is not a verified decision until all required gates pass and an authorized reviewer records a verified decision. The workspace deliberately exposes evidence gaps instead of fabricating confidence.</CardContent>
          </Card>
        </section>

        <Tabs defaultValue="runs" className="space-y-5">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="runs">Analysis Runs</TabsTrigger>
            <TabsTrigger value="evidence">Evidence Map & Report</TabsTrigger>
            <TabsTrigger value="create">Create Run</TabsTrigger>
            <TabsTrigger value="arcgis">ArcGIS Controls</TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Policy-Gated Analysis Runs</CardTitle><CardDescription>Select a run to inspect its provenance, evidence state, uncertainty, and review gates.</CardDescription></CardHeader>
              <CardContent>
                {runsQuery.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : runsQuery.error ? <p className="text-destructive">{runsQuery.error.message}</p> : (runsQuery.data ?? []).length === 0 ? <p className="text-muted-foreground">No GeoAI analysis runs have been recorded. Create a provenance-bearing manifest to begin.</p> : <div className="space-y-3">{(runsQuery.data as any[]).map((run) => <button key={run.id} onClick={() => { setSelectedRunId(run.id); setShowReport(false); }} className={`w-full rounded-lg border p-4 text-left transition ${selectedRunId === run.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{run.title}</p><p className="text-sm text-muted-foreground">{run.analysisType.replace(/_/g, " ")} · {run.runKey}</p></div><div className="flex gap-2"><EvidenceBadge value={run.evidenceStatus} /><Badge variant="outline">{run.status.replace(/_/g, " ")}</Badge></div></div></button>)}</div>}
              </CardContent>
            </Card>
            {selectedRun && <div className="flex flex-wrap gap-3"><Button disabled={queueRun.isPending || !["draft", "failed", "cancelled"].includes(selectedRun.status)} onClick={() => queueRun.mutate({ runId: selectedRun.id })}><Play className="mr-2 h-4 w-4" /> Queue analysis</Button><Button variant="outline" disabled={approveRun.isPending || selectedRun.status !== "awaiting_review"} onClick={() => approveRun.mutate({ runId: selectedRun.id, decision: "verified", reviewNotes: "Evidence reviewed in GeoAI Operations Center" })}><CheckCircle2 className="mr-2 h-4 w-4" /> Verify evidence</Button><Button variant="outline" onClick={() => { setShowReport(true); presentationQuery.refetch(); }}><FileText className="mr-2 h-4 w-4" /> Open evidence report</Button></div>}
          </TabsContent>

          <TabsContent value="evidence" className="space-y-4">
            {!selectedRunId ? <Card><CardContent className="py-10 text-center text-muted-foreground">Select an analysis run first.</CardContent></Card> : presentationQuery.isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : presentationQuery.error ? <Card><CardContent className="py-6 text-destructive">{presentationQuery.error.message}</CardContent></Card> : presentation && <><Card className={presentation.display.allowedForDecisionPresentation ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}><CardHeader><CardTitle className="flex items-center gap-2"><Map className="h-5 w-5" /> {presentation.run.title}</CardTitle><CardDescription>{presentation.display.banner}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><EvidenceBadge value={presentation.run.evidenceStatus} /><Badge variant="outline">Policy {presentation.run.policyVersion}</Badge><Badge variant="outline">{presentation.display.checkpointSummary.passed}/{presentation.display.checkpointSummary.required} required gates passed</Badge></CardContent></Card>
              <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Evidence layers</CardTitle><CardDescription>Only declared source assets and persisted artifacts are listed; no synthetic map layer is created.</CardDescription></CardHeader><CardContent className="space-y-3">{presentation.layers.length ? presentation.layers.map((layer: any) => <div key={layer.artifactId} className="rounded border p-3"><p className="font-medium">{layer.artifactType}</p><p className="break-all text-xs text-muted-foreground">{layer.uri}</p><p className="mt-1 text-xs">{layer.usableForVerifiedPresentation ? "Eligible for verified presentation" : "Not eligible for verified decision presentation"}</p></div>) : <p className="text-sm text-muted-foreground">No visual or numeric artifacts have been attached to this run.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Quality gates</CardTitle><CardDescription>Verification checkpoints required by the versioned GeoAI policy.</CardDescription></CardHeader><CardContent className="space-y-3">{presentation.qualityGates.map((gate: any) => <div key={gate.key} className="flex items-start justify-between gap-4 rounded border p-3"><div><p className="font-medium">{gate.name}</p><p className="text-xs text-muted-foreground">{gate.required ? "Required" : "Optional"}{gate.notes ? ` · ${gate.notes}` : ""}</p></div><Badge variant={gate.status === "passed" ? "default" : "outline"}>{gate.status}</Badge></div>)}</CardContent></Card></div>
              <Card><CardHeader><CardTitle>Uncertainty and limitations</CardTitle></CardHeader><CardContent><pre className="max-h-96 overflow-auto rounded bg-muted p-4 text-xs">{JSON.stringify(presentation.uncertaintySummary ?? { status: "Not supplied" }, null, 2)}</pre></CardContent></Card>
              {showReport && <Card><CardHeader><CardTitle>Evidence report</CardTitle></CardHeader><CardContent>{reportQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : reportQuery.error ? <p className="text-destructive">{reportQuery.error.message}</p> : <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded bg-muted p-4 text-xs">{(reportQuery.data as any)?.markdown}</pre>}</CardContent></Card>}</>}
          </TabsContent>

          <TabsContent value="create"><Card><CardHeader><CardTitle>Create a GeoAI analysis run</CardTitle><CardDescription>Submit a validated JSON manifest with immutable source-asset IDs, checksums, CRS metadata, purpose, and phase-specific method parameters. The server rejects incomplete evidence before it creates work.</CardDescription></CardHeader><CardContent className="space-y-4"><textarea value={manifestJson} onChange={(event) => setManifestJson(event.target.value)} className="min-h-[320px] w-full rounded-md border bg-background p-3 font-mono text-xs" placeholder='{"analysisType":"spatial_correctness","title":"...","purpose":"...","sourceAssets":[...]}' aria-label="GeoAI analysis manifest JSON" /><Button onClick={submitManifest} disabled={createRun.isPending}>{createRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-2 h-4 w-4" />}Validate and create run</Button></CardContent></Card></TabsContent>

          <TabsContent value="arcgis"><Card><CardHeader><CardTitle>Guarded ArcGIS Operations</CardTitle><CardDescription>External desktop-GIS operations are persisted with a plan and recovery plan, then require approval before a configured control plane can execute them.</CardDescription></CardHeader><CardContent>{arcgisQuery.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : arcgisQuery.error ? <p className="text-destructive">{arcgisQuery.error.message}</p> : <div className="space-y-3">{(arcgisQuery.data as any[]).length ? (arcgisQuery.data as any[]).map((operation) => <div key={operation.id} className="rounded border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{operation.operationType}</p><p className="break-all text-xs text-muted-foreground">{operation.targetWorkspaceUri}</p></div><Badge variant="outline">{operation.status}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={refreshArcgis.isPending || !operation.externalJobId} onClick={() => refreshArcgis.mutate({ operationId: operation.id })}><RefreshCw className="mr-2 h-3 w-3" /> Refresh</Button><Button size="sm" disabled={executeArcgis.isPending || operation.status !== "approved"} onClick={() => executeArcgis.mutate({ operationId: operation.id })}><Play className="mr-2 h-3 w-3" /> Execute approved operation</Button></div></div>) : <p className="text-muted-foreground">No guarded ArcGIS operations have been requested.</p>}</div>}</CardContent></Card></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
