import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bolt, Droplets, Network, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const defaultConnectionForm = {
  parcelId: 1105,
  utilityType: 'electricity' as const,
  providerName: 'National Grid Distribution',
  accountReference: 'ELEC-1105-X',
  status: 'pending' as const,
  serviceAddress: 'Parcel 1105, Eastern Growth Corridor',
};

const defaultPaymentForm = {
  connectionId: 0,
  amount: 50000,
  paymentMethod: 'bank_transfer' as const,
};

export default function UtilityConnectionCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.utility.overview.useQuery();
  const [connectionForm, setConnectionForm] = useState(defaultConnectionForm);
  const [paymentForm, setPaymentForm] = useState(defaultPaymentForm);
  const [clearanceParcelId, setClearanceParcelId] = useState(1105);
  const [selectedUtilityTypes, setSelectedUtilityTypes] = useState<string[]>(['electricity', 'water']);

  const refresh = async () => {
    await utils.utility.overview.invalidate();
  };

  const createConnection = trpc.utility.createConnection.useMutation({ onSuccess: async () => { toast.success('Utility connection workflow created'); setConnectionForm(defaultConnectionForm); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create connection') });
  const createClearance = trpc.utility.createClearance.useMutation({ onSuccess: async () => { toast.success('Utility clearance certificate created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create clearance') });
  const recordPayment = trpc.utility.recordPayment.useMutation({ onSuccess: async () => { toast.success('Utility payment recorded'); setPaymentForm(defaultPaymentForm); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to record payment') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading utility workflows...</div>;
  }

  const connections = data?.connections || [];
  const payments = data?.payments || [];
  const clearances = data?.clearances || [];

  const toggleUtilityType = (value: string) => {
    setSelectedUtilityTypes((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Utility Connection Center</h1>
        <p className="text-muted-foreground mt-2">Track electricity, water, sewage, gas, and telecom service workflows, issue utility clearances, and record payments.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Active connections</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.activeConnections ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Pending workflows</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.pendingConnections ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Issued clearances</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.issuedClearances ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Recorded payments</p><p className="mt-2 text-2xl font-semibold">₦{(data?.metrics?.totalPayments ?? 0).toLocaleString()}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="connections" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[720px]">
          <TabsTrigger value="connections"><Network className="mr-2 h-4 w-4" />Connections</TabsTrigger>
          <TabsTrigger value="clearance"><Receipt className="mr-2 h-4 w-4" />Clearances</TabsTrigger>
          <TabsTrigger value="payments"><Wallet className="mr-2 h-4 w-4" />Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="connections">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Connection workflow intake</CardTitle><CardDescription>Create electricity, water, sewage, gas, and telecom connection workflows.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={connectionForm.parcelId} onChange={(e) => setConnectionForm((c) => ({ ...c, parcelId: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Utility type</Label><Select value={connectionForm.utilityType} onValueChange={(value: typeof connectionForm.utilityType) => setConnectionForm((c) => ({ ...c, utilityType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="electricity">Electricity</SelectItem><SelectItem value="water">Water</SelectItem><SelectItem value="sewage">Sewage</SelectItem><SelectItem value="gas">Gas</SelectItem><SelectItem value="telecom">Telecom</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Provider</Label><Input value={connectionForm.providerName} onChange={(e) => setConnectionForm((c) => ({ ...c, providerName: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Account reference</Label><Input value={connectionForm.accountReference} onChange={(e) => setConnectionForm((c) => ({ ...c, accountReference: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Status</Label><Select value={connectionForm.status} onValueChange={(value: typeof connectionForm.status) => setConnectionForm((c) => ({ ...c, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="suspended">Suspended</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Service address</Label><Input value={connectionForm.serviceAddress} onChange={(e) => setConnectionForm((c) => ({ ...c, serviceAddress: e.target.value }))} /></div>
                <Button onClick={() => createConnection.mutate(connectionForm)} disabled={createConnection.isPending}>Create Connection Workflow</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Tracked utility connections</CardTitle><CardDescription>Current service workflows across electricity, water, sewage, gas, and telecom.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {connections.map((connection: any) => (
                  <div key={connection.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{connection.providerName}</p>
                        <p className="text-sm text-muted-foreground">{connection.utilityType} • Parcel {connection.parcelId} • {connection.accountReference}</p>
                      </div>
                      <Badge variant={connection.status === 'active' ? 'outline' : connection.status === 'pending' ? 'default' : 'secondary'}>{connection.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{connection.serviceAddress}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="clearance">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Utility clearance certificate</CardTitle><CardDescription>Issue a multi-utility clearance certificate after confirming service readiness.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={clearanceParcelId} onChange={(e) => setClearanceParcelId(Number(e.target.value))} /></div>
                <div className="space-y-2">
                  <Label>Utility types</Label>
                  <div className="flex flex-wrap gap-2">
                    {['electricity', 'water', 'sewage', 'gas', 'telecom'].map((utilityType) => (
                      <Button key={utilityType} type="button" variant={selectedUtilityTypes.includes(utilityType) ? 'default' : 'outline'} size="sm" onClick={() => toggleUtilityType(utilityType)}>
                        {utilityType}
                      </Button>
                    ))}
                  </div>
                </div>
                <Button onClick={() => createClearance.mutate({ parcelId: clearanceParcelId, utilityTypes: selectedUtilityTypes })} disabled={createClearance.isPending || selectedUtilityTypes.length === 0}>Issue Utility Clearance</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Issued and pending clearances</CardTitle><CardDescription>Review generated utility clearance certificates.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {clearances.map((clearance: any) => (
                  <div key={clearance.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{clearance.certificateId}</p>
                        <p className="text-sm text-muted-foreground">Parcel {clearance.parcelId} • {clearance.utilityTypes.join(', ')}</p>
                      </div>
                      <Badge variant={clearance.status === 'issued' ? 'outline' : 'default'}>{clearance.status}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Utility payment integration</CardTitle><CardDescription>Record utility service payments against tracked connection workflows.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Connection</Label><Select value={paymentForm.connectionId ? String(paymentForm.connectionId) : ''} onValueChange={(value) => setPaymentForm((c) => ({ ...c, connectionId: Number(value) }))}><SelectTrigger><SelectValue placeholder="Select connection" /></SelectTrigger><SelectContent>{connections.map((connection: any) => <SelectItem key={connection.id} value={String(connection.id)}>{connection.providerName} • {connection.utilityType}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Amount</Label><Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm((c) => ({ ...c, amount: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Payment method</Label><Select value={paymentForm.paymentMethod} onValueChange={(value: typeof paymentForm.paymentMethod) => setPaymentForm((c) => ({ ...c, paymentMethod: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank_transfer">Bank transfer</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="wallet">Wallet</SelectItem></SelectContent></Select></div>
                </div>
                <Button onClick={() => recordPayment.mutate(paymentForm)} disabled={recordPayment.isPending || paymentForm.connectionId === 0}>Record Utility Payment</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Utility payment history</CardTitle><CardDescription>Recent integrated utility payments and references.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {payments.map((payment: any) => (
                  <div key={payment.id} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{payment.reference}</p>
                        <p className="text-sm text-muted-foreground">Connection #{payment.connectionId} • {payment.paymentMethod}</p>
                      </div>
                      <Badge variant="outline">₦{payment.amount.toLocaleString()}</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
