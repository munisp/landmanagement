import { useEffect, useMemo, useState } from 'react';
import { Responsive } from 'react-grid-layout';
import type { ComponentType, ReactNode } from 'react';
import 'react-grid-layout/css/styles.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

interface Widget {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  type: 'stats' | 'list';
  content: ReactNode;
}

interface DashboardLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ResponsiveGridLayout = Responsive as unknown as ComponentType<any>;

const defaultLayout: Omit<Widget, 'content'>[] = [
  { i: 'widget-1', x: 0, y: 0, w: 3, h: 2, title: 'Total Parcels', type: 'stats' },
  { i: 'widget-2', x: 3, y: 0, w: 3, h: 2, title: 'Pending Transactions', type: 'stats' },
  { i: 'widget-3', x: 6, y: 0, w: 3, h: 2, title: 'Active Titles', type: 'stats' },
  { i: 'widget-4', x: 9, y: 0, w: 3, h: 2, title: 'Completed Transactions', type: 'stats' },
  { i: 'widget-5', x: 0, y: 2, w: 6, h: 4, title: 'Recent Parcels', type: 'list' },
  { i: 'widget-6', x: 6, y: 2, w: 6, h: 4, title: 'Recent Transactions', type: 'list' },
];

function formatCurrency(value?: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function applyLayout(baseWidgets: Widget[], persistedLayout?: DashboardLayoutItem[] | null): Widget[] {
  if (!persistedLayout || persistedLayout.length === 0) {
    return baseWidgets;
  }

  return baseWidgets.map((widget) => {
    const layoutItem = persistedLayout.find((item) => item.i === widget.i);
    if (!layoutItem) {
      return widget;
    }

    return {
      ...widget,
      x: layoutItem.x,
      y: layoutItem.y,
      w: layoutItem.w,
      h: layoutItem.h,
    };
  });
}

function StatWidget({ value, subtitle, accent }: { value: string; subtitle: string; accent?: string }) {
  return (
    <div className="text-center">
      <p className={`text-4xl font-bold ${accent ?? ''}`}>{value}</p>
      <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>
    </div>
  );
}

function ParcelListWidget({ parcels }: { parcels: any[] }) {
  if (!parcels.length) {
    return <div className="text-sm text-muted-foreground">No parcel records available yet.</div>;
  }

  return (
    <div className="space-y-2">
      {parcels.map((parcel) => {
        const status = (parcel.status || 'unknown').replace(/_/g, ' ');
        return (
          <div key={parcel.id ?? parcel.parcelNumber} className="flex justify-between items-center p-2 bg-muted rounded">
            <div>
              <p className="font-medium">{parcel.parcelNumber}</p>
              <p className="text-sm text-muted-foreground">{parcel.ownerName || parcel.lga || 'Unassigned owner'}</p>
            </div>
            <Badge variant={parcel.status === 'verified' || parcel.status === 'registered' ? 'default' : 'secondary'}>
              {status}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function TransactionListWidget({ transactions }: { transactions: any[] }) {
  if (!transactions.length) {
    return <div className="text-sm text-muted-foreground">No transaction records available yet.</div>;
  }

  return (
    <div className="space-y-2">
      {transactions.map((transaction) => {
        const status = (transaction.status || 'unknown').replace(/_/g, ' ');
        const amount = transaction.considerationAmount ?? transaction.transactionAmount ?? 0;
        return (
          <div key={transaction.id} className="flex justify-between items-center p-2 bg-muted rounded">
            <div>
              <p className="font-medium">TXN-{String(transaction.id).padStart(4, '0')}</p>
              <p className="text-sm text-muted-foreground">
                {(transaction.type || 'transaction').replace(/_/g, ' ')} · {formatCurrency(amount)}
              </p>
            </div>
            <Badge variant={transaction.status === 'completed' || transaction.status === 'registered' ? 'default' : 'secondary'}>
              {status}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

export default function PersonalizedDashboard() {
  const utils = trpc.useUtils();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const { data: savedLayout, isLoading: isLayoutLoading } = trpc.preferences.getDashboardLayout.useQuery(undefined, {
    retry: false,
  });
  const { data: dashboardStats, isLoading: isStatsLoading } = trpc.stats.dashboard.useQuery();
  const { data: parcelResults, isLoading: isParcelsLoading } = trpc.parcels.search.useQuery({ page: 1, limit: 4 });
  const { data: transactionResults, isLoading: isTransactionsLoading } = trpc.transactions.list.useQuery({ page: 1, limit: 4 });

  const saveLayoutMutation = trpc.preferences.saveDashboardLayout.useMutation({
    onSuccess: async () => {
      await utils.preferences.getDashboardLayout.invalidate();
      toast.success('Dashboard layout saved successfully');
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save dashboard layout');
    },
  });

  const liveWidgets = useMemo<Widget[]>(() => {
    const stats = dashboardStats ?? {
      parcels: { total: 0, verified: 0, pending: 0 },
      titles: { total: 0, active: 0, pending: 0 },
      transactions: { total: 0, completed: 0, pending: 0 },
    };

    const parcels = parcelResults?.parcels ?? [];
    const transactions = transactionResults?.transactions ?? [];

    return [
      {
        ...defaultLayout[0],
        content: <StatWidget value={String(stats.parcels.total || 0)} subtitle={`${stats.parcels.verified || 0} verified parcels`} />,
      },
      {
        ...defaultLayout[1],
        content: <StatWidget value={String(stats.transactions.pending || 0)} subtitle="Awaiting workflow completion" accent="text-orange-600" />,
      },
      {
        ...defaultLayout[2],
        content: <StatWidget value={String(stats.titles.active || 0)} subtitle={`${stats.titles.pending || 0} titles pending review`} accent="text-green-600" />,
      },
      {
        ...defaultLayout[3],
        content: <StatWidget value={String(stats.transactions.completed || 0)} subtitle={`${stats.transactions.total || 0} total transactions`} accent="text-blue-600" />,
      },
      {
        ...defaultLayout[4],
        content: <ParcelListWidget parcels={parcels} />,
      },
      {
        ...defaultLayout[5],
        content: <TransactionListWidget transactions={transactions} />,
      },
    ];
  }, [dashboardStats, parcelResults, transactionResults]);

  useEffect(() => {
    setWidgets(applyLayout(liveWidgets, savedLayout));
  }, [liveWidgets, savedLayout]);

  const handleLayoutChange = (layout: readonly DashboardLayoutItem[]) => {
    setWidgets((currentWidgets) => currentWidgets.map((widget) => {
      const layoutItem = layout.find((item) => item.i === widget.i);
      if (layoutItem) {
        return {
          ...widget,
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
        };
      }
      return widget;
    }));
  };

  const serializedLayout = useMemo<DashboardLayoutItem[]>(() => widgets.map((widget) => ({
    i: widget.i,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
  })), [widgets]);

  const handleSaveLayout = () => {
    saveLayoutMutation.mutate(serializedLayout);
  };

  const handleResetLayout = () => {
    const resetLayout = defaultLayout.map((widget) => ({
      i: widget.i,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
    }));

    setWidgets(applyLayout(liveWidgets, resetLayout));
    saveLayoutMutation.mutate(resetLayout);
  };

  if (isLayoutLoading || isStatsLoading || isParcelsLoading || isTransactionsLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading dashboard widgets...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Customize your dashboard with live parcel, title, and transaction insights.
          </p>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleResetLayout} disabled={saveLayoutMutation.isPending}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={handleSaveLayout} disabled={saveLayoutMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {saveLayoutMutation.isPending ? 'Saving...' : 'Save Layout'}
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Customize
            </Button>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-800">
            <strong>Editing mode:</strong> Drag widgets to rearrange them, or resize by dragging the bottom-right corner.
            Click "Save Layout" when done.
          </p>
        </div>
      )}

      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: serializedLayout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={60}
        width={1200}
        isDraggable={isEditing}
        isResizable={isEditing}
        onLayoutChange={handleLayoutChange}
      >
        {widgets.map((widget) => (
          <div key={widget.i}>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg">{widget.title}</CardTitle>
              </CardHeader>
              <CardContent>{widget.content}</CardContent>
            </Card>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
