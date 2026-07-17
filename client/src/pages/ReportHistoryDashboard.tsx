import { useMemo, useState } from 'react';
import { trpc } from '../lib/trpc';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Download,
  Search,
  Filter,
  Calendar,
  FileText,
  TrendingUp,
  AlertCircle,
  Share2,
  GitBranch,
} from 'lucide-react';

export default function ReportHistoryDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7days');

  // Fetch report history
  const { data: history, isLoading } = trpc.reportScheduler.getHistory.useQuery({
    limit: 100,
  });

  // Fetch statistics
  const { data: stats } = trpc.reportScheduler.getStatistics.useQuery();

  const shareToCollaborationMutation = trpc.collaboration.sendMessage.useMutation({
    onSuccess: () => {
      toast.success('Report link shared to collaboration workspace');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const versionMap = useMemo(() => {
    const grouped = new Map<string, Array<{ id: number; generatedAt: string | Date }>>();
    for (const item of history || []) {
      const key = `${item.reportName}::${item.reportType}`;
      const existing = grouped.get(key) || [];
      existing.push({ id: item.id, generatedAt: item.generatedAt });
      grouped.set(key, existing);
    }

    const resolved = new Map<number, number>();
    Array.from(grouped.values()).forEach((items) => {
      items
        .sort((a: { id: number; generatedAt: string | Date }, b: { id: number; generatedAt: string | Date }) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime())
        .forEach((entry: { id: number; generatedAt: string | Date }, index: number) => resolved.set(entry.id, index + 1));
    });
    return resolved;
  }, [history]);

  const handleShareReport = async (item: any) => {
    if (!item.fileUrl) return;

    const shareMessage = `Shared report: ${item.reportName} (${item.reportType}) — ${item.fileUrl}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(item.fileUrl);
      }
      await shareToCollaborationMutation.mutateAsync({ message: shareMessage });
    } catch (error) {
      toast.error('Failed to share report');
    }
  };

  // Filter history
  const filteredHistory = history?.filter((item) => {
    const matchesSearch =
      item.reportName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.reportType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesType = reportTypeFilter === 'all' || item.reportType === reportTypeFilter;

    // Date range filter
    const itemDate = new Date(item.generatedAt);
    const now = new Date();
    let matchesDate = true;
    if (dateRange === '24hours') {
      matchesDate = now.getTime() - itemDate.getTime() <= 24 * 60 * 60 * 1000;
    } else if (dateRange === '7days') {
      matchesDate = now.getTime() - itemDate.getTime() <= 7 * 24 * 60 * 60 * 1000;
    } else if (dateRange === '30days') {
      matchesDate = now.getTime() - itemDate.getTime() <= 30 * 24 * 60 * 60 * 1000;
    }

    return matchesSearch && matchesStatus && matchesType && matchesDate;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  const calculateSuccessRate = () => {
    if (!filteredHistory || filteredHistory.length === 0) return 0;
    const completed = filteredHistory.filter(h => h.status === 'completed').length;
    return ((completed / filteredHistory.length) * 100).toFixed(1);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading report history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Report History</h1>
          <p className="text-muted-foreground">
            View and analyze report generation history
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reports</p>
                <p className="text-2xl font-bold">{stats.totalReports}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.successfulReports}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{stats.failedReports}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{calculateSuccessRate()}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </Select>

          <Select value={reportTypeFilter} onValueChange={setReportTypeFilter}>
            <option value="all">All Types</option>
            <option value="analytics">Analytics</option>
            <option value="commission">Commission</option>
            <option value="broker">Broker</option>
            <option value="investor">Investor</option>
          </Select>

          <Select value={dateRange} onValueChange={setDateRange}>
            <option value="24hours">Last 24 Hours</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
            <option value="all">All Time</option>
          </Select>
        </div>
      </Card>

      {/* History Table */}
      <Card>
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Report Generation History</h2>
          <p className="text-sm text-muted-foreground">
            {filteredHistory?.length || 0} reports found
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Report Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Format</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Size</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Generated</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Duration</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredHistory && filteredHistory.length > 0 ? (
                filteredHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                                              <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{item.reportName}</p>
                            <Badge variant="secondary" className="gap-1">
                              <GitBranch className="h-3 w-3" />
                              v{versionMap.get(item.id) || 1}
                            </Badge>
                          </div>
                          {item.scheduledReportId && (
                            <p className="text-xs text-muted-foreground">
                              Scheduled Report #{item.scheduledReportId}
                            </p>
                          )}
                        </div>

                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{item.reportType}</Badge>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm uppercase">{item.format}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {formatFileSize(item.fileSize)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(item.generatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      N/A
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {item.fileUrl && item.status === 'completed' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(item.fileUrl!, '_blank')}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleShareReport(item)}
                              disabled={shareToCollaborationMutation.isPending}
                            >
                              <Share2 className="h-3 w-3 mr-1" />
                              Share
                            </Button>
                          </>
                        )}
                        {item.status === 'failed' && item.errorMessage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              toast.error('Error Details', {
                                description: item.errorMessage,
                              });
                            }}
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Details
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No reports found matching your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
