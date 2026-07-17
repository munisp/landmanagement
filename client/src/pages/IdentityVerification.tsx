import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Shield, CheckCircle2, AlertCircle, Upload, User, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const DOCUMENT_TYPES = [
  "National ID Card",
  "International Passport",
  "Passport Photograph",
  "Proof of Address",
];

function formatStatus(status?: "pending" | "verified" | "failed" | "rejected") {
  if (!status) return "Not Verified";
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function IdentityVerification() {
  const utils = trpc.useUtils();
  const [ninNumber, setNinNumber] = useState("");
  const [bvnNumber, setBvnNumber] = useState("");
  const [selectedDocumentType, setSelectedDocumentType] = useState("Proof of Address");
  const [documentFileName, setDocumentFileName] = useState("");

  const { data: profile, isLoading } = trpc.identityVerification.profile.useQuery();

  const verifyNinMutation = trpc.identityVerification.verifyNin.useMutation({
    onSuccess: async () => {
      await utils.identityVerification.profile.invalidate();
      toast.success("NIN verified successfully");
    },
    onError: (error) => toast.error(error.message || "Failed to verify NIN"),
  });

  const verifyBvnMutation = trpc.identityVerification.verifyBvn.useMutation({
    onSuccess: async () => {
      await utils.identityVerification.profile.invalidate();
      toast.success("BVN verified successfully");
    },
    onError: (error) => toast.error(error.message || "Failed to verify BVN"),
  });

  const uploadDocumentMutation = trpc.identityVerification.uploadDocument.useMutation({
    onSuccess: async () => {
      await utils.identityVerification.profile.invalidate();
      setDocumentFileName("");
      toast.success("KYC document uploaded successfully");
    },
    onError: (error) => toast.error(error.message || "Failed to upload document"),
  });

  const verificationSummary = useMemo(() => {
    const documents = profile?.documents ?? [];
    const verifiedDocuments = documents.filter((doc) => doc.status === "verified").length;
    return {
      nin: profile?.nin.status,
      bvn: profile?.bvn.status,
      verifiedDocuments,
      totalDocuments: documents.length,
    };
  }, [profile]);

  const handleVerifyNin = () => {
    if (ninNumber.length !== 11) {
      toast.error("NIN must be 11 digits");
      return;
    }
    verifyNinMutation.mutate({ nin: ninNumber });
  };

  const handleVerifyBvn = () => {
    if (bvnNumber.length !== 11) {
      toast.error("BVN must be 11 digits");
      return;
    }
    verifyBvnMutation.mutate({ bvn: bvnNumber });
  };

  const handleUploadDocument = () => {
    if (!documentFileName.trim()) {
      toast.error("Enter a file name to register the uploaded document");
      return;
    }

    uploadDocumentMutation.mutate({
      type: selectedDocumentType,
      fileName: documentFileName.trim(),
    });
  };

  if (isLoading || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading identity verification profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/profile">
            <Button variant="ghost" className="gap-2">
              ← Back to Profile
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Identity Verification</h1>
          <div />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <Shield className="h-10 w-10" />
              Identity Verification (KYC)
            </h1>
            <p className="text-lg text-muted-foreground">
              Verify your identity to access all features and complete land transactions.
            </p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Verification Status</CardTitle>
              <CardDescription>
                Complete all verification steps to unlock full platform access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-4 border rounded-lg">
                  {verificationSummary.nin === "verified" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <div>
                    <p className="font-medium">NIN Verification</p>
                    <p className="text-xs text-muted-foreground">{formatStatus(verificationSummary.nin)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 border rounded-lg">
                  {verificationSummary.bvn === "verified" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <div>
                    <p className="font-medium">BVN Verification</p>
                    <p className="text-xs text-muted-foreground">{formatStatus(verificationSummary.bvn)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 border rounded-lg">
                  {verificationSummary.verifiedDocuments >= 2 ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <div>
                    <p className="font-medium">Document Upload</p>
                    <p className="text-xs text-muted-foreground">
                      {verificationSummary.verifiedDocuments} of {Math.max(verificationSummary.totalDocuments, 3)} verified
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="nin" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="nin">NIN Verification</TabsTrigger>
              <TabsTrigger value="bvn">BVN Verification</TabsTrigger>
              <TabsTrigger value="documents">KYC Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="nin">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    National Identification Number (NIN)
                  </CardTitle>
                  <CardDescription>
                    Verify your identity using your NIN issued by NIMC.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {profile.nin.status === "verified" ? (
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                        <div>
                          <p className="font-semibold text-green-900">NIN Verified Successfully</p>
                          <p className="text-sm text-green-700">Your identity has been confirmed.</p>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Full Name:</span><span className="font-medium">{profile.fullName}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Date of Birth:</span><span className="font-medium">{new Date(profile.dateOfBirth).toLocaleDateString()}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Gender:</span><span className="font-medium">{profile.gender}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Verified On:</span><span className="font-medium">{profile.nin.verifiedAt ? new Date(profile.nin.verifiedAt).toLocaleDateString() : 'N/A'}</span></div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="nin">Enter your 11-digit NIN</Label>
                        <Input
                          id="nin"
                          placeholder="12345678901"
                          value={ninNumber}
                          onChange={(e) => setNinNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                          maxLength={11}
                        />
                        <p className="text-xs text-muted-foreground">
                          Your NIN will be verified against the platform identity continuity layer.
                        </p>
                      </div>

                      <Button onClick={handleVerifyNin} disabled={ninNumber.length !== 11 || verifyNinMutation.isPending} className="w-full">
                        {verifyNinMutation.isPending ? "Verifying..." : "Verify NIN"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bvn">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Bank Verification Number (BVN)
                  </CardTitle>
                  <CardDescription>
                    Verify your BVN for payment processing and financial transactions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {profile.bvn.status === "verified" ? (
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle2 className="h-6 w-6 text-green-600" />
                        <div>
                          <p className="font-semibold text-green-900">BVN Verified Successfully</p>
                          <p className="text-sm text-green-700">Your banking identity has been confirmed.</p>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Full Name:</span><span className="font-medium">{profile.fullName}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Phone Number:</span><span className="font-medium">{profile.phoneNumber}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Verified On:</span><span className="font-medium">{profile.bvn.verifiedAt ? new Date(profile.bvn.verifiedAt).toLocaleDateString() : 'N/A'}</span></div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="bvn">Enter your 11-digit BVN</Label>
                        <Input
                          id="bvn"
                          placeholder="22345678901"
                          value={bvnNumber}
                          onChange={(e) => setBvnNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                          maxLength={11}
                        />
                        <p className="text-xs text-muted-foreground">
                          Your BVN will be verified through the deterministic borrower identity continuity contract.
                        </p>
                      </div>

                      <Button onClick={handleVerifyBvn} disabled={bvnNumber.length !== 11 || verifyBvnMutation.isPending} className="w-full">
                        {verifyBvnMutation.isPending ? "Verifying..." : "Verify BVN"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    KYC Documents
                  </CardTitle>
                  <CardDescription>
                    Upload and review identity documents used in your KYC workflow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed rounded-lg p-6 space-y-4">
                    <div>
                      <Label htmlFor="documentType">Document Type</Label>
                      <select
                        id="documentType"
                        value={selectedDocumentType}
                        onChange={(e) => setSelectedDocumentType(e.target.value)}
                        className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      >
                        {DOCUMENT_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="fileName">File Name</Label>
                      <Input
                        id="fileName"
                        placeholder="proof-of-address.pdf"
                        value={documentFileName}
                        onChange={(e) => setDocumentFileName(e.target.value)}
                      />
                    </div>
                    <Button onClick={handleUploadDocument} disabled={uploadDocumentMutation.isPending}>
                      {uploadDocumentMutation.isPending ? "Uploading..." : "Register Document Upload"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Accepted formats: PDF, JPG, PNG. Document metadata is stored immediately and reviewed through the live continuity workflow.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-semibold">Uploaded Documents</h3>
                    {profile.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Upload className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{doc.type}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.fileName} • Uploaded on {new Date(doc.uploadedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge variant={doc.status === "verified" ? "default" : "secondary"}>{doc.status}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
