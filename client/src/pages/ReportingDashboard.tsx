import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { FileText, Download, Calendar, Clock, CheckCircle, XCircle, Loader2, Plus } from 'lucide-react';

type ReportFormat = 'pdf' | 'excel' | 'csv';
type ReportFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';

const reportTypes = [
  { value: 'parcel_registry', label: 'Parcel Registry' },
  { value: 'transaction_summary', label: 'Transaction Summary' },
  { value: 'verification_status', label: 'Verification Status' },
  { value: 'user_activity', label: 'User Activity' },
];

const formatOptions: { value: ReportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'excel', label: 'Excel (XLSX)' },
  { value: 'csv', label: 'CSV' },
];

const frequencyOptions: { value: ReportFrequency; label: string }[] = [
  { value: 'once', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function ReportingDashboard() {
  const { t } = useTranslation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  
  // Form states
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportType, setReportType] = useState('parcel_registry');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [frequency, setFrequency] = useState<ReportFrequency>('once');
  const [emailDelivery, setEmailDelivery] = useState(false);

  // Queries
  const { data: scheduledReports, refetch: refetchScheduled } = trpc.reporting.listScheduled.useQuery({
    includeInactive: false,
  });

  const { data: reportHistory } = trpc.reporting.getHistory.useQuery({
    limit: 50,
  });

  // Mutations
  const createScheduledMutation = trpc.reporting.createScheduled.useMutation({
    onSuccess: () => {
      toast.success('Scheduled report created successfully');
      setCreateDialogOpen(false);
      resetForm();
      refetchScheduled();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const generateMutation = trpc.reporting.generate.useMutation({
    onSuccess: (data) => {
      if (data.success && data.fileUrl) {
        toast.success('Report generated successfully');
        // Open download in new tab
        window.open(data.fileUrl, '_blank');
        setGenerateDialogOpen(false);
        resetForm();
      } else {
        toast.error(data.error || 'Failed to generate report');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteScheduledMutation = trpc.reporting.deleteScheduled.useMutation({
    onSuccess: () => {
      toast.success('Scheduled report deleted');
      refetchScheduled();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setReportName('');
    setReportDescription('');
    setReportType('parcel_registry');
    setFormat('pdf');
    setFrequency('once');
    setEmailDelivery(false);
  };

  const handleCreateScheduled = () => {
    if (!reportName) {
      toast.error('Please enter a report name');
      return;
    }

    createScheduledMutation.mutate({
      name: reportName,
      description: reportDescription,
      reportType,
      frequency,
      format,
      emailDelivery,
    });
  };

  const handleGenerateNow = () => {
    generateMutation.mutate({
      reportType,
      format,
    });
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Advanced Reporting</h1>
          <p className="text-muted-foreground mt-1">
            Generate and schedule reports with multiple export formats
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Generate Now
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate Report</DialogTitle>
                <DialogDescription>
                  Generate a report immediately and download it
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="gen-report-type">Report Type</Label>
                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger id="gen-report-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {reportTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="gen-format">Format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as ReportFormat)}>
                    <SelectTrigger id="gen-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formatOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateNow}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 mr-2" />
                      Generate
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Schedule Report
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Schedule New Report</DialogTitle>
                <DialogDescription>
                  Create a scheduled report that runs automatically
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="report-name">Report Name *</Label>
                  <Input
                    id="report-name"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder="e.g., Monthly Parcel Registry"
                  />
                </div>
                <div>
                  <Label htmlFor="report-description">Description</Label>
                  <Input
                    id="report-description"
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="report-type">Report Type</Label>
                    <Select value={reportType} onValueChange={setReportType}>
                      <SelectTrigger id="report-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {reportTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="format">Format</Label>
                    <Select value={format} onValueChange={(v) => setFormat(v as ReportFormat)}>
                      <SelectTrigger id="format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {formatOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as ReportFrequency)}>
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="email-delivery"
                    checked={emailDelivery}
                    onCheckedChange={(checked) => setEmailDelivery(checked as boolean)}
                  />
                  <Label htmlFor="email-delivery" className="cursor-pointer">
                    Email delivery
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateScheduled}
                  disabled={createScheduledMutation.isPending}
                >
                  {createScheduledMutation.isPending ? 'Creating...' : 'Create Schedule'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="history" className="space-y-4">
        <TabsList>
          <TabsTrigger value="history">Report History</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Report History</CardTitle>
              <CardDescription>
                {reportHistory?.length || 0} reports generated
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Generated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportHistory?.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">{report.reportName}</TableCell>
                      <TableCell>
                        {reportTypes.find((t) => t.value === report.reportType)?.label || report.reportType}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{report.format.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>
                        {report.status === 'completed' ? (
                          <Badge className="bg-green-500">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        ) : report.status === 'failed' ? (
                          <Badge variant="destructive">
                            <XCircle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            {report.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {report.fileSize ? `${(report.fileSize / 1024).toFixed(2)} KB` : '-'}
                      </TableCell>
                      <TableCell>
                        {new Date(report.generatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {report.fileUrl && report.status === 'completed' ? (
                          <Button size="sm" variant="outline" asChild>
                            <a href={report.fileUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="w-4 h-4" />
                            </a>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled>
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Reports</CardTitle>
              <CardDescription>
                {scheduledReports?.length || 0} active schedules
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledReports?.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">{report.name}</TableCell>
                      <TableCell>
                        {reportTypes.find((t) => t.value === report.reportType)?.label || report.reportType}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{report.format.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge>
                          <Clock className="w-3 h-3 mr-1" />
                          {report.frequency}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {report.nextRunAt ? new Date(report.nextRunAt).toLocaleString() : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {report.lastRunAt ? new Date(report.lastRunAt).toLocaleString() : 'Never'}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteScheduledMutation.mutate({ reportId: report.id })}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
