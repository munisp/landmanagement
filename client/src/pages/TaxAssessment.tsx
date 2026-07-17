import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Calculator, FileText, History, CheckCircle2, Clock, AlertCircle, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function TaxAssessment() {
  const { user } = useAuth();
  const [parcelId, setParcelId] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [landArea, setLandArea] = useState('');
  const [landUseType, setLandUseType] = useState<'residential' | 'commercial' | 'industrial' | 'agricultural' | 'mixed'>('residential');
  const [state, setState] = useState('');
  const [lga, setLga] = useState('');
  const [tin, setTin] = useState('');
  const [historyParcelId, setHistoryParcelId] = useState('');
  const [certificateId, setCertificateId] = useState('');

  const calculateTax = trpc.tax.calculateTax.useMutation({
    onSuccess: (data) => {
      toast.success('Tax Calculated', {
        description: `Annual tax: ₦${data.annualTax.toLocaleString()}`,
      });
    },
    onError: (error) => {
      toast.error('Calculation Failed', {
        description: error.message,
      });
    },
  });

  const verifyTIN = trpc.tax.verifyTIN.useQuery(
    { tin },
    { enabled: tin.length >= 10 }
  );

  const taxHistory = trpc.tax.getTaxHistory.useQuery(
    { parcelId: historyParcelId },
    { enabled: historyParcelId.length > 0 }
  );

  const verifyClearance = trpc.tax.verifyClearance.useQuery(
    { certificateId },
    { enabled: certificateId.length > 0 }
  );

  const generateClearance = trpc.tax.generateClearance.useMutation({
    onSuccess: (data) => {
      toast.success('Tax Clearance Generated', {
        description: `Certificate ID: ${data.certificateId}`,
      });
    },
  });

  const submitPayment = trpc.tax.submitPayment.useMutation({
    onSuccess: (data) => {
      toast.success('Payment Submitted', {
        description: `Receipt: ${data.receiptNumber}`,
      });
      if (historyParcelId) {
        taxHistory.refetch();
      }
    },
  });

  const handleCalculate = () => {
    if (!parcelId || !propertyValue || !landArea || !state || !lga) {
      toast.error('Validation Error', {
        description: 'Please fill in all required fields',
      });
      return;
    }

    calculateTax.mutate({
      parcelId,
      propertyValue: parseFloat(propertyValue),
      landArea: parseFloat(landArea),
      landUseType,
      state,
      lga,
    });
  };

  const handlePayment = (assessmentId: string, amount: number) => {
    submitPayment.mutate({
      assessmentId,
      amount,
      paymentMethod: 'bank_transfer',
    });
  };

  const handleGenerateClearance = () => {
    if (!parcelId || !tin) {
      toast.error('Validation Error', {
        description: 'Please provide parcel ID and TIN',
      });
      return;
    }

    const ownerName = verifyTIN.data?.taxpayerName || user?.name || 'Registered Property Owner';

    generateClearance.mutate({
      parcelId,
      ownerName,
      ownerTin: tin,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      paid: 'outline',
      overdue: 'destructive',
      disputed: 'default',
    };
    
    const icons = {
      pending: <Clock className="h-3 w-3 mr-1" />,
      paid: <CheckCircle2 className="h-3 w-3 mr-1" />,
      overdue: <AlertCircle className="h-3 w-3 mr-1" />,
      disputed: <AlertCircle className="h-3 w-3 mr-1" />,
    };

    return (
      <Badge variant={variants[status] || 'default'} className="flex items-center w-fit">
        {icons[status as keyof typeof icons]}
        {status.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Property Tax Assessment</h1>
        <p className="text-muted-foreground">
          Calculate property tax, view payment history, and generate tax clearance certificates
        </p>
      </div>

      <Tabs defaultValue="calculate" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="calculate">Calculate Tax</TabsTrigger>
          <TabsTrigger value="history">Payment History</TabsTrigger>
          <TabsTrigger value="clearance">Tax Clearance</TabsTrigger>
          <TabsTrigger value="verify">Verify TIN</TabsTrigger>
        </TabsList>

        <TabsContent value="calculate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calculator className="h-5 w-5 mr-2" />
                Tax Calculator
              </CardTitle>
              <CardDescription>
                Calculate property tax based on property value and land use type
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parcelId">Parcel ID</Label>
                  <Input
                    id="parcelId"
                    placeholder="e.g., FCT-ABJ-001234"
                    value={parcelId}
                    onChange={(e) => setParcelId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="propertyValue">Property Value (₦)</Label>
                  <Input
                    id="propertyValue"
                    type="number"
                    placeholder="e.g., 50000000"
                    value={propertyValue}
                    onChange={(e) => setPropertyValue(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="landArea">Land Area (m²)</Label>
                  <Input
                    id="landArea"
                    type="number"
                    placeholder="e.g., 500"
                    value={landArea}
                    onChange={(e) => setLandArea(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="landUseType">Land Use Type</Label>
                  <Select value={landUseType} onValueChange={(value: any) => setLandUseType(value)}>
                    <SelectTrigger id="landUseType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="residential">Residential</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                      <SelectItem value="industrial">Industrial</SelectItem>
                      <SelectItem value="agricultural">Agricultural</SelectItem>
                      <SelectItem value="mixed">Mixed Use</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    placeholder="e.g., FCT"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lga">LGA</Label>
                  <Input
                    id="lga"
                    placeholder="e.g., Abuja Municipal"
                    value={lga}
                    onChange={(e) => setLga(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={handleCalculate}
                disabled={calculateTax.isPending}
                className="w-full"
                size="lg"
              >
                {calculateTax.isPending ? 'Calculating...' : 'Calculate Tax'}
              </Button>

              {calculateTax.data && (
                <Card className="bg-muted">
                  <CardHeader>
                    <CardTitle className="text-lg">Tax Assessment Result</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assessment ID:</span>
                      <span className="font-mono">{calculateTax.data.assessmentId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Property Value:</span>
                      <span>₦{calculateTax.data.propertyValue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assessed Value:</span>
                      <span>₦{calculateTax.data.assessedValue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax Rate:</span>
                      <span>{(calculateTax.data.taxRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold">
                      <span>Annual Tax:</span>
                      <span className="text-primary">₦{calculateTax.data.annualTax.toLocaleString()}</span>
                    </div>
                    {calculateTax.data.penalties > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Penalties:</span>
                        <span>₦{calculateTax.data.penalties.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xl font-bold border-t pt-3">
                      <span>Total Due:</span>
                      <span className="text-primary">₦{calculateTax.data.totalDue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Due Date:</span>
                      <span>{new Date(calculateTax.data.dueDate).toLocaleDateString()}</span>
                    </div>
                    <Button
                      onClick={() => handlePayment(calculateTax.data!.assessmentId, calculateTax.data!.totalDue)}
                      disabled={submitPayment.isPending}
                      className="w-full mt-4"
                    >
                      {submitPayment.isPending ? 'Processing...' : 'Pay Now'}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <History className="h-5 w-5 mr-2" />
                Payment History
              </CardTitle>
              <CardDescription>
                View tax assessment and payment history for a property
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter Parcel ID"
                  value={historyParcelId}
                  onChange={(e) => setHistoryParcelId(e.target.value)}
                />
                <Button onClick={() => taxHistory.refetch()}>Search</Button>
              </div>

              {taxHistory.isLoading && (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              )}

              {taxHistory.data && taxHistory.data.length > 0 && (
                <div className="space-y-4">
                  {taxHistory.data.map((assessment) => (
                    <Card key={assessment.assessmentId}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">Tax Year {assessment.taxYear}</CardTitle>
                          {getStatusBadge(assessment.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Assessment ID</p>
                            <p className="font-mono">{assessment.assessmentId}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Assessment Date</p>
                            <p>{new Date(assessment.assessmentDate).toLocaleDateString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Property Value</p>
                            <p>₦{assessment.propertyValue.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Annual Tax</p>
                            <p className="font-bold">₦{assessment.annualTax.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Penalties</p>
                            <p className={assessment.penalties > 0 ? 'text-destructive' : ''}>
                              ₦{assessment.penalties.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Total Due</p>
                            <p className="font-bold text-primary">₦{assessment.totalDue.toLocaleString()}</p>
                          </div>
                        </div>
                        {assessment.status === 'pending' && (
                          <Button
                            onClick={() => handlePayment(assessment.assessmentId, assessment.totalDue)}
                            disabled={submitPayment.isPending}
                            className="w-full mt-4"
                          >
                            Pay Now
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {taxHistory.data && taxHistory.data.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No tax history found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Tax Clearance Certificate
              </CardTitle>
              <CardDescription>
                Generate or verify tax clearance certificates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clearanceParcelId">Parcel ID</Label>
                  <Input
                    id="clearanceParcelId"
                    placeholder="e.g., FCT-ABJ-001234"
                    value={parcelId}
                    onChange={(e) => setParcelId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clearanceTin">Tax Identification Number (TIN)</Label>
                  <Input
                    id="clearanceTin"
                    placeholder="e.g., 12345678-0001"
                    value={tin}
                    onChange={(e) => setTin(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleGenerateClearance}
                  disabled={generateClearance.isPending}
                  className="w-full"
                >
                  {generateClearance.isPending ? 'Generating...' : 'Generate Tax Clearance'}
                </Button>
              </div>

              {generateClearance.data && (
                <Card className="bg-muted">
                  <CardHeader>
                    <CardTitle className="text-lg">Certificate Generated</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Certificate ID:</span>
                      <span className="font-mono">{generateClearance.data.certificateId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valid From:</span>
                      <span>{new Date(generateClearance.data.validFrom).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valid Until:</span>
                      <span>{new Date(generateClearance.data.validUntil).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge variant="outline">{generateClearance.data.status.toUpperCase()}</Badge>
                    </div>
                    <Button asChild className="w-full mt-4">
                      <a href={generateClearance.data.certificateUrl} download>
                        <Download className="h-4 w-4 mr-2" />
                        Download Certificate
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="pt-6 border-t">
                <h3 className="font-semibold mb-4">Verify Existing Certificate</h3>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter Certificate ID"
                    value={certificateId}
                    onChange={(e) => setCertificateId(e.target.value)}
                  />
                  <Button onClick={() => verifyClearance.refetch()}>Verify</Button>
                </div>

                {verifyClearance.data && (
                  <Card className="mt-4 bg-muted">
                    <CardHeader>
                      <CardTitle className="text-lg">Certificate Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Owner:</span>
                        <span>{verifyClearance.data.ownerName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">TIN:</span>
                        <span className="font-mono">{verifyClearance.data.ownerTin}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={verifyClearance.data.status === 'valid' ? 'outline' : 'destructive'}>
                          {verifyClearance.data.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valid Until:</span>
                        <span>{new Date(verifyClearance.data.validUntil).toLocaleDateString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verify" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Verify Tax Identification Number</CardTitle>
              <CardDescription>
                Verify TIN with FIRS database
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verifyTin">Tax Identification Number (TIN)</Label>
                <Input
                  id="verifyTin"
                  placeholder="e.g., 12345678-0001"
                  value={tin}
                  onChange={(e) => setTin(e.target.value)}
                />
              </div>

              {verifyTIN.data && (
                <Card className={verifyTIN.data.valid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      {verifyTIN.data.valid ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span className="font-semibold text-green-600">Valid TIN</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-5 w-5 text-red-600" />
                          <span className="font-semibold text-red-600">Invalid TIN</span>
                        </>
                      )}
                    </div>
                    {verifyTIN.data.valid && (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taxpayer Name:</span>
                          <span>{verifyTIN.data.taxpayerName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taxpayer Type:</span>
                          <span>{verifyTIN.data.taxpayerType}</span>
                        </div>
                        {verifyTIN.data.registrationDate && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Registration Date:</span>
                            <span>{new Date(verifyTIN.data.registrationDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
