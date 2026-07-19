import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Users, DollarSign, TrendingUp, FileText, Plus, Search } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useEffect } from 'react';
import { MortgageDashboardLayout } from "@/components/MortgageDashboardLayout";

export default function BrokerDashboard() {
  const [searchClient, setSearchClient] = useState('');
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);

  // WebSocket for real-time updates
  const { lastMessage } = useWebSocket({
    url: '/ws/mortgage-events',
    onMessage: (message) => {
      if (message.type === 'commission_calculated' ||
          message.type === 'commission_approved' ||
          message.type === 'commission_paid') {
        toast.info('Commission update received', {
          description: 'Your dashboard has been updated',
        });
      }
    },
  });
  const [newClient, setNewClient] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    clientNIN: '',
    notes: '',
  });

  // Get broker profile with utils for refetching
  const utils = trpc.useUtils();
  const { data: broker, isLoading: brokerLoading } = trpc.mortgageBroker.getMyProfile.useQuery();

  // Get broker performance
  const { data: performance } = trpc.mortgageBroker.getPerformance.useQuery(
    { brokerId: broker?.brokerId || '' },
    { enabled: !!broker?.brokerId }
  );

  // Get clients
  const { data: clients = [], refetch: refetchClients } = trpc.mortgageBroker.getClients.useQuery(
    { brokerId: broker?.brokerId || '' },
    { enabled: !!broker?.brokerId }
  );

  // Get commissions
  const { data: commissions = [] } = trpc.mortgageBroker.getCommissions.useQuery(
    { brokerId: broker?.brokerId || '' },
    { enabled: !!broker?.brokerId }
  );

  // Add client mutation
  const addClient = trpc.mortgageBroker.addClient.useMutation({
    onSuccess: () => {
      toast.success('Client added successfully');
      setIsAddClientOpen(false);
      setNewClient({
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        clientNIN: '',
        notes: '',
      });
      refetchClients();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleAddClient = () => {
    if (!broker?.brokerId) return;
    addClient.mutate({
      brokerId: broker.brokerId,
      ...newClient,
    });
  };

  // Auto-refetch data when WebSocket message received
  useEffect(() => {
    if (lastMessage && broker?.brokerId) {
      utils.mortgageBroker.getPerformance.invalidate();
      utils.mortgageBroker.getClients.invalidate();
      utils.mortgageBroker.getCommissions.invalidate();
    }
  }, [lastMessage, broker?.brokerId, utils]);

  // Filter clients
  const filteredClients = clients.filter((client: any) =>
    client.clientName.toLowerCase().includes(searchClient.toLowerCase()) ||
    client.clientEmail.toLowerCase().includes(searchClient.toLowerCase())
  );

  if (brokerLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading broker dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!broker) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Broker Registration Required</CardTitle>
            <CardDescription>
              You need to register as a broker to access this dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button>Register as Broker</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500',
    pending: 'bg-yellow-500',
    inactive: 'bg-gray-500',
    suspended: 'bg-red-500',
  };

  const commissionStatusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    approved: 'bg-blue-500',
    paid: 'bg-green-500',
    cancelled: 'bg-red-500',
  };

  return (
    <MortgageDashboardLayout>
      <div className="container py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Broker Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Manage your clients, track commissions, and monitor performance
        </p>
      </div>

      {/* Broker Status */}
      {broker.status !== 'active' && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge className={statusColors[broker.status]}>
                {broker.status.toUpperCase()}
              </Badge>
              Broker Account Status
            </CardTitle>
            <CardDescription>
              {broker.status === 'pending' && 'Your broker registration is pending approval.'}
              {broker.status === 'inactive' && 'Your broker account is inactive.'}
              {broker.status === 'suspended' && 'Your broker account has been suspended.'}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Performance Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance?.clients?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {performance?.clients?.active || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance?.broker?.totalApplications || 0}</div>
            <p className="text-xs text-muted-foreground">
              {performance?.broker?.approvedApplications || 0} approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approval Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{performance?.broker?.approvalRate || 0}%</div>
            <p className="text-xs text-muted-foreground">
              Success rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₦{((performance?.broker?.totalCommissionEarned || 0) / 100).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Lifetime earnings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="clients" className="space-y-4">
        <TabsList>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Client Portfolio</CardTitle>
                  <CardDescription>Manage your client relationships</CardDescription>
                </div>
                <Dialog open={isAddClientOpen} onOpenChange={setIsAddClientOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Client
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Client</DialogTitle>
                      <DialogDescription>
                        Add a new client to your portfolio
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="clientName">Client Name *</Label>
                        <Input
                          id="clientName"
                          value={newClient.clientName}
                          onChange={(e) => setNewClient({ ...newClient, clientName: e.target.value })}
                          placeholder="John Doe"
                        />
                      </div>
                      <div>
                        <Label htmlFor="clientEmail">Email *</Label>
                        <Input
                          id="clientEmail"
                          type="email"
                          value={newClient.clientEmail}
                          onChange={(e) => setNewClient({ ...newClient, clientEmail: e.target.value })}
                          placeholder="john@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="clientPhone">Phone *</Label>
                        <Input
                          id="clientPhone"
                          value={newClient.clientPhone}
                          onChange={(e) => setNewClient({ ...newClient, clientPhone: e.target.value })}
                          placeholder="+234 800 000 0000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="clientNIN">NIN (Optional)</Label>
                        <Input
                          id="clientNIN"
                          value={newClient.clientNIN}
                          onChange={(e) => setNewClient({ ...newClient, clientNIN: e.target.value })}
                          placeholder="12345678901"
                        />
                      </div>
                      <div>
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea
                          id="notes"
                          value={newClient.notes}
                          onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                          placeholder="Additional information about the client"
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAddClientOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleAddClient} disabled={addClient.isPending}>
                        {addClient.isPending ? 'Adding...' : 'Add Client'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search clients by name or email..."
                    value={searchClient}
                    onChange={(e) => setSearchClient(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>NIN</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No clients found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredClients.map((client: any) => (
                      <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.clientName}</TableCell>
                        <TableCell>{client.clientEmail}</TableCell>
                        <TableCell>{client.clientPhone}</TableCell>
                        <TableCell>{client.clientNIN || '-'}</TableCell>
                        <TableCell>
                          <Badge className={client.isActive ? 'bg-green-500' : 'bg-gray-500'}>
                            {client.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(client.addedAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Commission Tracking</CardTitle>
              <CardDescription>Monitor your commission earnings</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commission ID</TableHead>
                    <TableHead>Loan Amount</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No commissions yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    commissions.map((commission: any) => (
                      <TableRow key={commission.id}>
                        <TableCell className="font-mono text-sm">
                          {commission.commissionId}
                        </TableCell>
                        <TableCell>
                          ₦{(commission.loanAmount / 100).toLocaleString()}
                        </TableCell>
                        <TableCell>{(commission.commissionRate / 100).toFixed(2)}%</TableCell>
                        <TableCell className="font-semibold">
                          ₦{(commission.commissionAmount / 100).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={commissionStatusColors[commission.status]}>
                            {commission.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(commission.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Commission Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {performance?.commissions?.summary?.map((item: any) => (
                  <div key={item.status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={commissionStatusColors[item.status]}>
                        {item.status.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {item.count} commission{item.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="font-semibold">
                      ₦{((item.totalAmount || 0) / 100).toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Broker Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company:</span>
                  <span className="font-medium">{broker.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">License:</span>
                  <span className="font-mono text-sm">{broker.licenseNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Default Rate:</span>
                  <span className="font-medium">{(broker.defaultCommissionRate / 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={statusColors[broker.status]}>
                    {broker.status.toUpperCase()}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </MortgageDashboardLayout>
  );
}
