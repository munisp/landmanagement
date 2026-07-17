import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, BadgeCheck, Building2, Calendar, FileText, MapPin, ShieldCheck, Wallet } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(value?: string | Date | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatus(status?: string | null) {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ");
}

function getStatusVariant(status?: string | null): "default" | "secondary" | "outline" {
  switch (status) {
    case "active":
    case "verified":
    case "registered":
      return "default";
    case "pending":
    case "pending_review":
      return "secondary";
    default:
      return "outline";
  }
}

export default function TitleDetails() {
  const [, params] = useRoute("/titles/:id");
  const titleId = params?.id ? Number.parseInt(params.id, 10) : null;

  const titleQuery = trpc.titles.getById.useQuery(
    { id: titleId ?? 0 },
    { enabled: !!titleId, retry: false }
  );

  const title = titleQuery.data as Record<string, any> | undefined;
  const parcelId = typeof title?.parcelId === "number" ? title.parcelId : undefined;

  const documentsQuery = trpc.documents.getByParcel.useQuery(
    { parcelId: parcelId ?? 0 },
    { enabled: typeof parcelId === "number", retry: false }
  );

  const relatedDocuments = useMemo(() => {
    const raw = documentsQuery.data as any;
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.documents)) return raw.documents;
    return [];
  }, [documentsQuery.data]);

  if (titleQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-8 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (!title) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <Card className="max-w-lg w-full border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Title record unavailable</CardTitle>
            <CardDescription>
              The requested property title could not be loaded from the current environment.
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
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Property title record</p>
              <h1 className="text-2xl font-semibold text-slate-950">{title.titleNumber || `Title #${title.id}`}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={getStatusVariant(title.status)} className="capitalize px-3 py-1">
              {formatStatus(title.status)}
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

      <div className="container mx-auto px-4 py-8 space-y-6">
        <section className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Title summary</CardTitle>
              <CardDescription>
                Core ownership, parcel linkage, issuance, and registration information for this title record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Title type</p>
                  <p className="mt-2 font-semibold text-slate-950">{title.titleType || "Property title"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Ownership structure</p>
                  <p className="mt-2 font-semibold text-slate-950">{title.ownershipType || "Sole ownership"}</p>
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
                  <p className="text-sm text-slate-500">Last updated</p>
                  <p className="mt-2 font-semibold text-slate-950">{formatDate(title.updatedAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Linked parcel ID</p>
                  <p className="mt-2 font-semibold text-slate-950">{parcelId ?? "Not linked"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm bg-slate-950 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ShieldCheck className="h-5 w-5 text-emerald-300" />
                Registry assurance
              </CardTitle>
              <CardDescription className="text-slate-300">
                This workspace consolidates title metadata, parcel context, and supporting documentation for fast review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Verification status</p>
                <p className="mt-2 text-lg font-semibold">{formatStatus(title.status)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Related documents</p>
                <p className="mt-2 text-lg font-semibold">{relatedDocuments.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-slate-300">Next operational step</p>
                <p className="mt-2 text-sm leading-6 text-slate-100">
                  Review supporting evidence, confirm parcel integrity, and continue through verification or transaction processing as appropriate.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="details" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="details">Record details</TabsTrigger>
            <TabsTrigger value="documents">Supporting documents</TabsTrigger>
            <TabsTrigger value="actions">Next actions</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Record details</CardTitle>
                <CardDescription>Operational metadata used by registry, legal, and transaction teams.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                      <Building2 className="mt-0.5 h-5 w-5 text-slate-500" />
                      <div>
                        <p className="text-sm text-slate-500">Owner ID</p>
                        <p className="font-semibold text-slate-950">{title.ownerId ?? "Not available"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                      <BadgeCheck className="mt-0.5 h-5 w-5 text-slate-500" />
                      <div>
                        <p className="text-sm text-slate-500">Registry status</p>
                        <p className="font-semibold text-slate-950 capitalize">{formatStatus(title.status)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                      <Calendar className="mt-0.5 h-5 w-5 text-slate-500" />
                      <div>
                        <p className="text-sm text-slate-500">Created</p>
                        <p className="font-semibold text-slate-950">{formatDate(title.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                      <Wallet className="mt-0.5 h-5 w-5 text-slate-500" />
                      <div>
                        <p className="text-sm text-slate-500">Transfer readiness</p>
                        <p className="font-semibold text-slate-950">
                          {title.status === "active" || title.status === "verified" ? "Eligible for downstream transaction workflows" : "Requires additional review before downstream processing"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Supporting documents
                </CardTitle>
                <CardDescription>
                  Documents associated with the linked parcel are surfaced here to support title review and transaction preparation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documentsQuery.isLoading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : relatedDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {relatedDocuments.slice(0, 10).map((document: any) => (
                      <div key={document.id ?? document.fileKey ?? document.title} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-950">{document.title || document.fileName || "Supporting document"}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {(document.type || document.documentType || "Document").toString().replace(/_/g, " ")}
                            {document.uploadedAt ? ` · Uploaded ${formatDate(document.uploadedAt)}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {document.fileUrl && (
                            <a href={document.fileUrl} target="_blank" rel="noreferrer">
                              <Button variant="outline">Open file</Button>
                            </a>
                          )}
                          <Link href="/document-validation">
                            <Button>Validate document</Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
                    <p className="font-medium text-slate-900">No supporting documents were returned for this record.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Continue to the document workflow tools to upload, validate, or verify title-related evidence.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-3">
                      <Link href="/document-validation">
                        <Button>Open document workflow</Button>
                      </Link>
                      <Link href="/ai-document-processing">
                        <Button variant="outline">Run AI extraction</Button>
                      </Link>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Next actions</CardTitle>
                <CardDescription>Operational paths available from this title record.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <Link href="/verification">
                    <Button variant="outline" className="w-full justify-start gap-2 h-auto px-4 py-4">
                      <ShieldCheck className="h-4 w-4" />
                      Continue verification workflow
                    </Button>
                  </Link>
                  {parcelId ? (
                    <Link href={`/transactions/initiate/${parcelId}`}>
                      <Button variant="outline" className="w-full justify-start gap-2 h-auto px-4 py-4">
                        <Wallet className="h-4 w-4" />
                        Initiate parcel transaction
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" disabled className="w-full justify-start gap-2 h-auto px-4 py-4">
                      <Wallet className="h-4 w-4" />
                      Parcel transaction unavailable
                    </Button>
                  )}
                  <Link href="/reporting">
                    <Button variant="outline" className="w-full justify-start gap-2 h-auto px-4 py-4">
                      <FileText className="h-4 w-4" />
                      Send to reporting workspace
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
