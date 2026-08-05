import type { LucideIcon } from "lucide-react";
import { ArrowRight, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ContextPill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "attention" | "info";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "attention" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "info" && "border-blue-200 bg-blue-50 text-blue-800",
        tone === "neutral" && "border-slate-200 bg-white/80 text-slate-600",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="experience-hero overflow-hidden rounded-[1.5rem] border border-slate-200/70 px-5 py-6 shadow-[0_18px_54px_-38px_rgba(15,23,42,0.55)] sm:px-7 sm:py-8">
      <div className="relative z-10 flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
        <div className="max-w-3xl">
          <ContextPill tone="info">{eyebrow}</ContextPill>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
          {actions ? <div className="mt-5 flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
        {aside ? <div className="experience-hero-aside relative z-10 w-full max-w-md rounded-2xl border border-white/75 p-4 shadow-sm">{aside}</div> : null}
      </div>
      <Sparkles aria-hidden="true" className="pointer-events-none absolute -right-5 -top-5 z-0 h-32 w-32 text-blue-200/45" strokeWidth={1} />
    </section>
  );
}

export function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  tone = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  detail: string;
  tone?: "blue" | "emerald" | "amber" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-800 ring-amber-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  }[tone];
  return (
    <div className="experience-metric rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_12px_30px_-26px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
        </div>
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl ring-1", toneClass)}>
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

export function WorkspaceEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-9 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-slate-200">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>
      {action ? (
        <Button className="mt-5" onClick={action.onClick}>
          {action.label}
          <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
