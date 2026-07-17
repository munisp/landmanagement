import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, Ban, CheckCircle, Clock } from 'lucide-react';


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

  const blockIPMutation = trpc.securityMonitoring.blockIP.useMutation({
    onSuccess: () => {
      alert('IP address blocked successfully');
      setBlockIPDialog(false);
      setSelectedIP('');
      setBlockReason('');
      refetchBlocked();
      refetchEvents();
    },
    onError: (error: any) => {
      alert('Error: ' + error.message);
    },
  });

  const unblockIPMutation = trpc.securityMonitoring.unblockIP.useMutation({
    onSuccess: () => {
      alert('IP address unblocked successfully');
      refetchBlocked();
      refetchEvents();
    },
    onError: (error: any) => {
      alert('Error: ' + error.message);
    },
  });

  const handleBlockIP = () => {
    if (!selectedIP || !blockReason) {
      alert('Please fill in all fields');
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
    if (confirm(`Are you sure you want to unblock ${ipAddress}?`)) {
      unblockIPMutation.mutate({ ipAddress });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  if (statsLoading || eventsLoading || blockedLoading) {
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
          <p className="text-muted-foreground">Track security events and manage IP blocking</p>
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

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalEvents || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats?.criticalEvents || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Blocked IPs</CardTitle>
            <Ban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.blockedIPs || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.failedLogins || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Account Lockouts</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.accountLockouts || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="blocked">Blocked IPs</TabsTrigger>
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
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Event type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="login_failed">Login Failed</SelectItem>
                      <SelectItem value="account_locked">Account Locked</SelectItem>
                      <SelectItem value="unusual_access">Unusual Access</SelectItem>
                      <SelectItem value="ip_blocked">IP Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={severityFilter} onValueChange={setSeverityFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
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
                {events && events.length > 0 ? (
                  events.map((event: any) => (
                    <div key={event.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={getSeverityColor(event.severity)}>
                              {event.severity}
                            </Badge>
                            <span className="font-medium capitalize">
                              {event.eventType.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {event.ipAddress && <span>IP: {event.ipAddress}</span>}
                            {event.userId && <span className="ml-4">User ID: {event.userId}</span>}
                          </div>
                          {event.details && (
                            <div className="text-xs text-muted-foreground mt-2">
                              {JSON.stringify(event.details)}
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(event.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No security events found
                  </div>
                )}
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
                {blockedIPs && blockedIPs.length > 0 ? (
                  blockedIPs.map((blocked: any) => (
                    <div key={blocked.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{blocked.ipAddress}</span>
                            {blocked.isPermanent && (
                              <Badge variant="destructive">Permanent</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Reason: {blocked.reason}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Blocked: {new Date(blocked.blockedAt).toLocaleString()}
                            {blocked.expiresAt && !blocked.isPermanent && (
                              <span className="ml-4">
                                Expires: {new Date(blocked.expiresAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnblockIP(blocked.ipAddress)}
                          disabled={unblockIPMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Unblock
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No blocked IPs
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Block IP Dialog */}
      <Dialog open={blockIPDialog} onOpenChange={setBlockIPDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block IP Address</DialogTitle>
            <DialogDescription>
              Block an IP address from accessing the system
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="ip">IP Address</Label>
              <Input
                id="ip"
                placeholder="192.168.1.1"
                value={selectedIP}
                onChange={(e) => setSelectedIP(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                placeholder="Suspicious activity detected"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                placeholder="60"
                value={blockDuration}
                onChange={(e) => setBlockDuration(e.target.value)}
                disabled={isPermanent}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="permanent"
                checked={isPermanent}
                onChange={(e) => setIsPermanent(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="permanent">Permanent block</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockIPDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBlockIP} disabled={blockIPMutation.isPending}>
              Block IP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
