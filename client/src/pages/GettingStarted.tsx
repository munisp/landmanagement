import { Link } from "wouter";
import {
  ArrowRight,
  BadgeCheck,
  CircleDot,
  Clock3,
  FileCheck2,
  GraduationCap,
  KeyRound,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

import { ContextPill, PageHero, WorkspaceEmptyState } from "@/components/ExperiencePrimitives";
import { trpc } from "@/lib/trpc";

const statusStyle = {
  complete: { icon: BadgeCheck, tone: "success" as const, label: "Complete", className: "border-emerald-200 bg-emerald-50" },
  current: { icon: CircleDot, tone: "info" as const, label: "Ready now", className: "border-blue-200 bg-blue-50" },
  blocked: { icon: Clock3, tone: "attention" as const, label: "Waiting", className: "border-amber-200 bg-amber-50" },
  information: { icon: Sparkles, tone: "neutral" as const, label: "Guidance", className: "border-slate-200 bg-slate-50" },
};

const milestoneIcon = {
  invitation: UserRoundCheck,
  secure_access: KeyRound,
  access_policy: ShieldCheck,
  identity: FileCheck2,
  training: GraduationCap,
  first_task: ArrowRight,
  workspace: Sparkles,
} as const;

function ownerLabel(owner: string) {
  return {
    participant: "You can take this step",
    administrator: "An authorized administrator owns this step",
    verifier: "An approved verifier owns this step",
    training_team: "The training team supports this step",
  }[owner] ?? "Platform guidance";
}

export default function GettingStarted() {
  const journey = trpc.onboarding.getMyJourney.useQuery();

  if (journey.isLoading) {
    return <div className="experience-page"><WorkspaceEmptyState icon={Sparkles} title="Preparing your workspace" description="Loading your role, activation readiness, and safest next action." /></div>;
  }

  if (journey.isError || !journey.data) {
    return <div className="experience-page"><WorkspaceEmptyState icon={ShieldCheck} title="Your journey is temporarily unavailable" description="Reconnect and retry to load your protected readiness details. Existing access remains governed by the platform policy." action={{ label: "Retry", onClick: () => void journey.refetch() }} /></div>;
  }

  const data = journey.data;
  const nextHref = data.next.href;

  return (
    <div className="experience-page">
      <PageHero
        eyebrow="Your guided workspace"
        title="One clear next step, with every safeguard intact."
        description="This guide uses your protected role and onboarding record to show what is ready, what is waiting, and who owns each activation step. It never grants access or completes verification from the browser."
        actions={<><ContextPill tone={data.status === "active" || data.status === "workspace_ready" ? "success" : "attention"}>{data.status === "active" || data.status === "workspace_ready" ? "Workspace ready" : "Activation in progress"}</ContextPill><ContextPill tone="neutral">Role: {data.role.replaceAll("_", " ")}</ContextPill></>}
        aside={<><p className="text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">Next best action</p><p className="mt-2 text-base font-semibold tracking-[-0.02em] text-slate-950">{data.next.title}</p><p className="mt-1.5 text-sm leading-5 text-slate-600">{data.next.description}</p>{nextHref ? <Link href={nextHref} className="mt-4 inline-flex h-10 items-center rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800">{data.next.actionLabel ?? "Continue"}<ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" /></Link> : <p className="mt-4 text-xs font-medium text-slate-600">{ownerLabel(data.next.owner)}</p>}</>}
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="experience-panel overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/75 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6"><div><h2 className="experience-section-title">Your activation path</h2><p className="experience-section-copy">Follow the path in order. A waiting step is a controlled handoff, not an error.</p></div><span className="text-xs font-medium text-slate-500">{data.steps.filter((step) => step.status === "complete").length} of {data.steps.length} milestones complete</span></div>
          <ol className="divide-y divide-slate-100">
            {data.steps.map((step, index) => {
              const state = statusStyle[step.status];
              const StatusIcon = state.icon;
              const MilestoneIcon = milestoneIcon[step.id as keyof typeof milestoneIcon] ?? CircleDot;
              return <li key={step.id} className="relative flex gap-4 px-5 py-5 sm:px-6"><div className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"><MilestoneIcon aria-hidden="true" className="h-4 w-4" /></div>{index < data.steps.length - 1 ? <span aria-hidden="true" className="absolute top-15 left-10 h-[calc(100%-1rem)] w-px bg-slate-200" /> : null}<div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-950">{step.title}</h3><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${state.className}`}><StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />{state.label}</span></div><p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">{step.description}</p><div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-xs font-medium text-slate-500">{ownerLabel(step.owner)}</span>{step.href ? <Link href={step.href} className="text-xs font-semibold text-blue-700 underline-offset-4 hover:underline">Open supported step</Link> : null}</div></div></li>;
            })}
          </ol>
        </div>

        <aside className="space-y-4">
          <div className="experience-panel p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><ShieldCheck aria-hidden="true" className="h-5 w-5" /></div><h2 className="mt-4 text-base font-semibold text-slate-950">Why some steps wait</h2><p className="mt-2 text-sm leading-6 text-slate-600">Identity, policy, document verification, and activation are deliberately completed by the authorized party. This prevents a convenient interface from becoming an unsafe shortcut.</p></div>
          <div className="experience-panel p-5"><p className="text-xs font-semibold tracking-[0.1em] text-slate-500 uppercase">When you are ready</p><h2 className="mt-2 text-base font-semibold text-slate-950">{data.launch.label}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{data.launch.description}</p><Link href={data.launch.href} className="mt-4 inline-flex items-center text-sm font-semibold text-blue-700 underline-offset-4 hover:underline">Preview workspace<ArrowRight aria-hidden="true" className="ml-1.5 h-4 w-4" /></Link></div>
        </aside>
      </section>
    </div>
  );
}
