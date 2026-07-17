import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Home,
  Calculator,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  FileText,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function MortgageApplication() {
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState(1);
  const [propertyValue, setPropertyValue] = useState(75000000);
  const [loanAmount, setLoanAmount] = useState(50000000);
  const [interestRate, setInterestRate] = useState(18);
  const [loanTermYears, setLoanTermYears] = useState(20);
  const [propertyId, setPropertyId] = useState(501);
  const [monthlyIncome, setMonthlyIncome] = useState(9500000);
  const [employmentStatus, setEmploymentStatus] = useState<"employed" | "self-employed" | "unemployed" | "retired">("employed");
  const [bankName, setBankName] = useState("National Housing Finance Desk");
  const [bankBranch, setBankBranch] = useState("Primary Processing Hub");
  const [creditScore, setCreditScore] = useState(720);
  const [prefillDocumentId, setPrefillDocumentId] = useState<string>('none');

  const calculatorQuery = trpc.mortgageApplications.calculate.useQuery({
    propertyValue,
    loanAmount,
    interestRate,
    loanTermYears,
  });
  const applicationsQuery = trpc.mortgageApplications.mine.useQuery(undefined, { enabled: isAuthenticated });
  const documentsQuery = trpc.documents.list.useQuery(undefined, { enabled: isAuthenticated });
  const prefillResultsQuery = trpc.documentAI.getResults.useQuery(
    { documentId: Number(prefillDocumentId) },
    { enabled: prefillDocumentId !== 'none' }
  );
  const createApplication = trpc.mortgageApplications.create.useMutation({
    onSuccess: async (application: any) => {
      toast.success(`Mortgage application ${application.applicationId} submitted successfully.`);
      setStep(1);
      await applicationsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Unable to submit mortgage application.");
    },
  });

  const summary = calculatorQuery.data ?? {
    monthlyPayment: 0,
    totalPayment: 0,
    totalInterest: 0,
    downPayment: 0,
    loanToValue: 0,
  };

  const applications = useMemo(() => (applicationsQuery.data as any)?.applications ?? [], [applicationsQuery.data]);

  const formatCurrency = (amount: number) => `₦${(amount / 1000000).toFixed(1)}M`;

  const applyDocumentPrefill = () => {
    const latestResult = prefillResultsQuery.data?.[0];
    const extracted = (latestResult?.extractedFields || {}) as Record<string, unknown>;

    const parsedPropertyId = Number(extracted.propertyId ?? extracted.parcelNumber ?? propertyId);
    if (Number.isFinite(parsedPropertyId) && parsedPropertyId > 0) {
      setPropertyId(parsedPropertyId);
    }

    const parsedPropertyValue = Number(extracted.estimatedPropertyValue ?? extracted.propertyValue ?? propertyValue);
    if (Number.isFinite(parsedPropertyValue) && parsedPropertyValue > 0) {
      setPropertyValue(parsedPropertyValue);
      if (loanAmount > parsedPropertyValue) {
        setLoanAmount(Math.round(parsedPropertyValue * 0.7));
      }
    }

    const parsedMonthlyIncome = Number(extracted.monthlyIncome ?? extracted.income ?? monthlyIncome);
    if (Number.isFinite(parsedMonthlyIncome) && parsedMonthlyIncome > 0) {
      setMonthlyIncome(parsedMonthlyIncome);
    }

    const parsedCreditScore = Number(extracted.creditScore ?? creditScore);
    if (Number.isFinite(parsedCreditScore) && parsedCreditScore > 0) {
      setCreditScore(parsedCreditScore);
    }

    if (typeof extracted.employmentStatus === 'string' && ['employed', 'self-employed', 'unemployed', 'retired'].includes(extracted.employmentStatus)) {
      setEmploymentStatus(extracted.employmentStatus as 'employed' | 'self-employed' | 'unemployed' | 'retired');
    }

    if (typeof extracted.bankName === 'string' && extracted.bankName.trim()) {
      setBankName(extracted.bankName.trim());
    }

    if (typeof extracted.bankBranch === 'string' && extracted.bankBranch.trim()) {
      setBankBranch(extracted.bankBranch.trim());
    }

    toast.success('Applied available extracted document fields to the mortgage form.');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-500";
      case "under_review":
      case "pending":
        return "bg-blue-500";
      case "rejected":
        return "bg-red-500";
      case "disbursed":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="h-4 w-4" />;
      case "under_review":
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "rejected":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const handleSubmitApplication = async () => {
    await createApplication.mutateAsync({
      propertyId,
      loanAmount,
      interestRate,
      loanTermYears,
      monthlyIncome,
      employmentStatus,
      bankName,
      bankBranch,
      creditScore,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      <div className="bg-white dark:bg-slate-900 border-b">
        <div className="container mx-auto py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-green-500 to-blue-500 rounded-lg">
              <Home className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Mortgage Application</h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Apply for property financing using the live underwriting and seeded workflow repository.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-8">
        <Tabs defaultValue="calculator" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="calculator">
              <Calculator className="mr-2 h-4 w-4" />
              Loan Calculator
            </TabsTrigger>
            <TabsTrigger value="apply">
              <FileText className="mr-2 h-4 w-4" />
              Apply Now
            </TabsTrigger>
            <TabsTrigger value="applications">
              <Building2 className="mr-2 h-4 w-4" />
              My Applications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Mortgage Calculator</CardTitle>
                  <CardDescription>Calculate your monthly mortgage payments using the live underwriting contract.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label>Property Value</Label>
                    <Input type="number" value={propertyValue} onChange={(e) => setPropertyValue(Number(e.target.value))} className="mt-2" />
                    <p className="text-sm text-slate-500 mt-1">{formatCurrency(propertyValue)}</p>
                  </div>

                  <div>
                    <Label>Loan Amount</Label>
                    <Input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} className="mt-2" />
                    <p className="text-sm text-slate-500 mt-1">{formatCurrency(loanAmount)} (LTV: {summary.loanToValue}%)</p>
                  </div>

                  <div>
                    <Label>Interest Rate (%)</Label>
                    <Input type="number" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} step="0.1" className="mt-2" />
                  </div>

                  <div>
                    <Label>Loan Term (Years)</Label>
                    <Select value={loanTermYears.toString()} onValueChange={(v) => setLoanTermYears(Number(v))}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 years</SelectItem>
                        <SelectItem value="10">10 years</SelectItem>
                        <SelectItem value="15">15 years</SelectItem>
                        <SelectItem value="20">20 years</SelectItem>
                        <SelectItem value="25">25 years</SelectItem>
                        <SelectItem value="30">30 years</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Payment Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Monthly Payment</p>
                        <p className="text-3xl font-bold text-green-600">₦{summary.monthlyPayment.toLocaleString()}</p>
                      </div>
                      {calculatorQuery.isLoading ? <Loader2 className="h-8 w-8 animate-spin text-green-600" /> : <TrendingUp className="h-8 w-8 text-green-600" />}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-500">Total Payment</p>
                        <p className="text-lg font-semibold">{formatCurrency(summary.totalPayment)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Total Interest</p>
                        <p className="text-lg font-semibold">{formatCurrency(summary.totalInterest)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Down Payment</p>
                        <p className="text-lg font-semibold">{formatCurrency(summary.downPayment)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Loan-to-Value</p>
                        <p className="text-lg font-semibold">{summary.loanToValue}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Underwriting Profile</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between"><span>Applicant</span><span className="font-medium">{user?.name || user?.email || "Authenticated User"}</span></div>
                    <div className="flex justify-between"><span>Monthly Income</span><span className="font-medium">₦{monthlyIncome.toLocaleString()}</span></div>
                    <div className="flex justify-between"><span>Credit Score</span><span className="font-medium">{creditScore}</span></div>
                    <div className="flex justify-between"><span>Employment Status</span><span className="font-medium capitalize">{employmentStatus}</span></div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="apply" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Mortgage Application Form</CardTitle>
                <CardDescription>Submit a live application into the mortgage workflow repository.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Step {step} of 4</span>
                    <span className="text-sm text-slate-500">{(step / 4) * 100}% Complete</span>
                  </div>
                  <Progress value={(step / 4) * 100} className="h-2" />
                </div>

                {step === 1 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Applicant Information</h3>
                    <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/40 p-4 space-y-3">
                      <div>
                        <h4 className="font-medium">Intelligent Form Fill</h4>
                        <p className="text-sm text-slate-500">Use processed identity, property, or financial documents to prefill mortgage application fields.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                        <div>
                          <Label>Processed Document Source</Label>
                          <Select value={prefillDocumentId} onValueChange={setPrefillDocumentId}>
                            <SelectTrigger className="mt-2"><SelectValue placeholder="Select processed document" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No prefill document</SelectItem>
                              {(documentsQuery.data ?? []).map((doc: any) => (
                                <SelectItem key={doc.id} value={String(doc.id)}>{doc.title} ({doc.fileName})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={applyDocumentPrefill}
                          disabled={prefillDocumentId === 'none' || prefillResultsQuery.isLoading || !(prefillResultsQuery.data && prefillResultsQuery.data.length > 0)}
                        >
                          Apply Prefill
                        </Button>
                      </div>
                      {prefillDocumentId !== 'none' && prefillResultsQuery.data?.[0]?.extractedFields && (
                        <div className="text-xs text-slate-500">
                          Available fields: {Object.keys(prefillResultsQuery.data[0].extractedFields).join(', ') || 'none'}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Full Name</Label>
                        <Input value={user?.name || ""} readOnly className="mt-2" />
                      </div>
                      <div>
                        <Label>Email Address</Label>
                        <Input value={user?.email || ""} readOnly className="mt-2" />
                      </div>
                      <div>
                        <Label>Monthly Income (₦)</Label>
                        <Input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(Number(e.target.value))} className="mt-2" />
                      </div>
                      <div>
                        <Label>Credit Score</Label>
                        <Input type="number" value={creditScore} onChange={(e) => setCreditScore(Number(e.target.value))} className="mt-2" />
                      </div>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Employment & Bank Preferences</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Employment Status</Label>
                        <Select value={employmentStatus} onValueChange={(value: any) => setEmploymentStatus(value)}>
                          <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employed">Employed</SelectItem>
                            <SelectItem value="self-employed">Self-Employed</SelectItem>
                            <SelectItem value="unemployed">Unemployed</SelectItem>
                            <SelectItem value="retired">Retired</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Preferred Bank</Label>
                        <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="mt-2" />
                      </div>
                      <div className="col-span-2">
                        <Label>Preferred Branch</Label>
                        <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} className="mt-2" />
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Property & Loan Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Property ID</Label>
                        <Input type="number" value={propertyId} onChange={(e) => setPropertyId(Number(e.target.value))} className="mt-2" />
                      </div>
                      <div>
                        <Label>Property Value (₦)</Label>
                        <Input type="number" value={propertyValue} onChange={(e) => setPropertyValue(Number(e.target.value))} className="mt-2" />
                      </div>
                      <div>
                        <Label>Loan Amount (₦)</Label>
                        <Input type="number" value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} className="mt-2" />
                      </div>
                      <div>
                        <Label>Interest Rate (%)</Label>
                        <Input type="number" value={interestRate} onChange={(e) => setInterestRate(Number(e.target.value))} className="mt-2" />
                      </div>
                      <div>
                        <Label>Loan Term (Years)</Label>
                        <Input type="number" value={loanTermYears} onChange={(e) => setLoanTermYears(Number(e.target.value))} className="mt-2" />
                      </div>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Submission Review</h3>
                    <div className="border rounded-lg p-4 space-y-2 text-sm">
                      <p><strong>Property ID:</strong> {propertyId}</p>
                      <p><strong>Loan Amount:</strong> ₦{loanAmount.toLocaleString()}</p>
                      <p><strong>Estimated Monthly Payment:</strong> ₦{summary.monthlyPayment.toLocaleString()}</p>
                      <p><strong>Preferred Bank:</strong> {bankName} ({bankBranch})</p>
                      <p><strong>Employment Status:</strong> {employmentStatus}</p>
                      <p><strong>Credit Score:</strong> {creditScore}</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between mt-8">
                  <Button variant="outline" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
                    Previous
                  </Button>
                  {step < 4 ? (
                    <Button onClick={() => setStep(Math.min(4, step + 1))}>Next</Button>
                  ) : (
                    <Button onClick={handleSubmitApplication} disabled={createApplication.isPending}>
                      {createApplication.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Submit Application
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="applications" className="mt-6">
            <div className="space-y-4">
              {applicationsQuery.isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : applications.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">No mortgage applications found for your account.</CardContent></Card>
              ) : (
                applications.map((app: any) => (
                  <Card key={app.applicationId}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{app.applicationId}</h3>
                            <Badge className={getStatusColor(app.status)}>
                              {getStatusIcon(app.status)}
                              <span className="ml-1 capitalize">{String(app.status).replace(/_/g, " ")}</span>
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                            <div>
                              <p className="text-sm text-slate-500">Loan Amount</p>
                              <p className="font-semibold">{formatCurrency(app.loanAmount)}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500">Monthly Payment</p>
                              <p className="font-semibold">₦{app.monthlyPayment.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500">Interest Rate</p>
                              <p className="font-semibold">{app.interestRate}%</p>
                            </div>
                            <div>
                              <p className="text-sm text-slate-500">Term</p>
                              <p className="font-semibold">{Math.round((app.loanTermMonths ?? app.loanTerm) / 12)} years</p>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center gap-6 text-sm text-slate-500 flex-wrap">
                            <span>Bank: {app.bankName}</span>
                            <span>Credit Score: {app.creditScore ?? "N/A"}</span>
                            <span>Submitted: {new Date(app.submittedAt).toLocaleDateString()}</span>
                            {app.reviewedAt && <span>Reviewed: {new Date(app.reviewedAt).toLocaleDateString()}</span>}
                          </div>
                          {app.rejectionReason && (
                            <p className="mt-3 text-sm text-red-600">Rejection reason: {app.rejectionReason}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
