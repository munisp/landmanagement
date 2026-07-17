import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Scale, FileText, Upload, Calendar, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";

const DISPUTE_TYPES = [
  { value: "boundary_dispute", label: "Boundary Dispute" },
  { value: "ownership_dispute", label: "Ownership Dispute" },
  { value: "title_dispute", label: "Title Dispute" },
  { value: "encroachment", label: "Encroachment" },
  { value: "fraud", label: "Fraud/Forgery" },
  { value: "tax_assessment", label: "Tax Assessment" },
  { value: "other", label: "Other" },
] as const;

export default function DisputeResolution() {
  const [showFileForm, setShowFileForm] = useState(false);
  const [parcelNumber, setParcelNumber] = useState("");
  const [disputeType, setDisputeType] = useState<string>("boundary_dispute");
  const [respondent, setRespondent] = useState("");
  const [description, setDescription] = useState("");
  const [requestedRelief, setRequestedRelief] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);

  const disputesQuery = trpc.disputes.list.useQuery({ page: 1, limit: 100 });
  const statsQuery = trpc.disputes.stats.useQuery();
  const createDispute = trpc.disputes.create.useMutation();

  const disputes = useMemo(() => (disputesQuery.data as any)?.disputes ?? [], [disputesQuery.data]);
  const stats = (statsQuery.data as any) ?? {
    total: 0,
    pending: 0,
    investigating: 0,
    mediation: 0,
    hearing: 0,
    resolved: 0,
    dismissed: 0,
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
      investigating: "bg-amber-100 text-amber-800 border-amber-200",
      mediation: "bg-blue-100 text-blue-800 border-blue-200",
      hearing: "bg-purple-100 text-purple-800 border-purple-200",
      resolved: "bg-green-100 text-green-800 border-green-200",
      dismissed: "bg-red-100 text-red-800 border-red-200",
    };

    return (
      <Badge variant="outline" className={variants[status] || ""}>
        {status.replace(/_/g, " ").toUpperCase()}
      </Badge>
    );
  };

  const resetForm = () => {
    setParcelNumber("");
    setDisputeType("boundary_dispute");
    setRespondent("");
    setDescription("");
    setRequestedRelief("");
    setEvidenceFiles([]);
  };

  const fileDispute = async () => {
    if (!parcelNumber || !respondent || description.length < 20) {
      toast.error("Complete the parcel number, respondent, and a detailed dispute description.");
      return;
    }

    try {
      const result: any = await createDispute.mutateAsync({
        parcelNumber,
        type: disputeType as any,
        respondent,
        description,
        requestedRelief: requestedRelief || undefined,
        evidenceFiles: evidenceFiles.map((file) => ({
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
        })),
      });

      toast.success(`Dispute filed successfully. Case number: ${result.dispute.caseNumber}`);
      resetForm();
      setShowFileForm(false);
      await disputesQuery.refetch();
      await statsQuery.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to file dispute.");
    }
  };

  const pendingDisputes = disputes.filter((dispute: any) => dispute.status === "pending" || dispute.status === "investigating");
  const mediationDisputes = disputes.filter((dispute: any) => dispute.status === "mediation" || dispute.status === "hearing");
  const resolvedDisputes = disputes.filter((dispute: any) => dispute.status === "resolved");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Dispute Resolution</h1>
          <Button onClick={() => setShowFileForm(!showFileForm)} className="gap-2">
            <FileText className="h-4 w-4" />
            File New Dispute
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <Scale className="h-10 w-10" />
              Dispute Resolution System
            </h1>
            <p className="text-lg text-muted-foreground">
              File and track property disputes, schedule mediations, and monitor resolution outcomes tied to registry parcels and title workflows.
            </p>
          </div>

          {showFileForm && (
            <Card className="mb-8 border-2 border-primary">
              <CardHeader>
                <CardTitle>File New Dispute</CardTitle>
                <CardDescription>
                  Submit a registry-linked property dispute for intake review and assignment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="parcelNumber">Parcel Number</Label>
                    <Input
                      id="parcelNumber"
                      placeholder="Enter parcel number"
                      value={parcelNumber}
                      onChange={(event) => setParcelNumber(event.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="disputeType">Dispute Type</Label>
                    <Select value={disputeType} onValueChange={setDisputeType}>
                      <SelectTrigger id="disputeType">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DISPUTE_TYPES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="respondent">Respondent Name</Label>
                  <Input
                    id="respondent"
                    placeholder="Name of the other party"
                    value={respondent}
                    onChange={(event) => setRespondent(event.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="description">Dispute Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Provide detailed description of the dispute..."
                    rows={4}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="requestedRelief">Requested Relief</Label>
                  <Textarea
                    id="requestedRelief"
                    placeholder="Describe the determination or relief you are seeking..."
                    rows={3}
                    value={requestedRelief}
                    onChange={(event) => setRequestedRelief(event.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="evidence">Upload Evidence</Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-2">
                      Attach supporting instruments, survey plans, or correspondence.
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Supported: PDF, images, and office documents. File names are recorded for the dispute record in offline mode.
                    </p>
                    <Input
                      id="evidence"
                      type="file"
                      multiple
                      onChange={(event) => setEvidenceFiles(Array.from(event.target.files ?? []))}
                    />
                  </div>
                  {evidenceFiles.length > 0 && (
                    <div className="mt-3 space-y-2 text-sm">
                      {evidenceFiles.map((file) => (
                        <div key={file.name} className="rounded border px-3 py-2">
                          {file.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button onClick={fileDispute} className="gap-2" disabled={createDispute.isPending}>
                    {createDispute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Submit Dispute
                  </Button>
                  <Button variant="outline" onClick={() => setShowFileForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {disputesQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Tabs defaultValue="all" className="space-y-6">
              <TabsList>
                <TabsTrigger value="all">All Disputes</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="mediation">In Mediation</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4">
                {disputes.map((dispute: any) => (
                  <Card key={dispute.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2 flex-wrap">
                            {dispute.caseNumber}
                            {getStatusBadge(dispute.status)}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Parcel: {dispute.parcelNumber} • Filed: {format(new Date(dispute.filedDate), "MMM dd, yyyy")}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {String(dispute.type).replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <p className="text-sm">{dispute.description}</p>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Complainant:</span>
                            <p className="font-semibold">{dispute.filedBy}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Respondent:</span>
                            <p className="font-semibold">{dispute.respondent}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Assigned Officer:</span>
                            <p className="font-semibold">{dispute.assignedOfficer || "Not assigned"}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Mediator:</span>
                            <p className="font-semibold">{dispute.mediator || "Not assigned"}</p>
                          </div>
                        </div>

                        {dispute.hearingDate && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-blue-600" />
                            <div>
                              <p className="text-sm font-semibold text-blue-900">Hearing Scheduled</p>
                              <p className="text-xs text-blue-700">
                                {format(new Date(dispute.hearingDate), "EEEE, MMMM dd, yyyy 'at' HH:mm")}
                              </p>
                            </div>
                          </div>
                        )}

                        {dispute.resolution && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-sm font-semibold text-green-900 mb-1">Resolution</p>
                            <p className="text-sm text-green-700">{dispute.resolution}</p>
                            {dispute.resolvedDate && (
                              <p className="text-xs text-green-600 mt-2">
                                Resolved on {format(new Date(dispute.resolvedDate), "MMM dd, yyyy")}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" className="gap-2">
                            <FileText className="h-4 w-4" />
                            Evidence ({dispute.evidence?.length ?? 0})
                          </Button>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Clock className="h-4 w-4" />
                            SLA {dispute.slaDays} days
                          </Button>
                          {dispute.hearingDate && (
                            <Button variant="outline" size="sm" className="gap-2">
                              <Calendar className="h-4 w-4" />
                              Hearing Scheduled
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="pending" className="space-y-4">
                {pendingDisputes.map((dispute: any) => (
                  <Card key={dispute.id}>
                    <CardHeader>
                      <CardTitle>{dispute.caseNumber}</CardTitle>
                      <CardDescription>{dispute.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="mediation" className="space-y-4">
                {mediationDisputes.map((dispute: any) => (
                  <Card key={dispute.id}>
                    <CardHeader>
                      <CardTitle>{dispute.caseNumber}</CardTitle>
                      <CardDescription>{dispute.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="resolved" className="space-y-4">
                {resolvedDisputes.map((dispute: any) => (
                  <Card key={dispute.id}>
                    <CardHeader>
                      <CardTitle>{dispute.caseNumber}</CardTitle>
                      <CardDescription>{dispute.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{stats.total}</div>
                <p className="text-xs text-muted-foreground">Total Disputes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-yellow-600">{stats.pending + stats.investigating}</div>
                <p className="text-xs text-muted-foreground">Pending Review</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">{stats.mediation + stats.hearing}</div>
                <p className="text-xs text-muted-foreground">Mediation / Hearing</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
