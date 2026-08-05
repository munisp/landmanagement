import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeCheck,
  Copy,
  Clock3,
  KeyRound,
  Send,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";

import { ContextPill, MetricTile, PageHero, WorkspaceEmptyState } from "@/components/ExperiencePrimitives";
import { trpc } from "@/lib/trpc";

const SECTORS = ["land", "mining", "oil_gas", "water", "forestry", "agriculture", "fisheries", "renewable_energy"] as const;
const ROLES_BY_SECTOR: Record<(typeof SECTORS)[number], string[]> = {
  land: ["citizen", "surveyor", "registrar", "admin"],
  mining: ["operator", "inspector", "registrar", "admin"],
  oil_gas: ["operator", "inspector", "registrar", "admin"],
  water: ["rights_holder", "inspector", "registrar", "admin"],
  forestry: ["operator", "inspector", "registrar", "admin"],
  agriculture: ["operator", "inspector", "registrar", "admin"],
  fisheries: ["operator", "inspector", "admin"],
  renewable_energy: ["operator", "inspector", "admin"],
};

function pretty(value: string) { return value.replaceAll("_", " "); }
function readyForActivation(record: any) { return Boolean(record.keycloakUserId && record.permifyPoliciesApplied && record.ninVerified && record.documentsVerified); }

export default function StakeholderOnboarding() {
  const [selectedSector, setSelectedSector] = useState<(typeof SECTORS)[number]>("land");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("citizen");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const recordsQuery = trpc.onboarding.listOnboardingRecords.useQuery({ limit: 100, page: 1 });
  const initiate = trpc.onboarding.initiate.useMutation({
    onSuccess: async (result) => { setInviteToken(result.inviteToken); setUserId(""); await utils.onboarding.listOnboardingRecords.invalidate(); toast.success("Managed invitation created"); },
    onError: (error) => toast.error(error.message),
  });
  const provision = trpc.onboarding.provisionKeycloak.useMutation({ onSuccess: async () => { await utils.onboarding.listOnboardingRecords.invalidate(); toast.success("Secure account provisioned"); }, onError: (error) => toast.error(error.message) });
  const applyPolicies = trpc.onboarding.applyPolicies.useMutation({ onSuccess: async () => { await utils.onboarding.listOnboardingRecords.invalidate(); toast.success("Workspace access synchronized"); }, onError: (error) => toast.error(error.message) });
  const activate = trpc.onboarding.activate.useMutation({ onSuccess: async () => { await utils.onboarding.listOnboardingRecords.invalidate(); toast.success("Stakeholder activated"); }, onError: (error) => toast.error(error.message) });

  const records = recordsQuery.data?.items ?? [];
  const sectorRecords = useMemo(() => records.filter((record: any) => record.sector === selectedSector), [records, selectedSector]);
  const activeCount = records.filter((record: any) => record.onboardingStatus === "active").length;
  const blockedCount = records.filter((record: any) => !readyForActivation(record) && record.onboardingStatus !== "active").length;
  const roles = ROLES_BY_SECTOR[selectedSector];
  const recordsLoading = recordsQuery.isLoading;
  const recordsUnavailable = recordsQuery.isError;
  const activationPosture = recordsLoading
    ? "Loading activation readiness"
    : recordsUnavailable
      ? "Managed readiness is temporarily unavailable"
      : blockedCount
        ? `${blockedCount} records need a controlled handoff`
        : "All visible records are ready or active";

  const selectSector = (sector: (typeof SECTORS)[number]) => { setSelectedSector(sector); setRole(ROLES_BY_SECTOR[sector][0]); };
  const startInvitation = () => {
    const parsedUserId = Number(userId);
    if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) { toast.error("Enter a valid existing platform user ID"); return; }
    initiate.mutate({ userId: parsedUserId, sector: selectedSector, role });
  };
  const copyInvite = async () => {
    if (!inviteToken) return;
    try { await navigator.clipboard.writeText(inviteToken); toast.success("Invitation token copied"); } catch { toast.error("Copy is unavailable in this browser. Use your approved secure delivery channel."); }
  };

  return <div className="experience-page">
    <PageHero
      eyebrow="Authorized activation management"
      title="Guide people into the right work, without weakening the controls."
      description="Create managed invitations, see every activation prerequisite in one place, and advance only the steps your administrator role is authorized to perform. Identity, document verification, and final activation remain server-governed."
      actions={<><ContextPill tone="info"><UsersRound aria-hidden="true" className="h-3.5 w-3.5" />{recordsLoading ? "Loading records" : `${records.length} managed records`}</ContextPill><ContextPill tone="success">{recordsLoading ? "Checking active" : `${activeCount} active`}</ContextPill></>}
      aside={<><p className="text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Activation posture</p><p className="mt-2 text-base font-semibold text-slate-950">{activationPosture}</p><p className="mt-1.5 text-sm leading-5 text-slate-600">A waiting milestone identifies its owner so participants are not sent through unsupported or unsafe shortcuts.</p></>}
    />

    <section className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="space-y-4"><div className="experience-panel p-4"><p className="px-2 pb-3 text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Sector focus</p><div className="space-y-1">{SECTORS.map((sector) => <button key={sector} type="button" onClick={() => selectSector(sector)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${selectedSector === sector ? "bg-blue-700 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}><span className="capitalize">{pretty(sector)}</span><span className={`text-xs ${selectedSector === sector ? "text-blue-100" : "text-slate-400"}`}>{records.filter((record: any) => record.sector === sector).length}</span></button>)}</div></div><div className="grid grid-cols-2 gap-3"><MetricTile icon={BadgeCheck} label="Active" value={activeCount} detail="Participants ready for governed work" tone="emerald" /><MetricTile icon={Clock3} label="Waiting" value={blockedCount} detail="Records with controlled prerequisites" tone="amber" /></div></aside>

      <div className="space-y-5">
        <div className="experience-panel overflow-hidden"><div className="border-b border-slate-100 bg-slate-50/75 px-5 py-5 sm:px-6"><div className="flex items-center gap-2 text-blue-700"><UserPlus aria-hidden="true" className="h-4 w-4" /><span className="text-xs font-semibold tracking-[0.1em] uppercase">Step 1 · Managed invitation</span></div><h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950">Start a safe participant journey</h2><p className="mt-1 text-sm leading-6 text-slate-600">Use an existing platform user ID. The participant receives no access until secure account, policy, verification, and activation requirements are complete.</p></div><div className="grid gap-4 p-5 sm:grid-cols-3 sm:p-6"><label className="space-y-2"><span className="text-sm font-semibold text-slate-800">Platform user ID</span><input value={userId} onChange={(event) => setUserId(event.target.value)} inputMode="numeric" placeholder="e.g. 1042" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label><label className="space-y-2"><span className="text-sm font-semibold text-slate-800">Sector</span><select value={selectedSector} onChange={(event) => selectSector(event.target.value as (typeof SECTORS)[number])} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">{SECTORS.map((sector) => <option key={sector} value={sector}>{pretty(sector)}</option>)}</select></label><label className="space-y-2"><span className="text-sm font-semibold text-slate-800">Approved role</span><select value={role} onChange={(event) => setRole(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">{roles.map((item) => <option key={item} value={item}>{pretty(item)}</option>)}</select></label></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6"><p className="text-xs leading-5 text-slate-500">Invitation tokens are one-time administrative secrets. Deliver them only through an approved secure channel.</p><button type="button" disabled={initiate.isPending} onClick={startInvitation} className="inline-flex h-10 items-center rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{initiate.isPending ? "Creating…" : "Create managed invitation"}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></button></div></div>

        {inviteToken ? <div className="experience-panel border-blue-200 bg-blue-50/50 p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-700 text-white"><Send aria-hidden="true" className="h-4 w-4" /></div><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-slate-950">Deliver this invitation through an approved channel</h2><p className="mt-1 text-sm leading-5 text-slate-600">This token expires in seven days. It is displayed after creation so an authorized administrator can deliver it securely; do not add it to a case note or public message.</p><div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-white p-2"><code className="min-w-0 flex-1 break-all px-2 text-xs text-slate-700">{inviteToken}</code><button type="button" onClick={() => void copyInvite()} className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50"><Copy aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />Copy</button></div></div></div></div> : null}

        <div className="experience-panel overflow-hidden"><div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/75 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6"><div><h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{pretty(selectedSector)} participant readiness</h2><p className="mt-1 text-sm leading-6 text-slate-600">Advance only the next allowed operational step. Verification and final activation remain visibly gated.</p></div><ContextPill tone="neutral">{sectorRecords.length} visible</ContextPill></div>{recordsLoading ? <WorkspaceEmptyState icon={ShieldCheck} title="Loading managed records" description="Retrieving authorized onboarding status." /> : null}{recordsUnavailable ? <WorkspaceEmptyState icon={ShieldCheck} title="Managed records are temporarily unavailable" description="Reconnect and retry. The console will not represent unavailable protected data as an empty activation queue." action={{ label: "Retry", onClick: () => void recordsQuery.refetch() }} /> : null}{!recordsLoading && !recordsUnavailable && !sectorRecords.length ? <WorkspaceEmptyState icon={UsersRound} title="No onboarding records in this sector" description="Create a managed invitation when an existing platform user is ready for an authorized role." /> : null}<div className="divide-y divide-slate-100">{sectorRecords.map((record: any) => { const canProvision = !record.keycloakUserId; const canApply = Boolean(record.keycloakUserId && !record.permifyPoliciesApplied); const canActivate = readyForActivation(record) && record.onboardingStatus !== "active"; return <article key={record.id} className="p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-950">Participant #{record.userId}</h3><ContextPill tone={record.onboardingStatus === "active" ? "success" : "attention"}>{pretty(record.onboardingStatus)}</ContextPill><ContextPill tone="neutral">{pretty(record.role)}</ContextPill></div><p className="mt-2 text-sm text-slate-600">Updated {record.updatedAt ? new Date(record.updatedAt).toLocaleString() : "recently"}</p></div><div className="flex flex-wrap gap-2">{canProvision ? <button type="button" disabled={provision.isPending} onClick={() => provision.mutate({ onboardingId: record.id })} className="inline-flex h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60"><KeyRound aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />Provision secure account</button> : null}{canApply ? <button type="button" disabled={applyPolicies.isPending} onClick={() => applyPolicies.mutate({ onboardingId: record.id })} className="inline-flex h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60"><ShieldCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />Apply access policy</button> : null}{canActivate ? <button type="button" disabled={activate.isPending} onClick={() => activate.mutate({ onboardingId: record.id })} className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"><BadgeCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />Activate participant</button> : null}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{[{ label: "Secure account", value: Boolean(record.keycloakUserId), owner: "Administrator" }, { label: "Access policy", value: record.permifyPoliciesApplied, owner: "Administrator" }, { label: "Identity check", value: record.ninVerified, owner: "Verifier" }, { label: "Documents", value: record.documentsVerified, owner: "Verifier" }, { label: "Training", value: record.trainingCompleted, owner: "Training" }, { label: "Activation", value: record.onboardingStatus === "active", owner: "Administrator" }].map((step) => <div key={step.label} className={`rounded-xl border px-3 py-2.5 ${step.value ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-800">{step.label}</span>{step.value ? <BadgeCheck aria-hidden="true" className="h-4 w-4 text-emerald-700" /> : <span className="text-[11px] font-medium text-slate-500">{step.owner}</span>}</div><p className={`mt-1 text-xs ${step.value ? "text-emerald-800" : "text-slate-500"}`}>{step.value ? "Complete" : `Waiting for ${step.owner.toLowerCase()}`}</p></div>)}</div></article>; })}</div></div>
      </div>
    </section>
  </div>;
}
