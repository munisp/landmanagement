import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Zap, CheckCircle, XCircle, Clock, Eye, Trash2, Plus, RefreshCw } from 'lucide-react';

export default function WebhookTestingDashboard() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isTestResultDialogOpen, setIsTestResultDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    url: '',
    eventTypes: [] as ('report_generated' | 'schedule_created' | 'schedule_updated' | 'schedule_deleted')[],
    description: '',
  });

  // Queries
  const { data: endpoints, isLoading, refetch } = trpc.webhook.list.useQuery({ activeOnly: false });
  const { data: stats } = trpc.webhook.stats.useQuery({});

  // Mutations
  const registerWebhook = trpc.webhook.register.useMutation({
    onSuccess: () => {
      toast.success('Webhook endpoint registered successfully');
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => toast.error(`Failed to register webhook: ${error.message}`),
  });

  const deleteWebhook = trpc.webhook.delete.useMutation({
    onSuccess: () => {
      toast.success('Webhook endpoint deleted successfully');
      refetch();
    },
    onError: (error) => toast.error(`Failed to delete webhook: ${error.message}`),
  });

  const testWebhook = trpc.webhook.test.useMutation({
    onSuccess: (result) => {
      setTestResult(result);
      setIsTestResultDialogOpen(true);
      toast.success('Webhook test completed');
      refetch();
    },
    onError: (error) => {
      toast.error(`Webhook test failed: ${error.message}`);
      setTestResult({ success: false, error: error.message });
      setIsTestResultDialogOpen(true);
    },
  });

  const resetForm = () => {
    setFormData({
      url: '',
      eventTypes: [],
      description: '',
    });
  };

  const handleCreate = () => {
    if (!formData.url.trim()) {
      toast.error('Please enter a webhook URL');
      return;
    }
    if (formData.eventTypes.length === 0) {
      toast.error('Please select at least one event type');
      return;
    }
    registerWebhook.mutate(formData);
  };

  const handleTest = (endpointId: number) => {
    testWebhook.mutate({ endpointId });
  };

  const handleDelete = (endpointId: number) => {
    if (confirm('Are you sure you want to delete this webhook endpoint?')) {
      deleteWebhook.mutate({ endpointId });
    }
  };

  const toggleEventType = (eventType: 'report_generated' | 'schedule_created' | 'schedule_updated' | 'schedule_deleted') => {
    setFormData({
      ...formData,
      eventTypes: formData.eventTypes.includes(eventType)
        ? formData.eventTypes.filter((e) => e !== eventType)
        : [...formData.eventTypes, eventType],
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
      case 'paused':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Paused</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Webhook Testing</h1>
          <p className="text-muted-foreground">Test and manage webhook endpoints for report notifications</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Webhook
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Endpoints</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEndpoints || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeEndpoints || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDeliveries || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalDeliveries ? Math.round((stats.successfulDeliveries / stats.totalDeliveries) * 100) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Endpoints List */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook Endpoints</CardTitle>
          <CardDescription>Manage and test your webhook endpoints</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground">Loading...</p>
          ) : !endpoints || endpoints.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No webhook endpoints configured</p>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Webhook
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {endpoints.map((endpoint: any) => (
                <div key={endpoint.id} className="border rounded-lg p-4 flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{endpoint.name}</h3>
                      {getStatusBadge(endpoint.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{endpoint.url}</p>
                    {endpoint.description && (
                      <p className="text-sm text-muted-foreground mb-2">{endpoint.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {JSON.parse(endpoint.events).map((event: string) => (
                        <Badge key={event} variant="outline">{event}</Badge>
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Total: {endpoint.totalDeliveries || 0}</span>
                      <span className="text-green-600">Success: {endpoint.successfulDeliveries || 0}</span>
                      <span className="text-red-600">Failed: {endpoint.failedDeliveries || 0}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(endpoint.id)}
                      disabled={testWebhook.isPending}
                    >
                      <Zap className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(endpoint.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Webhook Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Webhook Endpoint</DialogTitle>
            <DialogDescription>
              Configure a webhook endpoint to receive report notifications
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="url">Webhook URL *</Label>
              <Input
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/webhook"
              />
            </div>
            <div>
              <Label>Event Types *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {(['report_generated', 'schedule_created', 'schedule_updated', 'schedule_deleted'] as const).map((event) => (
                  <div key={event} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={event}
                      checked={formData.eventTypes.includes(event)}
                      onChange={() => toggleEventType(event)}
                      className="rounded"
                    />
                    <Label htmlFor={event} className="text-sm font-normal cursor-pointer">
                      {event}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={registerWebhook.isPending}>
              {registerWebhook.isPending ? 'Creating...' : 'Create Webhook'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Result Dialog */}
      <Dialog open={isTestResultDialogOpen} onOpenChange={setIsTestResultDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Webhook Test Result</DialogTitle>
            <DialogDescription>
              Response from the webhook endpoint
            </DialogDescription>
          </DialogHeader>
          {testResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="font-semibold text-green-600">Test Successful</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="font-semibold text-red-600">Test Failed</span>
                  </>
                )}
              </div>
              {testResult.statusCode && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm font-medium">Status Code:</p>
                  <p className="text-sm">{testResult.statusCode}</p>
                </div>
              )}
              {testResult.response && (
                <div className="bg-muted p-3 rounded-lg">
                  <p className="text-sm font-medium mb-2">Response:</p>
                  <pre className="text-xs overflow-auto max-h-64 bg-background p-2 rounded">
                    {JSON.stringify(testResult.response, null, 2)}
                  </pre>
                </div>
              )}
              {testResult.error && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                  <p className="text-sm font-medium text-red-600">Error:</p>
                  <p className="text-sm text-red-600">{testResult.error}</p>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={() => setIsTestResultDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
