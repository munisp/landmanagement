import { ArrowLeft, BadgeCheck, Building2, Calendar, FileText, MapPin, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react';
import { Link, useRoute } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';

function formatDate(value?: string | Date | null) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatStatus(status?: string | null) {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}

function getStatusVariant(status?: string | null): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'active':
    case 'verified':
    case 'registered':
      return 'default';
    case 'pending':
    case 'pending_review':
    case 'review':
      return 'secondary';
    default:
      return 'outline';
  }
}

function severityClass(severity: 'info' | 'warning' | 'critical') {
  if (severity === 'critical') return 'border-red-200 bg-red-50';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50';
  return 'border-slate-200 bg-slate-50';
}

export default function TitleDetails() {
  const [, params] = useRoute('/titles/:id');
  const titleId = params?.id ? Number.parseInt(params.id, 10) : null;

  const dossierQuery = trpc.titleIntelligence.getDossier.useQuery(
    { titleId: titleId ?? 0 },
    { enabled: !!titleId, retry: false }
  );

  const dossier = dossierQuery.data as Record<string, any> | undefined;
  const title = dossier?.title as Record<string, any> | undefined;
  const parcel = dossier?.parcel as Record<string, any> | undefined;
  const parcelId = typeof title?.parcelId === 'number' ? title.parcelId : undefined;

  if (dossierQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto space-y-6 px-4 py-8">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 md:grid-cols-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!dossier || !title) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-lg border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Title intelligence unavailable</CardTitle>
            <CardDescription>
              The requested property title dossier could not be assembled from the current environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/dashboard">
              <Button>Return to dashboard</Button>
            </Link>
            <Link href="/search">
              <Button variant="outline">Search parcels</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Button>
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Title intelligence dossier</p>
              <h1 className="text-2xl font-semibold text-slate-950">{title.titleNumber || `Title #${title.id}`}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={getStatusVariant(title.status)} className="px-3 py-1 capitalize">
              {formatStatus(title.status)}
            </Badge>
            <Badge variant={getStatusVariant(dossier.operationalSummary?.registrationReadiness)} className="px-3 py-1 capitalize">
              {dossier.operationalSummary?.registrationReadiness} readiness
            </Badge>
            {parcelId && (
              <Link href={`/parcels/${parcelId}`}>
                <Button variant="outline" className="gap-2">
                  <MapPin className="h-4 w-4" />
                  View parcel
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto space-y-6 px-4 py-8">
        <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Unified record summary</CardTitle>
              <CardDescription>
                A competitive, single-pane dossier combining title, parcel, document, dispute, transaction, and risk insight.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Title type</p>
                  <p className="mt-2 font-semibold text-slate-950">{title.titleType || 'Property title'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Ownership structure</p>
                  <p className="mt-2 font-semibold text-slate-950">{title.ownershipType || 'Sole ownership'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Ownership percentage</p>
                  <p className="mt-2 font-semibold text-slate-950">{title.ownershipPercentage ?? 100}%</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Issued date</p>
                  <p className="mt-2 font-semibold text-slate-950">{formatDate(title.issuedAt || title.createdAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Linked parcel</p>
                  <p className="mt-2 font-semibold text-slate-950">{parcel?.parcelNumber || parcelId || 'Not linked'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Title risk band</p>
                  <p className="mt-2 font-semibold capitalize text-slate-950">{dossier.titleRisk?.riskBand || 'Unknown'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-slate-950 text-white shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                Record assurance
              </CardTitle>
              <CardDescription className="text-slate-300">
                Consolidated registry confidence aligned with the transparency expectations of leading land platforms.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Open disputes</p>
                <p className="mt-2 text-lg font-semibold">{dossier.operationalSummary?.openDisputeCount ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Verified documents</p>
                <p className="mt-2 text-lg font-semibold">
                  {dossier.operationalSummary?.verifiedDocumentCount ?? 0} / {dossier.documents?.length ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Active encumbrances</p>
                <p className="mt-2 text-lg font-semibold">{dossier.operationalSummary?.activeEncumbranceCount ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Chain of title clarity</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{dossier.scorecard?.chainOfTitleClarity ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Document completeness</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{dossier.scorecard?.documentCompleteness ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Encumbrance exposure</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{dossier.scorecard?.encumbranceExposure ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Dispute exposure</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{dossier.scorecard?.disputeExposure ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-wide text-slate-500">Workflow readiness</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{dossier.scorecard?.workflowReadiness ?? 0}</p>
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="timeline" className="space-y-4">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="timeline">Lifecycle timeline</TabsTrigger>
            <TabsTrigger value="risk">Risk & recommendations</TabsTrigger>
            <TabsTrigger value="documents">Documents & disputes</TabsTrigger>
            <TabsTrigger value="actions">Next actions</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Lifecycle timeline</CardTitle>
                <CardDescription>
                  A chain-of-title style operational timeline spanning title events, documents, transactions, disputes, and risk signals.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(dossier.timeline || []).map((event: any) => (
                  <div key={event.id} className={`rounded-2xl border p-4 ${severityClass(event.severity)}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{event.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{event.description}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="capitalize">{event.category}</Badge>
                        <p className="mt-2 text-xs text-slate-500">{formatDate(event.date)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Title risk factors</CardTitle>
                  <CardDescription>
                    Explainable factors behind the current title-risk assessment.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(dossier.titleRisk?.factors || []).map((factor: any) => (
                    <div key={factor.key} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-slate-950">{factor.label}</p>
                        <Badge variant="outline">Score {factor.score}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{factor.explanation}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Operational recommendations</CardTitle>
                  <CardDescription>
                    Actions to improve dossier quality, public trust, and downstream transaction readiness.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(dossier.recommendations || []).map((recommendation: string) => (
                    <div key={recommendation} className="flex gap-3 rounded-2xl border border-slate-200 p-4">
                      <ShieldAlert className="mt-0.5 h-5 w-5 text-slate-500" />
                      <p className="text-sm leading-6 text-slate-700">{recommendation}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="documents">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Supporting documents
                  </CardTitle>
                  <CardDescription>
                    Verification state, completeness, and supporting evidence associated with this title's parcel.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(dossier.documents || []).length > 0 ? (
                    dossier.documents.map((document: any) => (
                      <div key={document.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">{document.title}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {document.type.replace(/_/g, ' ')} · Uploaded {formatDate(document.uploadedAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={document.verified ? 'default' : 'secondary'}>
                            {document.verified ? 'Verified' : 'Pending verification'}
                          </Badge>
                          {document.fileUrl && (
                            <a href={document.fileUrl} target="_blank" rel="noreferrer">
                              <Button variant="outline">Open file</Button>
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                      <p className="font-medium text-slate-900">No supporting documents are currently attached.</p>
                      <p className="mt-2 text-sm text-slate-500">Upload foundational evidence to improve title readiness and auditability.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Disputes & encumbrances</CardTitle>
                  <CardDescription>
                    Visibility into issues that affect public confidence, transferability, or chain-of-title certainty.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(dossier.disputes || []).map((dispute: any) => (
                    <div key={dispute.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-950">{dispute.caseNumber}</p>
                        <Badge variant={['resolved', 'dismissed'].includes(dispute.status) ? 'outline' : 'secondary'} className="capitalize">
                          {formatStatus(dispute.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{dispute.description}</p>
                    </div>
                  ))}
                  {(dossier.disputes || []).length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      No recorded disputes are linked to this title dossier.
                    </div>
                  )}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Active encumbrances</p>
                    <p className="mt-2 font-semibold text-slate-950">{dossier.operationalSummary?.activeEncumbranceCount ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="actions">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Next actions</CardTitle>
                <CardDescription>Operational paths available from this title dossier.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <Link href="/verification">
                    <Button variant="outline" className="h-auto w-full justify-start gap-2 px-4 py-4">
                      <ShieldCheck className="h-4 w-4" />
                      Continue verification workflow
                    </Button>
                  </Link>
                  {parcelId ? (
                    <Link href={`/transactions/initiate/${parcelId}`}>
                      <Button variant="outline" className="h-auto w-full justify-start gap-2 px-4 py-4">
                        <Wallet className="h-4 w-4" />
                        Initiate parcel transaction
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" disabled className="h-auto w-full justify-start gap-2 px-4 py-4">
                      <Wallet className="h-4 w-4" />
                      Parcel transaction unavailable
                    </Button>
                  )}
                  <Link href="/reporting">
                    <Button variant="outline" className="h-auto w-full justify-start gap-2 px-4 py-4">
                      <Building2 className="h-4 w-4" />
                      Send to reporting workspace
                    </Button>
                  </Link>
                </div>
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Portfolio recommendation</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Use this dossier as the single-pane review surface for title decisions, dispute escalation, and public-service assurance.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
