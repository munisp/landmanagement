import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Database,
  FileKey2,
  Handshake,
  Leaf,
  Network,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { ContextPill, MetricTile, PageHero, WorkspaceEmptyState } from "@/components/ExperiencePrimitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const PRODUCTS = [
  {
    key: "acquisition-intelligence",
    prefix: "ACQ-",
    name: "Acquisition intelligence",
    shortName: "Data rooms",
    icon: Database,
    tone: "blue" as const,
    description: "Organize factual due-diligence evidence in governed data rooms.",
    boundary: "No investment advice or acquisition decision is produced here.",
    action: "Open data room",
    fields: { name: "Data room name", purpose: "Approved diligence purpose", extra: "Additional reference (optional)" },
  },
  {
    key: "resilience-exposure-monitor",
    prefix: "EXP-",
    name: "Resilience & exposure monitor",
    shortName: "Exposure",
    icon: ShieldAlert,
    tone: "amber" as const,
    description: "Maintain attributable public-context portfolios with human interpretation.",
    boundary: "No underwriting, safety, claims, or emergency decision is produced here.",
    action: "Create portfolio",
    fields: { name: "Portfolio name", purpose: "Context note (optional)", extra: "Additional reference (optional)" },
  },
  {
    key: "property-data-api",
    prefix: "API-",
    name: "Property data & integration API",
    shortName: "Integrations",
    icon: Network,
    tone: "emerald" as const,
    description: "Issue purpose-bound clients with immutable usage records.",
    boundary: "Only approved factual projections are available; every call is purpose-bound.",
    action: "Create scoped client",
    fields: { name: "Client name", purpose: "Approved use case", extra: "Approved scopes, comma separated" },
  },
  {
    key: "planning-analytics",
    prefix: "PLN-",
    name: "Land market & planning analytics",
    shortName: "Planning",
    icon: BarChart3,
    tone: "blue" as const,
    description: "Create privacy-preserving, cohort-suppressed aggregate reports.",
    boundary: "Small cohorts are suppressed and reports cannot be used for re-identification.",
    action: "Create aggregate report",
    fields: { name: "Report name", purpose: "Planning purpose", extra: "Cohort size, minimum cohort" },
  },
  {
    key: "rural-agribusiness-hub",
    prefix: "RUR-",
    name: "Rural land & agribusiness hub",
    shortName: "Rural services",
    icon: Leaf,
    tone: "emerald" as const,
    description: "Coordinate consent-backed rural service cases with clear references.",
    boundary: "This workspace does not score land rights or make eligibility decisions.",
    action: "Open rural service case",
    fields: { name: "Program type", purpose: "Verified consent reference", extra: "Service reference" },
  },
  {
    key: "trusted-service-directory",
    prefix: "SVC-",
    name: "Trusted service directory",
    shortName: "Directory",
    icon: Handshake,
    tone: "amber" as const,
    description: "Submit verified professionals and consented service requests.",
    boundary: "Provider status requires independent verification; no ownership-data lead sale.",
    action: "Submit provider",
    fields: { name: "Provider legal name", purpose: "Service categories, comma separated", extra: "Service radius in km" },
  },
] as const;

type ProductKey = (typeof PRODUCTS)[number]["key"];

export default function PortfolioProductHub() {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.commercialLender.listMyAccounts.useQuery();
  const [product, setProduct] = useState<ProductKey>("acquisition-intelligence");
  const [accountKey, setAccountKey] = useState("");
  const [account, setAccount] = useState({ legalName: "", billingEmail: "" });
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [extra, setExtra] = useState("");
  const [secretReveal, setSecretReveal] = useState("");

  const spec = useMemo(() => PRODUCTS.find((item) => item.key === product)!, [product]);
  const accounts = (accountsQuery.data ?? []).filter((item) => item.accountKey.startsWith(spec.prefix));

  useEffect(() => {
    setAccountKey("");
    setName("");
    setPurpose("");
    setExtra("");
    setSecretReveal("");
  }, [product]);

  useEffect(() => {
    if (!accountKey && accounts[0]) setAccountKey(accounts[0].accountKey);
  }, [accountKey, accounts]);

  const create = trpc.portfolioProducts.createAccount.useMutation({
    onSuccess: async (result) => {
      setAccountKey(result.accountKey);
      await utils.commercialLender.listMyAccounts.invalidate();
      toast.success("Controlled commercial trial created");
    },
    onError: (error) => toast.error(error.message),
  });
  const createRoom = trpc.portfolioProducts.createDataroom.useMutation({ onSuccess: () => toast.success("Data room opened"), onError: (error) => toast.error(error.message) });
  const createPortfolio = trpc.portfolioProducts.createExposurePortfolio.useMutation({ onSuccess: () => toast.success("Exposure portfolio created"), onError: (error) => toast.error(error.message) });
  const createClient = trpc.portfolioProducts.createApiClient.useMutation({
    onSuccess: (result) => {
      setSecretReveal(result.secret);
      toast.success("Scoped client created. Copy the secret now; it is not shown again.");
    },
    onError: (error) => toast.error(error.message),
  });
  const createReport = trpc.portfolioProducts.createPlanningReport.useMutation({
    onSuccess: (result) => toast.success(result.suppressed ? "Report safely suppressed because the cohort is below its threshold" : "Aggregate report created"),
    onError: (error) => toast.error(error.message),
  });
  const createRural = trpc.portfolioProducts.createRuralCase.useMutation({ onSuccess: () => toast.success("Consent-backed rural case created"), onError: (error) => toast.error(error.message) });
  const createProvider = trpc.portfolioProducts.createProvider.useMutation({ onSuccess: () => toast.success("Provider submitted for independent verification"), onError: (error) => toast.error(error.message) });

  const busy = create.isPending || createRoom.isPending || createPortfolio.isPending || createClient.isPending || createReport.isPending || createRural.isPending || createProvider.isPending;

  function submitWorkflow() {
    if (!accountKey) return toast.error("Create or choose a product account first");
    if (!name.trim()) return toast.error(`Enter ${spec.fields.name.toLowerCase()}`);
    if (product === "acquisition-intelligence") return createRoom.mutate({ accountKey, name, purpose });
    if (product === "resilience-exposure-monitor") return createPortfolio.mutate({ accountKey, name });
    if (product === "property-data-api") return createClient.mutate({ accountKey, name, purpose, scopes: extra.split(",").map((value) => value.trim()).filter(Boolean) });
    if (product === "planning-analytics") {
      const [cohortSize, minimumCohort] = extra.split(",").map(Number);
      return createReport.mutate({ accountKey, name, cohortSize, minimumCohort, summary: { purpose } });
    }
    if (product === "rural-agribusiness-hub") return createRural.mutate({ accountKey, programType: name, consentReference: purpose, serviceReference: extra });
    return createProvider.mutate({ accountKey, legalName: name, serviceCategories: purpose.split(",").map((value) => value.trim()).filter(Boolean), serviceRadiusKm: Number(extra) });
  }

  return (
    <div className="experience-page">
      <PageHero
        eyebrow="Commercial workspaces"
        title="A governed portfolio built around real work."
        description="Choose the workspace that matches the outcome you are responsible for. Each product keeps its own organization boundary, entitlement, audit trail, and decision limitation."
        actions={<ContextPill tone="success"><CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> Human review remains in control</ContextPill>}
        aside={<><p className="text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Your next step</p><p className="mt-2 text-sm font-medium leading-6 text-slate-900">Select a workspace, activate its organization account, then begin a controlled task.</p></>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Commercial workspaces">
        {PRODUCTS.map((item) => {
          const Icon = item.icon;
          const active = item.key === product;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setProduct(item.key)}
              aria-pressed={active}
              className={`experience-action-card group relative overflow-hidden ${active ? "border-blue-400 bg-blue-50/55 ring-2 ring-blue-100" : ""}`}
            >
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${active ? "bg-blue-700 text-white shadow-lg shadow-blue-700/20" : "bg-slate-100 text-slate-700"}`}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-950">{item.name}</p><p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p></div>
                <ArrowRight aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${active ? "translate-x-0 text-blue-700" : "text-slate-400 group-hover:translate-x-1"}`} />
              </div>
              {active ? <span className="mt-4 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800 shadow-sm">Selected workspace</span> : null}
            </button>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="experience-panel overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><ContextPill tone="info">Step {accounts.length ? "2 of 2" : "1 of 2"}</ContextPill><span className="text-xs font-medium text-slate-500">{spec.shortName}</span></div>
                <CardTitle className="mt-3 text-xl tracking-[-0.03em] text-slate-950">{accounts.length ? spec.action : "Activate a controlled workspace"}</CardTitle>
                <CardDescription className="mt-1.5 max-w-2xl leading-6 text-slate-600">{accounts.length ? "Choose the institutional account responsible for this work, then provide only the minimum context required to begin." : "Your organization account establishes entitlement, billing visibility, and a traceable boundary before operational work starts."}</CardDescription>
              </div>
              <span className="hidden rounded-2xl bg-white p-3 text-blue-700 shadow-sm ring-1 ring-slate-200 sm:grid"><Sparkles aria-hidden="true" className="h-5 w-5" /></span>
            </div>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {!accounts.length ? (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2"><Label htmlFor="legalName">Institution legal name</Label><p className="mt-1 text-xs text-slate-500">Use the legal entity that will own this product account.</p><Input id="legalName" className="mt-2 h-11 rounded-xl" placeholder="Example Land Services Ltd." value={account.legalName} onChange={(event) => setAccount({ ...account, legalName: event.target.value })} /></div>
                <div className="md:col-span-2"><Label htmlFor="billingEmail">Billing contact</Label><p className="mt-1 text-xs text-slate-500">Invoices and subscription notices are sent to this address.</p><Input id="billingEmail" className="mt-2 h-11 rounded-xl" placeholder="finance@example.org" type="email" value={account.billingEmail} onChange={(event) => setAccount({ ...account, billingEmail: event.target.value })} /></div>
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50/70 p-3"><p className="max-w-lg text-xs leading-5 text-blue-900">Activation creates a controlled trial. Payment, renewal, and access decisions continue to be verified by the existing commercial workflow.</p><Button className="rounded-xl" disabled={busy || !account.legalName.trim() || !account.billingEmail.trim()} onClick={() => create.mutate({ productKey: product, ...account })}>{busy ? "Creating…" : "Create controlled trial"}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Button></div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2"><Label htmlFor="productAccount">Responsible product account</Label><Select value={accountKey} onValueChange={setAccountKey}><SelectTrigger id="productAccount" className="mt-2 h-11 rounded-xl bg-white"><SelectValue placeholder="Choose an account" /></SelectTrigger><SelectContent>{accounts.map((item) => <SelectItem key={item.accountKey} value={item.accountKey}>{item.legalName} · {item.accountKey}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label htmlFor="workspaceName">{spec.fields.name}</Label><Input id="workspaceName" className="mt-2 h-11 rounded-xl" value={name} onChange={(event) => setName(event.target.value)} /></div>
                  <div><Label htmlFor="workspacePurpose">{spec.fields.purpose}</Label><Input id="workspacePurpose" className="mt-2 h-11 rounded-xl" value={purpose} onChange={(event) => setPurpose(event.target.value)} /></div>
                  <div className="md:col-span-2"><Label htmlFor="workspaceReference">{spec.fields.extra}</Label><Textarea id="workspaceReference" className="mt-2 min-h-22 rounded-xl" value={extra} onChange={(event) => setExtra(event.target.value)} placeholder={product === "property-data-api" ? "parcel.read" : product === "planning-analytics" ? "35,10" : "Add a source, service, or supporting reference if useful"} /></div>
                </div>
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-2xl text-xs leading-5 text-slate-600"><strong className="font-semibold text-slate-900">Decision boundary:</strong> {spec.boundary}</p><Button className="rounded-xl" disabled={busy || !accountKey} onClick={submitWorkflow}>{busy ? "Saving…" : spec.action}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Button></div>
                {secretReveal ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-amber-950"><FileKey2 aria-hidden="true" className="h-4 w-4" /><p className="text-sm font-semibold">Copy this client secret now</p></div><p className="mt-1 text-xs leading-5 text-amber-900">For security, this secret is never shown again after you leave this workspace.</p><code className="mt-3 block break-all rounded-xl bg-white p-3 text-xs text-slate-800 ring-1 ring-amber-200">{secretReveal}</code></div> : null}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <MetricTile icon={CheckCircle2} label="Available workspaces" value={PRODUCTS.length} detail="Each has its own entitlement and audit boundary." tone="blue" />
          <MetricTile icon={ShieldAlert} label="Decision posture" value="Human" detail="The platform records accountable work; it does not replace professional judgment." tone="amber" />
          <div className="experience-panel p-4"><p className="text-sm font-semibold text-slate-900">Working responsibly</p><ul className="mt-3 space-y-3 text-sm leading-5 text-slate-600"><li className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Use an account belonging to the responsible institution.</li><li className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Record a clear purpose and reference for governed work.</li><li className="flex gap-2"><CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Keep final decisions with authorized reviewers.</li></ul></div>
        </aside>
      </section>

      {accountsQuery.isError ? <WorkspaceEmptyState icon={ShieldAlert} title="Workspace accounts are unavailable" description="Reconnect and retry to load your commercial accounts. No new work can begin until the responsible organization context is available." action={{ label: "Retry account loading", onClick: () => void accountsQuery.refetch() }} /> : null}
      <Link href="/dashboard" className="inline-flex items-center gap-2 px-1 text-sm font-medium text-slate-600 transition hover:text-slate-950"><ArrowRight aria-hidden="true" className="h-4 w-4 rotate-180" /> Return to operations dashboard</Link>
    </div>
  );
}
