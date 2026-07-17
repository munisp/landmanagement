import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Thermometer, ShieldCheck, Gauge, Wrench } from 'lucide-react';
import { toast } from 'sonner';

const defaultDeviceForm = {
  name: '',
  category: 'environmental_sensor' as const,
  location: '',
  status: 'online' as const,
  firmwareVersion: '1.0.0',
};

const defaultEnvironmentalForm = {
  deviceId: 0,
  temperatureCelsius: 25,
  humidityPercent: 50,
};

const defaultAccessForm = {
  deviceId: 0,
  actor: '',
  credentialType: 'badge' as const,
  outcome: 'granted' as const,
};

const defaultMeterForm = {
  deviceId: 0,
  meterType: 'electricity' as const,
  usage: 0,
  unit: 'kWh',
};

const defaultMaintenanceForm = {
  deviceId: 0,
  severity: 'medium' as const,
  title: '',
  recommendation: '',
  predictedFailureWindow: '',
};

export default function IoTOperations() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.iot.overview.useQuery();
  const [deviceForm, setDeviceForm] = useState(defaultDeviceForm);
  const [environmentalForm, setEnvironmentalForm] = useState(defaultEnvironmentalForm);
  const [accessForm, setAccessForm] = useState(defaultAccessForm);
  const [meterForm, setMeterForm] = useState(defaultMeterForm);
  const [maintenanceForm, setMaintenanceForm] = useState(defaultMaintenanceForm);

  const refresh = async () => {
    await utils.iot.overview.invalidate();
  };

  const registerDevice = trpc.iot.registerDevice.useMutation({ onSuccess: async () => { toast.success('IoT device registered'); setDeviceForm(defaultDeviceForm); await refresh(); }, onError: (e) => toast.error(e.message || 'Failed to register device') });
  const addEnvironmentalReading = trpc.iot.addEnvironmentalReading.useMutation({ onSuccess: async () => { toast.success('Environmental reading added'); setEnvironmentalForm(defaultEnvironmentalForm); await refresh(); }, onError: (e) => toast.error(e.message || 'Failed to add environmental reading') });
  const addAccessControlEvent = trpc.iot.addAccessControlEvent.useMutation({ onSuccess: async () => { toast.success('Access-control event logged'); setAccessForm(defaultAccessForm); await refresh(); }, onError: (e) => toast.error(e.message || 'Failed to add access event') });
  const addUtilityMeterReading = trpc.iot.addUtilityMeterReading.useMutation({ onSuccess: async () => { toast.success('Utility meter reading added'); setMeterForm(defaultMeterForm); await refresh(); }, onError: (e) => toast.error(e.message || 'Failed to add utility reading') });
  const createMaintenanceAlert = trpc.iot.createMaintenanceAlert.useMutation({ onSuccess: async () => { toast.success('Predictive maintenance alert created'); setMaintenanceForm(defaultMaintenanceForm); await refresh(); }, onError: (e) => toast.error(e.message || 'Failed to create maintenance alert') });

  if (isLoading) {
    return <div className="container mx-auto py-8 text-sm text-muted-foreground">Loading IoT operations...</div>;
  }

  const devices = data?.devices || [];

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">IoT Operations</h1>
        <p className="mt-2 text-muted-foreground">Manage smart-property devices, environmental monitoring, access control, utility meters, and predictive maintenance from one workspace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Online devices</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.onlineDevices ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Offline devices</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.offlineDevices ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Maintenance devices</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.maintenanceDevices ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Maintenance alerts</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.activeMaintenanceAlerts ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="devices" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-[900px]">
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="environment"><Thermometer className="mr-2 h-4 w-4" />Environment</TabsTrigger>
          <TabsTrigger value="access"><ShieldCheck className="mr-2 h-4 w-4" />Access</TabsTrigger>
          <TabsTrigger value="meters"><Gauge className="mr-2 h-4 w-4" />Meters</TabsTrigger>
          <TabsTrigger value="maintenance"><Wrench className="mr-2 h-4 w-4" />Maintenance</TabsTrigger>
        </TabsList>

        <TabsContent value="devices">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader><CardTitle>Register IoT device</CardTitle><CardDescription>Add smart-property sensors, access nodes, or utility meters to the platform.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Name</Label><Input value={deviceForm.name} onChange={(e) => setDeviceForm((current) => ({ ...current, name: e.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Category</Label><Select value={deviceForm.category} onValueChange={(value: typeof deviceForm.category) => setDeviceForm((current) => ({ ...current, category: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="environmental_sensor">Environmental sensor</SelectItem><SelectItem value="access_control">Access control</SelectItem><SelectItem value="utility_meter">Utility meter</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Status</Label><Select value={deviceForm.status} onValueChange={(value: typeof deviceForm.status) => setDeviceForm((current) => ({ ...current, status: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="online">Online</SelectItem><SelectItem value="offline">Offline</SelectItem><SelectItem value="maintenance">Maintenance</SelectItem></SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Location</Label><Input value={deviceForm.location} onChange={(e) => setDeviceForm((current) => ({ ...current, location: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Firmware version</Label><Input value={deviceForm.firmwareVersion} onChange={(e) => setDeviceForm((current) => ({ ...current, firmwareVersion: e.target.value }))} /></div>
                <Button onClick={() => registerDevice.mutate(deviceForm)} disabled={registerDevice.isPending}>Register Device</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Managed device inventory</CardTitle><CardDescription>Current smart-property and facility-control devices.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {devices.map((device: any) => (
                  <div key={device.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{device.name}</p>
                        <p className="text-sm text-muted-foreground">{device.location}</p>
                      </div>
                      <Badge variant={device.status === 'online' ? 'outline' : device.status === 'maintenance' ? 'default' : 'secondary'}>{device.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{device.category.replace('_', ' ')}</Badge>
                      <Badge variant="outline">Firmware {device.firmwareVersion}</Badge>
                      <span>Last seen {new Date(device.lastSeenAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="environment">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader><CardTitle>Environmental monitoring</CardTitle><CardDescription>Capture temperature and humidity from smart-property sensors.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Device</Label><Select value={environmentalForm.deviceId ? String(environmentalForm.deviceId) : ''} onValueChange={(value) => setEnvironmentalForm((current) => ({ ...current, deviceId: Number(value) }))}><SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger><SelectContent>{devices.filter((d: any) => d.category === 'environmental_sensor').map((device: any) => <SelectItem key={device.id} value={String(device.id)}>{device.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Temperature (°C)</Label><Input type="number" value={environmentalForm.temperatureCelsius} onChange={(e) => setEnvironmentalForm((current) => ({ ...current, temperatureCelsius: Number(e.target.value) }))} /></div><div className="space-y-2"><Label>Humidity (%)</Label><Input type="number" value={environmentalForm.humidityPercent} onChange={(e) => setEnvironmentalForm((current) => ({ ...current, humidityPercent: Number(e.target.value) }))} /></div></div>
                <Button onClick={() => addEnvironmentalReading.mutate(environmentalForm)} disabled={addEnvironmentalReading.isPending}>Add Environmental Reading</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Latest environmental readings</CardTitle><CardDescription>Temperature and humidity telemetry from registered sensors.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {(data?.environmentalReadings || []).map((reading: any) => (
                  <div key={reading.id} className="rounded-lg border p-4">
                    <p className="font-medium">Device #{reading.deviceId}</p>
                    <p className="text-sm text-muted-foreground">{reading.temperatureCelsius}°C • {reading.humidityPercent}% humidity</p>
                    <p className="mt-2 text-xs text-muted-foreground">{new Date(reading.recordedAt).toLocaleString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="access">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader><CardTitle>Access-control events</CardTitle><CardDescription>Record physical-entry events from smart locks, badge readers, and biometric gates.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Device</Label><Select value={accessForm.deviceId ? String(accessForm.deviceId) : ''} onValueChange={(value) => setAccessForm((current) => ({ ...current, deviceId: Number(value) }))}><SelectTrigger><SelectValue placeholder="Select access-control device" /></SelectTrigger><SelectContent>{devices.filter((d: any) => d.category === 'access_control').map((device: any) => <SelectItem key={device.id} value={String(device.id)}>{device.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Actor</Label><Input value={accessForm.actor} onChange={(e) => setAccessForm((current) => ({ ...current, actor: e.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Credential type</Label><Select value={accessForm.credentialType} onValueChange={(value: typeof accessForm.credentialType) => setAccessForm((current) => ({ ...current, credentialType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="badge">Badge</SelectItem><SelectItem value="biometric">Biometric</SelectItem><SelectItem value="temporary_code">Temporary code</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Outcome</Label><Select value={accessForm.outcome} onValueChange={(value: typeof accessForm.outcome) => setAccessForm((current) => ({ ...current, outcome: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="granted">Granted</SelectItem><SelectItem value="denied">Denied</SelectItem></SelectContent></Select></div></div>
                <Button onClick={() => addAccessControlEvent.mutate(accessForm)} disabled={addAccessControlEvent.isPending}>Log Access Event</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent access events</CardTitle><CardDescription>Physical-access telemetry linked to facility-control devices.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {(data?.accessControlEvents || []).map((event: any) => (
                  <div key={event.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{event.actor}</p><p className="text-sm text-muted-foreground">Device #{event.deviceId} • {event.credentialType.replace('_', ' ')}</p></div><Badge variant={event.outcome === 'granted' ? 'outline' : 'destructive'}>{event.outcome}</Badge></div>
                    <p className="mt-2 text-xs text-muted-foreground">{new Date(event.recordedAt).toLocaleString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="meters">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader><CardTitle>Utility meter integration</CardTitle><CardDescription>Capture electricity, water, and gas usage from managed meter devices.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Device</Label><Select value={meterForm.deviceId ? String(meterForm.deviceId) : ''} onValueChange={(value) => setMeterForm((current) => ({ ...current, deviceId: Number(value) }))}><SelectTrigger><SelectValue placeholder="Select utility meter" /></SelectTrigger><SelectContent>{devices.filter((d: any) => d.category === 'utility_meter').map((device: any) => <SelectItem key={device.id} value={String(device.id)}>{device.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label>Meter type</Label><Select value={meterForm.meterType} onValueChange={(value: typeof meterForm.meterType) => setMeterForm((current) => ({ ...current, meterType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="electricity">Electricity</SelectItem><SelectItem value="water">Water</SelectItem><SelectItem value="gas">Gas</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Usage</Label><Input type="number" value={meterForm.usage} onChange={(e) => setMeterForm((current) => ({ ...current, usage: Number(e.target.value) }))} /></div><div className="space-y-2"><Label>Unit</Label><Input value={meterForm.unit} onChange={(e) => setMeterForm((current) => ({ ...current, unit: e.target.value }))} /></div></div>
                <Button onClick={() => addUtilityMeterReading.mutate(meterForm)} disabled={addUtilityMeterReading.isPending}>Add Meter Reading</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Latest utility readings</CardTitle><CardDescription>Meter telemetry for utilities and property operations.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {(data?.utilityMeterReadings || []).map((reading: any) => (
                  <div key={reading.id} className="rounded-lg border p-4"><p className="font-medium">Device #{reading.deviceId}</p><p className="text-sm text-muted-foreground">{reading.meterType}: {reading.usage} {reading.unit}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(reading.recordedAt).toLocaleString()}</p></div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="maintenance">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader><CardTitle>Predictive maintenance</CardTitle><CardDescription>Create maintenance alerts from device telemetry and predicted failure windows.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Device</Label><Select value={maintenanceForm.deviceId ? String(maintenanceForm.deviceId) : ''} onValueChange={(value) => setMaintenanceForm((current) => ({ ...current, deviceId: Number(value) }))}><SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger><SelectContent>{devices.map((device: any) => <SelectItem key={device.id} value={String(device.id)}>{device.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Severity</Label><Select value={maintenanceForm.severity} onValueChange={(value: typeof maintenanceForm.severity) => setMaintenanceForm((current) => ({ ...current, severity: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Alert title</Label><Input value={maintenanceForm.title} onChange={(e) => setMaintenanceForm((current) => ({ ...current, title: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Recommendation</Label><Textarea rows={4} value={maintenanceForm.recommendation} onChange={(e) => setMaintenanceForm((current) => ({ ...current, recommendation: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Predicted failure window</Label><Input value={maintenanceForm.predictedFailureWindow} onChange={(e) => setMaintenanceForm((current) => ({ ...current, predictedFailureWindow: e.target.value }))} /></div>
                <Button onClick={() => createMaintenanceAlert.mutate(maintenanceForm)} disabled={createMaintenanceAlert.isPending}>Create Maintenance Alert</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Maintenance alerts</CardTitle><CardDescription>Predicted maintenance issues surfaced from smart-property telemetry.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {(data?.maintenanceAlerts || []).map((alert: any) => (
                  <div key={alert.id} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{alert.title}</p><p className="text-sm text-muted-foreground">{alert.recommendation}</p></div><Badge variant={alert.severity === 'high' ? 'destructive' : 'default'}>{alert.severity}</Badge></div><div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground"><span>Device #{alert.deviceId}</span><Badge variant="outline">Failure window: {alert.predictedFailureWindow}</Badge><span>{new Date(alert.createdAt).toLocaleString()}</span></div></div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
