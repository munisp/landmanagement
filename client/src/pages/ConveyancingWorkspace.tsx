import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { CommercialBillingPanel } from "@/components/CommercialBillingPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, BookOpenCheck, CheckCircle2, FileCheck2, Gavel, Landmark, Plus, Scale } from "lucide-react";
import { toast } from "sonner";

const MATTER_STATUSES = ["evidence_requested", "title_review", "legal_drafting", "signatures_pending", "closing_ready", "completed", "withdrawn"] as const;
const CLOSED_MATTER_STATUSES = new Set(["completed", "withdrawn"]);

function statusVariant(status: string) {
  if (["active", "trial", "trialing", "accepted", "completed", "closing_ready"].includes(status)) return "default" as const;
  if (["title_review", "legal_drafting", "signatures_pending", "evidence_requested"].includes(status)) return "secondary" as const;
  return "outline" as const;
}

export default function ConveyancingWorkspace() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.commercialLender.listMyAccounts.useQuery();
  const workspaceAccounts = (accountsQuery.data ?? []).filter((account) => account.accountKey.startsWith("CONV-"));
  const [accountKey, setAccountKey] = useState("");
  const [matterKey, setMatterKey] = useState("");
  const [accountForm, setAccountForm] = useState({ legalName: "", billingEmail: "" });
  const [matterForm, setMatterForm] = useState({ parcelId: "", transactionReference: "", clientId: "" });
  const [evidenceForm, setEvidenceForm] = useState({ evidenceType: "title_search", sourceReference: "", sourceChecksumSha256: "" });
  const [reviewNotes, setReviewNotes] = useState("");
  const [nextStatus, setNextStatus] = useState<(typeof MATTER_STATUSES)[number]>("evidence_requested");
  const [matterNotes, setMatterNotes] = useState("");

  useEffect(() => {
    if (!accountKey && workspaceAccounts[0]?.accountKey) setAccountKey(workspaceAccounts[0].accountKey);
  }, [accountKey, workspaceAccounts]);

  const dashboardQuery = trpc.commercialLender.conveyancingDashboard.useQuery(
    { accountKey: accountKey || "CONV-00000000000000000000", matterKey: matterKey || undefined },
    { enabled: Boolean(accountKey), refetchInterval: 30_000 },
  );

  useEffect(() => {
    const firstMatter = dashboardQuery.data?.matters?.[0]?.matterKey;
    if (!matterKey && firstMatter) setMatterKey(firstMatter);
  }, [dashboardQuery.data?.matters, matterKey]);

  const createAccount = trpc.commercialLender.createConveyancingAccount.useMutation({
    onSuccess: async (account) => {
      toast.success("Conveyancing commercial account created with a controlled trial subscription");
      setAccountKey(account.accountKey);
      setAccountForm({ legalName: "", billingEmail: "" });
      await utils.commercialLender.listMyAccounts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const openMatter = trpc.commercialLender.openConveyancingMatter.useMutation({
    onSuccess: async (matter) => {
      toast.success("Conveyancing matter opened; collect and review evidence before title review");
      setMatterKey(matter.matterKey);
      setMatterForm({ parcelId: "", transactionReference: "", clientId: "" });
      await utils.commercialLender.conveyancingDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const submitEvidence = trpc.commercialLender.submitConveyancingEvidence.useMutation({
    onSuccess: async () => {
      toast.success("Matter evidence submitted for professional verification");
      setEvidenceForm({ evidenceType: "title_search", sourceReference: "", sourceChecksumSha256: "" });
      await utils.commercialLender.conveyancingDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const reviewEvidence = trpc.commercialLender.reviewConveyancingEvidence.useMutation({
    onSuccess: async () => {
      toast.success("Professional evidence review recorded");
      setReviewNotes("");
      await utils.commercialLender.conveyancingDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const transitionMatter = trpc.commercialLender.transitionConveyancingMatter.useMutation({
    onSuccess: async () => {
      toast.success("Matter lifecycle updated");
      setMatterNotes("");
      await utils.commercialLender.conveyancingDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (accountsQuery.isLoading) return <div className="container mx-auto flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading professional workspaces…</div>;

  if (!workspaceAccounts.length) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 py-8">
        <div><h1 className="text-3xl font-bold">Conveyancing and Title Verification Workspace</h1><p className="mt-2 text-muted-foreground">Create a professional workspace for transaction-linked legal documents, title evidence, review checkpoints, and accountable closing coordination.</p></div>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Scale className="h-5 w-5" /> Create commercial legal workspace</CardTitle><CardDescription>This application coordinates evidence and workflow. It does not provide legal advice, determine title, or replace a registry decision.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Legal organization name</Label><Input value={accountForm.legalName} onChange={(event) => setAccountForm({ ...accountForm, legalName: event.target.value })} /></div><div className="space-y-2"><Label>Billing email</Label><Input type="email" value={accountForm.billingEmail} onChange={(event) => setAccountForm({ ...accountForm, billingEmail: event.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button disabled={createAccount.isPending} onClick={() => createAccount.mutate(accountForm)}><Plus className="mr-2 h-4 w-4" /> Create controlled trial</Button></div></CardContent></Card>
      </div>
    );
  }

  const selectedMatter = dashboardQuery.data?.selectedMatter;
  const activeSubscription = dashboardQuery.data?.subscriptions?.[0];

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h1 className="text-3xl font-bold">Conveyancing and Title Verification Workspace</h1><p className="mt-2 max-w-3xl text-muted-foreground">Accountable legal workflow coordination, not an automated title conclusion. Every evidence outcome and closing transition is assigned to an authorized professional.</p></div><div className="w-full lg:w-80"><Label>Commercial workspace</Label><Select value={accountKey} onValueChange={(value) => { setAccountKey(value); setMatterKey(""); }}><SelectTrigger><SelectValue placeholder="Select workspace" /></SelectTrigger><SelectContent>{workspaceAccounts.map((account) => <SelectItem key={account.accountKey} value={account.accountKey}>{account.legalName} · {account.role}</SelectItem>)}</SelectContent></Select></div></div>
      {dashboardQuery.error && <Card className="border-destructive"><CardContent className="flex gap-3 pt-6 text-destructive"><AlertTriangle className="h-5 w-5" />{dashboardQuery.error.message}</CardContent></Card>}
      {dashboardQuery.data && <>
        <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Account status</CardDescription><CardTitle className="text-xl">{dashboardQuery.data.account.accountStatus}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{dashboardQuery.data.account.legalName}</p></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Workspace subscription</CardDescription><CardTitle className="text-xl">{activeSubscription?.product.name ?? "Unavailable"}</CardTitle></CardHeader><CardContent><Badge variant={statusVariant(activeSubscription?.subscription.status ?? "cancelled")}>{activeSubscription?.subscription.status ?? "cancelled"}</Badge></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Verification requests</CardDescription><CardTitle className="text-3xl">{dashboardQuery.data.usageByMetric.monthly_verification_requests ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Usage is tied to source-provenanced matter evidence.</p></CardContent></Card></div>
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Open conveyancing matter</CardTitle><CardDescription>Start from a governed parcel and optional transaction/client references. Statutory registry data remains authoritative.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Parcel ID</Label><Input inputMode="numeric" value={matterForm.parcelId} onChange={(event) => setMatterForm({ ...matterForm, parcelId: event.target.value })} /></div><div className="space-y-2"><Label>Transaction reference (optional)</Label><Input value={matterForm.transactionReference} onChange={(event) => setMatterForm({ ...matterForm, transactionReference: event.target.value })} /></div><div className="space-y-2"><Label>Client user ID (optional)</Label><Input inputMode="numeric" value={matterForm.clientId} onChange={(event) => setMatterForm({ ...matterForm, clientId: event.target.value })} /></div><div className="flex items-end justify-end"><Button disabled={openMatter.isPending} onClick={() => openMatter.mutate({ accountKey, parcelId: Number(matterForm.parcelId), transactionReference: matterForm.transactionReference || undefined, clientId: matterForm.clientId ? Number(matterForm.clientId) : undefined })}><BookOpenCheck className="mr-2 h-4 w-4" /> Open matter</Button></div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Matter queue</CardTitle><CardDescription>All work stays within the selected commercial account.</CardDescription></CardHeader><CardContent className="space-y-2">{dashboardQuery.data.matters.length ? dashboardQuery.data.matters.map((matter) => <button type="button" key={matter.matterKey} onClick={() => setMatterKey(matter.matterKey)} className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 ${matterKey === matter.matterKey ? "border-primary bg-muted/40" : ""}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{matter.matterKey}</span><Badge variant={statusVariant(matter.status)}>{matter.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Parcel {matter.parcelId} · {matter.transactionReference ?? "No transaction reference"}</p></button>) : <p className="text-sm text-muted-foreground">No matters are open in this workspace.</p>}</CardContent></Card></div>
        {selectedMatter && <div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Evidence · {selectedMatter.matter.matterKey}</CardTitle><CardDescription>Submit registry extracts, searches, legal instruments, and signed-document references with immutable provenance. Only a legal reviewer may accept evidence.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Evidence type</Label><Input value={evidenceForm.evidenceType} onChange={(event) => setEvidenceForm({ ...evidenceForm, evidenceType: event.target.value })} /></div><div className="space-y-2"><Label>Source reference</Label><Input value={evidenceForm.sourceReference} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceReference: event.target.value })} /></div></div><div className="space-y-2"><Label>SHA-256 checksum (optional)</Label><Input value={evidenceForm.sourceChecksumSha256} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceChecksumSha256: event.target.value })} /></div><Button disabled={submitEvidence.isPending || CLOSED_MATTER_STATUSES.has(selectedMatter.matter.status)} onClick={() => submitEvidence.mutate({ accountKey, matterKey: selectedMatter.matter.matterKey, ...evidenceForm, sourceChecksumSha256: evidenceForm.sourceChecksumSha256 || undefined })}><Plus className="mr-2 h-4 w-4" /> Submit evidence</Button><div className="space-y-2">{selectedMatter.evidence.map((evidence) => <div key={evidence.evidenceKey} className="rounded border p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{evidence.evidenceType}</span><Badge variant={statusVariant(evidence.status)}>{evidence.status}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">{evidence.sourceReference}</p>{evidence.status === "pending" && <div className="mt-3 flex flex-col gap-2"><Textarea placeholder="Professional verification rationale" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} /><div className="flex gap-2"><Button size="sm" disabled={reviewEvidence.isPending || reviewNotes.trim().length < 8} onClick={() => reviewEvidence.mutate({ accountKey, evidenceKey: evidence.evidenceKey, status: "accepted", reviewNotes })}><CheckCircle2 className="mr-2 h-4 w-4" /> Accept</Button><Button size="sm" variant="outline" disabled={reviewEvidence.isPending || reviewNotes.trim().length < 8} onClick={() => reviewEvidence.mutate({ accountKey, evidenceKey: evidence.evidenceKey, status: "rejected", reviewNotes })}>Reject</Button></div></div>}</div>)}</div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5" /> Professional matter progression</CardTitle><CardDescription>Title review requires accepted evidence. Completion requires professional closing notes and does not declare a legal conclusion or registry change.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Next state</Label><Select value={nextStatus} onValueChange={(value) => setNextStatus(value as (typeof MATTER_STATUSES)[number])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MATTER_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Current state</Label><Input disabled value={selectedMatter.matter.status} /></div></div><div className="space-y-2"><Label>Professional notes</Label><Textarea placeholder="Required for completion; retained in the auditable matter history" value={matterNotes} onChange={(event) => setMatterNotes(event.target.value)} /></div><Button disabled={transitionMatter.isPending || CLOSED_MATTER_STATUSES.has(selectedMatter.matter.status)} onClick={() => transitionMatter.mutate({ accountKey, matterKey: selectedMatter.matter.matterKey, nextStatus, notes: matterNotes || undefined })}>Record controlled transition</Button><div className="space-y-2 border-t pt-4"><p className="font-medium">Matter activity</p>{selectedMatter.events.map((event) => <div key={event.id} className="rounded border p-3 text-sm"><div className="flex justify-between gap-3"><span>{event.description}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span></div></div>)}</div></CardContent></Card></div>}
      </>}
      {dashboardQuery.data && <CommercialBillingPanel accountKey={accountKey} invoices={dashboardQuery.data.invoices} onChanged={() => utils.commercialLender.conveyancingDashboard.invalidate()} />}
      <div className="text-sm text-muted-foreground"><Link href="/legal-document-center" className="underline">Open the existing Legal Document Center</Link></div>
    </div>
  );
}
