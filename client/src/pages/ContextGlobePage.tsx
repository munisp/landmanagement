import { ArrowLeft, Globe2, ShieldAlert } from "lucide-react";
import { Link } from "wouter";

import { ContextGlobeViewer } from "@/components/ContextGlobeViewer";
import { Button } from "@/components/ui/button";

export default function ContextGlobePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="container flex min-h-16 items-center justify-between gap-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="icon" asChild aria-label="Return to advanced geospatial center"><Link href="/advanced-geospatial-center"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <div className="min-w-0"><h1 className="flex items-center gap-2 text-lg font-bold sm:text-xl"><Globe2 className="h-5 w-5 text-sky-700" /> Context Globe</h1><p className="truncate text-xs text-slate-500">Read-only global situational awareness</p></div>
          </div>
          <Button variant="outline" size="sm" asChild><Link href="/advanced-geospatial-center">Geospatial center</Link></Button>
        </div>
      </header>
      <main id="main-content" className="container space-y-6 py-7 sm:py-10">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-end">
          <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">Governed public context</p><h2 className="mt-2 max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl">Observe approved seismic and weather signals without changing the land record.</h2><p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">This view delivers normalized public events through the platform’s same-origin gateway. It is deliberately separate from evidence, assessment, parcel editing, title workflows, payments, and emergency response.</p></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><div className="flex gap-2"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><p><strong>Decision boundary.</strong> Confirm conditions with applicable authorities and your approved operational process. Context Globe neither verifies site conditions nor creates a legal, regulatory, or safety conclusion.</p></div></div>
        </section>
        <ContextGlobeViewer />
      </main>
    </div>
  );
}
