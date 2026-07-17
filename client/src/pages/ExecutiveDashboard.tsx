import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, FileText, CheckCircle, Clock, Users, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export default function ExecutiveDashboard() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState('30');

  // Calculate date ranges
  const { currentStart, currentEnd, previousStart, previousEnd } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(timeRange));

    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - parseInt(timeRange));

    return {
      currentStart: start.toISOString().split('T')[0],
      currentEnd: end.toISOString().split('T')[0],
      previousStart: prevStart.toISOString().split('T')[0],
      previousEnd: prevEnd.toISOString().split('T')[0],
    };
  }, [timeRange]);

  // Fetch data
  const { data: trends, isLoading: trendsLoading } = trpc.executiveAnalytics.trends.useQuery({
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  });

  const { data: timeSeries, isLoading: timeSeriesLoading } = trpc.executiveAnalytics.timeSeries.useQuery({
    startDate: currentStart,
    endDate: currentEnd,
  });

  const { data: prediction, isLoading: predictionLoading } = trpc.executiveAnalytics.predictWorkload.useQuery({
    daysToPredict: 30,
  });

  const { data: revenueBreakdown, isLoading: revenueLoading } = trpc.executiveAnalytics.revenueBreakdown.useQuery({
    startDate: currentStart,
    endDate: currentEnd,
  });

  if (trendsLoading || timeSeriesLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const kpis = trends?.current;
  const changes = trends?.changes;

  const KPICard = ({ title, value, change, icon: Icon, prefix = '', suffix = '' }: any) => {
    const isPositive = change >= 0;
    const TrendIcon = isPositive ? TrendingUp : TrendingDown;

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
          </div>
          {change !== undefined && (
            <p className={`text-xs flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(change)}% from previous period
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Executive Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive analytics and insights</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Transactions"
          value={kpis?.totalTransactions}
          change={changes?.transactions}
          icon={FileText}
        />
        <KPICard
          title="Total Revenue"
          value={kpis?.totalRevenue}
          change={changes?.revenue}
          icon={DollarSign}
          prefix="$"
        />
        <KPICard
          title="Parcels Registered"
          value={kpis?.totalParcels}
          change={changes?.parcels}
          icon={CheckCircle}
        />
        <KPICard
          title="Avg Processing Time"
          value={kpis?.avgProcessingTime}
          change={changes?.processingTime}
          icon={Clock}
          suffix=" hrs"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Transaction Volume Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction Volume Trend</CardTitle>
            <CardDescription>Daily transaction count over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="transactions" stroke="#8884d8" name="Transactions" />
                <Line type="monotone" dataKey="verifications" stroke="#82ca9d" name="Verifications" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Breakdown</CardTitle>
            <CardDescription>Revenue by transaction type</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <LoadingSpinner />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={revenueBreakdown?.byType}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.type}: $${entry.amount.toFixed(0)}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                  >
                    {revenueBreakdown?.byType.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Parcel Registrations */}
        <Card>
          <CardHeader>
            <CardTitle>Parcel Registrations</CardTitle>
            <CardDescription>Daily parcel registration activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="parcels" fill="#8884d8" name="Parcels" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader>
            <CardTitle>Active Users Trend</CardTitle>
            <CardDescription>Daily active user count</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="activeUsers" stroke="#ff7300" name="Active Users" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Predictive Analytics */}
      <Card>
        <CardHeader>
          <CardTitle>Workload Forecast (Next 30 Days)</CardTitle>
          <CardDescription>
            Predicted transaction volume using linear regression
            {prediction && ` • Avg Daily: ${prediction.avgDaily}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {predictionLoading ? (
            <LoadingSpinner />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prediction?.predictions}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="predictedTransactions" 
                  stroke="#ff7300" 
                  strokeDasharray="5 5"
                  name="Predicted Transactions" 
                />
                <Line 
                  type="monotone" 
                  dataKey="predictedVerifications" 
                  stroke="#82ca9d" 
                  strokeDasharray="5 5"
                  name="Predicted Verifications" 
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Approval Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis?.approvalRate}%</div>
            <p className="text-xs text-muted-foreground">
              {kpis?.totalApprovals} approved / {kpis?.totalVerifications} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Avg Daily Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {prediction?.avgDaily || 0}
            </div>
            <p className="text-xs text-muted-foreground">Based on historical data</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${kpis?.totalVolume.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Transaction volume in period</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
