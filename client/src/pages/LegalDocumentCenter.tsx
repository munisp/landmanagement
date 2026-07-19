import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileSignature, PenSquare, ShieldCheck, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

const documentTypeOptions = [
  { value: 'deed_of_assignment', label: 'Deed of Assignment' },
  { value: 'power_of_attorney', label: 'Power of Attorney' },
  { value: 'contract_of_sale', label: 'Contract of Sale' },
  { value: 'lease_agreement', label: 'Lease Agreement' },
  { value: 'mortgage_deed', label: 'Mortgage Deed' },
  { value: 'certificate_of_occupancy', label: 'Certificate of Occupancy' },
  { value: 'governor_consent', label: 'Governor Consent' },
] as const;

type DocumentType = typeof documentTypeOptions[number]['value'];

const templateBodies: Record<DocumentType, string> = {
  deed_of_assignment: 'This Deed of Assignment is made between {{sellerName}} and {{buyerName}} regarding Parcel {{parcelId}}. The assignor transfers all rights, title, and interest in the property for the agreed consideration of {{consideration}} effective {{effectiveDate}}.',
  power_of_attorney: 'I, {{sellerName}}, hereby appoint {{buyerName}} as lawful attorney to act on matters concerning Parcel {{parcelId}}, including filing, execution, and registry follow-up activities beginning {{effectiveDate}}.',
  contract_of_sale: 'This Contract of Sale records the sale of Parcel {{parcelId}} between {{sellerName}} and {{buyerName}} for {{consideration}} with completion targeted for {{effectiveDate}}.',
  lease_agreement: 'This Lease Agreement grants {{buyerName}} occupancy rights over Parcel {{parcelId}} from {{effectiveDate}} under terms approved by {{lawFirm}}.',
  mortgage_deed: 'This Mortgage Deed secures financing over Parcel {{parcelId}} in favor of {{buyerName}} for principal consideration of {{consideration}} effective {{effectiveDate}}.',
  certificate_of_occupancy: 'This Certificate of Occupancy draft confirms occupancy rights over Parcel {{parcelId}} in favor of {{buyerName}}, subject to registry confirmation on {{effectiveDate}}.',
  governor_consent: 'This Governor Consent request supports the transfer and registration workflow for Parcel {{parcelId}} between {{sellerName}} and {{buyerName}}, to take effect on {{effectiveDate}}.',
};

export default function LegalDocumentCenter() {
  const [documentType, setDocumentType] = useState<DocumentType>('deed_of_assignment');
  const [title, setTitle] = useState('Deed of Assignment Draft');
  const [transactionId, setTransactionId] = useState('TXN-2026-1101');
  const [parcelId, setParcelId] = useState('1101');
  const [sellerName, setSellerName] = useState('Adeyemi Estates Ltd');
  const [buyerName, setBuyerName] = useState('Amina Bello');
  const [consideration, setConsideration] = useState('₦95,000,000');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [lawyerName, setLawyerName] = useState('Registry Legal Desk');
  const [lawFirm, setLawFirm] = useState('Metropolitan Title Chambers');
  const [lawyerContact, setLawyerContact] = useState('legaldesk@example.com');
  const [description, setDescription] = useState('Auto-generated legal instrument for registry and transaction processing.');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('none');

  const documentsQuery = trpc.documents.list.useQuery();
  const prefillResultsQuery = trpc.documentAI.getResults.useQuery(
    { documentId: Number(selectedDocumentId) },
    { enabled: selectedDocumentId !== 'none' }
  );
  const signatureQuery = trpc.documentAI.verifySignature.useQuery(
    { documentId: Number(selectedDocumentId) },
    { enabled: selectedDocumentId !== 'none' }
  );
  const legalDocumentsQuery = trpc.phase4.getAllLegalDocuments.useQuery();

  const createLegalDocument = trpc.phase4.createLegalDocument.useMutation({
    onSuccess: async () => {
      toast.success('Legal document workflow created');
      await legalDocumentsQuery.refetch();
    },
    onError: (error) => toast.error(error.message || 'Unable to create legal document workflow'),
  });

  const renderedTemplate = useMemo(() => {
    return templateBodies[documentType]
      .replaceAll('{{sellerName}}', sellerName || 'Seller')
      .replaceAll('{{buyerName}}', buyerName || 'Buyer')
      .replaceAll('{{parcelId}}', parcelId || 'Parcel')
      .replaceAll('{{consideration}}', consideration || 'consideration')
      .replaceAll('{{effectiveDate}}', effectiveDate || 'effective date')
      .replaceAll('{{lawFirm}}', lawFirm || 'assigned counsel');
  }, [buyerName, consideration, documentType, effectiveDate, lawFirm, parcelId, sellerName]);

  const handleApplyPrefill = () => {
    const extracted = (prefillResultsQuery.data?.[0]?.extractedFields || {}) as Record<string, unknown>;
    if (typeof extracted.propertyId === 'string' || typeof extracted.propertyId === 'number') {
      setParcelId(String(extracted.propertyId));
    }
    if (typeof extracted.parcelNumber === 'string') {
      setParcelId(extracted.parcelNumber);
    }
    if (typeof extracted.applicantName === 'string') {
      setBuyerName(extracted.applicantName);
    }
    if (typeof extracted.ownerName === 'string') {
      setSellerName(extracted.ownerName);
    }
    if (typeof extracted.estimatedPropertyValue === 'string' || typeof extracted.estimatedPropertyValue === 'number') {
      setConsideration(String(extracted.estimatedPropertyValue));
    }
    if (typeof extracted.bankName === 'string') {
      setLawFirm(`${extracted.bankName} Legal Liaison`);
    }
    toast.success('Available extracted fields applied to legal document draft');
  };

  const handleSubmit = async () => {
    await createLegalDocument.mutateAsync({
      transactionId,
      parcelId: Number(parcelId),
      documentType,
      title,
      description: `${description}\n\n${renderedTemplate}`,
      documentUrl: `generated://legal/${documentType}/${transactionId}`,
      lawyerName,
      lawyerContact,
      lawFirm,
    });
  };

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Legal Document Center</h1>
        <p className="text-muted-foreground mt-2">Generate legal templates, apply automated document filling, verify signature cues, and submit legal workflows into the Phase 4 registry pipeline.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Templates</p><p className="mt-2 text-2xl font-semibold">7</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Documents in workflow</p><p className="mt-2 text-2xl font-semibold">{legalDocumentsQuery.data?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Signature verification</p><p className="mt-2 text-2xl font-semibold">{signatureQuery.data?.hasSignature ? 'Detected' : 'Awaiting review'}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="drafting" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[720px]">
          <TabsTrigger value="drafting"><PenSquare className="mr-2 h-4 w-4" />Drafting</TabsTrigger>
          <TabsTrigger value="prefill"><Wand2 className="mr-2 h-4 w-4" />Autofill</TabsTrigger>
          <TabsTrigger value="signature"><FileSignature className="mr-2 h-4 w-4" />Signature Review</TabsTrigger>
        </TabsList>

        <TabsContent value="drafting">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Template configuration</CardTitle>
                <CardDescription>Create deed, power-of-attorney, contract, lease, mortgage, certificate, or consent drafts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Document type</Label>
                  <Select value={documentType} onValueChange={(value: DocumentType) => { setDocumentType(value); setTitle(documentTypeOptions.find((item) => item.value === value)?.label || 'Legal Draft'); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {documentTypeOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Transaction ID</Label><Input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Parcel ID</Label><Input value={parcelId} onChange={(e) => setParcelId(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Effective date</Label><Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Seller / Assignor</Label><Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Buyer / Assignee</Label><Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Consideration</Label><Input value={consideration} onChange={(e) => setConsideration(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Lawyer name</Label><Input value={lawyerName} onChange={(e) => setLawyerName(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Law firm</Label><Input value={lawFirm} onChange={(e) => setLawFirm(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Lawyer contact</Label><Input value={lawyerContact} onChange={(e) => setLawyerContact(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>Workflow description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                <Button onClick={handleSubmit} disabled={createLegalDocument.isPending}>Submit Legal Workflow</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Generated template preview</CardTitle>
                <CardDescription>Auto-filled draft body for the selected legal instrument type.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-7 whitespace-pre-wrap">{renderedTemplate}</div>
                <div className="rounded-lg border p-4">
                  <p className="font-medium mb-2">Workflow metadata</p>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div>Prepared by: {lawyerName}</div>
                    <div>Firm: {lawFirm}</div>
                    <div>Transaction: {transactionId}</div>
                    <div>Parcel: {parcelId}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="prefill">
          <Card>
            <CardHeader>
              <CardTitle>Automated document filling</CardTitle>
              <CardDescription>Apply extracted document fields from processed documents into the legal template workflow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] items-end">
                <div className="space-y-2">
                  <Label>Processed document source</Label>
                  <Select value={selectedDocumentId} onValueChange={setSelectedDocumentId}>
                    <SelectTrigger><SelectValue placeholder="Select processed document" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No source selected</SelectItem>
                      {(documentsQuery.data ?? []).map((doc: any) => (
                        <SelectItem key={doc.id} value={String(doc.id)}>{doc.title} ({doc.fileName})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" onClick={handleApplyPrefill} disabled={selectedDocumentId === 'none' || !(prefillResultsQuery.data && prefillResultsQuery.data.length > 0)}>Apply Autofill</Button>
              </div>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                Available extracted fields: {selectedDocumentId !== 'none' && prefillResultsQuery.data?.[0]?.extractedFields ? Object.keys(prefillResultsQuery.data[0].extractedFields).join(', ') : 'Select a processed document to inspect available fields.'}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signature">
          <Card>
            <CardHeader>
              <CardTitle>Digital signature integration</CardTitle>
              <CardDescription>Reuse the existing signature verification workflow to assess signature cues before filing or registration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedDocumentId === 'none' ? (
                <p className="text-sm text-muted-foreground">Select a processed document in the Autofill tab to run signature review.</p>
              ) : signatureQuery.data ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="font-medium">Signature verification result</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>Signature cues detected</span><Badge variant={signatureQuery.data.hasSignature ? 'default' : 'secondary'}>{signatureQuery.data.hasSignature ? 'Yes' : 'No'}</Badge></div>
                      <div className="flex items-center justify-between"><span>Confidence</span><span>{signatureQuery.data.confidence}%</span></div>
                      <div className="flex items-center justify-between"><span>Identified signer</span><span>{signatureQuery.data.signerName || 'Not identified'}</span></div>
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="font-medium mb-3">Verification notes</p>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {signatureQuery.data.verificationNotes.map((note: string, index: number) => (
                        <div key={index} className="rounded border bg-muted/40 p-2">{note}</div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Running signature verification...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
