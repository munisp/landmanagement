import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Database, Sparkles, GitBranch, ShieldCheck } from 'lucide-react';

export default function DataGovernanceCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.dataGovernance.overview.useQuery();
  const [domain, setDomain] = useState('document_registry');
  const [qualityScore, setQualityScore] = useState(90);
  const [cleansingStatus, setCleansingStatus] = useState('Low-confidence duplicates and malformed metadata flagged for steward review.');
  const [lineagePath, setLineagePath] = useState('document intake → OCR processing → validation → storage → analytics');
  const [masterRecord, setMasterRecord] = useState('canonical document metadata record');
  const [catalogEntry, setCatalogEntry] = useState('Document governance catalog dataset');
  const [governancePolicy, setGovernancePolicy] = useState('Sensitive document metadata must preserve lineage, steward review, and retention classification.');

  const refresh = async () => {
    await utils.dataGovernance.overview.invalidate();
  };

  const createRecord = trpc.dataGovernance.createRecord.useMutation({ onSuccess: async () => { toast.success('Data governance record created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create governance record') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading data governance workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Data Governance Center</h1>
        <p className="text-muted-foreground mt-2">Manage data quality scoring, cleansing posture, lineage, master-data stewardship, data catalog visibility, governance dashboards, and policy controls.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Governed domains</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.governedDomains ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Average quality score</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.averageQualityScore ?? 0}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><Database className="inline mr-2 h-4 w-4" />Governance workflow</CardTitle><CardDescription>Create governance records with quality, cleansing, lineage, master-data, catalog, and policy context.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Domain</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} /></div><div className="space-y-2"><Label>Quality score</Label><Input type="number" value={qualityScore} onChange={(e) => setQualityScore(Number(e.target.value))} /></div></div>
            <div className="space-y-2"><Label>Cleansing status</Label><Input value={cleansingStatus} onChange={(e) => setCleansingStatus(e.target.value)} /></div>
            <div className="space-y-2"><Label>Lineage path</Label><Input value={lineagePath} onChange={(e) => setLineagePath(e.target.value)} /></div>
            <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Master data record</Label><Input value={masterRecord} onChange={(e) => setMasterRecord(e.target.value)} /></div><div className="space-y-2"><Label>Catalog entry</Label><Input value={catalogEntry} onChange={(e) => setCatalogEntry(e.target.value)} /></div></div>
            <div className="space-y-2"><Label>Governance policy</Label><Input value={governancePolicy} onChange={(e) => setGovernancePolicy(e.target.value)} /></div>
            <Button onClick={() => createRecord.mutate({ domain, qualityScore, cleansingStatus, lineagePath, masterRecord, catalogEntry, governancePolicy })} disabled={createRecord.isPending}>Create Governance Record</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><ShieldCheck className="inline mr-2 h-4 w-4" />Governance register</CardTitle><CardDescription>Current quality scores, cleansing posture, lineage, catalog records, and policy controls.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(data?.records || []).map((item: any) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between"><div><p className="font-medium">{item.domain}</p><p className="text-sm text-muted-foreground"><GitBranch className="inline mr-1 h-3 w-3" />{item.lineagePath}</p></div><Badge variant="outline"><Sparkles className="mr-1 inline h-3 w-3" />{item.qualityScore}</Badge></div>
                <p className="mt-2 text-sm text-muted-foreground">Cleansing: {item.cleansingStatus}</p>
                <p className="mt-1 text-sm text-muted-foreground">Master data: {item.masterRecord}</p>
                <p className="mt-1 text-sm text-muted-foreground">Catalog: {item.catalogEntry}</p>
                <p className="mt-1 text-sm text-muted-foreground">Policy: {item.governancePolicy}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
