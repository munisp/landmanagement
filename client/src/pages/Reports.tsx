import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  TrendingUp,
  DollarSign,
  Loader2,
  MapPin,
} from "lucide-react";
import { Link } from "wouter";
import { ConnectedReportBuilder } from "@/components/ConnectedReportBuilder";
import { trpc } from "@/lib/trpc";

export default function Reports() {
  const now = new Date();
  const currentEnd = now.toISOString().split("T")[0];
  const currentStartDate = new Date(now);
  currentStartDate.setDate(now.getDate() - 30);
  const previousEndDate = new Date(currentStartDate);
  previousEndDate.setDate(currentStartDate.getDate() - 1);
  const previousStartDate = new Date(previousEndDate);
  previousStartDate.setDate(previousEndDate.getDate() - 30);

  const { data: trends, isLoading } = trpc.executiveAnalytics.trends.useQuery({
    currentStart: currentStartDate.toISOString().split("T")[0],
    currentEnd,
    previousStart: previousStartDate.toISOString().split("T")[0],
    previousEnd: previousEndDate.toISOString().split("T")[0],
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const stats = [
    {
      title: "Total Transactions",
      value: trends?.current.totalTransactions?.toLocaleString() || "0",
      change: `${trends?.changes.transactions ?? 0}% from previous period`,
      icon: TrendingUp,
      iconClass: "text-green-600",
    },
    {
      title: "Total Revenue",
      value: formatCurrency(trends?.current.totalRevenue || 0),
      change: `${trends?.changes.revenue ?? 0}% from previous period`,
      icon: DollarSign,
      iconClass: "text-blue-600",
    },
    {
      title: "Registered Parcels",
      value: trends?.current.totalParcels?.toLocaleString() || "0",
      change: `${trends?.changes.parcels ?? 0}% from previous period`,
      icon: MapPin,
      iconClass: "text-purple-600",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Reports & Analytics</h1>
          <div className="w-24"></div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Generate Reports</h1>
            <p className="text-muted-foreground">
              Create detailed reports for transactions, parcels, revenue, and compliance.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.title}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${stat.iconClass}`} />
                      {stat.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Loading metrics...</span>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <p className="text-xs text-muted-foreground">{stat.change}</p>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <ConnectedReportBuilder />
        </div>
      </div>
    </div>
  );
}
