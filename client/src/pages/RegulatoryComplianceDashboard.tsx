import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  FileText,
  Download,
  Calendar,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Building2,
  Shield,
} from 'lucide-react';

const toIsoDate = (daysAgo = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

function downloadTextFile(filename: string, mimeType: string, contents: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function RegulatoryComplianceDashboard() {
  const [reportType, setReportType] = useState<'cbn_monthly' | 'cbn_quarterly' | 'cbn_annual'>('cbn_monthly');
  const [secReportType, setSecReportType] = useState<'sec_quarterly' | 'sec_annual'>('sec_quarterly');
  const [startDate, setStartDate] = useState(toIsoDate(90));
  const [endDate, setEndDate] = useState(toIsoDate(0));
  const [auditStartDate, setAuditStartDate] = useState(toIsoDate(30));
  const [auditEndDate, setAuditEndDate] = useState(toIsoDate(0));

  const overviewStartDate = useMemo(() => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), []);
  const overviewEndDate = useMemo(() => new Date().toISOString(), []);

  const { data: performanceReport } = trpc.regulatoryCompliance.generateLoanPerformanceReport.useQuery({
    startDate: overviewStartDate,
    endDate: overviewEndDate,
  });

  const { data: overviewAuditTrail } = trpc.regulatoryCompliance.exportAuditTrail.useQuery({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  });

  const generateCBN = trpc.regulatoryCompliance.generateCBNReport.useMutation({
    onSuccess: () => {
      toast.success('CBN report generated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to generate CBN report: ${error.message}`);
    },
  });

  const generateSEC = trpc.regulatoryCompliance.generateSECReport.useMutation({
    onSuccess: () => {
      toast.success('SEC report generated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to generate SEC report: ${error.message}`);
    },
  });

  const { data: auditTrail, refetch: refetchAudit, isFetching: isFetchingAudit } = trpc.regulatoryCompliance.exportAuditTrail.useQuery(
    {
      startDate: auditStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: auditEndDate || new Date().toISOString(),
    },
    {
      enabled: false,
    }
  );

  const overviewCards = useMemo(() => {
    const auditEvents = overviewAuditTrail ?? [];
    const approvedEvents = auditEvents.filter((event: any) => event.status === 'approved').length;
    const pendingEvents = auditEvents.filter((event: any) => event.status === 'pending' || event.status === 'under_review').length;
    const performanceScore = performanceReport
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              100 -
                pendingEvents * 4 -
                Math.max(0, (performanceReport.loansByTerm?.long ?? 0) - (performanceReport.loansByTerm?.short ?? 0))
            )
          )
        )
      : 0;

    return {
      auditableEvents: auditEvents.length,
      approvedApplications: approvedEvents,
      pendingReviews: pendingEvents,
      complianceScore: performanceScore,
    };
  }, [overviewAuditTrail, performanceReport]);

  const handleGenerateCBN = () => {
    if (!startDate || !endDate) {
      toast.error('Please select start and end dates');
      return;
    }
    generateCBN.mutate({ reportType, startDate, endDate });
  };

  const handleGenerateSEC = () => {
    if (!startDate || !endDate) {
      toast.error('Please select start and end dates');
      return;
    }
    generateSEC.mutate({ reportType: secReportType, startDate, endDate });
  };

  const handleExportAudit = async () => {
    const result = await refetchAudit();
    if (!result.data || result.data.length === 0) {
      toast.error('No audit events found for the selected period');
      return;
    }

    const csv = [
      ['Type', 'ID', 'Action', 'Status', 'Amount', 'Timestamp'].join(','),
      ...result.data.map((event: any) => [
        event.type,
        event.id,
        event.action,
        event.status,
        event.amount,
        event.timestamp,
      ].join(',')),
    ].join('\n');

    downloadTextFile(`audit-trail-${auditStartDate || 'start'}-${auditEndDate || 'end'}.csv`, 'text/csv', csv);
    toast.success('Audit trail exported');
  };

  const handleExportReport = (format: 'pdf' | 'excel', reportData: any, reportLabel: string) => {
    const serialized = JSON.stringify(reportData, null, 2);
    const extension = format === 'pdf' ? 'txt' : 'json';
    const mimeType = format === 'pdf' ? 'text/plain' : 'application/json';
    downloadTextFile(`${reportLabel}-${reportData.reportId}.${extension}`, mimeType, serialized);
    toast.success(`${reportLabel} exported as ${format.toUpperCase()}`);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Mortgage Regulatory Compliance</h1>
        <p className="text-muted-foreground">
          Generate and manage CBN/SEC compliance reports, monitor filing exposure, and export auditable activity.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Auditable Events</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewCards.auditableEvents}</div>
            <p className="text-xs text-muted-foreground">Captured from the last 30 days of live activity</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Applications</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewCards.approvedApplications}</div>
            <p className="text-xs text-muted-foreground">Derived from the current audit trail</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewCards.pendingReviews}</div>
            <p className="text-xs text-muted-foreground">Pending or under-review events in the live audit window</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overviewCards.complianceScore}%</div>
            <p className="text-xs text-muted-foreground">Calculated from live review backlog and term distribution</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="cbn" className="mb-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cbn">CBN Reports</TabsTrigger>
          <TabsTrigger value="sec">SEC Reports</TabsTrigger>
          <TabsTrigger value="audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="cbn">
          <Card>
            <CardHeader>
              <CardTitle>Generate CBN Compliance Report</CardTitle>
              <CardDescription>
                Create monthly, quarterly, or annual reports for the Central Bank of Nigeria using the live compliance contract.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Report Type</label>
                  <Select value={reportType} onValueChange={(value: 'cbn_monthly' | 'cbn_quarterly' | 'cbn_annual') => setReportType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cbn_monthly">Monthly Report</SelectItem>
                      <SelectItem value="cbn_quarterly">Quarterly Report</SelectItem>
                      <SelectItem value="cbn_annual">Annual Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleGenerateCBN} disabled={generateCBN.isPending}>
                  <FileText className="mr-2 h-4 w-4" />
                  {generateCBN.isPending ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>

              {generateCBN.data && (
                <div className="mt-6 p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Report Generated</h3>
                      <p className="text-sm text-muted-foreground">
                        {generateCBN.data.reportId} - {new Date(generateCBN.data.generatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleExportReport('pdf', generateCBN.data, 'cbn-report')}>
                        <Download className="mr-2 h-4 w-4" />
                        Export Snapshot
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleExportReport('excel', generateCBN.data, 'cbn-report')}>
                        <Download className="mr-2 h-4 w-4" />
                        Export Data
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Loans</p>
                      <p className="text-2xl font-bold">{generateCBN.data.summary.totalLoansOriginated}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-2xl font-bold">₦{(generateCBN.data.summary.totalLoanAmount / 1000000).toFixed(1)}M</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Interest Rate</p>
                      <p className="text-2xl font-bold">{generateCBN.data.summary.averageInterestRate}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Capital Adequacy</p>
                      <p className="text-2xl font-bold">{generateCBN.data.capitalAdequacyRatio}%</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Loans by Risk Tier</h4>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {Object.entries(generateCBN.data.summary.loansByRiskTier).map(([tier, data]: [string, any]) => (
                        <div key={tier} className="p-2 border rounded text-center">
                          <Badge variant="outline" className="mb-1">{tier.toUpperCase()}</Badge>
                          <p className="text-sm font-medium">{data.count} loans</p>
                          <p className="text-xs text-muted-foreground">₦{(data.amount / 1000000).toFixed(1)}M</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sec">
          <Card>
            <CardHeader>
              <CardTitle>Generate SEC Disclosure Report</CardTitle>
              <CardDescription>
                Create quarterly or annual reports for the Securities and Exchange Commission using the live compliance contract.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Report Type</label>
                  <Select value={secReportType} onValueChange={(value: 'sec_quarterly' | 'sec_annual') => setSecReportType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sec_quarterly">Quarterly Report</SelectItem>
                      <SelectItem value="sec_annual">Annual Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleGenerateSEC} disabled={generateSEC.isPending}>
                  <FileText className="mr-2 h-4 w-4" />
                  {generateSEC.isPending ? 'Generating...' : 'Generate Report'}
                </Button>
              </div>

              {generateSEC.data && (
                <div className="mt-6 p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Report Generated</h3>
                      <p className="text-sm text-muted-foreground">
                        {generateSEC.data.reportId} - {new Date(generateSEC.data.generatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleExportReport('pdf', generateSEC.data, 'sec-report')}>
                        <Download className="mr-2 h-4 w-4" />
                        Export Snapshot
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleExportReport('excel', generateSEC.data, 'sec-report')}>
                        <Download className="mr-2 h-4 w-4" />
                        Export Data
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Pools Created</p>
                      <p className="text-2xl font-bold">{generateSEC.data.securitizationActivity.poolsCreated}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Securitized</p>
                      <p className="text-2xl font-bold">₦{(generateSEC.data.securitizationActivity.totalSecuritized / 1000000).toFixed(1)}M</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Pool Size</p>
                      <p className="text-2xl font-bold">₦{(generateSEC.data.securitizationActivity.averagePoolSize / 1000000).toFixed(1)}M</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Compliance Status</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="text-sm font-medium">{generateSEC.data.complianceStatus.disclosuresFiled}</p>
                          <p className="text-xs text-muted-foreground">Disclosures Filed</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">{generateSEC.data.complianceStatus.pendingDisclosures}</p>
                          <p className="text-xs text-muted-foreground">Pending</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-yellow-500" />
                        <div>
                          <p className="text-sm font-medium">{generateSEC.data.complianceStatus.overdueDisclosures}</p>
                          <p className="text-xs text-muted-foreground">Overdue</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Export Audit Trail</CardTitle>
              <CardDescription>
                Download comprehensive audit activity for compliance verification and operational review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <Input type="date" value={auditStartDate} onChange={(e) => setAuditStartDate(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Input type="date" value={auditEndDate} onChange={(e) => setAuditEndDate(e.target.value)} />
                </div>
              </div>

              <Button onClick={handleExportAudit} disabled={isFetchingAudit}>
                <Download className="mr-2 h-4 w-4" />
                {isFetchingAudit ? 'Exporting...' : 'Export Audit Trail'}
              </Button>

              {auditTrail && auditTrail.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-4">Recent Activity ({auditTrail.length} events)</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {auditTrail.slice(0, 50).map((event: any, index: number) => (
                      <div key={`${event.id}-${index}`} className="p-3 border rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{event.type}</Badge>
                          <div>
                            <p className="text-sm font-medium">{event.action} - {event.id}</p>
                            <p className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">₦{(event.amount / 1000000).toFixed(2)}M</p>
                          <Badge variant={event.status === 'approved' ? 'default' : 'secondary'}>{event.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
