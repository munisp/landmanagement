import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCw,
  Download,
  Filter,
  Search,
  TrendingUp,
  Activity,
  DollarSign,
  FileText,
  Shield,
  Home,
  Leaf,
  Bell,
  Map,
  Building,
} from 'lucide-react';
import { toast } from 'sonner';

interface SystemStatus {
  system: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  lastUpdated: Date;
  details?: string;
  icon: React.ReactNode;
}

interface TransactionOverview {
  transactionId: string;
  parcelId: string;
  parcelAddress: string;
  transactionType: string;
  overallStatus: string;
  overallProgress: number;
  createdAt: Date;
  estimatedCompletion: Date;
  systems: SystemStatus[];
}

export default function UnifiedDashboard() {
  const { t } = useTranslation();
  const [selectedTransaction, setSelectedTransaction] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds

  // Fetch all transactions with real-time status
  const { data: transactions, isLoading, refetch } = trpc.dashboard.getUnifiedTransactionStatus.useQuery(
    undefined,
    {
      refetchInterval: autoRefresh ? refreshInterval : false,
    }
  );

  // Fetch detailed status for selected transaction
  const { data: transactionDetail } = trpc.dashboard.getTransactionDetail.useQuery(
    { transactionId: selectedTransaction! },
    {
      enabled: !!selectedTransaction,
      refetchInterval: autoRefresh ? refreshInterval : false,
    }
  );

  // Export functionality
  const exportMutation = trpc.dashboard.exportTransactionReport.useMutation({
    onSuccess: (data) => {
      // Download the file
      const link = document.createElement('a');
      link.href = data.url;
      link.download = data.filename;
      link.click();
      toast.success(t('dashboard.exportSuccess'));
    },
    onError: () => {
      toast.error(t('dashboard.exportError'));
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-blue-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'failed':
        return 'bg-red-500';
      case 'cancelled':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSystemIcon = (system: string) => {
    switch (system) {
      case 'mortgage':
        return <Home className="h-5 w-5" />;
      case 'tax':
        return <DollarSign className="h-5 w-5" />;
      case 'insurance':
        return <Shield className="h-5 w-5" />;
      case 'legal':
        return <FileText className="h-5 w-5" />;
      case 'survey':
        return <Map className="h-5 w-5" />;
      case 'environmental':
        return <Leaf className="h-5 w-5" />;
      case 'public_notice':
        return <Bell className="h-5 w-5" />;
      case 'land_use':
        return <Building className="h-5 w-5" />;
      case 'blockchain':
        return <Activity className="h-5 w-5" />;
      case 'payment':
        return <DollarSign className="h-5 w-5" />;
      default:
        return <Activity className="h-5 w-5" />;
    }
  };

  const handleExport = (format: 'pdf' | 'excel') => {
    if (selectedTransaction) {
      exportMutation.mutate({ transactionId: selectedTransaction, format });
    } else {
      toast.error(t('dashboard.selectTransactionFirst'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('dashboard.unifiedTitle')}</h1>
          <p className="text-muted-foreground">{t('dashboard.unifiedDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? t('dashboard.autoRefreshOn') : t('dashboard.autoRefreshOff')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('dashboard.refresh')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('pdf')}
            disabled={!selectedTransaction}
          >
            <Download className="h-4 w-4 mr-2" />
            {t('dashboard.exportPDF')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('excel')}
            disabled={!selectedTransaction}
          >
            <Download className="h-4 w-4 mr-2" />
            {t('dashboard.exportExcel')}
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.totalTransactions')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.activeTransactions')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.completed')}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {transactions?.filter((t) => t.overallStatus === 'completed').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.successfulTransactions')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.inProgress')}</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {transactions?.filter((t: any) => t.overallStatus === 'in_progress').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.ongoingTransactions')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('dashboard.failed')}</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {transactions?.filter((t: any) => t.overallStatus === 'failed').length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('dashboard.failedTransactions')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('dashboard.transactions')}</CardTitle>
            <CardDescription>{t('dashboard.selectTransaction')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {transactions?.map((transaction: any) => (
              <div
                key={transaction.transactionId}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedTransaction === transaction.transactionId
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                onClick={() => setSelectedTransaction(transaction.transactionId)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{transaction.transactionId}</span>
                  {getStatusIcon(transaction.overallStatus)}
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {transaction.parcelAddress}
                </p>
                <Progress value={transaction.overallProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {transaction.overallProgress}% {t('dashboard.complete')}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Transaction Detail */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('dashboard.transactionDetail')}</CardTitle>
            <CardDescription>
              {selectedTransaction
                ? t('dashboard.detailDescription')
                : t('dashboard.noTransactionSelected')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionDetail ? (
              <div className="space-y-6">
                {/* Overall Progress */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{t('dashboard.overallProgress')}</h3>
                    <Badge className={getStatusColor(transactionDetail.overallStatus)}>
                      {t(`dashboard.status.${transactionDetail.overallStatus}`)}
                    </Badge>
                  </div>
                  <Progress value={transactionDetail.overallProgress} className="h-3" />
                  <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
                    <span>{t('dashboard.created')}: {new Date(transactionDetail.createdAt).toLocaleDateString()}</span>
                    <span>{t('dashboard.estimated')}: {new Date(transactionDetail.estimatedCompletion).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* System Status Timeline */}
                <div>
                  <h3 className="font-semibold mb-4">{t('dashboard.systemStatus')}</h3>
                  <div className="space-y-4">
                    {transactionDetail.systems.map((system: any) => (
                      <div key={system.system} className="flex items-start gap-3">
                        <div className="mt-1">{getSystemIcon(system.system)}</div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">
                              {t(`dashboard.systems.${system.system}`)}
                            </span>
                            {getStatusIcon(system.status)}
                          </div>
                          <Progress value={system.progress} className="h-2 mb-1" />
                          <p className="text-xs text-muted-foreground">
                            {system.details || t(`dashboard.systemStatus.${system.status}`)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('dashboard.lastUpdated')}: {new Date(system.lastUpdated).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Blockchain Verification */}
                {transactionDetail.blockchainTxHash && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-5 w-5 text-blue-500" />
                      <h3 className="font-semibold">{t('dashboard.blockchainVerification')}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t('dashboard.txHash')}: {transactionDetail.blockchainTxHash}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/verify?hash=${transactionDetail.blockchainTxHash}`, '_blank')}
                    >
                      {t('dashboard.verifyOnBlockchain')}
                    </Button>
                  </div>
                )}

                {/* Payment Status */}
                {transactionDetail.paymentStatus && (
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="h-5 w-5 text-green-500" />
                      <h3 className="font-semibold">{t('dashboard.paymentStatus')}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">{t('dashboard.amount')}</p>
                        <p className="font-medium">{transactionDetail.paymentAmount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t('dashboard.status')}</p>
                        <Badge className={getStatusColor(transactionDetail.paymentStatus)}>
                          {t(`dashboard.status.${transactionDetail.paymentStatus}`)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Search className="h-12 w-12 mb-4" />
                <p>{t('dashboard.selectTransactionToView')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
