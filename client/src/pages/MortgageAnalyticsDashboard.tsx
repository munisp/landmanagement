import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
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
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { Download, Calendar, TrendingUp, Users, DollarSign, Shield, FileText } from 'lucide-react';
import { exportChartToPDF, exportMultipleElementsToPDF } from '@/lib/pdfExport';
import { useRef, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MortgageDashboardLayout } from "@/components/MortgageDashboardLayout";

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

export default function MortgageAnalyticsDashboard() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket({
    url: '/ws/mortgage-events',
    onMessage: (message) => {
      if (message.type === 'mortgage_application_submitted' ||
          message.type === 'mortgage_application_approved' ||
          message.type === 'mortgage_payment_received') {
        toast.info('Dashboard data updated', {
          description: 'New mortgage activity detected',
        });
      }
    },
  });

  // Refs for chart elements
  const pipelineChartRef = useRef<HTMLDivElement>(null);
  const brokerChartRef = useRef<HTMLDivElement>(null);
  const investorChartRef = useRef<HTMLDivElement>(null);
  const complianceChartRef = useRef<HTMLDivElement>(null);

  // Fetch analytics data with utils for refetching
  const utils = trpc.useUtils();
  const { data: pipelineMetrics, isLoading: loadingPipeline } = trpc.mortgageAnalytics.getPipelineMetrics.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: brokerPerformance, isLoading: loadingBrokers } = trpc.mortgageAnalytics.getBrokerPerformance.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: investorROI, isLoading: loadingInvestors } = trpc.mortgageAnalytics.getInvestorROI.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const { data: complianceScore, isLoading: loadingCompliance } = trpc.mortgageAnalytics.getComplianceScore.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const exportCSV = trpc.mortgageAnalytics.exportToCSV.useMutation({
    onSuccess: (data) => {
      // Create blob and download
      const blob = new Blob([data.content], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('CSV exported successfully');
    },
    onError: () => {
      toast.error('Failed to export CSV');
    },
  });

  const handleExport = (dataType: 'pipeline' | 'broker_performance' | 'investor_roi' | 'compliance') => {
    exportCSV.mutate({
      dataType,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleDateRangeApply = () => {
    if (startDate && endDate) {
      toast.success('Date range applied');
    }
  };

  // Auto-refetch data when WebSocket message received
  useEffect(() => {
    if (lastMessage) {
      // Refetch all analytics data
      utils.mortgageAnalytics.getPipelineMetrics.invalidate();
      utils.mortgageAnalytics.getBrokerPerformance.invalidate();
      utils.mortgageAnalytics.getInvestorROI.invalidate();
      utils.mortgageAnalytics.getComplianceScore.invalidate();
    }
  }, [lastMessage, utils]);

  const handleExportPDF = async (chartType: 'pipeline' | 'broker' | 'investor' | 'compliance' | 'all') => {
    setIsExportingPDF(true);
    try {
      if (chartType === 'all') {
        // Export all charts to multi-page PDF
        const elements = [];
        if (pipelineChartRef.current) elements.push({ element: pipelineChartRef.current, title: 'Pipeline Funnel' });
        if (brokerChartRef.current) elements.push({ element: brokerChartRef.current, title: 'Broker Performance' });
        if (investorChartRef.current) elements.push({ element: investorChartRef.current, title: 'Investor ROI' });
        if (complianceChartRef.current) elements.push({ element: complianceChartRef.current, title: 'Compliance Score' });

        await exportMultipleElementsToPDF(elements, {
          filename: `mortgage-analytics-report-${new Date().toISOString().split('T')[0]}.pdf`,
          title: 'Mortgage Analytics Report',
          orientation: 'landscape',
        });
        toast.success('Full analytics report exported successfully');
      } else {
        // Export single chart
        let chartRef: React.RefObject<HTMLDivElement | null> | null = null;
        let chartTitle = '';
        let chartDescription = '';

        switch (chartType) {
          case 'pipeline':
            chartRef = pipelineChartRef;
            chartTitle = 'Pipeline Funnel Analysis';
            chartDescription = 'Application flow through mortgage stages';
            break;
          case 'broker':
            chartRef = brokerChartRef;
            chartTitle = 'Broker Performance Leaderboard';
            chartDescription = 'Top performing brokers by loan volume';
            break;
          case 'investor':
            chartRef = investorChartRef;
            chartTitle = 'Investor ROI Tracking';
            chartDescription = 'Return on investment for active investors';
            break;
          case 'compliance':
            chartRef = complianceChartRef;
            chartTitle = 'Compliance Score Dashboard';
            chartDescription = 'Regulatory compliance metrics';
            break;
        }

        if (chartRef?.current) {
          await exportChartToPDF(
            chartRef.current,
            {
              title: chartTitle,
              description: chartDescription,
              metadata: {
                'Date Range': startDate && endDate ? `${startDate} to ${endDate}` : 'All Time',
                'Generated': new Date().toLocaleString(),
              },
            },
            {
              filename: `${chartType}-chart-${new Date().toISOString().split('T')[0]}.pdf`,
              orientation: 'landscape',
            }
          );
          toast.success('Chart exported to PDF successfully');
        }
      }
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Pipeline Funnel Chart Data
  const pipelineFunnelData = pipelineMetrics
    ? {
        labels: ['Submitted', 'Under Review', 'Approved', 'Disbursed'],
        datasets: [
          {
            label: 'Applications',
            data: [
              pipelineMetrics.totalApplications,
              pipelineMetrics.underReviewApplications,
              pipelineMetrics.approvedApplications,
              pipelineMetrics.pendingApplications,
            ],
            backgroundColor: ['rgba(59, 130, 246, 0.8)', 'rgba(251, 191, 36, 0.8)', 'rgba(34, 197, 94, 0.8)', 'rgba(168, 85, 247, 0.8)'],
            borderColor: ['rgb(59, 130, 246)', 'rgb(251, 191, 36)', 'rgb(34, 197, 94)', 'rgb(168, 85, 247)'],
            borderWidth: 1,
          },
        ],
      }
    : null;

  // Broker Leaderboard Chart Data
  const brokerLeaderboardData = brokerPerformance
    ? {
        labels: brokerPerformance.map((b) => b.brokerName),
        datasets: [
          {
            label: 'Total Loan Volume',
            data: brokerPerformance.map((b) => b.totalLoanVolume),
            backgroundColor: 'rgba(59, 130, 246, 0.8)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1,
          },
        ],
      }
    : null;

  // Investor ROI Chart Data
  const investorROIData = investorROI
    ? {
        labels: investorROI.map((inv) => inv.investorName),
        datasets: [
          {
            label: 'ROI (%)',
            data: investorROI.map((inv) => inv.roi),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            fill: true,
            tension: 0.4,
          },
        ],
      }
    : null;

  // Compliance Score Gauge Data
  const complianceGaugeData = complianceScore
    ? {
        labels: ['Score', 'Remaining'],
        datasets: [
          {
            data: [complianceScore.overallScore, 100 - complianceScore.overallScore],
            backgroundColor: [
              complianceScore.overallScore >= 90 ? 'rgba(34, 197, 94, 0.8)' : complianceScore.overallScore >= 70 ? 'rgba(251, 191, 36, 0.8)' : 'rgba(239, 68, 68, 0.8)',
              'rgba(229, 231, 235, 0.3)',
            ],
            borderWidth: 0,
          },
        ],
      }
    : null;

  const isLoading = loadingPipeline || loadingBrokers || loadingInvestors || loadingCompliance;

  return (
    <MortgageDashboardLayout>
      <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mortgage Analytics Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive mortgage pipeline and performance metrics</p>
        </div>
        <Button
          onClick={() => handleExportPDF('all')}
          disabled={isExportingPDF || isLoading}
          size="lg"
        >
          <FileText className="h-4 w-4 mr-2" />
          {isExportingPDF ? 'Generating PDF...' : 'Export Full Report'}
        </Button>
      </div>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Date Range Filter
          </CardTitle>
          <CardDescription>Select custom date range for analytics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleDateRangeApply} className="w-full">
                Apply Filter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-muted-foreground">Loading analytics...</p>
        </div>
      ) : (
        <>
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pipelineMetrics?.totalApplications || 0}</div>
                <p className="text-xs text-muted-foreground">
                  {pipelineMetrics?.approvalRate.toFixed(1)}% approval rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Loan Volume</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₦{(pipelineMetrics?.totalLoanAmount || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg: ₦{(pipelineMetrics?.averageLoanAmount || 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Active Brokers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{brokerPerformance?.length || 0}</div>
                <p className="text-xs text-muted-foreground">Performance tracked</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{complianceScore?.overallScore || 0}%</div>
                <p className="text-xs text-muted-foreground">
                  {complianceScore && complianceScore.overallScore >= 90
                    ? 'Excellent'
                    : complianceScore && complianceScore.overallScore >= 70
                    ? 'Good'
                    : 'Needs Improvement'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline Funnel */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Pipeline Funnel</CardTitle>
                    <CardDescription>Application flow through stages</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExport('pipeline')}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPDF('pipeline')} disabled={isExportingPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent ref={pipelineChartRef}>
                {pipelineFunnelData && (
                  <Bar
                    data={pipelineFunnelData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: {
                        legend: {
                          display: false,
                        },
                        title: {
                          display: false,
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                        },
                      },
                    }}
                  />
                )}
              </CardContent>
            </Card>

            {/* Broker Leaderboard */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Broker Performance</CardTitle>
                    <CardDescription>Top brokers by loan volume</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExport('broker_performance')}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPDF('broker')} disabled={isExportingPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent ref={brokerChartRef}>
                {brokerLeaderboardData && (
                  <Bar
                    data={brokerLeaderboardData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      indexAxis: 'y',
                      plugins: {
                        legend: {
                          display: false,
                        },
                      },
                      scales: {
                        x: {
                          beginAtZero: true,
                        },
                      },
                    }}
                  />
                )}
              </CardContent>
            </Card>

            {/* Investor ROI */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Investor ROI Tracking</CardTitle>
                    <CardDescription>Return on investment by investor</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExport('investor_roi')}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPDF('investor')} disabled={isExportingPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent ref={investorChartRef}>
                {investorROIData && (
                  <Line
                    data={investorROIData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: {
                        legend: {
                          display: false,
                        },
                      },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: {
                            callback: (value) => `${value}%`,
                          },
                        },
                      },
                    }}
                  />
                )}
              </CardContent>
            </Card>

            {/* Compliance Gauge */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Compliance Score</CardTitle>
                    <CardDescription>Overall regulatory compliance</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExport('compliance')}>
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPDF('compliance')} disabled={isExportingPDF}>
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent ref={complianceChartRef}>
                <div className="flex flex-col items-center">
                  {complianceGaugeData && (
                    <div className="w-64 h-64">
                      <Doughnut
                        data={complianceGaugeData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: true,
                          cutout: '70%',
                          plugins: {
                            legend: {
                              display: false,
                            },
                            tooltip: {
                              enabled: false,
                            },
                          },
                        }}
                      />
                    </div>
                  )}
                  {complianceScore && (
                    <div className="mt-4 text-center space-y-2">
                      <div className="text-4xl font-bold">{complianceScore.overallScore}%</div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Documentation:</span>
                          <span className="font-medium">{complianceScore.documentationScore}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Timeliness:</span>
                          <span className="font-medium">{complianceScore.timelinessScore}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Accuracy:</span>
                          <span className="font-medium">{complianceScore.accuracyScore}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
      </div>
    </MortgageDashboardLayout>
  );
}
