import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, ClipboardList, Clock3, FileCheck2, Landmark, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { CommercialBillingPanel } from "@/components/CommercialBillingPanel";
import { ContextPill, MetricTile, PageHero, WorkspaceEmptyState } from "@/components/ExperiencePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const CASE_STATUSES = ["triaged", "in_review", "returned", "completed", "withdrawn"] as const;

function statusVariant(status: string) {
  return ["completed", "active", "trialing"].includes(status)
    ? "default" as const
    : ["in_review", "triaged", "returned"].includes(status)
      ? "secondary" as const
      : "outline" as const;
}

export default function RegistryOperationsCloud() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.commercialLender.listMyAccounts.useQuery();
  const accounts = (accountsQuery.data ?? []).filter((account) => account.accountKey.startsWith("REG-"));
  const [accountKey, setAccountKey] = useState("");
  const [caseKey, setCaseKey] = useState("");
  const [accountForm, setAccountForm] = useState({ legalName: "", billingEmail: "" });
  const [queueForm, setQueueForm] = useState({ name: "", serviceType: "", slaHours: "72" });
  const [caseForm, setCaseForm] = useState({ queueKey: "", requestReference: "", parcelId: "", requesterName: "", sourceReference: "" });
  const [nextStatus, setNextStatus] = useState<(typeof CASE_STATUSES)[number]>("triaged");
  const [outcomeNote, setOutcomeNote] = useState("");

  useEffect(() => {
    if (!accountKey && accounts[0]?.accountKey) setAccountKey(accounts[0].accountKey);
  }, [accountKey, accounts]);

  const dashboard = trpc.registryOperations.dashboard.useQuery(
    { accountKey: accountKey || "REG-00000000000000000000", caseKey: caseKey || undefined },
    { enabled: Boolean(accountKey), refetchInterval: 30_000 },
  );

  useEffect(() => {
    if (!caseKey && dashboard.data?.cases[0]?.caseKey) setCaseKey(dashboard.data.cases[0].caseKey);
  }, [caseKey, dashboard.data?.cases]);

  useEffect(() => {
    if (!caseForm.queueKey && dashboard.data?.queues[0]?.queueKey) {
      setCaseForm((current) => ({ ...current, queueKey: dashboard.data!.queues[0].queueKey }));
    }
  }, [caseForm.queueKey, dashboard.data?.queues]);

  const createAccount = trpc.registryOperations.createAccount.useMutation({
    onSuccess: async (account) => {
      toast.success("Registry Operations Cloud trial created");
      setAccountKey(account.accountKey);
      await utils.commercialLender.listMyAccounts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const createQueue = trpc.registryOperations.createQueue.useMutation({
    onSuccess: async () => {
      toast.success("Service queue configured");
      setQueueForm({ name: "", serviceType: "", slaHours: "72" });
      await utils.registryOperations.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const openCase = trpc.registryOperations.openCase.useMutation({
    onSuccess: async (item) => {
      toast.success("Registry service case opened");
      setCaseKey(item.caseKey);
      setCaseForm((current) => ({ ...current, requestReference: "", parcelId: "", requesterName: "", sourceReference: "" }));
      await utils.registryOperations.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const transition = trpc.registryOperations.transitionCase.useMutation({
    onSuccess: async () => {
      toast.success("Case transition recorded");
      setOutcomeNote("");
      await utils.registryOperations.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (accountsQuery.isLoading) {
    return <div className="experience-page"><WorkspaceEmptyState icon={Clock3} title="Loading registry operations" description="Preparing your institution-scoped queues and accountable case work." /></div>;
  }

  if (!accounts.length) {
    return (
      <div className="experience-page max-w-4xl">
        <PageHero
          eyebrow="Registry Operations Cloud"
          title="Bring clarity to every service request."
          description="Create an institution-scoped workspace for service queues, accountable request handling, SLA targets, and audit-ready activity. Registry officials remain authoritative for every statutory record change."
          aside={<><p className="text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Start safely</p><p className="mt-2 text-sm font-medium leading-6 text-slate-900">A controlled trial creates workflow space only. It never modifies registry data.</p></>}
        />
        <Card className="experience-panel overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-5 py-5"><CardTitle className="flex items-center gap-2 text-xl tracking-[-0.03em]"><Landmark className="h-5 w-5 text-blue-700" /> Create a registry operations account</CardTitle><CardDescription className="mt-1.5 leading-6">Set the responsible institution and billing contact before any queues or requests can be created.</CardDescription></CardHeader>
          <CardContent className="grid gap-5 p-5 md:grid-cols-2 sm:p-6">
            <div><Label htmlFor="registryLegalName">Institution legal name</Label><Input id="registryLegalName" className="mt-2 h-11 rounded-xl" value={accountForm.legalName} onChange={(event) => setAccountForm({ ...accountForm, legalName: event.target.value })} /></div>
            <div><Label htmlFor="registryBillingEmail">Billing contact</Label><Input id="registryBillingEmail" className="mt-2 h-11 rounded-xl" type="email" value={accountForm.billingEmail} onChange={(event) => setAccountForm({ ...accountForm, billingEmail: event.target.value })} /></div>
            <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-blue-50/70 p-4"><p className="max-w-xl text-xs leading-5 text-blue-950">Entitlement, subscription, and payment records remain in the common verified commercial workflow.</p><Button className="rounded-xl" disabled={createAccount.isPending || !accountForm.legalName.trim() || !accountForm.billingEmail.trim()} onClick={() => createAccount.mutate(accountForm)}><Plus className="mr-2 h-4 w-4" /> {createAccount.isPending ? "Creating…" : "Create controlled trial"}</Button></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selected = dashboard.data?.selectedCase;

  return (
    <div className="experience-page">
      <PageHero
        eyebrow="Registry Operations Cloud"
        title="Keep public-service work moving with accountability."
        description="Coordinate queues, cases, due dates, and factual operational outcomes. This workspace records service work; only authorized officials make registry decisions and statutory record changes."
        aside={<div><p className="text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Responsible account</p><Select value={accountKey} onValueChange={(value) => { setAccountKey(value); setCaseKey(""); }}><SelectTrigger className="mt-2 h-10 rounded-xl bg-white"><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{accounts.map((account) => <SelectItem key={account.accountKey} value={account.accountKey}>{account.legalName} · {account.role}</SelectItem>)}</SelectContent></Select></div>}
      />

      {dashboard.error ? <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900"><AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />{dashboard.error.message}</div> : null}

      {dashboard.data ? (
        <>
          <section className="grid gap-3 md:grid-cols-3">
            <MetricTile icon={ClipboardList} label="Open cases" value={dashboard.data.metrics.openCases} detail="Across the queues configured for this institution." tone="blue" />
            <MetricTile icon={AlertTriangle} label="SLA attention" value={dashboard.data.metrics.overdueCases} detail="Cases that need a supervisor or assignee review." tone="amber" />
            <MetricTile icon={FileCheck2} label="Completed work" value={dashboard.data.metrics.completedCases} detail="Factual workflow outcomes; not registry decisions." tone="emerald" />
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Card className="experience-panel"><CardHeader><CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-blue-700" /> Configure a service queue</CardTitle><CardDescription className="leading-6">Set a clear queue and operational target. An SLA guides service handling; it does not guarantee a registry outcome.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><div><Label>Queue name</Label><Input className="mt-2 rounded-xl" value={queueForm.name} onChange={(event) => setQueueForm({ ...queueForm, name: event.target.value })} /></div><div><Label>Service type</Label><Input className="mt-2 rounded-xl" value={queueForm.serviceType} onChange={(event) => setQueueForm({ ...queueForm, serviceType: event.target.value })} /></div><div><Label>SLA hours</Label><Input className="mt-2 rounded-xl" inputMode="numeric" value={queueForm.slaHours} onChange={(event) => setQueueForm({ ...queueForm, slaHours: event.target.value })} /></div><div className="md:col-span-3 flex justify-end"><Button className="rounded-xl" disabled={createQueue.isPending || !queueForm.name.trim() || !queueForm.serviceType.trim()} onClick={() => createQueue.mutate({ accountKey, name: queueForm.name, serviceType: queueForm.serviceType, slaHours: Number(queueForm.slaHours) })}><Plus className="mr-2 h-4 w-4" /> Add queue</Button></div></CardContent></Card>
            <Card className="experience-panel"><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-blue-700" /> Open a service case</CardTitle><CardDescription className="leading-6">Use a concise request and source reference. Do not place sensitive personal information in a case reference.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div><Label>Queue</Label><Select value={caseForm.queueKey} onValueChange={(value) => setCaseForm({ ...caseForm, queueKey: value })}><SelectTrigger className="mt-2 rounded-xl"><SelectValue placeholder="Choose a queue" /></SelectTrigger><SelectContent>{dashboard.data.queues.filter((queue) => queue.enabled).map((queue) => <SelectItem key={queue.queueKey} value={queue.queueKey}>{queue.name} · {queue.slaHours}h</SelectItem>)}</SelectContent></Select></div><div><Label>Request reference</Label><Input className="mt-2 rounded-xl" value={caseForm.requestReference} onChange={(event) => setCaseForm({ ...caseForm, requestReference: event.target.value })} /></div><div><Label>Parcel ID <span className="font-normal text-slate-500">optional</span></Label><Input className="mt-2 rounded-xl" inputMode="numeric" value={caseForm.parcelId} onChange={(event) => setCaseForm({ ...caseForm, parcelId: event.target.value })} /></div><div><Label>Requester name <span className="font-normal text-slate-500">optional</span></Label><Input className="mt-2 rounded-xl" value={caseForm.requesterName} onChange={(event) => setCaseForm({ ...caseForm, requesterName: event.target.value })} /></div><div className="md:col-span-2"><Label>Evidence or source reference <span className="font-normal text-slate-500">optional</span></Label><Input className="mt-2 rounded-xl" value={caseForm.sourceReference} onChange={(event) => setCaseForm({ ...caseForm, sourceReference: event.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button className="rounded-xl" disabled={openCase.isPending || !caseForm.queueKey || !caseForm.requestReference.trim()} onClick={() => openCase.mutate({ accountKey, queueKey: caseForm.queueKey, requestReference: caseForm.requestReference, parcelId: caseForm.parcelId ? Number(caseForm.parcelId) : undefined, requesterName: caseForm.requesterName || undefined, sourceReference: caseForm.sourceReference || undefined })}><Plus className="mr-2 h-4 w-4" /> Open case</Button></div></CardContent></Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card className="experience-panel"><CardHeader className="border-b border-slate-100"><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-blue-700" /> Case queue</CardTitle><CardDescription>Choose a case to review its accountable activity and allowed next transition.</CardDescription></CardHeader><CardContent className="space-y-2 p-3">{dashboard.data.cases.length ? dashboard.data.cases.map((item) => <button type="button" key={item.caseKey} onClick={() => setCaseKey(item.caseKey)} className={`w-full rounded-xl border p-3.5 text-left transition ${caseKey === item.caseKey ? "border-blue-300 bg-blue-50/75 shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-900">{item.caseKey}</span><Badge variant={statusVariant(item.status)}>{item.status.replaceAll("_", " ")}</Badge></div><p className="mt-1.5 text-sm text-slate-600">{item.requestReference}</p><p className="mt-1 text-xs text-slate-500">Due {new Date(item.dueAt).toLocaleString()}</p></button>) : <WorkspaceEmptyState icon={ClipboardList} title="No cases in this account" description="Configure a queue, then open a request to begin accountable case work." />}</CardContent></Card>
            {selected ? <Card className="experience-panel"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-blue-700" /> Record an allowed next step</CardTitle><CardDescription className="mt-1.5 leading-6">A transition records a factual operational outcome. It never certifies a registry decision.</CardDescription></div><ContextPill tone="info">{selected.case.status.replaceAll("_", " ")}</ContextPill></div></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div><Label>Next workflow state</Label><Select value={nextStatus} onValueChange={(value) => setNextStatus(value as (typeof CASE_STATUSES)[number])}><SelectTrigger className="mt-2 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{CASE_STATUSES.map((status) => <SelectItem key={status} value={status}>{status.replaceAll("_", " ")}</SelectItem>)}</SelectContent></Select></div><div><Label>Current state</Label><Input className="mt-2 rounded-xl bg-slate-50" disabled value={selected.case.status.replaceAll("_", " ")} /></div></div><div><Label>Factual outcome note</Label><Textarea className="mt-2 min-h-24 rounded-xl" value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="Add a clear factual note before completing a case" /></div><div className="flex justify-end"><Button className="rounded-xl" disabled={transition.isPending} onClick={() => transition.mutate({ accountKey, caseKey: selected.case.caseKey, nextStatus, outcomeNote: outcomeNote || undefined })}>{transition.isPending ? "Recording…" : "Record transition"}</Button></div><div className="border-t border-slate-100 pt-4"><p className="text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Accountable activity</p><div className="mt-3 space-y-2">{selected.events.map((event) => <div key={event.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"><div className="flex flex-col justify-between gap-1 sm:flex-row sm:gap-3"><span className="text-sm text-slate-800">{event.description}</span><span className="shrink-0 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()}</span></div></div>)}</div></div></CardContent></Card> : <WorkspaceEmptyState icon={FileCheck2} title="Select a case" description="Choose an item from the queue to view its activity and authorized next transition." />}
          </section>
          <CommercialBillingPanel accountKey={accountKey} invoices={dashboard.data.invoices} onChanged={() => utils.registryOperations.dashboard.invalidate()} />
        </>
      ) : null}
      <Link href="/admin" className="inline-flex text-sm font-medium text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline">Return to platform administration</Link>
    </div>
  );
}
