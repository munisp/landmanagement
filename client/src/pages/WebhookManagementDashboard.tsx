import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Webhook, Plus, Trash2, TestTube, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

const EVENT_TYPES = [
  'mortgage.application.created',
  'mortgage.application.approved',
  'mortgage.application.rejected',
  'mortgage.payment.completed',
  'mortgage.payment.failed',
  'broker.commission.paid',
  'loan_pool.created',
  'loan_pool.closed',
  'investor.distribution.paid',
];

export default function WebhookManagementDashboard() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<number | null>(null);
  const [newEndpoint, setNewEndpoint] = useState({
    url: '',
    secret: '',
    events: [] as string[],
    description: '',
  });
  const [testPayload, setTestPayload] = useState('{\n  "test": true\n}');

  const utils = trpc.useUtils();

  // Fetch webhook endpoints
  const { data: endpoints, isLoading: loadingEndpoints } = trpc.webhook.list.useQuery({ activeOnly: false });

  // Fetch delivery logs for selected endpoint
  const { data: deliveryLogs, isLoading: loadingLogs } = trpc.webhook.deliveryLogs.useQuery(
    { endpointId: selectedEndpoint!, limit: 50 },
    { enabled: !!selectedEndpoint }
  );

  // Fetch statistics
  const { data: stats } = trpc.webhook.stats.useQuery(
    { endpointId: selectedEndpoint || undefined },
    { enabled: true }
  );

  // Mutations
  const createEndpoint = trpc.webhook.register.useMutation({
    onSuccess: () => {
      toast.success('Webhook endpoint created successfully');
      setIsCreateDialogOpen(false);
      setNewEndpoint({ url: '', secret: '', events: [], description: '' });
      utils.webhook.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to create endpoint: ${error.message}`);
    },
  });

  const deleteEndpoint = trpc.webhook.delete.useMutation({
    onSuccess: () => {
      toast.success('Webhook endpoint deleted');
      utils.webhook.list.invalidate();
      if (selectedEndpoint) {
        setSelectedEndpoint(null);
      }
    },
    onError: (error) => {
      toast.error(`Failed to delete endpoint: ${error.message}`);
    },
  });

  const testEndpoint = trpc.webhook.test.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Test webhook delivered successfully');
      } else {
        toast.error(`Test failed: ${data.message}`);
      }
      setIsTestDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });

  // Webhook retries are handled automatically by the service

  const handleCreateEndpoint = () => {
    if (!newEndpoint.url || !newEndpoint.secret || newEndpoint.events.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    createEndpoint.mutate({
      url: newEndpoint.url,
      eventTypes: newEndpoint.events as any,
      description: newEndpoint.description || undefined,
    });
  };

  const handleDeleteEndpoint = (id: number) => {
    if (confirm('Are you sure you want to delete this webhook endpoint?')) {
      deleteEndpoint.mutate({ endpointId: id });
    }
  };

  const handleTestEndpoint = () => {
    if (!selectedEndpoint) return;

    try {
      const payload = JSON.parse(testPayload);
      testEndpoint.mutate({
        endpointId: selectedEndpoint,
      });
    } catch (error: unknown) {
      toast.error('Invalid JSON payload');
    }
  };

  // Retry delivery removed - handled automatically by the service

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            Success
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
      case 'retrying':
        return (
          <Badge variant="secondary" className="bg-yellow-500">
            <RefreshCw className="h-3 w-3 mr-1" />
            Retrying
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Webhook className="h-8 w-8" />
            Webhook Management
          </h1>
          <p className="text-muted-foreground">Manage webhook endpoints and monitor delivery status</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Endpoint
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Webhook Endpoint</DialogTitle>
              <DialogDescription>Configure a new webhook endpoint to receive events</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="url">Endpoint URL *</Label>
                <Input
                  id="url"
                  placeholder="https://api.example.com/webhooks"
                  value={newEndpoint.url}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, url: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="secret">Secret Key *</Label>
                <Input
                  id="secret"
                  type="password"
                  placeholder="Enter a secret key for signature verification"
                  value={newEndpoint.secret}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, secret: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for HMAC-SHA256 signature verification
                </p>
              </div>
              <div>
                <Label>Event Types *</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {EVENT_TYPES.map((event) => (
                    <label key={event} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newEndpoint.events.includes(event)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewEndpoint({
                              ...newEndpoint,
                              events: [...newEndpoint.events, event],
                            });
                          } else {
                            setNewEndpoint({
                              ...newEndpoint,
                              events: newEndpoint.events.filter((ev) => ev !== event),
                            });
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm">{event}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Optional description"
                  value={newEndpoint.description}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, description: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateEndpoint} disabled={createEndpoint.isPending}>
                {createEndpoint.isPending ? 'Creating...' : 'Create Endpoint'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDeliveries}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Successful</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.successfulDeliveries}</div>
              <p className="text-xs text-muted-foreground">{stats.successRate.toFixed(1)}% success rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.failedDeliveries}</div>
              <p className="text-xs text-muted-foreground">{stats.failureRate.toFixed(1)}% failure rate</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pending Retries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pendingRetries}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Webhook Endpoints */}
        <Card>
          <CardHeader>
            <CardTitle>Webhook Endpoints</CardTitle>
            <CardDescription>Configured webhook endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingEndpoints ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : endpoints && endpoints.length > 0 ? (
              <div className="space-y-4">
                {endpoints.map((endpoint: any) => (
                  <div
                    key={endpoint.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedEndpoint === endpoint.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedEndpoint(endpoint.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium truncate">{endpoint.url}</div>
                        {endpoint.description && (
                          <p className="text-sm text-muted-foreground mt-1">{endpoint.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {endpoint.events.map((event: string) => (
                            <Badge key={event} variant="secondary" className="text-xs">
                              {event}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={endpoint.isActive ? 'default' : 'outline'}>
                            {endpoint.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Created {new Date(endpoint.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEndpoint(endpoint.id);
                            setIsTestDialogOpen(true);
                          }}
                        >
                          <TestTube className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEndpoint(endpoint.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No webhook endpoints configured</p>
                <p className="text-sm">Create your first endpoint to get started</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delivery Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery Logs</CardTitle>
            <CardDescription>
              {selectedEndpoint ? 'Recent delivery attempts' : 'Select an endpoint to view logs'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedEndpoint ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a webhook endpoint to view delivery logs</p>
              </div>
            ) : loadingLogs ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : deliveryLogs && deliveryLogs.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {deliveryLogs.map((log: any) => (
                  <div key={log.id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(log.status)}
                          <Badge variant="outline" className="text-xs">
                            {log.eventType}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(log.createdAt).toLocaleString()}
                        </div>
                      </div>
                      {/* Retry handled automatically by service */}
                    </div>
                    {log.responseStatusCode && (
                      <div className="text-xs">
                        <span className="text-muted-foreground">Status Code:</span>{' '}
                        <span className="font-mono">{log.responseStatusCode}</span>
                      </div>
                    )}
                    {log.errorMessage && (
                      <div className="text-xs text-red-600 mt-1 p-2 bg-red-50 rounded">
                        {log.errorMessage}
                      </div>
                    )}
                    {log.retryCount > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Retry attempt: {log.retryCount}/5
                        {log.nextRetryAt && (
                          <span className="ml-2">
                            Next retry: {new Date(log.nextRetryAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No delivery logs found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Test Endpoint Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Webhook Endpoint</DialogTitle>
            <DialogDescription>Send a test payload to the selected endpoint</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="testPayload">Test Payload (JSON)</Label>
              <Textarea
                id="testPayload"
                value={testPayload}
                onChange={(e) => setTestPayload(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleTestEndpoint} disabled={testEndpoint.isPending}>
              {testEndpoint.isPending ? 'Sending...' : 'Send Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
