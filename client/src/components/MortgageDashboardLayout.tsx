import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard,
  FileText,
  DollarSign,
  Users,
  TrendingUp,
  Settings,
  Webhook,
  Calendar,
  BarChart3,
  Building2,
  Briefcase,
  CreditCard,
  Shield,
  Menu,
  ChevronDown,
  ChevronRight,
  Clock,
  History,
} from 'lucide-react';
import { ConnectionStatusBadge } from '@/components/ConnectionStatusBadge';
import { useWebSocket } from '@/hooks/useWebSocket';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navigationGroups: NavGroup[] = [
  {
    title: 'Applications',
    items: [
      { title: 'Mortgage Dashboard', href: '/mortgage-dashboard', icon: LayoutDashboard },
      { title: 'Loan Officer', href: '/loan-officer-dashboard', icon: Briefcase },
      { title: 'Document Verification', href: '/document-verification', icon: FileText },
    ],
  },
  {
    title: 'Payments',
    items: [
      { title: 'Borrower Portal', href: '/borrower-payment-portal', icon: CreditCard },
      { title: 'Payment Schedule', href: '/borrower-payment-portal', icon: Calendar },
    ],
  },
  {
    title: 'Analytics & Reports',
    items: [
      { title: 'Mortgage Analytics', href: '/mortgage-analytics', icon: BarChart3 },
      { title: 'Compliance Dashboard', href: '/regulatory-compliance', icon: Shield },
    ],
  },
  {
    title: 'Broker & Investor',
    items: [
      { title: 'Broker Dashboard', href: '/broker-dashboard', icon: Users },
      { title: 'Investor Dashboard', href: '/investor-dashboard', icon: TrendingUp },
      { title: 'Commission Management', href: '/commission-management', icon: DollarSign },
    ],
  },
  {
    title: 'Administration',
    items: [
      { title: 'Pooling Scheduler', href: '/pooling-scheduler', icon: Calendar },
      { title: 'Report Scheduler', href: '/report-scheduler', icon: Clock },
      { title: 'Report History', href: '/report-history', icon: History },
      { title: 'Webhook Management', href: '/webhook-management', icon: Webhook },
      { title: 'Secondary Market', href: '/secondary-market', icon: Building2 },
      { title: 'Security Monitoring', href: '/security-monitoring', icon: Shield },
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

interface MortgageDashboardLayoutProps {
  children: ReactNode;
}

export function MortgageDashboardLayout({ children }: MortgageDashboardLayoutProps) {
  const [location] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(navigationGroups.map((g) => g.title))
  );

  // WebSocket connection for real-time updates
  const { isConnected, reconnect } = useWebSocket({ url: '/ws/mortgage-events' });

  const toggleGroup = (title: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Mortgage System</h2>
          <ConnectionStatusBadge 
            isConnected={isConnected} 
            onReconnect={reconnect}
          />
        </div>
        <p className="text-sm text-muted-foreground">Integrated Digital Land Registry</p>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-2">
          {navigationGroups.map((group) => {
            const isExpanded = expandedGroups.has(group.title);

            return (
              <div key={group.title} className="space-y-1">
                <Button
                  variant="ghost"
                  className="w-full justify-between px-3 py-2 text-sm font-medium"
                  onClick={() => toggleGroup(group.title)}
                >
                  <span>{group.title}</span>
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {isExpanded && (
                  <div className="ml-2 space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.href;

                      return (
                        <Link key={item.href} href={item.href}>
                          <Button
                            variant={isActive ? 'secondary' : 'ghost'}
                            className={cn(
                              'w-full justify-start gap-3 px-3 py-2 text-sm',
                              isActive && 'bg-secondary font-medium'
                            )}
                            onClick={() => setIsSidebarOpen(false)}
                          >
                            <Icon className="h-4 w-4" />
                            {item.title}
                          </Button>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">
          © 2026 IDLR Platform
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 border-r bg-background md:block">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button
            variant="outline"
            size="icon"
            className="fixed left-4 top-4 z-40"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
