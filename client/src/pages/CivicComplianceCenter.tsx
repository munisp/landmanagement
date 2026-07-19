import { useMemo, useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Compass, FileSearch, Leaf, Megaphone, Building2 } from 'lucide-react';

const defaultSurveyForm = {
  transactionId: 'TXN-2026-1101',
  parcelId: 1101,
  surveyPlanNumber: 'SG-2026-1101',
  surveyDate: new Date().toISOString().slice(0, 10),
  surveyorName: 'Registry Survey Desk',
  surveyorLicenseNumber: 'SURV-99881',
  surveyFirm: 'Metropolitan Geomatics',
  area: 4200,
  perimeter: 265,
  coordinates: '9.0765,7.3986;9.0768,7.3991;9.0762,7.3994',
};

const defaultEnvironmentalForm = {
  transactionId: 'TXN-2026-1101',
  parcelId: 1101,
  assessmentType: 'Environmental Clearance Review',
  assessorName: 'GreenScope Consulting',
  assessorLicense: 'EIA-77410',
  assessorFirm: 'GreenScope Consulting',
  soilQuality: 'good',
  waterQuality: 'stable',
  airQuality: 'stable',
  floodRisk: 'low',
  erosionRisk: 'low',
  contaminationLevel: 'minimal',
  protectedAreaType: 'none',
  estimatedAnnualEmissions: 18,
};

const defaultNoticeForm = {
  transactionId: 'TXN-2026-1101',
  parcelId: 1101,
  noticeType: 'title_transfer',
  noticeTitle: 'Public Notice of Title Transfer',
  noticeContent: 'Notice is hereby given to the public regarding the pending transfer of title for the identified parcel.',
  newspaperName: 'National Registry Gazette',
  newspaperEdition: 'Morning Edition',
  publicationPeriodDays: 30,
  hearingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
};

const defaultLandUseForm = {
  transactionId: 'TXN-2026-1101',
  parcelId: 1101,
  currentLandUse: 'residential',
  proposedLandUse: 'mixed_use',
  zoningClassification: 'R4-MU',
  developmentType: 'mid-rise mixed use',
  planningAuthority: 'Urban Planning Department',
  planningOfficer: 'Planning Officer A. Danjuma',
  planningOfficerContact: 'planning@example.com',
  complianceNotes: 'Requires frontage and parking review.',
  restrictions: 'Maximum height 18m; minimum setback 6m.',
  lotArea: 4200,
  buildingFootprint: 1680,
  setback: 7,
};

export default function CivicComplianceCenter() {
  const { user } = useAuth();
  const [surveyForm, setSurveyForm] = useState(defaultSurveyForm);
  const [environmentalForm, setEnvironmentalForm] = useState(defaultEnvironmentalForm);
  const [noticeForm, setNoticeForm] = useState(defaultNoticeForm);
  const [landUseForm, setLandUseForm] = useState(defaultLandUseForm);
  const [selectedNoticeId, setSelectedNoticeId] = useState<string>('');
  const [objectionName, setObjectionName] = useState('Community Association');
  const [objectionContact, setObjectionContact] = useState('community@example.com');
  const [objectionDetails, setObjectionDetails] = useState('Request review of circulation plan and site access.');
  const [surveyCompareA, setSurveyCompareA] = useState<string>('');
  const [surveyCompareB, setSurveyCompareB] = useState<string>('');

  if (user?.role !== 'admin') {
    return <div className="container py-8 text-sm text-muted-foreground">Administrator access is required for civic compliance operations.</div>;
  }

  const surveysQuery = trpc.phase4.getAllCadastralSurveys.useQuery();
  const environmentalQuery = trpc.phase4.getAllEnvironmentalAssessments.useQuery();
  const noticesQuery = trpc.phase4.getAllPublicNotices.useQuery();
  const landUseQuery = trpc.phase4.getAllLandUsePlans.useQuery();

  const createSurvey = trpc.phase4.createCadastralSurvey.useMutation({ onSuccess: async () => { toast.success('Cadastral survey workflow created'); await surveysQuery.refetch(); }, onError: (e) => toast.error(e.message || 'Unable to create survey workflow') });
  const createEnvironmental = trpc.phase4.createEnvironmentalAssessment.useMutation({ onSuccess: async () => { toast.success('Environmental workflow created'); await environmentalQuery.refetch(); }, onError: (e) => toast.error(e.message || 'Unable to create environmental workflow') });
  const createNotice = trpc.phase4.createPublicNotice.useMutation({ onSuccess: async () => { toast.success('Public notice workflow created'); await noticesQuery.refetch(); }, onError: (e) => toast.error(e.message || 'Unable to create public notice workflow') });
  const addObjection = trpc.phase4.addPublicNoticeObjection.useMutation({ onSuccess: async () => { toast.success('Objection filed'); await noticesQuery.refetch(); }, onError: (e) => toast.error(e.message || 'Unable to file objection') });
  const createLandUse = trpc.phase4.createLandUsePlan.useMutation({ onSuccess: async () => { toast.success('Land-use workflow created'); await landUseQuery.refetch(); }, onError: (e) => toast.error(e.message || 'Unable to create land-use workflow') });

  const projectedCoordinates = useMemo(() => {
    const first = surveyForm.coordinates.split(';')[0]?.split(',').map((v) => Number(v.trim()));
    if (!first || first.length < 2 || Number.isNaN(first[0]) || Number.isNaN(first[1])) return null;
    const [lat, lng] = first;
    return {
      easting: Math.round((lng + 180) * 500),
      northing: Math.round((lat + 90) * 1000),
    };
  }, [surveyForm.coordinates]);

  const surveyA = (surveysQuery.data || []).find((item: any) => item.surveyId === surveyCompareA);
  const surveyB = (surveysQuery.data || []).find((item: any) => item.surveyId === surveyCompareB);

  const carbonFootprint = useMemo(() => {
    const base = environmentalForm.estimatedAnnualEmissions;
    const multiplier = environmentalForm.protectedAreaType !== 'none' ? 1.15 : 1;
    return (base * multiplier).toFixed(2);
  }, [environmentalForm.estimatedAnnualEmissions, environmentalForm.protectedAreaType]);

  const noticeArchive = useMemo(() => (noticesQuery.data || []).filter((item: any) => ['completed', 'cancelled'].includes(item.status)), [noticesQuery.data]);
  const coverageRatio = useMemo(() => ((landUseForm.buildingFootprint / Math.max(landUseForm.lotArea, 1)) * 100).toFixed(1), [landUseForm.buildingFootprint, landUseForm.lotArea]);
  const landUseCompliant = Number(coverageRatio) <= 45 && landUseForm.setback >= 6;

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Civic Compliance Center</h1>
        <p className="text-muted-foreground mt-2">Operate cadastral survey, environmental clearance, public notice, and land-use planning workflows from one compliance workspace.</p>
      </div>

      <Tabs defaultValue="survey" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[920px]">
          <TabsTrigger value="survey"><Compass className="mr-2 h-4 w-4" />Survey</TabsTrigger>
          <TabsTrigger value="environmental"><Leaf className="mr-2 h-4 w-4" />Environmental</TabsTrigger>
          <TabsTrigger value="notice"><Megaphone className="mr-2 h-4 w-4" />Public Notice</TabsTrigger>
          <TabsTrigger value="landuse"><Building2 className="mr-2 h-4 w-4" />Land Use</TabsTrigger>
        </TabsList>

        <TabsContent value="survey">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Cadastral survey workflow</CardTitle><CardDescription>Create survey submissions, verify licenses, and capture measurement metadata.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Transaction ID</Label><Input value={surveyForm.transactionId} onChange={(e) => setSurveyForm((c) => ({ ...c, transactionId: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={surveyForm.parcelId} onChange={(e) => setSurveyForm((c) => ({ ...c, parcelId: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Survey plan number</Label><Input value={surveyForm.surveyPlanNumber} onChange={(e) => setSurveyForm((c) => ({ ...c, surveyPlanNumber: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Survey date</Label><Input type="date" value={surveyForm.surveyDate} onChange={(e) => setSurveyForm((c) => ({ ...c, surveyDate: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Surveyor name</Label><Input value={surveyForm.surveyorName} onChange={(e) => setSurveyForm((c) => ({ ...c, surveyorName: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Certification / license</Label><Input value={surveyForm.surveyorLicenseNumber} onChange={(e) => setSurveyForm((c) => ({ ...c, surveyorLicenseNumber: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Survey firm</Label><Input value={surveyForm.surveyFirm} onChange={(e) => setSurveyForm((c) => ({ ...c, surveyFirm: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Area (m²)</Label><Input type="number" value={surveyForm.area} onChange={(e) => setSurveyForm((c) => ({ ...c, area: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Perimeter (m)</Label><Input type="number" value={surveyForm.perimeter} onChange={(e) => setSurveyForm((c) => ({ ...c, perimeter: Number(e.target.value) }))} /></div>
                </div>
                <div className="space-y-2"><Label>Boundary coordinates</Label><Textarea rows={4} value={surveyForm.coordinates} onChange={(e) => setSurveyForm((c) => ({ ...c, coordinates: e.target.value }))} /></div>
                <Button onClick={() => createSurvey.mutate({
                  transactionId: surveyForm.transactionId,
                  parcelId: surveyForm.parcelId,
                  surveyPlanNumber: surveyForm.surveyPlanNumber,
                  surveyDate: new Date(surveyForm.surveyDate),
                  surveyorName: surveyForm.surveyorName,
                  surveyorLicenseNumber: surveyForm.surveyorLicenseNumber,
                  surveyFirm: surveyForm.surveyFirm,
                  coordinates: surveyForm.coordinates,
                  area: surveyForm.area,
                  perimeter: surveyForm.perimeter,
                })} disabled={createSurvey.isPending}>Create Survey Workflow</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Verification, transformation, and comparison</CardTitle><CardDescription>Operational tools for survey verification, coordinate transformation, measurement review, and survey comparison.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4 text-sm">
                  <p className="font-medium mb-2">Coordinate transformation preview</p>
                  {projectedCoordinates ? <p className="text-muted-foreground">Projected easting {projectedCoordinates.easting} / northing {projectedCoordinates.northing}</p> : <p className="text-muted-foreground">Enter valid coordinates to preview transformation.</p>}
                </div>
                <div className="rounded-lg border p-4 text-sm">
                  <p className="font-medium mb-2">Survey plan viewer with measurements</p>
                  <p className="text-muted-foreground">Area: {surveyForm.area.toLocaleString()} m² • Perimeter: {surveyForm.perimeter.toLocaleString()} m • Surveyor certificate: {surveyForm.surveyorLicenseNumber}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Compare survey A</Label><Select value={surveyCompareA} onValueChange={setSurveyCompareA}><SelectTrigger><SelectValue placeholder="Select survey" /></SelectTrigger><SelectContent>{(surveysQuery.data || []).map((item: any) => <SelectItem key={item.surveyId} value={item.surveyId}>{item.surveyId}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Compare survey B</Label><Select value={surveyCompareB} onValueChange={setSurveyCompareB}><SelectTrigger><SelectValue placeholder="Select survey" /></SelectTrigger><SelectContent>{(surveysQuery.data || []).map((item: any) => <SelectItem key={item.surveyId} value={item.surveyId}>{item.surveyId}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  {surveyA && surveyB
                    ? (() => {
                        const surveyAArea = Number((surveyA as any).surveyedArea ?? (surveyA as any).area ?? 0);
                        const surveyBArea = Number((surveyB as any).surveyedArea ?? (surveyB as any).area ?? 0);
                        const surveyAMethod = String((surveyA as any).surveyMethod ?? (surveyA as any).surveyFirm ?? 'Recorded workflow');
                        const surveyBMethod = String((surveyB as any).surveyMethod ?? (surveyB as any).surveyFirm ?? 'Recorded workflow');
                        return `Area delta: ${Math.abs(surveyAArea - surveyBArea).toLocaleString()} m² • Methods: ${surveyAMethod} vs ${surveyBMethod}`;
                      })()
                    : 'Select two surveys to compare verification and measurement differences.'}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="environmental">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Environmental clearance workflow</CardTitle><CardDescription>Create EIA reviews with agency, clearance, compliance, protected-area, and risk metadata.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={environmentalForm.parcelId} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, parcelId: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Assessment type</Label><Input value={environmentalForm.assessmentType} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, assessmentType: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Agency / assessor</Label><Input value={environmentalForm.assessorName} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, assessorName: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>License</Label><Input value={environmentalForm.assessorLicense} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, assessorLicense: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Soil quality</Label><Input value={environmentalForm.soilQuality} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, soilQuality: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Flood risk</Label><Input value={environmentalForm.floodRisk} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, floodRisk: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Erosion risk</Label><Input value={environmentalForm.erosionRisk} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, erosionRisk: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Protected area overlay</Label><Input value={environmentalForm.protectedAreaType} onChange={(e) => setEnvironmentalForm((c) => ({ ...c, protectedAreaType: e.target.value }))} /></div>
                </div>
                <Button onClick={() => createEnvironmental.mutate({
                  transactionId: environmentalForm.transactionId,
                  parcelId: environmentalForm.parcelId,
                  assessmentType: environmentalForm.assessmentType,
                  assessorName: environmentalForm.assessorName,
                  assessorLicense: environmentalForm.assessorLicense,
                  assessorFirm: environmentalForm.assessorFirm,
                  soilQuality: environmentalForm.soilQuality,
                  waterQuality: environmentalForm.waterQuality,
                  airQuality: environmentalForm.airQuality,
                  floodRisk: environmentalForm.floodRisk,
                  erosionRisk: environmentalForm.erosionRisk,
                  contaminationLevel: environmentalForm.contaminationLevel,
                  isProtectedArea: environmentalForm.protectedAreaType !== 'none',
                  protectedAreaType: environmentalForm.protectedAreaType,
                  reportUrl: 'generated://environmental/report',
                })} disabled={createEnvironmental.isPending}>Create Environmental Workflow</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Environmental risk and carbon tools</CardTitle><CardDescription>Protected-area overlay, compliance tracking, risk classification, and carbon-footprint estimation.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Protected-area overlay: <strong>{environmentalForm.protectedAreaType}</strong> • Compliance posture: <strong>{environmentalForm.floodRisk === 'low' && environmentalForm.erosionRisk === 'low' ? 'Low risk' : 'Needs mitigation'}</strong>
                </div>
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Carbon footprint estimate: <strong>{carbonFootprint} tCO₂e/year</strong>
                </div>
                <div className="space-y-3">
                  {(environmentalQuery.data || []).map((item: any) => (
                    <div key={item.assessmentId} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between"><div><p className="font-medium">{item.assessmentId}</p><p className="text-sm text-muted-foreground">{item.assessorName} • {item.assessmentType}</p></div><Badge variant="outline">{item.status}</Badge></div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notice">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Public notice publication workflow</CardTitle><CardDescription>Create newspaper-linked notice publication, objection intake, hearing scheduling, period tracking, and archival workflow entries.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Notice title</Label><Input value={noticeForm.noticeTitle} onChange={(e) => setNoticeForm((c) => ({ ...c, noticeTitle: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Newspaper</Label><Input value={noticeForm.newspaperName} onChange={(e) => setNoticeForm((c) => ({ ...c, newspaperName: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Edition / publication reference</Label><Input value={noticeForm.newspaperEdition} onChange={(e) => setNoticeForm((c) => ({ ...c, newspaperEdition: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Hearing date</Label><Input type="date" value={noticeForm.hearingDate} onChange={(e) => setNoticeForm((c) => ({ ...c, hearingDate: e.target.value }))} /></div>
                </div>
                <div className="space-y-2"><Label>Notice content</Label><Textarea rows={4} value={noticeForm.noticeContent} onChange={(e) => setNoticeForm((c) => ({ ...c, noticeContent: e.target.value }))} /></div>
                <Button onClick={() => createNotice.mutate({
                  transactionId: noticeForm.transactionId,
                  parcelId: noticeForm.parcelId,
                  noticeType: noticeForm.noticeType,
                  noticeTitle: `${noticeForm.noticeTitle} (Hearing ${noticeForm.hearingDate})`,
                  noticeContent: noticeForm.noticeContent,
                  publicationDate: new Date(),
                  publicationPeriodDays: noticeForm.publicationPeriodDays,
                  expiryDate: new Date(Date.now() + noticeForm.publicationPeriodDays * 24 * 60 * 60 * 1000),
                  newspaperName: noticeForm.newspaperName,
                  newspaperEdition: noticeForm.newspaperEdition,
                  publicationUrl: 'generated://public-notice/archive-entry',
                })} disabled={createNotice.isPending}>Create Notice Workflow</Button>

                <div className="rounded-lg border p-4 space-y-3">
                  <p className="font-medium">Objection filing</p>
                  <Select value={selectedNoticeId} onValueChange={setSelectedNoticeId}><SelectTrigger><SelectValue placeholder="Select notice" /></SelectTrigger><SelectContent>{(noticesQuery.data || []).map((item: any) => <SelectItem key={item.noticeId} value={item.noticeId}>{item.noticeId}</SelectItem>)}</SelectContent></Select>
                  <Input value={objectionName} onChange={(e) => setObjectionName(e.target.value)} placeholder="Objector name" />
                  <Input value={objectionContact} onChange={(e) => setObjectionContact(e.target.value)} placeholder="Objector contact" />
                  <Textarea rows={3} value={objectionDetails} onChange={(e) => setObjectionDetails(e.target.value)} />
                  <Button variant="outline" onClick={() => addObjection.mutate({ noticeId: selectedNoticeId, objectorName: objectionName, objectorContact: objectionContact, objectionDetails })} disabled={!selectedNoticeId || addObjection.isPending}>File Objection</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Notice period tracking and archive</CardTitle><CardDescription>Publication workflow status, archive visibility, and objection-review monitoring.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {(noticesQuery.data || []).map((item: any) => (
                    <div key={item.noticeId} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.noticeId}</p><p className="text-sm text-muted-foreground">{item.noticeType} • {item.publicationName || item.newspaperName || 'Publication workflow'}</p></div><Badge variant="outline">{item.status}</Badge></div></div>
                  ))}
                </div>
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Archived notices: <strong>{noticeArchive.length}</strong>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="landuse">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Land-use planning workflow</CardTitle><CardDescription>Create planning-department workflow entries with zoning, permit, approval, and restriction metadata.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Current land use</Label><Input value={landUseForm.currentLandUse} onChange={(e) => setLandUseForm((c) => ({ ...c, currentLandUse: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Proposed land use</Label><Input value={landUseForm.proposedLandUse} onChange={(e) => setLandUseForm((c) => ({ ...c, proposedLandUse: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Zoning classification</Label><Input value={landUseForm.zoningClassification} onChange={(e) => setLandUseForm((c) => ({ ...c, zoningClassification: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Development type</Label><Input value={landUseForm.developmentType} onChange={(e) => setLandUseForm((c) => ({ ...c, developmentType: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Planning authority</Label><Input value={landUseForm.planningAuthority} onChange={(e) => setLandUseForm((c) => ({ ...c, planningAuthority: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Planning officer</Label><Input value={landUseForm.planningOfficer} onChange={(e) => setLandUseForm((c) => ({ ...c, planningOfficer: e.target.value }))} /></div>
                </div>
                <div className="space-y-2"><Label>Compliance notes</Label><Textarea rows={3} value={landUseForm.complianceNotes} onChange={(e) => setLandUseForm((c) => ({ ...c, complianceNotes: e.target.value }))} /></div>
                <div className="space-y-2"><Label>Restrictions / master-plan notes</Label><Textarea rows={3} value={landUseForm.restrictions} onChange={(e) => setLandUseForm((c) => ({ ...c, restrictions: e.target.value }))} /></div>
                <Button onClick={() => createLandUse.mutate({
                  transactionId: landUseForm.transactionId,
                  parcelId: landUseForm.parcelId,
                  currentLandUse: landUseForm.currentLandUse,
                  proposedLandUse: landUseForm.proposedLandUse,
                  zoningClassification: landUseForm.zoningClassification,
                  developmentType: landUseForm.developmentType,
                  planningAuthority: landUseForm.planningAuthority,
                  planningOfficer: landUseForm.planningOfficer,
                  planningOfficerContact: landUseForm.planningOfficerContact,
                  complianceNotes: landUseForm.complianceNotes,
                  restrictions: landUseForm.restrictions,
                  applicationUrl: 'generated://planning/master-plan-overlay',
                })} disabled={createLandUse.isPending}>Create Land-Use Workflow</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Zoning database and compliance tools</CardTitle><CardDescription>Evaluate zoning compliance, setback and coverage, permit readiness, and master-plan overlay notes.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2"><Label>Lot area</Label><Input type="number" value={landUseForm.lotArea} onChange={(e) => setLandUseForm((c) => ({ ...c, lotArea: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Building footprint</Label><Input type="number" value={landUseForm.buildingFootprint} onChange={(e) => setLandUseForm((c) => ({ ...c, buildingFootprint: Number(e.target.value) }))} /></div>
                  <div className="space-y-2"><Label>Setback (m)</Label><Input type="number" value={landUseForm.setback} onChange={(e) => setLandUseForm((c) => ({ ...c, setback: Number(e.target.value) }))} /></div>
                </div>
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Coverage ratio: <strong>{coverageRatio}%</strong> • Setback: <strong>{landUseForm.setback}m</strong> • Compliance checker: <strong>{landUseCompliant ? 'Compliant' : 'Needs planning review'}</strong>
                </div>
                <div className="space-y-3">
                  {(landUseQuery.data || []).map((item: any) => (
                    <div key={item.planId} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.planId}</p><p className="text-sm text-muted-foreground">{item.currentZoning || item.currentLandUse} → {item.proposedUse || item.proposedLandUse}</p></div><Badge variant="outline">{item.status}</Badge></div></div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
