import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, CheckCircle, XCircle, AlertTriangle, Eye } from 'lucide-react';

export default function DocumentValidation() {
  const { t } = useTranslation();
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [comparisonDocumentId, setComparisonDocumentId] = useState<number | null>(null);

  const documentsQuery = trpc.documents.list.useQuery();
  const documents = documentsQuery.data ?? [];

  const { data: results, isLoading, refetch } = trpc.documentAI.getResults.useQuery(
    { documentId: selectedDocumentId! },
    { enabled: selectedDocumentId !== null }
  );

  const processDocumentMutation = trpc.documentAI.processDocument.useMutation({
    onSuccess: () => {
      alert('Document processed successfully');
      refetch();
    },
    onError: (error) => {
      alert('Error: ' + error.message);
    },
  });

  const comparisonQuery = trpc.documentAI.compareDocuments.useQuery(
    {
      leftDocumentId: selectedDocumentId!,
      rightDocumentId: comparisonDocumentId!,
    },
    {
      enabled:
        selectedDocumentId !== null &&
        comparisonDocumentId !== null &&
        selectedDocumentId !== comparisonDocumentId,
    }
  );

  const summaryQuery = trpc.documentAI.summarizeDocument.useQuery(
    { documentId: selectedDocumentId! },
    { enabled: selectedDocumentId !== null && Boolean(results && results.length > 0) }
  );

  const signatureQuery = trpc.documentAI.verifySignature.useQuery(
    { documentId: selectedDocumentId! },
    { enabled: selectedDocumentId !== null && Boolean(results && results.length > 0) }
  );

  const updateValidationMutation = trpc.documentAI.updateValidation.useMutation({
    onSuccess: () => {
      alert('Validation status updated');
      refetch();
    },
    onError: (error) => {
      alert('Error: ' + error.message);
    },
  });

  const handleProcessDocument = (doc: (typeof documents)[number]) => {
    setSelectedDocumentId(doc.id);
    processDocumentMutation.mutate({
      documentId: doc.id,
      documentUrl: doc.fileUrl,
    });
  };

  const handleUpdateValidation = (resultId: number, status: 'approved' | 'rejected' | 'needs_review') => {
    updateValidationMutation.mutate({ resultId, status });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'rejected':
        return 'destructive';
      case 'needs_review':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      case 'needs_review':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Document Validation</h1>
        <p className="text-muted-foreground">AI-powered document analysis and validation</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Document List */}
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>Select a document to process or view results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {documentsQuery.isLoading && (
                <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
              )}

              {!documentsQuery.isLoading && documents.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No documents available for validation yet.</div>
              )}

              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedDocumentId === doc.id ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                  onClick={() => setSelectedDocumentId(doc.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">{doc.title}</div>
                      <div className="text-sm text-muted-foreground capitalize">
                        {doc.type.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {doc.fileName}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={comparisonDocumentId === doc.id ? 'secondary' : 'outline'}
                        onClick={(e) => {
                          e.stopPropagation();
                          setComparisonDocumentId(doc.id);
                        }}
                      >
                        Compare
                      </Button>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProcessDocument(doc);
                        }}
                        disabled={processDocumentMutation.isPending}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Process
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Processing Results */}
        <Card>
          <CardHeader>
            <CardTitle>Processing Results</CardTitle>
            <CardDescription>
              {selectedDocumentId ? `Results for document #${selectedDocumentId}` : 'Select a document to view results'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && <div className="text-center py-8 text-muted-foreground">Loading...</div>}
            
            {!isLoading && !selectedDocumentId && (
              <div className="text-center py-8 text-muted-foreground">
                Select a document from the list
              </div>
            )}

            {!isLoading && selectedDocumentId && (!results || results.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                No processing results yet. Click "Process" to analyze this document.
              </div>
            )}

            {!isLoading && results && results.length > 0 && (
              <div className="space-y-4">
                {summaryQuery.data && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">Document Summary</div>
                        <div className="text-xs text-muted-foreground">AI-generated summary for document #{selectedDocumentId}</div>
                      </div>
                      <Badge variant="outline">Summary</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{summaryQuery.data.summary}</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {summaryQuery.data.bulletPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                    <div className="rounded border bg-background p-3 text-sm">
                      <span className="font-medium">Recommended action:</span> {summaryQuery.data.recommendedAction}
                    </div>
                  </div>
                )}

                {signatureQuery.data && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">Signature Verification</div>
                        <div className="text-xs text-muted-foreground">Detected execution cues for document #{selectedDocumentId}</div>
                      </div>
                      <Badge variant={signatureQuery.data.hasSignature ? 'default' : 'secondary'}>
                        {signatureQuery.data.hasSignature ? 'Signature cues found' : 'No strong signature cues'}
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 text-sm">
                      <div>
                        <div className="text-muted-foreground">Confidence</div>
                        <div className="font-semibold">{signatureQuery.data.confidence}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Likely signer</div>
                        <div className="font-semibold">{signatureQuery.data.signerName || 'Not identified'}</div>
                      </div>
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {signatureQuery.data.verificationNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {comparisonDocumentId && selectedDocumentId !== comparisonDocumentId && comparisonQuery.data && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium">Document Comparison</div>
                        <div className="text-xs text-muted-foreground">Comparing document #{selectedDocumentId} with document #{comparisonDocumentId}</div>
                      </div>
                      <Badge variant={comparisonQuery.data.overallMatchScore >= 80 ? 'default' : comparisonQuery.data.overallMatchScore >= 60 ? 'secondary' : 'destructive'}>
                        Match {comparisonQuery.data.overallMatchScore}%
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 text-sm">
                      <div>
                        <div className="text-muted-foreground">OCR Text Similarity</div>
                        <div className="font-semibold">{comparisonQuery.data.textSimilarity}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Matching Fields</div>
                        <div className="font-semibold">{comparisonQuery.data.matchingFields.length}</div>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{comparisonQuery.data.summary}</p>
                    {comparisonQuery.data.differingFields.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Differing Fields</div>
                        {comparisonQuery.data.differingFields.slice(0, 5).map((field) => (
                          <div key={field.field} className="rounded border bg-background p-3 text-xs">
                            <div className="font-medium capitalize">{field.field.replace(/([A-Z])/g, ' $1').trim()}</div>
                            <div className="text-muted-foreground">Selected: {field.leftValue || 'N/A'}</div>
                            <div className="text-muted-foreground">Comparison: {field.rightValue || 'N/A'}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {results.map((result) => (
                  <div key={result.id} className="border rounded-lg p-4 space-y-4">
                    {/* Status and Confidence */}
                    <div className="flex items-center justify-between">
                      <Badge variant={getStatusColor(result.validationStatus)}>
                        {getStatusIcon(result.validationStatus)}
                        <span className="ml-2 capitalize">{result.validationStatus.replace('_', ' ')}</span>
                      </Badge>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Confidence: </span>
                        <span className={`font-medium ${result.confidenceScore >= 80 ? 'text-green-600' : result.confidenceScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {result.confidenceScore}%
                        </span>
                      </div>
                    </div>

                    {/* Document Type */}
                    {result.documentType && (
                      <div>
                        <div className="text-sm font-medium mb-1">Document Type</div>
                        <div className="text-sm text-muted-foreground capitalize">
                          {result.documentType.replace('_', ' ')}
                        </div>
                      </div>
                    )}

                    {/* Extracted Fields */}
                    {result.extractedFields && Object.keys(result.extractedFields).length > 0 && (
                      <div>
                        <div className="text-sm font-medium mb-2">Extracted Fields</div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {Object.entries(result.extractedFields).map(([key, value]) => (
                            <div key={key} className="space-y-1">
                              <div className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                              <div className="font-medium">{String(value)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fraud Indicators */}
                    {result.fraudIndicators && result.fraudIndicators.hasIssues && (
                      <div>
                        <div className="text-sm font-medium mb-2 text-destructive">Fraud Indicators</div>
                        <div className="space-y-2">
                          {result.fraudIndicators.issues.map((issue: any, idx: number) => (
                            <div key={idx} className="text-sm border-l-2 border-destructive pl-3">
                              <div className="font-medium capitalize">{issue.type.replace('_', ' ')}</div>
                              <div className="text-muted-foreground">{issue.details}</div>
                              <Badge variant="outline" className="mt-1">{issue.severity}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* OCR Text Preview */}
                    {result.ocrText && (
                      <Tabs defaultValue="preview">
                        <TabsList>
                          <TabsTrigger value="preview">Text Preview</TabsTrigger>
                          <TabsTrigger value="full">Full Text</TabsTrigger>
                        </TabsList>
                        <TabsContent value="preview" className="text-sm text-muted-foreground">
                          {result.ocrText.substring(0, 200)}...
                        </TabsContent>
                        <TabsContent value="full" className="text-sm text-muted-foreground max-h-48 overflow-y-auto">
                          {result.ocrText}
                        </TabsContent>
                      </Tabs>
                    )}

                    {/* Actions */}
                    {result.validationStatus !== 'approved' && result.validationStatus !== 'rejected' && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleUpdateValidation(result.id, 'approved')}
                          disabled={updateValidationMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleUpdateValidation(result.id, 'rejected')}
                          disabled={updateValidationMutation.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateValidation(result.id, 'needs_review')}
                          disabled={updateValidationMutation.isPending}
                        >
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Needs Review
                        </Button>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="text-xs text-muted-foreground pt-2 border-t">
                      Processed: {new Date(result.processedAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
