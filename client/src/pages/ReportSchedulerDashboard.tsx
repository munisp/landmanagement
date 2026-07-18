import { useState } from 'react';
import DOMPurify from 'dompurify';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Calendar, FileText, Mail, Play, Pause, Trash2, Plus, TrendingUp, CheckCircle, XCircle, Clock, Zap, DollarSign, Briefcase, Shield, BarChart3, Edit, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ReportSchedulerDashboard() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<number | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templateRecipients, setTemplateRecipients] = useState('');
  const [isEmailTemplateDialogOpen, setIsEmailTemplateDialogOpen] = useState(false);
  const [selectedEmailTemplate, setSelectedEmailTemplate] = useState<any>(null);
  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; html: string } | null>(null);
  const [emailTemplateFormData, setEmailTemplateFormData] = useState({
    name: '',
    description: '',
    subject: '',
    body: '',
    reportType: 'mortgage_analytics' as const,
  });

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    reportType: 'mortgage_analytics' as const,
    frequency: 'monthly' as const,
    format: 'pdf' as const,
    emailDelivery: true,
    emailRecipients: '',
    filters: '',
  });

  // Queries
  const { data: schedules, isLoading: loadingSchedules, refetch: refetchSchedules } = trpc.reportScheduler.list.useQuery();
  const { data: statistics } = trpc.reportScheduler.getStatistics.useQuery();
  const { data: history } = trpc.reportScheduler.getHistory.useQuery({ limit: 10 });
  const { data: templates } = trpc.reportScheduler.getTemplates.useQuery();
  const { data: emailTemplates, refetch: refetchEmailTemplates } = trpc.emailTemplate.list.useQuery();
  const { data: availableVariables } = trpc.emailTemplate.getVariables.useQuery();

  // Mutations
  const createSchedule = trpc.reportScheduler.create.useMutation({
    onSuccess: () => {
      toast.success('Report schedule created successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      refetchSchedules();
    },
    onError: (error) => toast.error(`Failed to create schedule: ${error.message}`),
  });

  const toggleActive = trpc.reportScheduler.toggleActive.useMutation({
    onSuccess: () => {
      toast.success('Schedule status updated');
      refetchSchedules();
    },
    onError: (error) => toast.error(`Failed to update schedule: ${error.message}`),
  });

  const deleteSchedule = trpc.reportScheduler.delete.useMutation({
    onSuccess: () => {
      toast.success('Schedule deleted successfully');
      refetchSchedules();
    },
    onError: (error) => toast.error(`Failed to delete schedule: ${error.message}`),
  });

  const runNow = trpc.reportScheduler.runNow.useMutation({
    onSuccess: () => {
      toast.success('Report generation started');
      refetchSchedules();
    },
    onError: (error) => toast.error(`Failed to run report: ${error.message}`),
  });

  const createFromTemplate = trpc.reportScheduler.createFromTemplate.useMutation({
    onSuccess: () => {
      toast.success('Schedule created from template');
      setIsTemplateDialogOpen(false);
      setSelectedTemplate(null);
      setTemplateRecipients('');
      refetchSchedules();
    },
    onError: (error) => toast.error(`Failed to create from template: ${error.message}`),
  });

  // Email template mutations
  const createEmailTemplate = trpc.emailTemplate.create.useMutation({
    onSuccess: () => {
      toast.success('Email template created successfully');
      setIsEmailTemplateDialogOpen(false);
      resetEmailTemplateForm();
      refetchEmailTemplates();
    },
    onError: (error) => toast.error(`Failed to create template: ${error.message}`),
  });

  const updateEmailTemplate = trpc.emailTemplate.update.useMutation({
    onSuccess: () => {
      toast.success('Email template updated successfully');
      setIsEmailTemplateDialogOpen(false);
      setSelectedEmailTemplate(null);
      resetEmailTemplateForm();
      refetchEmailTemplates();
    },
    onError: (error) => toast.error(`Failed to update template: ${error.message}`),
  });

  const deleteEmailTemplate = trpc.emailTemplate.delete.useMutation({
    onSuccess: () => {
      toast.success('Email template deleted successfully');
      refetchEmailTemplates();
    },
    onError: (error) => toast.error(`Failed to delete template: ${error.message}`),
  });

  const previewEmailTemplate = trpc.emailTemplate.preview.useQuery(
    {
      templateId: selectedEmailTemplate?.id || 0,
      variables: {
        reportName: 'Monthly Analytics Report',
        date: new Date().toLocaleDateString(),
        recipientName: 'John Doe',
        reportType: 'Analytics',
        frequency: 'Monthly',
        downloadUrl: 'https://example.com/reports/sample.pdf',
        userName: 'Admin User',
      },
    },
    {
      enabled: false, // Only run when manually triggered
    }
  );

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      reportType: 'mortgage_analytics',
      frequency: 'monthly',
      format: 'pdf',
      emailDelivery: true,
      emailRecipients: '',
      filters: '',
    });
  };

  const resetEmailTemplateForm = () => {
    setEmailTemplateFormData({
      name: '',
      description: '',
      subject: '',
      body: '',
      reportType: 'mortgage_analytics',
    });
  };

  const handleCreateSchedule = () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a schedule name');
      return;
    }

    const emailRecipients = formData.emailRecipients
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    createSchedule.mutate({
      name: formData.name,
      description: formData.description || undefined,
      reportType: formData.reportType,
      frequency: formData.frequency,
      format: formData.format,
      emailDelivery: formData.emailDelivery,
      emailRecipients: emailRecipients.length > 0 ? emailRecipients : undefined,
      filters: formData.filters ? JSON.parse(formData.filters) : undefined,
    });
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    toggleActive.mutate({ id, isActive: !isActive });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this schedule?')) {
      deleteSchedule.mutate({ id });
    }
  };

  const handleRunNow = (id: number) => {
    runNow.mutate({ id });
  };

  const handleActivateTemplate = (template: any) => {
    setSelectedTemplate(template);
    setIsTemplateDialogOpen(true);
  };

  const handleConfirmTemplate = () => {
    if (!selectedTemplate) return;

    const recipients = templateRecipients
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0);

    createFromTemplate.mutate({
      templateId: selectedTemplate.id,
      customRecipients: recipients.length > 0 ? recipients : undefined,
    });
  };

  const handleCreateEmailTemplate = () => {
    if (!emailTemplateFormData.name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!emailTemplateFormData.subject.trim()) {
      toast.error('Please enter an email subject');
      return;
    }
    if (!emailTemplateFormData.body.trim()) {
      toast.error('Please enter an email body');
      return;
    }

    if (selectedEmailTemplate) {
      updateEmailTemplate.mutate({
        templateId: selectedEmailTemplate.id,
        ...emailTemplateFormData,
      });
    } else {
      createEmailTemplate.mutate(emailTemplateFormData);
    }
  };

  const handleEditEmailTemplate = (template: any) => {
    setSelectedEmailTemplate(template);
    setEmailTemplateFormData({
      name: template.name,
      description: template.description || '',
      subject: template.subject,
      body: template.body,
      reportType: template.reportType,
    });
    setIsEmailTemplateDialogOpen(true);
  };

  const handleDeleteEmailTemplate = (id: number) => {
    if (confirm('Are you sure you want to delete this email template?')) {
      deleteEmailTemplate.mutate({ templateId: id });
    }
  };

  const handlePreviewEmailTemplate = async (template: any) => {
    setSelectedEmailTemplate(template);
    try {
      const result = await previewEmailTemplate.refetch();
      if (result.data) {
        setPreviewData(result.data);
        setIsPreviewDialogOpen(true);
      }
    } catch (error) {
      toast.error('Failed to generate preview');
    }
  };

  const getTemplateIcon = (icon: string) => {
    const icons: Record<string, any> = {
      DollarSign,
      TrendingUp,
      FileText,
      Briefcase,
      BarChart3,
      Shield,
    };
    return icons[icon] || FileText;
  };

  const getReportTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      mortgage_analytics: 'Mortgage Analytics',
      commission_statement: 'Commission Statement',
      broker_performance: 'Broker Performance',
      investor_roi: 'Investor ROI',
      compliance_report: 'Compliance Report',
    };
    return labels[type] || type;
  };

  const getFrequencyLabel = (frequency: string) => {
    const labels: Record<string, string> = {
      once: 'Once',
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      custom: 'Custom',
    };
    return labels[frequency] || frequency;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Report Scheduler</h1>
          <p className="text-muted-foreground">Automate report generation and email delivery</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="lg" onClick={() => setIsTemplateDialogOpen(true)}>
            <Zap className="h-4 w-4 mr-2" />
            Use Template
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus className="h-4 w-4 mr-2" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Report Schedule</DialogTitle>
              <DialogDescription>
                Configure automated report generation and email delivery
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Schedule Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Monthly Analytics Report"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the purpose of this report"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="reportType">Report Type</Label>
                  <Select
                    value={formData.reportType}
                    onValueChange={(value: any) => setFormData({ ...formData, reportType: value })}
                  >
                    <SelectTrigger id="reportType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mortgage_analytics">Mortgage Analytics</SelectItem>
                      <SelectItem value="commission_statement">Commission Statement</SelectItem>
                      <SelectItem value="broker_performance">Broker Performance</SelectItem>
                      <SelectItem value="investor_roi">Investor ROI</SelectItem>
                      <SelectItem value="compliance_report">Compliance Report</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select
                    value={formData.frequency}
                    onValueChange={(value: any) => setFormData({ ...formData, frequency: value })}
                  >
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="once">Once</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="format">Format</Label>
                <Select
                  value={formData.format}
                  onValueChange={(value: any) => setFormData({ ...formData, format: value })}
                >
                  <SelectTrigger id="format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="excel">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="emailRecipients">Email Recipients (comma-separated)</Label>
                <Input
                  id="emailRecipients"
                  value={formData.emailRecipients}
                  onChange={(e) => setFormData({ ...formData, emailRecipients: e.target.value })}
                  placeholder="user@example.com, admin@example.com"
                />
              </div>

              <div>
                <Label htmlFor="filters">Filters (JSON)</Label>
                <Textarea
                  id="filters"
                  value={formData.filters}
                  onChange={(e) => setFormData({ ...formData, filters: e.target.value })}
                  placeholder='{"startDate": "2026-01-01", "endDate": "2026-01-31"}'
                  rows={3}
                />
              </div>

              <Button
                onClick={handleCreateSchedule}
                disabled={createSchedule.isPending}
                className="w-full"
              >
                {createSchedule.isPending ? 'Creating...' : 'Create Schedule'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Schedules</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalSchedules}</div>
              <p className="text-xs text-muted-foreground">
                {statistics.activeSchedules} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.totalReports}</div>
              <p className="text-xs text-muted-foreground">
                Generated reports
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.successRate}%</div>
              <p className="text-xs text-muted-foreground">
                {statistics.successfulReports} successful
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Failed Reports</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.failedReports}</div>
              <p className="text-xs text-muted-foreground">
                Require attention
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for Schedules and Email Templates */}
      <Tabs defaultValue="schedules" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="email-templates">Email Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="schedules">
      <Card>
        <CardHeader>
          <CardTitle>Active Schedules</CardTitle>
          <CardDescription>Manage your automated report schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSchedules ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-2 text-sm text-muted-foreground">Loading schedules...</p>
            </div>
          ) : schedules && schedules.length > 0 ? (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{schedule.name}</h3>
                      <Badge variant={schedule.isActive ? 'default' : 'secondary'}>
                        {schedule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline">{getReportTypeLabel(schedule.reportType)}</Badge>
                    </div>
                    {schedule.description && (
                      <p className="text-sm text-muted-foreground mb-2">{schedule.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {getFrequencyLabel(schedule.frequency)}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {schedule.format.toUpperCase()}
                      </span>
                      {schedule.emailDelivery && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          Email enabled
                        </span>
                      )}
                      {schedule.nextRunAt && (
                        <span>
                          Next run: {new Date(schedule.nextRunAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunNow(schedule.id)}
                      disabled={runNow.isPending}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(schedule.id, schedule.isActive)}
                      disabled={toggleActive.isPending}
                    >
                      {schedule.isActive ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(schedule.id)}
                      disabled={deleteSchedule.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No schedules configured yet</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                Create your first schedule
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Report History */}
      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <CardDescription>Latest generated reports</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div>
                    <p className="font-medium">{record.reportName}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(record.generatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        record.status === 'completed'
                          ? 'default'
                          : record.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {record.status}
                    </Badge>
                    {record.fileUrl && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={record.fileUrl} download>
                          Download
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="email-templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Email Templates</CardTitle>
                <CardDescription>Customize email templates for report delivery</CardDescription>
              </div>
              <Dialog open={isEmailTemplateDialogOpen} onOpenChange={(open) => {
                setIsEmailTemplateDialogOpen(open);
                if (!open) {
                  setSelectedEmailTemplate(null);
                  resetEmailTemplateForm();
                }
              }}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {selectedEmailTemplate ? 'Edit Email Template' : 'Create Email Template'}
                    </DialogTitle>
                    <DialogDescription>
                      Customize the email content for automated report delivery
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="templateName">Template Name *</Label>
                      <Input
                        id="templateName"
                        value={emailTemplateFormData.name}
                        onChange={(e) => setEmailTemplateFormData({ ...emailTemplateFormData, name: e.target.value })}
                        placeholder="Monthly Report Email"
                      />
                    </div>

                    <div>
                      <Label htmlFor="templateDescription">Description</Label>
                      <Textarea
                        id="templateDescription"
                        value={emailTemplateFormData.description}
                        onChange={(e) => setEmailTemplateFormData({ ...emailTemplateFormData, description: e.target.value })}
                        placeholder="Describe the purpose of this template"
                        rows={2}
                      />
                    </div>

                    <div>
                      <Label htmlFor="templateReportType">Report Type</Label>
                      <Select
                        value={emailTemplateFormData.reportType}
                        onValueChange={(value: any) => setEmailTemplateFormData({ ...emailTemplateFormData, reportType: value })}
                      >
                        <SelectTrigger id="templateReportType">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mortgage_analytics">Mortgage Analytics</SelectItem>
                          <SelectItem value="commission_statement">Commission Statement</SelectItem>
                          <SelectItem value="broker_performance">Broker Performance</SelectItem>
                          <SelectItem value="investor_roi">Investor ROI</SelectItem>
                          <SelectItem value="compliance_report">Compliance Report</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="templateSubject">Email Subject *</Label>
                      <Input
                        id="templateSubject"
                        value={emailTemplateFormData.subject}
                        onChange={(e) => setEmailTemplateFormData({ ...emailTemplateFormData, subject: e.target.value })}
                        placeholder="Your {{reportType}} Report is Ready"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Available variables: {availableVariables ? Object.keys(availableVariables).map(k => `{{${k}}}`).join(', ') : 'Loading...'}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="templateBody">Email Body *</Label>
                      <Textarea
                        id="templateBody"
                        value={emailTemplateFormData.body}
                        onChange={(e) => setEmailTemplateFormData({ ...emailTemplateFormData, body: e.target.value })}
                        placeholder="Hello {{recipientName}},\n\nYour {{reportType}} report for {{date}} is ready.\n\nDownload: {{downloadUrl}}"
                        rows={8}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use variables like {'{{'} reportName {'}}'},  {'{{'} date {'}}'},  {'{{'} recipientName {'}}'},  {'{{'} downloadUrl {'}}'}  
                      </p>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsEmailTemplateDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateEmailTemplate}>
                        {selectedEmailTemplate ? 'Update Template' : 'Create Template'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {emailTemplates && emailTemplates.length > 0 ? (
                <div className="space-y-4">
                  {emailTemplates.map((template: any) => (
                    <div
                      key={template.id}
                      className="flex items-start justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{template.name}</h3>
                          <Badge variant="outline">{getReportTypeLabel(template.reportType)}</Badge>
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
                        )}
                        <div className="text-sm">
                          <p className="text-muted-foreground"><strong>Subject:</strong> {template.subject}</p>
                          <p className="text-muted-foreground mt-1 line-clamp-2"><strong>Body:</strong> {template.body}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreviewEmailTemplate(template)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditEmailTemplate(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteEmailTemplate(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No email templates configured yet</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setIsEmailTemplateDialogOpen(true)}
                  >
                    Create your first template
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Selection Dialog */}
      <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose a Report Template</DialogTitle>
            <DialogDescription>
              Select a pre-configured template to quickly create a scheduled report
            </DialogDescription>
          </DialogHeader>

          {templates && (
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="broker">Broker</TabsTrigger>
                <TabsTrigger value="investor">Investor</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="compliance">Compliance</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates.map((template: any) => {
                    const Icon = getTemplateIcon(template.icon);
                    return (
                      <Card key={template.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleActivateTemplate(template)}>
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{template.name}</CardTitle>
                                <Badge variant="outline" className="mt-1">
                                  {template.frequency}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                          <div className="flex gap-2 mt-3">
                            <Badge variant="secondary">{template.format.toUpperCase()}</Badge>
                            <Badge variant="secondary">{getReportTypeLabel(template.reportType)}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              {['broker', 'investor', 'analytics', 'compliance'].map((category) => (
                <TabsContent key={category} value={category} className="space-y-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templates
                      .filter((t: any) => t.category === category)
                      .map((template: any) => {
                        const Icon = getTemplateIcon(template.icon);
                        return (
                          <Card key={template.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => handleActivateTemplate(template)}>
                            <CardHeader>
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-primary/10">
                                    <Icon className="h-5 w-5 text-primary" />
                                  </div>
                                  <div>
                                    <CardTitle className="text-base">{template.name}</CardTitle>
                                    <Badge variant="outline" className="mt-1">
                                      {template.frequency}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm text-muted-foreground">{template.description}</p>
                              <div className="flex gap-2 mt-3">
                                <Badge variant="secondary">{template.format.toUpperCase()}</Badge>
                                <Badge variant="secondary">{getReportTypeLabel(template.reportType)}</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Template Preview Dialog */}
      <Dialog open={isPreviewDialogOpen} onOpenChange={setIsPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Email Template Preview</DialogTitle>
            <DialogDescription>
              Preview with sample data. Actual emails will use real report data.
            </DialogDescription>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm font-medium mb-2">Subject:</p>
                <p className="text-sm">{previewData.subject}</p>
              </div>
              <div className="bg-white border rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Email Body:</p>
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewData.html) }}
                />
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setIsPreviewDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Confirmation Dialog */}
      {selectedTemplate && (
        <Dialog open={!!selectedTemplate && isTemplateDialogOpen} onOpenChange={(open) => !open && setSelectedTemplate(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Activate Template: {selectedTemplate.name}</DialogTitle>
              <DialogDescription>
                Configure email recipients for this scheduled report
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="templateRecipients">Email Recipients (comma-separated)</Label>
                <Input
                  id="templateRecipients"
                  value={templateRecipients}
                  onChange={(e) => setTemplateRecipients(e.target.value)}
                  placeholder="admin@example.com, manager@example.com"
                />
              </div>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="text-sm font-medium">Template Details:</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Report Type: {getReportTypeLabel(selectedTemplate.reportType)}</li>
                  <li>• Frequency: {getFrequencyLabel(selectedTemplate.frequency)}</li>
                  <li>• Format: {selectedTemplate.format.toUpperCase()}</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSelectedTemplate(null); setTemplateRecipients(''); }}>
                Cancel
              </Button>
              <Button onClick={handleConfirmTemplate} disabled={createFromTemplate.isPending}>
                {createFromTemplate.isPending ? 'Creating...' : 'Activate Template'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
