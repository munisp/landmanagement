import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Activity, ArrowRight, CheckCircle2, CircleAlert, Compass, ExternalLink, PauseCircle, PlayCircle, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ContextPill, MetricTile, PageHero, WorkspaceEmptyState } from "@/components/ExperiencePrimitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type JourneyStatus = "pending" | "running" | "awaiting_intervention" | "blocked" | "completed" | "cancelled" | "failed";

const statusTone: Record<JourneyStatus, "success" | "attention" | "neutral" | "info"> = {
  pending: "neutral", running: "info", awaiting_intervention: "attention", blocked: "attention", completed: "success", cancelled: "neutral", failed: "attention",
};

function statusLabel(status: JourneyStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StakeholderJourneyHub() {
  const templates = trpc.stakeholderJourneys.templates.useQuery();
  const runs = trpc.stakeholderJourneys.listMine.useQuery({ includeAll: false });
  const interventions = trpc.stakeholderJourneys.pendingInterventions.useQuery();
  const [templateCode, setTemplateCode] = useState("");
  const [subjectKind, setSubjectKind] = useState("");
  const [subjectReference, setSubjectReference] = useState("");
  const [selectedRunKey, setSelectedRunKey] = useState<string | null>(null);
  const [interventionNote, setInterventionNote] = useState("");

  const selectedTemplate = useMemo(() => templates.data?.find((item) => item.code === templateCode), [templates.data, templateCode]);
  useEffect(() => {
    if (!templateCode && templates.data?.[0]) setTemplateCode(templates.data[0].code);
  }, [templateCode, templates.data]);
  useEffect(() => {
    if (selectedTemplate?.subjectKinds[0]) setSubjectKind(selectedTemplate.subjectKinds[0]);
  }, [selectedTemplate?.code]);

  const selectedRun = trpc.stakeholderJourneys.get.useQuery({ runKey: selectedRunKey ?? "JRN-000000000000000000000000" }, { enabled: Boolean(selectedRunKey) });
  const start = trpc.stakeholderJourneys.start.useMutation({
    onSuccess: (result) => {
      setSelectedRunKey(result.run.runKey);
      runs.refetch();
      interventions.refetch();
      if (result.orchestrationBlocked) toast.warning(("reason" in result ? result.reason : undefined) ?? "The journey was recorded but orchestration is awaiting recovery.");
      else toast.success(result.created ? "Journey orchestration started" : "Existing journey opened");
    },
    onError: (error) => toast.error(error.message),
  });
  const retry = trpc.stakeholderJourneys.retry.useMutation({ onSuccess: () => { runs.refetch(); selectedRun.refetch(); toast.success("Journey retry requested"); }, onError: (error) => toast.error(error.message) });
  const cancel = trpc.stakeholderJourneys.cancel.useMutation({ onSuccess: () => { runs.refetch(); selectedRun.refetch(); toast.success("Journey cancelled"); }, onError: (error) => toast.error(error.message) });
  const resolve = trpc.stakeholderJourneys.resolveIntervention.useMutation({ onSuccess: (result) => { interventions.refetch(); selectedRun.refetch(); if (result.signalDelivered) toast.success("Authorized intervention sent to the journey"); else toast.warning(("reason" in result ? result.reason : undefined) ?? "Intervention recorded; orchestration recovery is pending."); }, onError: (error) => toast.error(error.message) });

  const requestJourney = () => {
    if (!selectedTemplate || !subjectKind || !subjectReference.trim()) {
      toast.error("Choose a journey and enter the reference for an existing governed record.");
      return;
    }
    start.mutate({
      templateCode: selectedTemplate.code,
      subjectKind: subjectKind as never,
      subjectReference: subjectReference.trim(),
      idempotencyKey: `journey-${crypto.randomUUID()}`,
      context: {},
    });
  };

  const activeRuns = runs.data?.filter((run) => !["completed", "cancelled"].includes(run.status)) ?? [];
  const completedRuns = runs.data?.filter((run) => run.status === "completed").length ?? 0;

  return (
    <main className="space-y-8 pb-16">
      <PageHero
        eyebrow="Guided service journeys"
        title="One connected path across land services"
        description="Start a role-appropriate journey around an existing governed record. The platform verifies the subject, coordinates approved services, preserves evidence, and pauses whenever an authorized person must decide."
        actions={<Link href="/getting-started"><Button variant="outline"><Compass className="mr-2 h-4 w-4" />Return to Getting Started</Button></Link>}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricTile icon={Activity} label="Active journeys" value={activeRuns.length} detail="Runs requiring progress, evidence, or intervention" tone="blue" />
        <MetricTile icon={CheckCircle2} label="Completed journeys" value={completedRuns} detail="Completion records never replace a domain decision" tone="emerald" />
        <MetricTile icon={ShieldCheck} label="Available templates" value={templates.data?.length ?? 0} detail="Filtered by your authenticated platform role" tone="amber" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-primary/15">
          <CardHeader>
            <ContextPill tone="info">Start a reusable journey</ContextPill>
            <CardTitle className="mt-3">Begin from a real service record</CardTitle>
            <CardDescription>Journeys do not create or approve land rights. Select the record already created in the appropriate governed workspace, then the orchestrator coordinates its next accountable path.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="journey-template">Journey</Label>
              <Select value={templateCode} onValueChange={setTemplateCode}>
                <SelectTrigger id="journey-template"><SelectValue placeholder="Choose a journey" /></SelectTrigger>
                <SelectContent>{templates.data?.map((item) => <SelectItem key={item.code} value={item.code}>{item.code} · {item.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {selectedTemplate && <div className="rounded-xl border border-border/70 bg-muted/35 p-4 text-sm">
              <p className="font-semibold text-foreground">{selectedTemplate.stakeholder}</p>
              <p className="mt-1 text-muted-foreground">{selectedTemplate.description}</p>
              <p className="mt-3 border-l-2 border-amber-500 pl-3 text-muted-foreground">{selectedTemplate.decisionBoundary}</p>
            </div>}
            <div className="grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-2"><Label htmlFor="subject-kind">Record type</Label><Select value={subjectKind} onValueChange={setSubjectKind}><SelectTrigger id="subject-kind"><SelectValue /></SelectTrigger><SelectContent>{selectedTemplate?.subjectKinds.map((kind) => <SelectItem key={kind} value={kind}>{kind.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label htmlFor="subject-reference">Existing record reference</Label><Input id="subject-reference" value={subjectReference} onChange={(event) => setSubjectReference(event.target.value)} placeholder="For example: MAT-…, COR-…, PAR-…" /></div>
            </div>
            <Button className="w-full" onClick={requestJourney} disabled={start.isPending || templates.isLoading}>{start.isPending ? "Starting governed journey…" : "Start journey"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
            {selectedTemplate && <Link href={selectedTemplate.launchRoute}><Button variant="ghost" className="w-full">Open the underlying {selectedTemplate.domain} service <ExternalLink className="ml-2 h-4 w-4" /></Button></Link>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <ContextPill tone="attention">Authorized interventions</ContextPill>
            <CardTitle className="mt-3">Decisions remain with accountable people</CardTitle>
            <CardDescription>When a template reaches a policy, legal, registry, provider, or review boundary, it pauses. Only the assigned authorized role can continue, block, or cancel it.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {interventions.isLoading && <p className="text-sm text-muted-foreground">Checking your intervention queue…</p>}
            {!interventions.isLoading && !interventions.data?.length && <WorkspaceEmptyState icon={ShieldCheck} title="No interventions waiting for you" description="Your active journeys will appear here only when your authorized role is required." />}
            {interventions.data?.map(({ intervention, run }) => (
              <div key={intervention.interventionKey} className="rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{run.templateCode} · {run.subjectReference}</p><ContextPill tone="attention">{intervention.requestedRole} review</ContextPill></div>
                <p className="mt-2 text-sm text-muted-foreground">{intervention.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => resolve.mutate({ runKey: run.runKey, interventionKey: intervention.interventionKey, decision: "continued", note: interventionNote || undefined })}><PlayCircle className="mr-1.5 h-4 w-4" />Continue</Button>
                  <Button size="sm" variant="outline" onClick={() => resolve.mutate({ runKey: run.runKey, interventionKey: intervention.interventionKey, decision: "blocked", note: interventionNote || undefined })}><PauseCircle className="mr-1.5 h-4 w-4" />Block</Button>
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ runKey: run.runKey, interventionKey: intervention.interventionKey, decision: "cancelled", note: interventionNote || undefined })}><XCircle className="mr-1.5 h-4 w-4" />Cancel</Button>
                </div>
              </div>
            ))}
            <div className="space-y-2"><Label htmlFor="intervention-note">Optional decision note</Label><Textarea id="intervention-note" value={interventionNote} onChange={(event) => setInterventionNote(event.target.value)} maxLength={2000} placeholder="Record the accountable reason for this decision." /></div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader><ContextPill tone="info">Your durable activity</ContextPill><CardTitle className="mt-3">Runs, evidence, and safe recovery</CardTitle><CardDescription>Choose a run to inspect its completed steps, requested interventions, minimized evidence, and available recovery action.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {!runs.isLoading && !runs.data?.length && <WorkspaceEmptyState icon={Compass} title="No journey runs yet" description="Start with one existing governed record and the service path that matches your task." />}
            {runs.data?.map((run) => <button type="button" key={run.runKey} onClick={() => setSelectedRunKey(run.runKey)} className={`w-full rounded-xl border p-4 text-left transition hover:border-primary/40 ${selectedRunKey === run.runKey ? "border-primary bg-primary/5" : "border-border/70"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{run.template.code} · {run.template.title}</p><p className="mt-1 text-sm text-muted-foreground">{run.subjectKind.replaceAll("_", " ")} · {run.subjectReference}</p></div><ContextPill tone={statusTone[run.status as JourneyStatus]}>{statusLabel(run.status as JourneyStatus)}</ContextPill></div>
            </button>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><ContextPill tone="neutral">Selected run</ContextPill><CardTitle className="mt-3">Evidence-led progress</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!selectedRunKey && <WorkspaceEmptyState icon={CircleAlert} title="Select a journey run" description="Run detail appears here without exposing unrelated or private workflow evidence." />}
            {selectedRun.isLoading && <p className="text-sm text-muted-foreground">Loading durable journey evidence…</p>}
            {selectedRun.data && <>
              <div className="rounded-xl bg-muted/40 p-4"><p className="font-semibold">{selectedRun.data.template.title}</p><p className="mt-1 text-sm text-muted-foreground">{selectedRun.data.template.decisionBoundary}</p></div>
              <div className="space-y-2">{selectedRun.data.steps.map((step) => <div key={step.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3"><div><p className="text-sm font-medium">{step.stepKey.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{step.adapterKey.replaceAll("_", " ")} · attempt {step.attemptCount}</p></div><ContextPill tone={statusTone[(step.status === "skipped" ? "cancelled" : step.status) as JourneyStatus]}>{statusLabel((step.status === "skipped" ? "cancelled" : step.status) as JourneyStatus)}</ContextPill></div>)}</div>
              <div className="flex flex-wrap gap-2">
                <Link href={selectedRun.data.template.launchRoute}><Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" />Open service</Button></Link>
                {(["blocked", "failed"] as string[]).includes(selectedRun.data.run.status) && <Button variant="outline" onClick={() => retry.mutate({ runKey: selectedRun.data!.run.runKey })} disabled={retry.isPending}><RefreshCw className="mr-2 h-4 w-4" />Retry after correction</Button>}
                {!(["completed", "cancelled"] as string[]).includes(selectedRun.data.run.status) && <Button variant="ghost" onClick={() => cancel.mutate({ runKey: selectedRun.data!.run.runKey })} disabled={cancel.isPending}><XCircle className="mr-2 h-4 w-4" />Cancel journey</Button>}
              </div>
            </>}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
