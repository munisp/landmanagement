import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, BadgeDollarSign, Building2, CheckCircle2, ClipboardCheck, FileCheck2, Plus, ReceiptText, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

const TERMINAL_CASE_STATUSES = new Set(["approved", "declined", "withdrawn"]);
const CASE_STATUSES = ["evidence_requested", "ready_for_review", "under_review", "conditional_approval", "approved", "declined", "withdrawn"] as const;

function statusVariant(status: string) {
  if (["active", "trial", "trialing", "paid", "approved", "accepted"].includes(status)) return "default" as const;
  if (["past_due", "overdue", "conditional_approval", "under_review", "ready_for_review"].includes(status)) return "secondary" as const;
  return "outline" as const;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value / 100);
}

export default function LenderCollateralControl() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.commercialLender.listMyAccounts.useQuery();
  const [accountKey, setAccountKey] = useState("");
  const [selectedCaseKey, setSelectedCaseKey] = useState("");
  const [accountForm, setAccountForm] = useState({ legalName: "", billingEmail: "", lenderName: "", policyVersion: "v1" });
  const [caseForm, setCaseForm] = useState({ parcelId: "", requestedAmountMinor: "", declaredCollateralValueMinor: "", currency: "USD", mortgageApplicationId: "", borrowerId: "" });
  const [evidenceForm, setEvidenceForm] = useState({ evidenceType: "title_search", sourceReference: "", sourceChecksumSha256: "" });
  const [reviewNotes, setReviewNotes] = useState("");
  const [caseStatus, setCaseStatus] = useState<(typeof CASE_STATUSES)[number]>("evidence_requested");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [invoiceKeyForPayment, setInvoiceKeyForPayment] = useState("");
  const [providerTransactionId, setProviderTransactionId] = useState("");

  useEffect(() => {
    if (!accountKey && accountsQuery.data?.[0]?.accountKey) setAccountKey(accountsQuery.data[0].accountKey);
  }, [accountKey, accountsQuery.data]);

  const dashboardQuery = trpc.commercialLender.dashboard.useQuery(
    { accountKey: accountKey || "LEND-00000000000000000000", caseKey: selectedCaseKey || undefined },
    { enabled: Boolean(accountKey), refetchInterval: 30_000 },
  );

  useEffect(() => {
    const firstCase = dashboardQuery.data?.cases?.[0]?.caseKey;
    if (!selectedCaseKey && firstCase) setSelectedCaseKey(firstCase);
  }, [dashboardQuery.data?.cases, selectedCaseKey]);

  const createAccount = trpc.commercialLender.createLenderAccount.useMutation({
    onSuccess: async (account) => {
      toast.success("Lender commercial account created with a controlled trial subscription");
      setAccountKey(account.accountKey);
      setAccountForm({ legalName: "", billingEmail: "", lenderName: "", policyVersion: "v1" });
      await utils.commercialLender.listMyAccounts.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const createCase = trpc.commercialLender.createCase.useMutation({
    onSuccess: async (caseRow) => {
      toast.success("Collateral case opened. Submit and verify evidence before review.");
      setSelectedCaseKey(caseRow.caseKey);
      setCaseForm({ parcelId: "", requestedAmountMinor: "", declaredCollateralValueMinor: "", currency: "USD", mortgageApplicationId: "", borrowerId: "" });
      await utils.commercialLender.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const submitEvidence = trpc.commercialLender.submitEvidence.useMutation({
    onSuccess: async () => {
      toast.success("Evidence submitted for independent reviewer verification");
      setEvidenceForm({ evidenceType: "title_search", sourceReference: "", sourceChecksumSha256: "" });
      await utils.commercialLender.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const reviewEvidence = trpc.commercialLender.reviewEvidence.useMutation({
    onSuccess: async () => {
      toast.success("Evidence review recorded");
      setReviewNotes("");
      await utils.commercialLender.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const transitionCase = trpc.commercialLender.transitionCase.useMutation({
    onSuccess: async () => {
      toast.success("Collateral case state updated");
      setDecisionNotes("");
      await utils.commercialLender.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const issueInvoice = trpc.commercialLender.issueInvoice.useMutation({
    onSuccess: async () => {
      toast.success("Commercial invoice issued for reconciliation");
      await utils.commercialLender.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const initializeInvoicePayment = trpc.commercialLender.initializeInvoicePayment.useMutation({
    onSuccess: (payment) => {
      toast.success("Secure commercial checkout created. Complete payment with the configured provider, then return here to verify it.");
      window.location.assign(payment.authorizationUrl);
    },
    onError: (error) => toast.error(error.message),
  });

  const verifyInvoicePayment = trpc.commercialLender.verifyInvoicePayment.useMutation({
    onSuccess: async () => {
      toast.success("Provider-confirmed payment recorded and commercial subscription renewed");
      setInvoiceKeyForPayment("");
      setProviderTransactionId("");
      await utils.commercialLender.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const selectedCase = dashboardQuery.data?.selectedCase;
  const usage = dashboardQuery.data?.usageByMetric ?? {};
  const activeSubscription = dashboardQuery.data?.subscriptions?.[0];
  const payableInvoices = useMemo(
    () => (dashboardQuery.data?.invoices ?? []).filter((invoice) => invoice.status === "issued" || invoice.status === "overdue"),
    [dashboardQuery.data?.invoices],
  );

  if (accountsQuery.isLoading) {
    return <div className="container mx-auto flex min-h-[50vh] items-center justify-center text-muted-foreground">Loading commercial accounts…</div>;
  }

  if (!accountsQuery.data?.length) {
    return (
      <div className="container mx-auto max-w-3xl space-y-6 py-8">
        <div>
          <h1 className="text-3xl font-bold">Lender Collateral Control</h1>
          <p className="mt-2 text-muted-foreground">Create an institution-scoped workspace for collateral evidence, human review, auditable portfolio operations, and commercial billing.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Create lender commercial account</CardTitle>
            <CardDescription>A trial subscription starts with an accountable owner. Credit decisions remain with authorized lender personnel.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Legal organization name</Label><Input value={accountForm.legalName} onChange={(event) => setAccountForm({ ...accountForm, legalName: event.target.value })} /></div>
            <div className="space-y-2"><Label>Billing email</Label><Input type="email" value={accountForm.billingEmail} onChange={(event) => setAccountForm({ ...accountForm, billingEmail: event.target.value })} /></div>
            <div className="space-y-2"><Label>Lender display name</Label><Input value={accountForm.lenderName} onChange={(event) => setAccountForm({ ...accountForm, lenderName: event.target.value })} /></div>
            <div className="space-y-2"><Label>Collateral policy version</Label><Input value={accountForm.policyVersion} onChange={(event) => setAccountForm({ ...accountForm, policyVersion: event.target.value })} /></div>
            <div className="md:col-span-2 flex justify-end"><Button disabled={createAccount.isPending} onClick={() => createAccount.mutate(accountForm)}><Plus className="mr-2 h-4 w-4" /> Create controlled trial</Button></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Lender Collateral Control</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">Institution-scoped collateral evidence and human review. This application does not automate underwriting, approve a loan, or create a title determination.</p>
        </div>
        <div className="w-full lg:w-80"><Label>Commercial account</Label><Select value={accountKey} onValueChange={(value) => { setAccountKey(value); setSelectedCaseKey(""); }}><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{accountsQuery.data.map((account) => <SelectItem key={account.accountKey} value={account.accountKey}>{account.legalName} · {account.role}</SelectItem>)}</SelectContent></Select></div>
      </div>

      {dashboardQuery.isLoading && <div className="text-muted-foreground">Loading lender portfolio…</div>}
      {dashboardQuery.error && <Card className="border-destructive"><CardContent className="flex gap-3 pt-6 text-destructive"><AlertTriangle className="h-5 w-5" />{dashboardQuery.error.message}</CardContent></Card>}

      {dashboardQuery.data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardDescription>Account status</CardDescription><CardTitle className="flex items-center gap-2 text-xl"><ShieldCheck className="h-5 w-5" /> {dashboardQuery.data.account.accountStatus}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{dashboardQuery.data.account.legalName}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Subscription</CardDescription><CardTitle className="text-xl">{activeSubscription?.product.name ?? "Unavailable"}</CardTitle></CardHeader><CardContent><Badge variant={statusVariant(activeSubscription?.subscription.status ?? "cancelled")}>{activeSubscription?.subscription.status ?? "cancelled"}</Badge><p className="mt-2 text-sm text-muted-foreground">Renews {activeSubscription ? new Date(activeSubscription.subscription.currentPeriodEnd).toLocaleDateString() : "—"}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Active collateral cases</CardDescription><CardTitle className="text-3xl">{dashboardQuery.data.cases.filter((item) => !TERMINAL_CASE_STATUSES.has(item.status)).length}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Usage recorded with idempotent evidence provenance.</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Evidence reviews this period</CardDescription><CardTitle className="text-3xl">{usage.monthly_evidence_reviews ?? 0}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">No evidence is treated as accepted until a human review is recorded.</p></CardContent></Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Open collateral case</CardTitle><CardDescription>Link a governed parcel and, optionally, an existing mortgage application. Amounts are stored in the smallest currency unit.</CardDescription></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Parcel ID</Label><Input inputMode="numeric" value={caseForm.parcelId} onChange={(event) => setCaseForm({ ...caseForm, parcelId: event.target.value })} /></div>
                <div className="space-y-2"><Label>Requested amount (minor units)</Label><Input inputMode="numeric" value={caseForm.requestedAmountMinor} onChange={(event) => setCaseForm({ ...caseForm, requestedAmountMinor: event.target.value })} /></div>
                <div className="space-y-2"><Label>Declared collateral value (optional)</Label><Input inputMode="numeric" value={caseForm.declaredCollateralValueMinor} onChange={(event) => setCaseForm({ ...caseForm, declaredCollateralValueMinor: event.target.value })} /></div>
                <div className="space-y-2"><Label>Currency</Label><Input maxLength={3} value={caseForm.currency} onChange={(event) => setCaseForm({ ...caseForm, currency: event.target.value.toUpperCase() })} /></div>
                <div className="space-y-2"><Label>Mortgage application ID (optional)</Label><Input inputMode="numeric" value={caseForm.mortgageApplicationId} onChange={(event) => setCaseForm({ ...caseForm, mortgageApplicationId: event.target.value })} /></div>
                <div className="space-y-2"><Label>Borrower user ID (optional)</Label><Input inputMode="numeric" value={caseForm.borrowerId} onChange={(event) => setCaseForm({ ...caseForm, borrowerId: event.target.value })} /></div>
                <div className="md:col-span-2 flex justify-end"><Button disabled={createCase.isPending} onClick={() => createCase.mutate({ accountKey, parcelId: Number(caseForm.parcelId), requestedAmountMinor: Number(caseForm.requestedAmountMinor), declaredCollateralValueMinor: caseForm.declaredCollateralValueMinor ? Number(caseForm.declaredCollateralValueMinor) : undefined, currency: caseForm.currency, mortgageApplicationId: caseForm.mortgageApplicationId ? Number(caseForm.mortgageApplicationId) : undefined, borrowerId: caseForm.borrowerId ? Number(caseForm.borrowerId) : undefined })}><ClipboardCheck className="mr-2 h-4 w-4" /> Open case</Button></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Portfolio case queue</CardTitle><CardDescription>Cases stay within the selected commercial account. Select a case to view its evidence and immutable activity history.</CardDescription></CardHeader>
              <CardContent className="space-y-2">{dashboardQuery.data.cases.length ? dashboardQuery.data.cases.map((item) => <button type="button" key={item.caseKey} onClick={() => setSelectedCaseKey(item.caseKey)} className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/40 ${selectedCaseKey === item.caseKey ? "border-primary bg-muted/40" : ""}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{item.caseKey}</span><Badge variant={statusVariant(item.status)}>{item.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Parcel {item.parcelId} · {money(item.requestedAmountMinor, item.currency)}</p></button>) : <p className="text-sm text-muted-foreground">No collateral cases are open for this account.</p>}</CardContent>
            </Card>
          </div>

          {selectedCase && (
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5" /> Evidence for {selectedCase.case.caseKey}</CardTitle><CardDescription>Evidence references and checksums are recorded before human verification. Direct object-store paths must not be used as evidence references.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Evidence type</Label><Input value={evidenceForm.evidenceType} onChange={(event) => setEvidenceForm({ ...evidenceForm, evidenceType: event.target.value })} /></div><div className="space-y-2"><Label>Source reference</Label><Input value={evidenceForm.sourceReference} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceReference: event.target.value })} /></div></div>
                  <div className="space-y-2"><Label>SHA-256 checksum (optional)</Label><Input value={evidenceForm.sourceChecksumSha256} onChange={(event) => setEvidenceForm({ ...evidenceForm, sourceChecksumSha256: event.target.value })} /></div>
                  <Button disabled={submitEvidence.isPending || TERMINAL_CASE_STATUSES.has(selectedCase.case.status)} onClick={() => submitEvidence.mutate({ accountKey, caseKey: selectedCase.case.caseKey, ...evidenceForm, sourceChecksumSha256: evidenceForm.sourceChecksumSha256 || undefined })}><Plus className="mr-2 h-4 w-4" /> Submit evidence</Button>
                  <div className="space-y-2">{selectedCase.evidence.map((evidence) => <div key={evidence.evidenceKey} className="rounded border p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{evidence.evidenceType}</span><Badge variant={statusVariant(evidence.status)}>{evidence.status}</Badge></div><p className="mt-1 break-all text-xs text-muted-foreground">{evidence.sourceReference}</p>{evidence.status === "pending" && <div className="mt-3 flex flex-col gap-2"><Textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Human verification rationale" /><div className="flex gap-2"><Button size="sm" disabled={reviewEvidence.isPending || reviewNotes.trim().length < 8} onClick={() => reviewEvidence.mutate({ accountKey, evidenceKey: evidence.evidenceKey, status: "accepted", reviewNotes })}><CheckCircle2 className="mr-2 h-4 w-4" /> Accept</Button><Button size="sm" variant="outline" disabled={reviewEvidence.isPending || reviewNotes.trim().length < 8} onClick={() => reviewEvidence.mutate({ accountKey, evidenceKey: evidence.evidenceKey, status: "rejected", reviewNotes })}>Reject</Button></div></div>}</div>)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Human review and decision</CardTitle><CardDescription>Only permitted institution members can advance a case. Approval, conditional approval, and decline require a written human rationale.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><Label>Next case state</Label><Select value={caseStatus} onValueChange={(value) => setCaseStatus(value as (typeof CASE_STATUSES)[number])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CASE_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Current state</Label><Input disabled value={selectedCase.case.status} /></div></div>
                  <div className="space-y-2"><Label>Decision or transition notes</Label><Textarea value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} placeholder="Required for conditional approval, approval, or decline" /></div>
                  <Button disabled={transitionCase.isPending || TERMINAL_CASE_STATUSES.has(selectedCase.case.status)} onClick={() => transitionCase.mutate({ accountKey, caseKey: selectedCase.case.caseKey, nextStatus: caseStatus, decisionNotes: decisionNotes || undefined })}>Record controlled transition</Button>
                  <div className="space-y-2 border-t pt-4"><p className="font-medium">Case activity</p>{selectedCase.events.map((event) => <div key={event.id} className="rounded border p-3 text-sm"><div className="flex justify-between gap-3"><span>{event.description}</span><span className="shrink-0 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span></div></div>)}</div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" /> Commercial invoices</CardTitle><CardDescription>Invoices use the configured plan price. Provider checkout and verification occur server-side; browser input cannot mark an invoice paid.</CardDescription></CardHeader>
              <CardContent className="space-y-3"><Button disabled={issueInvoice.isPending} onClick={() => issueInvoice.mutate({ accountKey })}><BadgeDollarSign className="mr-2 h-4 w-4" /> Issue current subscription invoice</Button>{dashboardQuery.data.invoices.map((invoice) => <div key={invoice.invoiceKey} className="rounded border p-3"><div className="flex items-center justify-between"><span className="font-medium">{invoice.invoiceKey}</span><Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{money(invoice.totalMinor, invoice.currency)} · due {invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "not issued"}</p></div>)}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Provider-verified invoice payment</CardTitle><CardDescription>Start a server-created checkout supported by the configured provider and invoice currency. After completing the provider flow, return here and ask the server to verify the exact paid amount and currency before access is renewed.</CardDescription></CardHeader>
              <CardContent className="space-y-3"><Select value={invoiceKeyForPayment} onValueChange={setInvoiceKeyForPayment}><SelectTrigger><SelectValue placeholder="Select an issued invoice" /></SelectTrigger><SelectContent>{payableInvoices.map((invoice) => <SelectItem key={invoice.invoiceKey} value={invoice.invoiceKey}>{invoice.invoiceKey} · {money(invoice.totalMinor, invoice.currency)} · {invoice.currency}</SelectItem>)}</SelectContent></Select><Input value={providerTransactionId} onChange={(event) => setProviderTransactionId(event.target.value)} placeholder="Flutterwave transaction ID after redirect (not needed for Paystack)" /><div className="flex flex-wrap gap-2"><Button disabled={initializeInvoicePayment.isPending || !invoiceKeyForPayment} onClick={() => initializeInvoicePayment.mutate({ accountKey, invoiceKey: invoiceKeyForPayment, callbackUrl: `${window.location.origin}/lender-collateral-control` })}>{initializeInvoicePayment.isPending ? "Opening checkout…" : "Open secure checkout"}</Button><Button variant="outline" disabled={verifyInvoicePayment.isPending || !invoiceKeyForPayment} onClick={() => verifyInvoicePayment.mutate({ accountKey, invoiceKey: invoiceKeyForPayment, providerTransactionId: providerTransactionId || undefined })}>{verifyInvoicePayment.isPending ? "Verifying…" : "Verify provider payment"}</Button></div><p className="text-xs text-muted-foreground">Checkout is available only when the configured provider credential is present. The server verifies the exact amount, currency, and paid state; Flutterwave additionally requires the returned transaction ID.</p></CardContent>
            </Card>
          </div>
        </>
      )}

      <div className="text-sm text-muted-foreground"><Link href="/loan-officer" className="underline">Return to existing mortgage operations</Link></div>
    </div>
  );
}
