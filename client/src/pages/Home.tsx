import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  FileCheck2,
  Landmark,
  LockKeyhole,
  Map,
  MapPinned,
  Search,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";

import NotificationCenter from "@/components/NotificationCenter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  ["40+", "Registry workflows digitized"],
  ["12", "Institutional service modules"],
  ["20+", "Role-based dashboards and workspaces"],
  ["24/7", "Operational monitoring coverage"],
] as const;

const capabilities = [
  {
    icon: Search,
    title: "Public parcel discovery",
    description: "Enable citizens, investors, and professionals to search parcels, title references, and transaction status through a clear self-service experience.",
  },
  {
    icon: Shield,
    title: "Trusted title assurance",
    description: "Strengthen confidence in land records with verification controls, auditability, and governed access to sensitive registry workflows.",
  },
  {
    icon: MapPinned,
    title: "Geospatial intelligence",
    description: "Combine registry data with map-based insights, survey context, valuation intelligence, and location-aware workflow support.",
  },
  {
    icon: FileCheck2,
    title: "Document and case processing",
    description: "Digitize intake, review, validation, and approval processes for faster service delivery across land administration teams.",
  },
  {
    icon: Landmark,
    title: "Institutional operations",
    description: "Support ministries, registrars, surveyors, legal teams, lenders, brokers, and investors from a common operating platform.",
  },
  {
    icon: BarChart3,
    title: "Executive visibility",
    description: "Provide leadership with operational dashboards, reporting, performance insights, and early warning indicators across services.",
  },
] as const;

const workflows = [
  ["01", "Search and validate", "Start with trusted parcel search, public record visibility, and title verification before any service action is initiated."],
  ["02", "Process and decide", "Guide staff through structured workflows for intake, review, approval, compliance, payments, and registry updates."],
  ["03", "Monitor and govern", "Track performance, service quality, integration health, and compliance posture from connected management dashboards."],
] as const;

const entryPoints = [
  {
    icon: Users,
    title: "Operational dashboard",
    description: "Access parcel, title, workflow, and transaction operations from a role-aware staff workspace.",
    href: "/dashboard",
    cta: "Open dashboard",
  },
  {
    icon: Sparkles,
    title: "Unified institutional portal",
    description: "Enter the broader command center for analytics, compliance, document workflows, integrations, and advanced modules.",
    href: "/unified-dashboard",
    cta: "Open portal",
  },
  {
    icon: Map,
    title: "Public search services",
    description: "Provide citizens and property professionals with transparent self-service access to public registry information.",
    href: "/search",
    cta: "Search records",
  },
] as const;

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const loginHref = getLoginUrl();
  const portalHref = isAuthenticated ? "/dashboard" : loginHref;
  const portalLabel = isAuthenticated ? "Go to dashboard" : "Sign in to the portal";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/">
            <div className="flex cursor-pointer items-center gap-3">
              <div className="rounded-2xl bg-blue-600/15 p-2 ring-1 ring-blue-400/20">
                <Building2 className="h-7 w-7 text-blue-300" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-200/80 sm:text-sm">National Land Platform</p>
                <h1 className="text-sm font-semibold text-white sm:text-lg">Integrated Digital Land Registry & Property Title System</h1>
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-3 lg:flex">
            <Link href="/search"><Button variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">Public Search</Button></Link>
            <Link href="/dashboard"><Button variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">Dashboard</Button></Link>
            <Link href="/unified-dashboard"><Button variant="ghost" className="text-slate-200 hover:bg-white/10 hover:text-white">Portal</Button></Link>
            {isAuthenticated ? (
              <>
                <Link href="/profile"><Button variant="outline" className="border-white/15 bg-transparent text-slate-100 hover:bg-white/10">{user?.name || "My Profile"}</Button></Link>
                <NotificationCenter />
              </>
            ) : (
              <a href={loginHref}><Button className="bg-blue-600 text-white hover:bg-blue-500">Sign in securely</Button></a>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.25),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_24%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
          <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-24">
            <div className="max-w-3xl">
              <Badge className="mb-6 border border-blue-400/20 bg-blue-500/10 px-4 py-1.5 text-blue-100 hover:bg-blue-500/10">Trusted digital public infrastructure for land administration, title security, and service delivery</Badge>
              <h2 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">A world-class digital front door for public land services and institutional registry operations.</h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">Modernize parcel search, title verification, document workflows, and executive reporting through a secure platform designed for citizens, registrars, surveyors, ministries, and institutional partners.</p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link href="/search"><Button size="lg" className="gap-2 bg-blue-600 px-6 text-white hover:bg-blue-500"><Search className="h-5 w-5" />Search public records</Button></Link>
                <a href={portalHref}><Button size="lg" variant="outline" className="gap-2 border-white/15 bg-white/5 px-6 text-white hover:bg-white/10">{portalLabel}<ArrowRight className="h-5 w-5" /></Button></a>
              </div>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map(([value, label]) => (
                  <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-slate-950/20 backdrop-blur">
                    <p className="text-2xl font-semibold text-white">{value}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <Card className="border-white/10 bg-white/6 text-slate-100 shadow-2xl shadow-blue-950/30 backdrop-blur-xl">
              <CardHeader className="space-y-4">
                <Badge className="w-fit border border-emerald-400/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/10">Service-ready platform</Badge>
                <CardTitle className="text-2xl text-white">Registry services for the public, operators, and institutions</CardTitle>
                <CardDescription className="text-base leading-7 text-slate-300">Present a credible public service experience while enabling secure staff access to operational dashboards, workflow controls, and executive reporting.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  "Professional public-facing digital service experience",
                  "Secure role-based access for institutional users",
                  "Search, verification, processing, and reporting in one platform",
                  "Preview-enabled dashboard access in this environment",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-xl border border-white/10 bg-slate-950/35 p-4">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                    <p className="text-sm leading-6 text-slate-200">{item}</p>
                  </div>
                ))}
                <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-5">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-200/80">Portal access</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{isAuthenticated ? `Signed in as ${user?.name || "an authenticated user"}. Continue directly to the dashboard or wider portal.` : "Use the secure access action to enter the preview-enabled dashboard and review the institutional workspace."}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a href={portalHref}><Button className="bg-white text-slate-950 hover:bg-slate-100"><LockKeyhole className="mr-2 h-4 w-4" />{portalLabel}</Button></a>
                    <Link href="/unified-dashboard"><Button variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/10">Explore portal modules</Button></Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-b border-white/10 bg-slate-950">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-200/80">Core capabilities</p>
                <h3 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Built to support public transparency and institutional execution from one connected platform.</h3>
              </div>
              <p className="max-w-2xl text-base leading-7 text-slate-300">The platform combines citizen-facing services with secure internal operations so land administration teams can move from fragmented processes to a resilient digital operating model.</p>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, description }) => (
                <Card key={title} className="border-white/10 bg-white/5 text-slate-100 shadow-xl shadow-slate-950/10">
                  <CardHeader>
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-200 ring-1 ring-blue-400/20"><Icon className="h-6 w-6" /></div>
                    <CardTitle className="text-xl text-white">{title}</CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">{description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-slate-900/60">
          <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-200/80">Operating model</p>
              <h3 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Clear workflow progression from public inquiry to governed institutional action.</h3>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">The experience is structured to support both self-service access and high-assurance back-office execution without compromising service quality, accountability, or security.</p>
            </div>
            <div className="grid gap-5">
              {workflows.map(([step, title, description]) => (
                <div key={step} className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-lg font-semibold text-blue-200 ring-1 ring-blue-400/20">{step}</div>
                    <div>
                      <h4 className="text-xl font-semibold text-white">{title}</h4>
                      <p className="mt-2 text-base leading-7 text-slate-300">{description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-slate-950">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-200/80">Access pathways</p>
              <h3 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Choose the right entry point for public access, operations, or full institutional oversight.</h3>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {entryPoints.map(({ icon: Icon, title, description, href, cta }) => (
                <Card key={title} className="flex h-full flex-col border-white/10 bg-white/5 text-slate-100">
                  <CardHeader>
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-200 ring-1 ring-blue-400/20"><Icon className="h-6 w-6" /></div>
                    <CardTitle className="text-xl text-white">{title}</CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-300">{description}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto"><Link href={href}><Button variant="outline" className="w-full border-white/15 bg-transparent text-white hover:bg-white/10">{cta}</Button></Link></CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-950">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-white/10 bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-950 p-8 shadow-2xl sm:p-10 lg:p-12">
              <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-200/80">Ready to continue</p>
                  <h3 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Enter the platform through the route that matches your role and objective.</h3>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">Use the public search experience for self-service discovery, or sign in to access the operational dashboard and institutional portal with preview-enabled credentials in this environment.</p>
                </div>
                <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/40 p-6">
                  <a href={portalHref}><Button size="lg" className="w-full bg-blue-600 text-white hover:bg-blue-500">{portalLabel}</Button></a>
                  <Link href="/search"><Button size="lg" variant="outline" className="w-full border-white/15 bg-transparent text-white hover:bg-white/10">Search public records</Button></Link>
                  <Link href="/unified-dashboard"><Button size="lg" variant="ghost" className="w-full text-blue-100 hover:bg-white/10">Open institutional portal</Button></Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
