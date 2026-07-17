import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Clock, FileText, Home, Shield, Leaf, MapPin, FileCheck, Building2 } from 'lucide-react';
import { toast } from 'sonner';

type SystemStatus = string;

export default function AdminPhase4Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('mortgage');

  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You do not have permission to access this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Fetch all Phase 4 data
  const { data: mortgages, refetch: refetchMortgages } = trpc.phase4.getAllMortgageApplications.useQuery();
  const { data: taxes, refetch: refetchTaxes } = trpc.phase4.getAllTaxClearances.useQuery();
  const { data: insurance, refetch: refetchInsurance } = trpc.phase4.getAllInsurancePolicies.useQuery();
  const { data: legal, refetch: refetchLegal } = trpc.phase4.getAllLegalDocuments.useQuery();
  const { data: surveys, refetch: refetchSurveys } = trpc.phase4.getAllCadastralSurveys.useQuery();
  const { data: environmental, refetch: refetchEnvironmental } = trpc.phase4.getAllEnvironmentalAssessments.useQuery();
  const { data: notices, refetch: refetchNotices } = trpc.phase4.getAllPublicNotices.useQuery();
  const { data: landUse, refetch: refetchLandUse} = trpc.phase4.getAllLandUsePlans.useQuery();

  // Mutations
  const updateMortgage = trpc.phase4.updateMortgageApplicationStatus.useMutation();
  const updateTax = trpc.phase4.updateTaxClearanceStatus.useMutation();
  const updateInsurance = trpc.phase4.updateInsurancePolicyStatus.useMutation();
  const updateLegal = trpc.phase4.updateLegalDocumentStatus.useMutation();
  const updateSurvey = trpc.phase4.updateCadastralSurveyStatus.useMutation();
  const updateEnvironmental = trpc.phase4.updateEnvironmentalAssessmentStatus.useMutation();
  const updateNotice = trpc.phase4.updatePublicNoticeStatus.useMutation();
  const updateLandUse = trpc.phase4.updateLandUsePlanStatus.useMutation();

  const handleStatusUpdate = async (
    type: string,
    item: any,
    action: 'approve' | 'reject' | 'review',
    refetch: () => void
  ) => {
    try {
      const payloadByType: Record<string, any> = {
        mortgage: {
          applicationId: item.applicationId,
          status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'under_review',
        },
        tax: {
          clearanceId: item.clearanceId,
          status: action === 'approve' ? 'issued' : action === 'reject' ? 'rejected' : 'verified',
        },
        insurance: {
          policyId: item.policyId,
          status: action === 'approve' ? 'active' : action === 'reject' ? 'cancelled' : 'pending',
        },
        legal: {
          documentId: item.documentId,
          status: action === 'approve' ? 'registered' : action === 'reject' ? 'rejected' : 'pending_review',
        },
        survey: {
          surveyId: item.surveyId,
          status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'in_progress',
        },
        environmental: {
          assessmentId: item.assessmentId,
          status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'under_review',
        },
        notice: {
          noticeId: item.noticeId,
          status: action === 'approve' ? 'published' : action === 'reject' ? 'cancelled' : 'objection_filed',
        },
        landUse: {
          planId: item.planId,
          status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'under_review',
        },
      };

      const mutations: Record<string, any> = {
        mortgage: updateMortgage,
        tax: updateTax,
        insurance: updateInsurance,
        legal: updateLegal,
        survey: updateSurvey,
        environmental: updateEnvironmental,
        notice: updateNotice,
        landUse: updateLandUse,
      };

      const mutation = mutations[type];
      const payload = payloadByType[type];
      await mutation.mutateAsync(payload);

      toast.success('Status Updated', {
        description: `Status changed to ${payload.status}`,
      });

      refetch();
    } catch (error) {
      toast.error('Error', {
        description: 'Failed to update status',
      });
    }
  };

  const getStatusBadge = (status: SystemStatus) => {
    const variants: Record<string, { variant: 'secondary' | 'default' | 'destructive' | 'outline'; icon: any }> = {
      pending: { variant: 'secondary', icon: Clock },
      approved: { variant: 'default', icon: CheckCircle2 },
      active: { variant: 'default', icon: CheckCircle2 },
      issued: { variant: 'default', icon: CheckCircle2 },
      registered: { variant: 'default', icon: CheckCircle2 },
      published: { variant: 'default', icon: CheckCircle2 },
      verified: { variant: 'outline', icon: FileText },
      in_progress: { variant: 'outline', icon: FileText },
      pending_review: { variant: 'outline', icon: FileText },
      under_review: { variant: 'outline', icon: FileText },
      conditional_approval: { variant: 'outline', icon: FileText },
      objection_filed: { variant: 'outline', icon: FileText },
      rejected: { variant: 'destructive', icon: XCircle },
      cancelled: { variant: 'destructive', icon: XCircle },
      suspended: { variant: 'destructive', icon: XCircle },
      expired: { variant: 'destructive', icon: XCircle },
    };

    const config = variants[status] || variants.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const StatusActions = ({ onUpdate }: { onUpdate: (action: 'approve' | 'reject' | 'review') => void }) => (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => onUpdate('approve')}>
        <CheckCircle2 className="h-4 w-4 mr-1" />
        Approve
      </Button>
      <Button size="sm" variant="destructive" onClick={() => onUpdate('reject')}>
        <XCircle className="h-4 w-4 mr-1" />
        Reject
      </Button>
      <Button size="sm" variant="outline" onClick={() => onUpdate('review')}>
        <FileText className="h-4 w-4 mr-1" />
        Review
      </Button>
    </div>
  );

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Phase 4 Systems Administration</h1>
        <p className="text-muted-foreground">
          Manage mortgage applications, tax clearances, insurance policies, and more
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="mortgage">
            <Home className="h-4 w-4 mr-2" />
            Mortgage
          </TabsTrigger>
          <TabsTrigger value="tax">
            <FileCheck className="h-4 w-4 mr-2" />
            Tax
          </TabsTrigger>
          <TabsTrigger value="insurance">
            <Shield className="h-4 w-4 mr-2" />
            Insurance
          </TabsTrigger>
          <TabsTrigger value="legal">
            <FileText className="h-4 w-4 mr-2" />
            Legal
          </TabsTrigger>
          <TabsTrigger value="survey">
            <MapPin className="h-4 w-4 mr-2" />
            Survey
          </TabsTrigger>
          <TabsTrigger value="environmental">
            <Leaf className="h-4 w-4 mr-2" />
            Environmental
          </TabsTrigger>
          <TabsTrigger value="notice">
            <FileText className="h-4 w-4 mr-2" />
            Notices
          </TabsTrigger>
          <TabsTrigger value="landUse">
            <Building2 className="h-4 w-4 mr-2" />
            Land Use
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mortgage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mortgage Applications</CardTitle>
              <CardDescription>Review and approve mortgage applications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mortgages?.map((app: any) => (
                  <Card key={app.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{app.transactionId}</h3>
                            {getStatusBadge(app.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Lender: {app.lenderName}</p>
                            <p>Amount: ${app.loanAmount.toLocaleString()}</p>
                            <p>Interest Rate: {app.interestRate}%</p>
                            <p>Term: {app.loanTerm} months</p>
                            {app.approvedAt && <p>Approved: {new Date(app.approvedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('mortgage', app, action, refetchMortgages)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!mortgages || mortgages.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No mortgage applications found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tax Clearances</CardTitle>
              <CardDescription>Review and approve tax clearance certificates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {taxes?.map((tax: any) => (
                  <Card key={tax.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{tax.transactionId}</h3>
                            {getStatusBadge(tax.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Tax Authority: {tax.taxAuthority}</p>
                            <p>Amount Due: ${tax.amountDue.toLocaleString()}</p>
                            <p>Amount Paid: ${tax.amountPaid.toLocaleString()}</p>
                            <p>Certificate: {tax.certificateNumber || 'Pending'}</p>
                            {tax.issuedAt && <p>Issued: {new Date(tax.issuedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('tax', tax, action, refetchTaxes)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!taxes || taxes.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No tax clearances found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insurance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Insurance Policies</CardTitle>
              <CardDescription>Review and verify insurance policies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insurance?.map((policy: any) => (
                  <Card key={policy.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{policy.transactionId}</h3>
                            {getStatusBadge(policy.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Provider: {policy.providerName}</p>
                            <p>Policy: {policy.policyNumber}</p>
                            <p>Type: {policy.policyType}</p>
                            <p>Coverage: ${policy.coverageAmount.toLocaleString()}</p>
                            <p>Premium: ${policy.premiumAmount.toLocaleString()}</p>
                            <p>Valid: {new Date(policy.startDate).toLocaleDateString()} - {new Date(policy.endDate).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('insurance', policy, action, refetchInsurance)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!insurance || insurance.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No insurance policies found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="legal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Legal Documents</CardTitle>
              <CardDescription>Review and approve legal documentation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {legal?.map((doc: any) => (
                  <Card key={doc.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{doc.transactionId}</h3>
                            {getStatusBadge(doc.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Type: {doc.documentType}</p>
                            <p>Prepared By: {doc.preparedBy}</p>
                            <p>Reviewed By: {doc.reviewedBy || 'Pending'}</p>
                            {doc.approvedAt && <p>Approved: {new Date(doc.approvedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('legal', doc, action, refetchLegal)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!legal || legal.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No legal documents found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="survey" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cadastral Surveys</CardTitle>
              <CardDescription>Review and approve land surveys</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {surveys?.map((survey: any) => (
                  <Card key={survey.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{survey.transactionId}</h3>
                            {getStatusBadge(survey.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Surveyor: {survey.surveyorName}</p>
                            <p>License: {survey.surveyorLicense}</p>
                            <p>Area: {survey.surveyedArea} sq m</p>
                            <p>Method: {survey.surveyMethod}</p>
                            {survey.completedAt && <p>Completed: {new Date(survey.completedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('survey', survey, action, refetchSurveys)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!surveys || surveys.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No surveys found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="environmental" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Environmental Assessments</CardTitle>
              <CardDescription>Review environmental impact assessments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {environmental?.map((assessment: any) => (
                  <Card key={assessment.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{assessment.transactionId}</h3>
                            {getStatusBadge(assessment.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Assessor: {assessment.assessorName}</p>
                            <p>Type: {assessment.assessmentType}</p>
                            <p>Impact Level: {assessment.impactLevel}</p>
                            <p>Mitigation Required: {assessment.mitigationRequired ? 'Yes' : 'No'}</p>
                            {assessment.completedAt && <p>Completed: {new Date(assessment.completedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('environmental', assessment, action, refetchEnvironmental)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!environmental || environmental.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No environmental assessments found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notice" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Public Notices</CardTitle>
              <CardDescription>Manage public notice publications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {notices?.map((notice: any) => (
                  <Card key={notice.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{notice.transactionId}</h3>
                            {getStatusBadge(notice.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Type: {notice.noticeType}</p>
                            <p>Publication: {notice.publicationName}</p>
                            <p>Reference: {notice.publicationReference || 'Pending'}</p>
                            <p>Period: {new Date(notice.noticeStartDate).toLocaleDateString()} - {new Date(notice.noticeEndDate).toLocaleDateString()}</p>
                            {notice.publishedAt && <p>Published: {new Date(notice.publishedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('notice', notice, action, refetchNotices)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!notices || notices.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No public notices found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="landUse" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Land Use Plans</CardTitle>
              <CardDescription>Review land use and zoning compliance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {landUse?.map((plan: any) => (
                  <Card key={plan.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Transaction #{plan.transactionId}</h3>
                            {getStatusBadge(plan.status as SystemStatus)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>Current Zoning: {plan.currentZoning}</p>
                            <p>Proposed Use: {plan.proposedUse}</p>
                            <p>Compliant: {plan.isCompliant ? 'Yes' : 'No'}</p>
                            <p>Planning Authority: {plan.planningAuthority}</p>
                            {plan.approvedAt && <p>Approved: {new Date(plan.approvedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                        <StatusActions
                          onUpdate={(action) => handleStatusUpdate('landUse', plan, action, refetchLandUse)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!landUse || landUse.length === 0) && (
                  <p className="text-center text-muted-foreground py-8">No land use plans found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
