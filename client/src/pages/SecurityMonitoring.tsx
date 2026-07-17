import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, Ban, CheckCircle, Clock, Radar, Bug, Siren } from 'lucide-react';
import { toast } from 'sonner';

const defaultBehavioralForm = {
  userId: 0,
  userLabel: '',
  signalType: 'velocity' as const,
  riskLevel: 'medium' as const,
  score: 50,
  description: '',
};

const defaultHoneypotForm = {
  sourceIp: '',
  endpoint: '',
  payloadSnippet: '',
  severity: 'high' as const,
};

export default function SecurityMonitoring() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState('7');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [blockIPDialog, setBlockIPDialog] = useState(false);
  const [selectedIP, setSelectedIP] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockDuration, setBlockDuration] = useState('60');
  const [isPermanent, setIsPermanent] = useState(false);
  const [behavioralForm, setBehavioralForm] = useState(defaultBehavioralForm);
  const [honeypotForm, setHoneypotForm] = useState(defaultHoneypotForm);

  const utils = trpc.useUtils();

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - parseInt(timeRange));
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  };

  const { data: stats, isLoading: statsLoading } = trpc.securityMonitoring.stats.useQuery(getDateRange());
  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = trpc.securityMonitoring.events.useQuery({
    ...getDateRange(),
    eventType: eventFilter !== 'all' ? eventFilter : undefined,
    severity: severityFilter !== 'all' ? severityFilter : undefined,
    limit: 100,
  });
  const { data: blockedIPs, isLoading: blockedLoading, refetch: refetchBlocked } = trpc.securityMonitoring.blockedIPs.useQuery({
    includeUnblocked: false,
  });
  const { data: responseOverview, isLoading: responseLoading, refetch: refetchResponse } = trpc.securityMonitoring.responseOverview.useQuery();

  const blockIPMutation = trpc.securityMonitoring.blockIP.useMutation({
    onSuccess: () => {
      toast.success('IP address blocked successfully');
      setBlockIPDialog(false);
      setSelectedIP('');
      setBlockReason('');
      refetchBlocked();
      refetchEvents();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to block IP'),
  });

  const unblockIPMutation = trpc.securityMonitoring.unblockIP.useMutation({
    onSuccess: () => {
      toast.success('IP address unblocked successfully');
      refetchBlocked();
      refetchEvents();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to unblock IP'),
  });

  const createBehavioralSignal = trpc.securityMonitoring.createBehavioralSignal.useMutation({
    onSuccess: async () => {
      toast.success('Behavioral risk signal created');
      setBehavioralForm(defaultBehavioralForm);
      await refetchResponse();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to create behavioral signal'),
  });

  const registerHoneypotEvent = trpc.securityMonitoring.registerHoneypotEvent.useMutation({
    onSuccess: async () => {
      toast.success('Honeypot event registered');
      setHoneypotForm(defaultHoneypotForm);
      await refetchResponse();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to register honeypot event'),
  });

  const createIncidentFromHoneypot = trpc.securityMonitoring.createIncidentFromHoneypot.useMutation({
    onSuccess: async () => {
      toast.success('Incident created from honeypot event');
      await refetchResponse();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to create incident'),
  });

  const updateIncidentStatus = trpc.securityMonitoring.updateIncidentStatus.useMutation({
    onSuccess: async () => {
      toast.success('Incident status updated');
      await refetchResponse();
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update incident status'),
  });

  const handleBlockIP = () => {
    if (!selectedIP || !blockReason) {
      toast.error('Please fill in all block-IP fields');
      return;
    }

    blockIPMutation.mutate({
      ipAddress: selectedIP,
      reason: blockReason,
      durationMinutes: isPermanent ? undefined : parseInt(blockDuration),
      isPermanent,
    });
  };

  const handleUnblockIP = (ipAddress: string) => {
    unblockIPMutation.mutate({ ipAddress });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'destructive' as const;
      case 'medium':
        return 'default' as const;
      case 'low':
        return 'secondary' as const;
      default:
        return 'secondary' as const;
    }
  };

  if (statsLoading || eventsLoading || blockedLoading || responseLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading security data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Monitoring</h1>
          <p className="text-muted-foreground">Track security events, behavioral risk, honeypot traps, and incident-response automation.</p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setBlockIPDialog(true)}>
            <Ban className="h-4 w-4 mr-2" />
            Block IP
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Events</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.totalEvents || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Critical Events</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{stats?.criticalEvents || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Blocked IPs</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.blockedIPs || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Failed Logins</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{stats?.failedLogins || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">High-Risk Signals</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{responseOverview?.metrics?.highRiskSignals || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Honeypot Hits</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{responseOverview?.metrics?.honeypotHits || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Open Incidents</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{responseOverview?.metrics?.openIncidents || 0}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Contained/Resolved</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{responseOverview?.metrics?.containedIncidents || 0}</div></CardContent></Card>
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList className="flex flex-wrap gap-2 h-auto">
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="blocked">Blocked IPs</TabsTrigger>
          <TabsTrigger value="behavioral"><Radar className="h-4 w-4 mr-2" />Behavioral Analytics</TabsTrigger>
          <TabsTrigger value="honeypot"><Bug className="h-4 w-4 mr-2" />Honeypot Traps</TabsTrigger>
          <TabsTrigger value="incidents"><Siren className="h-4 w-4 mr-2" />Incident Response</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Security Events</CardTitle>
                  <CardDescription>Recent security events and alerts</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Select value={eventFilter} onValueChange={setEventFilter}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Event type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="login_failed">Login Failed</SelectItem>
                      <SelectItem value="account_locked">Account Locked</SelectItem>
                      <SelectItem value="unusual_access">Unusual Access</SelectItem>
                      <SelectItem value="ip_blocked">IP Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severity" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Severity</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {events && events.length > 0 ? events.map((event: any) => (
                  <div key={event.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityColor(event.severity)}>{event.severity}</Badge>
                          <span className="font-medium capitalize">{event.eventType.replace('_', ' ')}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {event.ipAddress && <span>IP: {event.ipAddress}</span>}
                          {event.userId && <span className="ml-4">User ID: {event.userId}</span>}
                        </div>
                        {event.details && <div className="text-xs text-muted-foreground mt-2">{JSON.stringify(event.details)}</div>}
                      </div>
                      <div className="text-sm text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                )) : <div className="text-center py-8 text-muted-foreground">No security events found</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocked" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Blocked IP Addresses</CardTitle>
              <CardDescription>Currently blocked IP addresses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {blockedIPs && blockedIPs.length > 0 ? blockedIPs.map((blocked: any) => (
                  <div key={blocked.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{blocked.ipAddress}</span>
                          {blocked.isPermanent && <Badge variant="destructive">Permanent</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground">Reason: {blocked.reason}</div>
                        <div className="text-xs text-muted-foreground">
                          Blocked: {new Date(blocked.blockedAt).toLocaleString()}
                          {blocked.expiresAt && !blocked.isPermanent && <span className="ml-4">Expires: {new Date(blocked.expiresAt).toLocaleString()}</span>}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleUnblockIP(blocked.ipAddress)} disabled={unblockIPMutation.isPending}>
                        <CheckCircle className="h-4 w-4 mr-2" />Unblock
                      </Button>
                    </div>
                  </div>
                )) : <div className="text-center py-8 text-muted-foreground">No blocked IPs</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavioral" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Behavioral analytics for fraud detection</CardTitle>
                <CardDescription>Register high-risk user behavior and route signals into the incident pipeline.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>User ID</Label><Input type="number" value={behavioralForm.userId || ''} onChange={(e) => setBehavioralForm((current) => ({ ...current, userId: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>User label</Label><Input value={behavioralForm.userLabel} onChange={(e) => setBehavioralForm((current) => ({ ...current, userLabel: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Signal type</Label><Select value={behavioralForm.signalType} onValueChange={(value: typeof behavioralForm.signalType) => setBehavioralForm((current) => ({ ...current, signalType: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="velocity">Velocity spike</SelectItem><SelectItem value="device_shift">Device shift</SelectItem><SelectItem value="location_jump">Location jump</SelectItem><SelectItem value="after_hours_access">After-hours access</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Risk level</Label><Select value={behavioralForm.riskLevel} onValueChange={(value: typeof behavioralForm.riskLevel) => setBehavioralForm((current) => ({ ...current, riskLevel: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
                </div>
                <div className="space-y-2"><Label>Risk score</Label><Input type="number" min="0" max="100" value={behavioralForm.score} onChange={(e) => setBehavioralForm((current) => ({ ...current, score: Number(e.target.value) }))} /></div>
                <div className="space-y-2"><Label>Description</Label><Textarea rows={4} value={behavioralForm.description} onChange={(e) => setBehavioralForm((current) => ({ ...current, description: e.target.value }))} /></div>
                <Button onClick={() => createBehavioralSignal.mutate(behavioralForm)} disabled={createBehavioralSignal.isPending}>Create Behavioral Signal</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Behavioral risk signals</CardTitle>
                <CardDescription>Current user-behavior alerts used for fraud and abuse detection.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(responseOverview?.behavioralSignals || []).map((signal: any) => (
                  <div key={signal.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{signal.userLabel}</p>
                        <p className="text-sm text-muted-foreground">{signal.description}</p>
                      </div>
                      <Badge variant={signal.riskLevel === 'high' ? 'destructive' : signal.riskLevel === 'medium' ? 'default' : 'secondary'}>{signal.riskLevel}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{signal.signalType.replace('_', ' ')}</Badge>
                      <Badge variant="outline">Score {signal.score}</Badge>
                      <span>{new Date(signal.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="honeypot" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Honeypot trap intake</CardTitle>
                <CardDescription>Register deceptive-endpoint hits and escalate them into incident workflows.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Source IP</Label><Input value={honeypotForm.sourceIp} onChange={(e) => setHoneypotForm((current) => ({ ...current, sourceIp: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Endpoint</Label><Input value={honeypotForm.endpoint} onChange={(e) => setHoneypotForm((current) => ({ ...current, endpoint: e.target.value }))} /></div>
                </div>
                <div className="space-y-2"><Label>Severity</Label><Select value={honeypotForm.severity} onValueChange={(value: typeof honeypotForm.severity) => setHoneypotForm((current) => ({ ...current, severity: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Payload snippet</Label><Textarea rows={4} value={honeypotForm.payloadSnippet} onChange={(e) => setHoneypotForm((current) => ({ ...current, payloadSnippet: e.target.value }))} /></div>
                <Button onClick={() => registerHoneypotEvent.mutate(honeypotForm)} disabled={registerHoneypotEvent.isPending}>Register Honeypot Event</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Honeypot detections</CardTitle>
                <CardDescription>Observed attacker interactions with deceptive endpoints and high-risk traps.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(responseOverview?.honeypotEvents || []).map((event: any) => (
                  <div key={event.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{event.endpoint}</p>
                        <p className="text-sm text-muted-foreground">{event.payloadSnippet}</p>
                      </div>
                      <Badge variant={getSeverityColor(event.severity)}>{event.severity}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>IP: {event.sourceIp}</span>
                      <Badge variant="outline">{event.disposition}</Badge>
                      <span>{new Date(event.detectedAt).toLocaleString()}</span>
                    </div>
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => createIncidentFromHoneypot.mutate({ eventId: event.id })} disabled={createIncidentFromHoneypot.isPending || event.disposition === 'escalated'}>
                        Escalate to Incident
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="incidents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Incident response automation</CardTitle>
              <CardDescription>Review automated incident creation, linked entities, runbooks, and containment progression.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(responseOverview?.incidents || []).map((incident: any) => (
                <div key={incident.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{incident.title}</p>
                        <Badge variant={getSeverityColor(incident.severity)}>{incident.severity}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Source: {incident.source.replace('_', ' ')} • Owner: {incident.owner}</p>
                      <p className="text-sm">{incident.runbook}</p>
                      <div className="text-xs text-muted-foreground">Linked entity: {incident.linkedEntity}</div>
                      <div className="flex flex-wrap gap-2">
                        {incident.automationSteps.map((step: string, index: number) => (
                          <Badge key={index} variant="outline">{step}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2 min-w-[220px]">
                      <Badge variant="outline">{incident.status}</Badge>
                      <Select value={incident.status} onValueChange={(value: 'open' | 'investigating' | 'contained' | 'resolved') => updateIncidentStatus.mutate({ incidentId: incident.id, status: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="investigating">Investigating</SelectItem>
                          <SelectItem value="contained">Contained</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="text-xs text-muted-foreground">Updated {new Date(incident.updatedAt).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={blockIPDialog} onOpenChange={setBlockIPDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block IP Address</DialogTitle>
            <DialogDescription>Block an IP address from accessing the system</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label htmlFor="ip">IP Address</Label><Input id="ip" placeholder="192.168.1.1" value={selectedIP} onChange={(e) => setSelectedIP(e.target.value)} /></div>
            <div><Label htmlFor="reason">Reason</Label><Input id="reason" placeholder="Suspicious activity detected" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} /></div>
            <div><Label htmlFor="duration">Duration (minutes)</Label><Input id="duration" type="number" placeholder="60" value={blockDuration} onChange={(e) => setBlockDuration(e.target.value)} disabled={isPermanent} /></div>
            <div className="flex items-center space-x-2">
              <input type="checkbox" id="permanent" checked={isPermanent} onChange={(e) => setIsPermanent(e.target.checked)} className="rounded" />
              <Label htmlFor="permanent">Permanent block</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockIPDialog(false)}>Cancel</Button>
            <Button onClick={handleBlockIP} disabled={blockIPMutation.isPending}>Block IP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
