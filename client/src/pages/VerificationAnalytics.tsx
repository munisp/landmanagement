import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, Clock, AlertTriangle } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function VerificationAnalytics() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState('30');
  const [trendInterval, setTrendInterval] = useState<'day' | 'week' | 'month'>('day');

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(timeRange));
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  };

  const { data: metrics, isLoading: metricsLoading } = trpc.verificationAnalytics.metrics.useQuery(getDateRange());
  const { data: reviewerPerformance, isLoading: reviewerLoading } = trpc.verificationAnalytics.reviewerPerformance.useQuery(getDateRange());
  const { data: bottlenecks, isLoading: bottlenecksLoading } = trpc.verificationAnalytics.bottlenecks.useQuery();
  const { data: trends, isLoading: trendsLoading } = trpc.verificationAnalytics.trends.useQuery({
    ...getDateRange(),
    interval: trendInterval,
  });
  const { data: processingTimeDistribution, isLoading: distLoading } = trpc.verificationAnalytics.processingTimeDistribution.useQuery(getDateRange());

  if (metricsLoading || reviewerLoading || bottlenecksLoading || trendsLoading || distLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading analytics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Verification Analytics</h1>
          <p className="text-muted-foreground">Track verification performance and identify bottlenecks</p>
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

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.totalRequests || 0}</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.pendingCount || 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.approvalRate.toFixed(1) || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.approvedCount || 0} approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.averageProcessingTime.toFixed(1) || 0}h
            </div>
            <p className="text-xs text-muted-foreground">
              {((metrics?.averageProcessingTime || 0) / 24).toFixed(1)} days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejection Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.rejectionRate.toFixed(1) || 0}%</div>
            <p className="text-xs text-muted-foreground">
              {metrics?.rejectedCount || 0} rejected
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="reviewers">Reviewer Performance</TabsTrigger>
          <TabsTrigger value="bottlenecks">Bottlenecks</TabsTrigger>
          <TabsTrigger value="distribution">Processing Time</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Verification Trends</CardTitle>
                  <CardDescription>Track verification requests over time</CardDescription>
                </div>
                <Select value={trendInterval} onValueChange={(v) => setTrendInterval(v as any)}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="week">Weekly</SelectItem>
                    <SelectItem value="month">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={trends || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="submitted" stroke="#3b82f6" name="Submitted" />
                  <Line type="monotone" dataKey="approved" stroke="#10b981" name="Approved" />
                  <Line type="monotone" dataKey="rejected" stroke="#ef4444" name="Rejected" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviewers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reviewer Performance</CardTitle>
              <CardDescription>Compare reviewer efficiency and approval rates</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={reviewerPerformance || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="reviewerName" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="totalReviewed" fill="#3b82f6" name="Total Reviewed" />
                  <Bar dataKey="approved" fill="#10b981" name="Approved" />
                  <Bar dataKey="rejected" fill="#ef4444" name="Rejected" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviewerPerformance?.map((reviewer) => (
              <Card key={reviewer.reviewerId}>
                <CardHeader>
                  <CardTitle className="text-base">{reviewer.reviewerName || 'Unknown'}</CardTitle>
                  <CardDescription>Reviewer #{reviewer.reviewerId}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Reviewed:</span>
                    <span className="font-medium">{reviewer.totalReviewed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Approval Rate:</span>
                    <span className="font-medium">{reviewer.approvalRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Avg Time:</span>
                    <span className="font-medium">{reviewer.averageProcessingTime.toFixed(1)}h</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="bottlenecks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workflow Bottlenecks</CardTitle>
              <CardDescription>Identify stages with delays</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {bottlenecks?.map((bottleneck) => (
                  <div key={bottleneck.status} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold capitalize">{bottleneck.status.replace('_', ' ')}</h3>
                      <span className="text-2xl font-bold">{bottleneck.count}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Average Age:</span>
                        <p className="font-medium">{bottleneck.averageAge.toFixed(1)} hours</p>
                      </div>
                      {bottleneck.oldestRequest && (
                        <div>
                          <span className="text-muted-foreground">Oldest Request:</span>
                          <p className="font-medium">
                            #{bottleneck.oldestRequest.id} ({bottleneck.oldestRequest.age.toFixed(1)}h old)
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Processing Time Distribution</CardTitle>
              <CardDescription>How long does verification typically take?</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={processingTimeDistribution || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ bucket, count }) => `${bucket}: ${count}`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {(processingTimeDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
