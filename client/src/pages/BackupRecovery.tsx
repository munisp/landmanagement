import { AlertTriangle, Database, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

function statusVariant(status: string) {
  return status === 'healthy' ? 'default' as const : status === 'degraded' ? 'secondary' as const : 'destructive' as const;
}

export default function BackupRecovery() {
  const { data, isLoading, error } = trpc.backupRecovery.state.useQuery();
  const { data: readiness } = trpc.backupRecovery.readiness.useQuery();

  if (isLoading) return <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading recovery evidence…</div>;
  if (error || !data) return <div className="mx-auto max-w-xl p-8"><Card><CardHeader><CardTitle>Recovery evidence is unavailable</CardTitle><CardDescription>{error?.message ?? 'The recovery evidence service did not return a safe status.'}</CardDescription></CardHeader></Card></div>;

  const health = readiness?.monitoringStatus ?? data.automationHealth.monitoringStatus;
  return <main className="mx-auto max-w-6xl space-y-6 p-4 pb-12 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border bg-card p-6 shadow-sm">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Operational evidence</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Backup & recovery assurance</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">This screen displays independently recorded recovery evidence only. It does not execute backup, restore, replication, or failover actions from the browser.</p></div>
      <Link href="/admin/nationwide-rollout"><Button variant="outline"><ExternalLink className="mr-2 h-4 w-4" />Open rollout controls</Button></Link>
    </header>

    <section className="grid gap-4 md:grid-cols-3">
      <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><ShieldCheck className="h-5 w-5 text-primary" /><Badge variant={statusVariant(health)}>{health}</Badge></div><p className="mt-3 text-sm font-medium">Recovery monitoring</p><p className="mt-1 text-xs text-muted-foreground">Derived only from external configuration and reviewed drill evidence.</p></CardContent></Card>
      <Card><CardContent className="pt-6"><Database className="h-5 w-5 text-primary" /><p className="mt-3 text-2xl font-semibold">{data.recoveryDrills.length}</p><p className="mt-1 text-xs text-muted-foreground">Recorded recovery drills</p></CardContent></Card>
      <Card><CardContent className="pt-6"><AlertTriangle className="h-5 w-5 text-amber-600" /><p className="mt-3 text-sm font-medium">{data.schedule.lastBackup ? 'Backup evidence recorded' : 'No backup evidence recorded'}</p><p className="mt-1 text-xs text-muted-foreground">An evidence repository and independent review are required before rollout.</p></CardContent></Card>
    </section>

    <section className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Evidence posture</CardTitle><CardDescription>Unavailable values are not inferred or substituted with a simulated success state.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex justify-between gap-4"><span className="text-muted-foreground">Backup schedule</span><span className="text-right font-medium">{data.schedule.frequency}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Last evidenced backup</span><span className="text-right font-medium">{data.schedule.lastBackup ? new Date(data.schedule.lastBackup).toLocaleString() : 'Not recorded'}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Retention</span><span className="text-right font-medium">{data.schedule.retention}</span></div><div className="flex justify-between gap-4"><span className="text-muted-foreground">Evidence location</span><span className="text-right font-medium">{data.schedule.location}</span></div></CardContent></Card>
      <Card><CardHeader><CardTitle>Required operational handoff</CardTitle><CardDescription>Record execution and independent review through the protected rollout controls.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>1. Run the approved backup or restore runbook in the isolated operational environment.</p><p>2. Store immutable execution evidence in the configured repository.</p><p>3. A separate reviewer records measured RPO/RTO and evidence hash through Nationwide Rollout Control.</p><p>4. Only independently reviewed passed drills contribute to pilot readiness.</p></CardContent></Card>
    </section>

    <Card><CardHeader><CardTitle>Recovery-drill evidence</CardTitle><CardDescription>Latest first. A failed or unfinished drill is a rollout blocker until remediated and independently reviewed.</CardDescription></CardHeader><CardContent className="space-y-3">{data.recoveryDrills.length ? data.recoveryDrills.map((drill) => <div key={drill.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium capitalize">{drill.scenario.replaceAll('_', ' ')}</p><p className="mt-1 text-sm text-muted-foreground">{new Date(drill.timestamp).toLocaleString()} · RTO {drill.recoveryTime}</p>{drill.notes ? <p className="mt-2 text-xs text-muted-foreground">{drill.notes}</p> : null}</div><Badge variant={drill.outcome === 'passed' ? 'default' : drill.outcome === 'failed' ? 'destructive' : 'secondary'}>{drill.outcome}</Badge></div>) : <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No independently recorded recovery drill evidence is available. Nationwide rollout must remain blocked until evidence is recorded and reviewed.</div>}</CardContent></Card>
  </main>;
}
