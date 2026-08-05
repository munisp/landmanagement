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
import { AlertTriangle, CheckCircle2, ClipboardCheck, Compass, MapPin, Plus, ShieldCheck, UserCheck } from "lucide-react";
import { toast } from "sonner";

const ASSIGNMENT_STATUSES = ["in_progress", "submitted", "under_review", "accepted", "returned", "cancelled"] as const;
const CLOSED_ASSIGNMENT_STATUSES = new Set(["accepted", "cancelled"]);

function statusVariant(status: string) {
  if (["active", "trial", "trialing", "accepted"].includes(status)) return "default" as const;
  if (["in_progress", "submitted", "under_review", "returned"].includes(status)) return "secondary" as const;
  return "outline" as const;
}

export default function FieldSurveyOperations() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.commercialLender.listMyAccounts.useQuery();
  const fieldAccounts = (accountsQuery.data ?? []).filter((account) => account.accountKey.startsWith("FIELD-"));
  const [accountKey, setAccountKey] = useState("");
  const [assignmentKey, setAssignmentKey] = useState("");
  const [accountForm, setAccountForm] = useState({ legalName: "", billingEmail: "" });
  const [assignmentForm, setAssignmentForm] = useState({ parcelId: "", assignedTo: "", instructions: "", scheduledFor: "", dueAt: "" });
  const [evidenceForm, setEvidenceForm] = useState({ evidenceType: "site_photo", sourceReference: "", sourceChecksumSha256: "", capturedAt: new Date().toISOString(), latitude: "", longitude: "", qualityFlags: "" });
  const [reviewNotes, setReviewNotes] = useState("");
  const [nextStatus, setNextStatus] = useState<(typeof ASSIGNMENT_STATUSES)[number]>("in_progress");
  const [transitionNotes, setTransitionNotes] = useState("");

  useEffect(() => {
    if (!accountKey && fieldAccounts[0]?.accountKey) setAccountKey(fieldAccounts[0].accountKey);
  }, [accountKey, fieldAccounts]);

  const dashboardQuery = trpc.commercialLender.fieldSurveyDashboard.useQuery(
    { accountKey: accountKey || "FIELD-00000000000000000000", assignmentKey: assignmentKey || undefined },
    { enabled: Boolean(accountKey), refetchInterval: 30_000 },
  );

  useEffect(() => {
    const firstAssignment = dashboardQuery.data?.assignments?.[0]?.assignmentKey;
    if (!assignmentKey && firstAssignment) setAssignmentKey(firstAssignment);
  }, [dashboardQuery.data?.assignments, assignmentKey]);

  const createAccount = trpc.commercialLender.createFieldSurveyAccount.useMutation({
    onSuccess: async (account) => {
      toast.success("Field operations commercial account created with a controlled trial subscription");
      setAccountKey(account.accountKey);
      setAccountForm({ legalName: "", billingEmail: "" });
      await utils.commercialLender.listMyAccounts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const createAssignment = trpc.commercialLender.createFieldAssignment.useMutation({
    onSuccess: async (assignment) => {
      toast.success("Field assignment created for the authorized inspector");
      setAssignmentKey(assignment.assignmentKey);
      setAssignmentForm({ parcelId: "", assignedTo: "", instructions: "", scheduledFor: "", dueAt: "" });
      await utils.commercialLender.fieldSurveyDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const submitEvidence = trpc.commercialLender.submitFieldEvidence.useMutation({
    onSuccess: async () => {
      toast.success("Field evidence submitted online for independent review");
      setEvidenceForm({ evidenceType: "site_photo", sourceReference: "", sourceChecksumSha256: "", capturedAt: new Date().toISOString(), latitude: "", longitude: "", qualityFlags: "" });
      await utils.commercialLender.fieldSurveyDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const reviewEvidence = trpc.commercialLender.reviewFieldEvidence.useMutation({
    onSuccess: async () => {
      toast.success("Field evidence review recorded");
      setReviewNotes("");
      await utils.commercialLender.fieldSurveyDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const transitionAssignment = trpc.commercialLender.transitionFieldAssignment.useMutation({
    onSuccess: async () => {
      toast.success("Field assignment state updated");
      setTransitionNotes("");
      await utils.commercialLender.fieldSurveyDashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (accountsQuery.isLoading) return <div className="container mx-auto flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading field commercial accounts…</div>;
  if (!fieldAccounts.length) {
    return <div className="container mx-auto max-w-3xl space-y-6 py-8"><div><h1 className="text-3xl font-bold">Field Survey and Parcel Inspection</h1><p className="mt-2 text-muted-foreground">Create an institution-scoped workspace for authorized parcel inspection assignments, source-provenanced evidence, quality review, and auditable acceptance.</p></div><Card><CardHeader><CardTitle className="flex items-center gap-2"><Compass className="h-5 w-5" /> Create field operations account</CardTitle><CardDescription>Field evidence is submitted online to the governed service. The product does not promote observations into registry changes without an independent authorized workflow.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Organization name</Label><Input value={accountForm.legalName} onChange={(event) => setAccountForm({ ...accountForm, legalName: event.target.value })} /></div><div className="space-y-2"><Label>Billing email</Label><Input type="email" value={accountForm.billingEmail} onChange={(event) => setAccountForm({ ...accountForm, billingEmail: event.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button disabled={createAccount.isPending} onClick={() => createAccount.mutate(accountForm)}><Plus className="mr-2 h-4 w-4" /> Create controlled trial</Button></div></CardContent></Card></div>;
  }

  const selectedAssignment = dashboardQuery.data?.selectedAssignment;
  const activeSubscription = dashboardQuery.data?.subscriptions?.[0];
  return <div className="container mx-auto space-y-6 py-8">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h1 className="text-3xl font-bold">Field Survey and Parcel Inspection</h1><p className="mt-2 max-w-3xl text-muted-foreground">Online, account-scoped assignment and evidence workflow. Captured field context must be independently reviewed before acceptance and never changes registry data automatically.</p></div><div className="w-full lg:w-80"><Label>Field operations account</Label><Select value={accountKey} onValueChange={(value) => { setAccountKey(value); setAssignmentKey(""); }}><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{fieldAccounts.map((account) => <SelectItem key={account.accountKey} value={account.accountKey}>{account.legalName} · {account.role}</SelectItem>)}</SelectContent></Select></div></div>
    {dashboardQuery.error && <Card className="border-destructive"><CardContent className="flex gap-3 pt-6 text-destructive"><AlertTriangle className="h-5 w-5" />{dashboardQuery.error.message}</CardContent></Card>}
    {dashboardQuery.data && <>
      <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader className="pb-2"><CardDescription>Account status</CardDescription><CardTitle className="text-xl">{dashboardQuery.data.account.accountStatus}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{dashboardQuery.data.account.legalName}</p></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Subscription</CardDescription><CardTitle className="text-xl">{activeSubscription?.product.name ?? "Unavailable"}</CardTitle></CardHeader><CardContent><Badge variant={statusVariant(activeSubscription?.subscription.status ?? "cancelled")}>{activeSubscription?.subscription.status ?? "cancelled"}</Badge></CardContent></Card><Card><CardHeader className="pb-2"><CardDescription>Monthly assignments</CardDescription><CardTitle className="text-3xl">{dashboardQuery.data.usageByMetric.monthly_field_assignments ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Idempotently metered at assignment creation.</p></CardContent></Card></div>
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]"><Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Assign parcel inspection</CardTitle><CardDescription>Managers assign a real commercial-account member. The server verifies membership before it creates the assignment.</CardDescription></CardHeader><CardContent className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Parcel ID</Label><Input inputMode="numeric" value={assignmentForm.parcelId} onChange={(event) => setAssignmentForm({ ...assignmentForm, parcelId: event.target.value })} /></div><div className="space-y-2"><Label>Inspector user ID</Label><Input inputMode="numeric" value={assignmentForm.assignedTo} onChange={(event) => setAssignmentForm({ ...assignmentForm, assignedTo: event.target.value })} /></div><div className="space-y-2 md:col-span-2"><Label>Inspection instructions</Label><Textarea value={assignmentForm.instructions} onChange={(event) => setAssignmentForm({ ...assignmentForm, instructions: event.target.value })} /></div><div className="space-y-2"><Label>Scheduled time (optional)</Label><Input type="datetime-local" value={assignmentForm.scheduledFor} onChange={(event) => setAssignmentForm({ ...assignmentForm, scheduledFor: event.target.value })} /></div><div className="space-y-2"><Label>Due time (optional)</Label><Input type="datetime-local" value={assignmentForm.dueAt} onChange={(event) => setAssignmentForm({ ...assignmentForm, dueAt: event.target.value })} /></div><div className="md:col-span-2 flex justify-end"><Button disabled={createAssignment.isPending} onClick={() => createAssignment.mutate({ accountKey, parcelId: Number(assignmentForm.parcelId), assignedTo: Number(assignmentForm.assignedTo), instructions: assignmentForm.instructions, scheduledFor: assignmentForm.scheduledFor ? new Date(assignmentForm.scheduledFor).toISOString() : undefined, dueAt: assignmentForm.dueAt ? new Date(assignmentForm.dueAt).toISOString() : undefined })}><ClipboardCheck className="mr-2 h-4 w-4" /> Create assignment</Button></div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5" /> Assignment queue</CardTitle><CardDescription>Inspectors can act only on assignments issued directly to them; supervisors review before acceptance.</CardDescription></CardHeader><CardContent className="space-y-2">{dashboardQuery.data.assignments.length ? dashboardQuery.data.assignments.map((assignment) => <button type="button" key={assignment.assignmentKey} onClick={() => setAssignmentKey(assignment.assignmentKey)} className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 ${assignmentKey === assignment.assignmentKey ? "border-primary bg-muted/40" : ""}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{assignment.assignmentKey}</span><Badge variant={statusVariant(assignment.status)}>{assignment.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Parcel {assignment.parcelId} · inspector {assignment.assignedTo}</p></button>) : <p className="text-sm text-muted-foreground">No field assignments exist in this account.</p>}</CardContent></Card></div>
      {selectedAssignment && <div className="grid gap-6 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Online evidence · {selectedAssignment.assignment.assignmentKey}</CardTitle><CardDescription>Field evidence stores references, optional SHA-256 integrity, WGS84 coordinates, and quality flags. The app does not maintain an offline event cache.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Evidence type</Label><Input value={evidenceForm.evidenceType} onChange={(event) => setEvidenceForm({ ...evidenceForm, evidenceType: event.target.value })} /></div><div className="space-y-2"><Label>Source reference</Label><Input value={evidenceForm.sourceReference} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceReference: event.target.value })} /></div></div><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Latitude (optional)</Label><Input inputMode="decimal" value={evidenceForm.latitude} onChange={(event) => setEvidenceForm({ ...evidenceForm, latitude: event.target.value })} /></div><div className="space-y-2"><Label>Longitude (optional)</Label><Input inputMode="decimal" value={evidenceForm.longitude} onChange={(event) => setEvidenceForm({ ...evidenceForm, longitude: event.target.value })} /></div></div><div className="space-y-2"><Label>Capture timestamp</Label><Input value={evidenceForm.capturedAt} onChange={(event) => setEvidenceForm({ ...evidenceForm, capturedAt: event.target.value })} /></div><div className="space-y-2"><Label>SHA-256 checksum (optional)</Label><Input value={evidenceForm.sourceChecksumSha256} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceChecksumSha256: event.target.value })} /></div><div className="space-y-2"><Label>Quality flags (comma separated)</Label><Input value={evidenceForm.qualityFlags} onChange={(event) => setEvidenceForm({ ...evidenceForm, qualityFlags: event.target.value })} /></div><Button disabled={submitEvidence.isPending || CLOSED_ASSIGNMENT_STATUSES.has(selectedAssignment.assignment.status)} onClick={() => submitEvidence.mutate({ accountKey, assignmentKey: selectedAssignment.assignment.assignmentKey, evidenceType: evidenceForm.evidenceType, sourceReference: evidenceForm.sourceReference, sourceChecksumSha256: evidenceForm.sourceChecksumSha256 || undefined, capturedAt: evidenceForm.capturedAt, latitude: evidenceForm.latitude ? Number(evidenceForm.latitude) : undefined, longitude: evidenceForm.longitude ? Number(evidenceForm.longitude) : undefined, qualityFlags: evidenceForm.qualityFlags ? evidenceForm.qualityFlags.split(",").map((item) => item.trim()).filter(Boolean) : undefined })}><Plus className="mr-2 h-4 w-4" /> Submit online evidence</Button><div className="space-y-2">{selectedAssignment.evidence.map((evidence) => <div key={evidence.evidenceKey} className="rounded border p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{evidence.evidenceType}</span><Badge variant={statusVariant(evidence.status)}>{evidence.status}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">{evidence.sourceReference}</p>{evidence.status === "pending" && <div className="mt-3 flex flex-col gap-2"><Textarea placeholder="Independent field-review rationale" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} /><div className="flex gap-2"><Button size="sm" disabled={reviewEvidence.isPending || reviewNotes.trim().length < 8} onClick={() => reviewEvidence.mutate({ accountKey, evidenceKey: evidence.evidenceKey, status: "accepted", reviewNotes })}><CheckCircle2 className="mr-2 h-4 w-4" /> Accept</Button><Button size="sm" variant="outline" disabled={reviewEvidence.isPending || reviewNotes.trim().length < 8} onClick={() => reviewEvidence.mutate({ accountKey, evidenceKey: evidence.evidenceKey, status: "rejected", reviewNotes })}>Reject</Button></div></div>}</div>)}</div></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Controlled inspection progression</CardTitle><CardDescription>Review and acceptance require at least one accepted evidence item plus an authorized reviewer’s note. Acceptance is not a registry update.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Next assignment state</Label><Select value={nextStatus} onValueChange={(value) => setNextStatus(value as (typeof ASSIGNMENT_STATUSES)[number])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ASSIGNMENT_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Current state</Label><Input disabled value={selectedAssignment.assignment.status} /></div></div><div className="space-y-2"><Label>Reviewer/transition notes</Label><Textarea value={transitionNotes} onChange={(event) => setTransitionNotes(event.target.value)} /></div><Button disabled={transitionAssignment.isPending || CLOSED_ASSIGNMENT_STATUSES.has(selectedAssignment.assignment.status)} onClick={() => transitionAssignment.mutate({ accountKey, assignmentKey: selectedAssignment.assignment.assignmentKey, nextStatus, reviewNotes: transitionNotes || undefined })}>Record controlled transition</Button><div className="space-y-2 border-t pt-4"><p className="font-medium">Assignment activity</p>{selectedAssignment.events.map((event) => <div key={event.id} className="rounded border p-3 text-sm"><div className="flex justify-between gap-3"><span>{event.description}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span></div></div>)}</div></CardContent></Card></div>}
    </>}
    {dashboardQuery.data && <CommercialBillingPanel accountKey={accountKey} invoices={dashboardQuery.data.invoices} onChanged={() => utils.commercialLender.fieldSurveyDashboard.invalidate()} />}
    <div className="text-sm text-muted-foreground"><Link href="/field-surveyor" className="underline">Open the existing field survey workspace</Link></div>
  </div>;
}
