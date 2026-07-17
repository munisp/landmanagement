import { useState, useEffect } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, LineChart, PieChart, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Users, Activity, MapPin } from 'lucide-react';
import { Line, Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function ExecutiveAnalyticsDashboard() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | '90d' | '1y'>('7d');
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds

  // Fetch analytics data
  const { data: transactionMetrics, refetch: refetchTransactions } = trpc.executiveAnalytics.getTransactionMetrics.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  const { data: fraudAlerts } = trpc.executiveAnalytics.getFraudAlerts.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  const { data: propertyValuations } = trpc.executiveAnalytics.getPropertyValuationTrends.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  const { data: userBehavior } = trpc.executiveAnalytics.getUserBehaviorAnalytics.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  const { data: systemPerformance } = trpc.executiveAnalytics.getSystemPerformance.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  const { data: revenueForecasts } = trpc.executiveAnalytics.getRevenueForecasts.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  const { data: geospatialHeatmap } = trpc.executiveAnalytics.getGeospatialHeatmap.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  const { data: mlModelPerformance } = trpc.executiveAnalytics.getMLModelPerformance.useQuery(
    { timeRange },
    { refetchInterval: refreshInterval }
  );

  // Transaction volume chart data
  const transactionVolumeData = {
    labels: transactionMetrics?.daily?.map((d: any) => d.date) || [],
    datasets: [
      {
        label: 'Transaction Volume',
        data: transactionMetrics?.daily?.map((d: any) => d.count) || [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        fill: true,
      },
    ],
  };

  // Revenue chart data
  const revenueData = {
    labels: revenueForecasts?.historical?.map((d: any) => d.date) || [],
    datasets: [
      {
        label: 'Actual Revenue',
        data: revenueForecasts?.historical?.map((d: any) => d.actual) || [],
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.2)',
      },
      {
        label: 'Forecasted Revenue',
        data: revenueForecasts?.forecast?.map((d: any) => d.predicted) || [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderDash: [5, 5],
      },
    ],
  };

  // Property type distribution
  const propertyTypeData = {
    labels: propertyValuations?.byType?.map((d: any) => d.type) || [],
    datasets: [
      {
        data: propertyValuations?.byType?.map((d: any) => d.count) || [],
        backgroundColor: [
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)',
          'rgba(153, 102, 255, 0.8)',
        ],
      },
    ],
  };

  // ML model accuracy chart
  const mlModelData = {
    labels: mlModelPerformance?.models?.map((m: any) => m.name) || [],
    datasets: [
      {
        label: 'Accuracy (%)',
        data: mlModelPerformance?.models?.map((m: any) => m.accuracy * 100) || [],
        backgroundColor: 'rgba(75, 192, 192, 0.8)',
      },
    ],
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You need admin privileges to access this dashboard.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Executive Analytics Dashboard</h1>
          <p className="text-muted-foreground">Real-time insights and predictive analytics</p>
        </div>
        <div className="flex gap-4">
          <Select value={timeRange} onValueChange={(value) => setTimeRange(value as '24h' | '7d' | '30d' | '90d' | '1y')}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
              <SelectItem value="1y">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => refetchTransactions()}>Refresh</Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactionMetrics?.total?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              {transactionMetrics?.growth && transactionMetrics.growth > 0 ? (
                <span className="text-green-600 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +{transactionMetrics.growth}% from last period
                </span>
              ) : (
                <span className="text-red-600 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  {transactionMetrics?.growth}% from last period
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${revenueForecasts?.totalRevenue?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Forecast: ${revenueForecasts?.forecastedRevenue?.toLocaleString() || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userBehavior?.activeUsers?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              {userBehavior?.newUsers || 0} new users this period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fraud Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fraudAlerts?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {fraudAlerts?.highRisk || 0} high-risk alerts
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="ml-models">ML Models</TabsTrigger>
          <TabsTrigger value="geospatial">Geospatial</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Volume Trend</CardTitle>
              <CardDescription>Daily transaction volume over time</CardDescription>
            </CardHeader>
            <CardContent>
              <Line data={transactionVolumeData} options={{ responsive: true, maintainAspectRatio: true }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Analytics & Forecasting</CardTitle>
              <CardDescription>Historical revenue and ML-powered forecasts</CardDescription>
            </CardHeader>
            <CardContent>
              <Line data={revenueData} options={{ responsive: true, maintainAspectRatio: true }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Property Type Distribution</CardTitle>
              <CardDescription>Breakdown of properties by type</CardDescription>
            </CardHeader>
            <CardContent>
              <Pie data={propertyTypeData} options={{ responsive: true, maintainAspectRatio: true }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ml-models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ML Model Performance</CardTitle>
              <CardDescription>Accuracy metrics for AI/ML models</CardDescription>
            </CardHeader>
            <CardContent>
              <Bar data={mlModelData} options={{ responsive: true, maintainAspectRatio: true }} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geospatial" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Geospatial Heatmap</CardTitle>
              <CardDescription>Property activity by location</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] bg-muted rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Geospatial heatmap visualization</p>
                  <p className="text-sm text-muted-foreground">
                    {geospatialHeatmap?.hotspots?.length || 0} activity hotspots detected
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
