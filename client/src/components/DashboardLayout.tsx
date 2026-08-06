import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Building2,
  Compass,
  FileText,
  Landmark,
  LayoutDashboard,
  LogOut,
  Map,
  PanelLeft,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { LanguageSelector } from "./LanguageSelector";
import { NotificationBell } from "./NotificationBell";
import { Button } from "./ui/button";

type NavigationItem = { icon: LucideIcon; label: string; path: string; description: string };

type NavigationGroup = { label: string; items: NavigationItem[] };

const menuGroups: NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      { icon: LayoutDashboard, label: "Overview", path: "/dashboard", description: "Your operational pulse" },
      { icon: Sparkles, label: "Getting started", path: "/getting-started", description: "Your guided next step" },
      { icon: Map, label: "Land & mapping", path: "/advanced-geospatial-center", description: "Parcels and spatial context" },
      { icon: FileText, label: "Cases & documents", path: "/legal-document-center", description: "Governed evidence and records" },
      { icon: ShieldCheck, label: "Rollout control", path: "/admin/nationwide-rollout", description: "Evidence-gated pilot safety" },
    ],
  },
  {
    label: "Services",
    items: [
      { icon: Landmark, label: "Mortgage operations", path: "/mortgage-dashboard", description: "Loan and collateral workflows" },
      { icon: ShoppingCart, label: "Trusted services", path: "/marketplace", description: "Verified professional services" },
      { icon: Building2, label: "Commercial portfolio", path: "/commercial-portfolio", description: "Institutional workspaces" },
      { icon: Compass, label: "Guided journeys", path: "/journeys", description: "Connected, evidence-led service paths" },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 284;
const MIN_WIDTH = 224;
const MAX_WIDTH = 420;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const numeric = saved ? Number.parseInt(saved, 10) : DEFAULT_WIDTH;
    return Number.isFinite(numeric) ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, numeric)) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,.16),_transparent_38%),linear-gradient(145deg,_#f8fafc,_#eef6ff)] p-5">
        <div className="w-full max-w-md rounded-[1.75rem] border border-white/80 bg-white/90 p-7 text-center shadow-[0_28px_80px_-48px_rgba(15,23,42,.72)] backdrop-blur">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/25">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          </div>
          <p className="mt-5 text-xs font-semibold tracking-[0.15em] text-blue-700 uppercase">Secure land operations</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">Continue where your work matters.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Sign in to access only the cases, spatial context, and actions assigned to your organization and role.</p>
          <Button onClick={() => { window.location.href = getLoginUrl(); }} size="lg" className="mt-6 w-full rounded-xl shadow-lg shadow-blue-700/20">
            Sign in securely
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeItem = menuGroups.flatMap((group) => group.items).find((item) => location === item.path);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - sidebarLeft;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const stop = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" className="border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur-xl" disableTransition={isResizing}>
          <SidebarHeader className="h-auto p-3">
            <div className="flex min-h-12 items-center gap-3 rounded-2xl bg-slate-950 px-3 py-2.5 text-white shadow-lg shadow-slate-900/12 group-data-[collapsible=icon]:justify-center">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-inner">
                <Landmark aria-hidden="true" className="h-4 w-4" />
              </span>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="truncate text-sm font-semibold tracking-[-0.025em]">IDLR Operations</p>
                <p className="mt-0.5 truncate text-[10px] font-medium tracking-[0.12em] text-slate-300 uppercase">Trusted land system</p>
              </div>
            </div>
            <button
              onClick={toggleSidebar}
              className="mt-2 flex h-8 w-full items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:mt-3"
              aria-label="Toggle navigation"
            >
              <PanelLeft aria-hidden="true" className="h-4 w-4" />
            </button>
          </SidebarHeader>

          <SidebarContent className="gap-4 px-2 py-2">
            {menuGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.13em] text-slate-400 uppercase group-data-[collapsible=icon]:hidden">{group.label}</p>
                <SidebarMenu className="gap-1">
                  {group.items.map((item) => {
                    const active = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={active}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-11 rounded-xl px-3 text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-950 data-[active=true]:bg-blue-50 data-[active=true]:font-semibold data-[active=true]:text-blue-800"
                        >
                          <item.icon aria-hidden="true" className={active ? "h-4 w-4 text-blue-700" : "h-4 w-4"} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 pt-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/70 p-2 text-left transition hover:bg-white focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-8 w-8 shrink-0 border border-slate-200">
                    <AvatarFallback className="bg-blue-50 text-xs font-semibold text-blue-800">{user?.name?.charAt(0).toUpperCase() ?? "U"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium text-slate-900">{user?.name || "Signed-in user"}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">Workspace settings</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5">
                <div className="px-2 py-2">
                  <p className="truncate text-sm font-medium">{user?.name || "Signed-in user"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email || ""}</p>
                </div>
                <DropdownMenuItem onClick={logout} className="rounded-lg text-destructive focus:text-destructive">
                  <LogOut aria-hidden="true" className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500/30 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => !isCollapsed && setIsResizing(true)}
        />
      </div>

      <SidebarInset className="bg-[radial-gradient(circle_at_top_right,_rgba(147,197,253,.18),_transparent_24rem),linear-gradient(135deg,_#fafaf9,_#f6f9ff)]">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/75 bg-[#fbfbfa]/82 px-3 backdrop-blur-xl sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            {isMobile ? <SidebarTrigger className="h-9 w-9 rounded-xl border border-slate-200 bg-white shadow-sm" /> : null}
            <div className="hidden h-7 w-px bg-slate-200 sm:block" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-500">Operations workspace</p>
              <p className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-950">{activeItem?.label ?? "Land management"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSelector />
            <NotificationBell />
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Governed workspace
            </span>
          </div>
        </header>
        <main className="min-h-[calc(100vh-4rem)] flex-1 px-0 pb-10">{children}</main>
      </SidebarInset>
    </>
  );
}
