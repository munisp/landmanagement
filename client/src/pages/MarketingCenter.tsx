import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Mail, MessageSquare, BellRing, BarChart3 } from 'lucide-react';

type CampaignFormState = {
  name: string;
  channel: 'email' | 'sms' | 'push';
  audience: string;
  scheduledFor: string;
  message: string;
};

type LandingPageFormState = {
  name: string;
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  variant: 'A' | 'B';
};

type ExperimentFormState = {
  name: string;
  hypothesis: string;
  variantA: string;
  variantB: string;
};

const defaultCampaignForm: CampaignFormState = {
  name: '',
  channel: 'email',
  audience: '',
  scheduledFor: new Date().toISOString().slice(0, 16),
  message: '',
};

const defaultLandingPageForm: LandingPageFormState = {
  name: '',
  slug: '',
  headline: '',
  body: '',
  ctaLabel: '',
  variant: 'A',
};

const defaultExperimentForm: ExperimentFormState = {
  name: '',
  hypothesis: '',
  variantA: '',
  variantB: '',
};

export default function MarketingCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.marketing.overview.useQuery();
  const [campaignForm, setCampaignForm] = useState(defaultCampaignForm);
  const [landingPageForm, setLandingPageForm] = useState(defaultLandingPageForm);
  const [experimentForm, setExperimentForm] = useState(defaultExperimentForm);

  const createCampaign = trpc.marketing.createCampaign.useMutation({
    onSuccess: async () => {
      await utils.marketing.overview.invalidate();
      toast.success('Marketing campaign created');
      setCampaignForm(defaultCampaignForm);
    },
    onError: (error) => toast.error(error.message || 'Failed to create campaign'),
  });

  const updateCampaignStatus = trpc.marketing.updateCampaignStatus.useMutation({
    onSuccess: async () => {
      await utils.marketing.overview.invalidate();
      toast.success('Campaign status updated');
    },
    onError: (error) => toast.error(error.message || 'Failed to update campaign status'),
  });

  const createLandingPage = trpc.marketing.createLandingPage.useMutation({
    onSuccess: async () => {
      await utils.marketing.overview.invalidate();
      toast.success('Landing page created');
      setLandingPageForm(defaultLandingPageForm);
    },
    onError: (error) => toast.error(error.message || 'Failed to create landing page'),
  });

  const createExperiment = trpc.marketing.createExperiment.useMutation({
    onSuccess: async () => {
      await utils.marketing.overview.invalidate();
      toast.success('A/B experiment started');
      setExperimentForm(defaultExperimentForm);
    },
    onError: (error) => toast.error(error.message || 'Failed to create experiment'),
  });

  if (isLoading) {
    return <div className="container mx-auto py-8 text-sm text-muted-foreground">Loading marketing center...</div>;
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Marketing Center</h1>
        <p className="mt-2 text-muted-foreground">
          Coordinate email, SMS, and push campaigns, manage landing pages, run A/B experiments, and review marketing analytics from one workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Campaigns</p><p className="mt-2 text-2xl font-semibold">{data?.totals?.campaigns ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Active campaigns</p><p className="mt-2 text-2xl font-semibold">{data?.totals?.activeCampaigns ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Landing pages</p><p className="mt-2 text-2xl font-semibold">{data?.totals?.landingPages ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Experiments</p><p className="mt-2 text-2xl font-semibold">{data?.totals?.experiments ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="campaigns" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-[560px]">
          <TabsTrigger value="campaigns"><Mail className="mr-2 h-4 w-4" />Campaigns</TabsTrigger>
          <TabsTrigger value="landing-pages"><MessageSquare className="mr-2 h-4 w-4" />Landing Pages</TabsTrigger>
          <TabsTrigger value="experiments"><BarChart3 className="mr-2 h-4 w-4" />A/B Testing</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Create campaign</CardTitle>
                <CardDescription>Schedule email, SMS, or push outreach for a specific audience segment.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="campaign-name">Campaign name</Label><Input id="campaign-name" value={campaignForm.name} onChange={(e) => setCampaignForm((current) => ({ ...current, name: e.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={campaignForm.channel} onValueChange={(value: CampaignFormState['channel']) => setCampaignForm((current) => ({ ...current, channel: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="push">Push</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label htmlFor="campaign-audience">Audience</Label><Input id="campaign-audience" value={campaignForm.audience} onChange={(e) => setCampaignForm((current) => ({ ...current, audience: e.target.value }))} /></div>
                </div>
                <div className="space-y-2"><Label htmlFor="campaign-scheduled">Scheduled for</Label><Input id="campaign-scheduled" type="datetime-local" value={campaignForm.scheduledFor} onChange={(e) => setCampaignForm((current) => ({ ...current, scheduledFor: e.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="campaign-message">Message</Label><Textarea id="campaign-message" value={campaignForm.message} onChange={(e) => setCampaignForm((current) => ({ ...current, message: e.target.value }))} rows={5} /></div>
                <Button onClick={() => createCampaign.mutate(campaignForm)} disabled={createCampaign.isPending}>{createCampaign.isPending ? 'Saving...' : 'Create Campaign'}</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Campaign queue</CardTitle>
                <CardDescription>Current multi-channel campaign schedule and execution state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.campaigns || []).map((campaign: any) => (
                  <div key={campaign.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-muted-foreground">Audience: {campaign.audience}</p>
                      </div>
                      <Badge variant="outline">{campaign.channel}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{campaign.message}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Badge variant="outline">{campaign.status}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(campaign.scheduledFor).toLocaleString()}</span>
                      <Select value={campaign.status} onValueChange={(value: any) => updateCampaignStatus.mutate({ campaignId: campaign.id, status: value })}>
                        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-4 mt-6">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Audience reach</p><p className="mt-2 text-2xl font-semibold">{data?.analytics?.audienceReach ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Conversions</p><p className="mt-2 text-2xl font-semibold">{data?.analytics?.conversions ?? 0}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Conversion rate</p><p className="mt-2 text-2xl font-semibold">{data?.analytics?.conversionRate ?? 0}%</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Top channel</p><p className="mt-2 text-2xl font-semibold capitalize">{data?.analytics?.topChannel ?? 'email'}</p></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="landing-pages">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Landing page builder</CardTitle>
                <CardDescription>Create structured landing-page variants for outreach and conversion experiments.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="lp-name">Page name</Label><Input id="lp-name" value={landingPageForm.name} onChange={(e) => setLandingPageForm((current) => ({ ...current, name: e.target.value }))} /></div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="lp-slug">Slug</Label><Input id="lp-slug" value={landingPageForm.slug} onChange={(e) => setLandingPageForm((current) => ({ ...current, slug: e.target.value }))} /></div>
                  <div className="space-y-2">
                    <Label>Variant</Label>
                    <Select value={landingPageForm.variant} onValueChange={(value: LandingPageFormState['variant']) => setLandingPageForm((current) => ({ ...current, variant: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Variant A</SelectItem>
                        <SelectItem value="B">Variant B</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label htmlFor="lp-headline">Headline</Label><Input id="lp-headline" value={landingPageForm.headline} onChange={(e) => setLandingPageForm((current) => ({ ...current, headline: e.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="lp-body">Body</Label><Textarea id="lp-body" value={landingPageForm.body} onChange={(e) => setLandingPageForm((current) => ({ ...current, body: e.target.value }))} rows={5} /></div>
                <div className="space-y-2"><Label htmlFor="lp-cta">CTA label</Label><Input id="lp-cta" value={landingPageForm.ctaLabel} onChange={(e) => setLandingPageForm((current) => ({ ...current, ctaLabel: e.target.value }))} /></div>
                <Button onClick={() => createLandingPage.mutate(landingPageForm)} disabled={createLandingPage.isPending}>Create Landing Page</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Landing-page library</CardTitle>
                <CardDescription>Current campaign entry experiences and experimental variants.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.landingPages || []).map((page: any) => (
                  <div key={page.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{page.name}</p>
                        <p className="text-sm text-muted-foreground">/{page.slug}</p>
                      </div>
                      <Badge variant="outline">Variant {page.variant}</Badge>
                    </div>
                    <p className="mt-3 font-medium">{page.headline}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{page.body}</p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"><BellRing className="h-4 w-4" />{page.ctaLabel}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="experiments">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>A/B testing framework</CardTitle>
                <CardDescription>Define a hypothesis and compare message or CTA variants in a structured experiment workflow.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label htmlFor="exp-name">Experiment name</Label><Input id="exp-name" value={experimentForm.name} onChange={(e) => setExperimentForm((current) => ({ ...current, name: e.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="exp-hypothesis">Hypothesis</Label><Textarea id="exp-hypothesis" value={experimentForm.hypothesis} onChange={(e) => setExperimentForm((current) => ({ ...current, hypothesis: e.target.value }))} rows={3} /></div>
                <div className="space-y-2"><Label htmlFor="exp-a">Variant A</Label><Input id="exp-a" value={experimentForm.variantA} onChange={(e) => setExperimentForm((current) => ({ ...current, variantA: e.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="exp-b">Variant B</Label><Input id="exp-b" value={experimentForm.variantB} onChange={(e) => setExperimentForm((current) => ({ ...current, variantB: e.target.value }))} /></div>
                <Button onClick={() => createExperiment.mutate(experimentForm)} disabled={createExperiment.isPending}>Start Experiment</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Experiment results</CardTitle>
                <CardDescription>Track conversion outcomes across active and completed A/B tests.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.experiments || []).map((experiment: any) => (
                  <div key={experiment.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{experiment.name}</p>
                        <p className="text-sm text-muted-foreground">{experiment.hypothesis}</p>
                      </div>
                      <Badge variant="outline">{experiment.status}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg border p-3">
                        <p className="text-sm font-medium">Variant A</p>
                        <p className="text-sm text-muted-foreground">{experiment.variantA}</p>
                        <p className="mt-2 text-sm">Conversion: {(experiment.conversionRateA * 100).toFixed(1)}%</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-sm font-medium">Variant B</p>
                        <p className="text-sm text-muted-foreground">{experiment.variantB}</p>
                        <p className="mt-2 text-sm">Conversion: {(experiment.conversionRateB * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="mt-3"><Badge variant={experiment.winner === 'B' ? 'default' : 'outline'}>Winner: {experiment.winner}</Badge></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
