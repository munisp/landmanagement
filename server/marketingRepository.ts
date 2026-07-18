import { readJsonStore, writeJsonStore } from './jsonStore';

export type MarketingChannel = 'email' | 'sms' | 'push';
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'completed';

export interface MarketingCampaignRecord {
  id: number;
  name: string;
  channel: MarketingChannel;
  audience: string;
  status: CampaignStatus;
  scheduledFor: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface LandingPageRecord {
  id: number;
  name: string;
  slug: string;
  headline: string;
  body: string;
  ctaLabel: string;
  variant: 'A' | 'B';
  updatedAt: string;
}

export interface ExperimentRecord {
  id: number;
  name: string;
  hypothesis: string;
  status: 'draft' | 'running' | 'completed';
  variantA: string;
  variantB: string;
  winner: 'A' | 'B' | 'inconclusive';
  conversionRateA: number;
  conversionRateB: number;
  updatedAt: string;
}

interface MarketingStore {
  nextCampaignId: number;
  nextLandingPageId: number;
  nextExperimentId: number;
  campaigns: MarketingCampaignRecord[];
  landingPages: LandingPageRecord[];
  experiments: ExperimentRecord[];
}


function defaultStore(): MarketingStore {
  return {
    nextCampaignId: 4,
    nextLandingPageId: 3,
    nextExperimentId: 3,
    campaigns: [
      {
        id: 1,
        name: 'Registry onboarding email wave',
        channel: 'email',
        audience: 'new_applicants',
        status: 'active',
        scheduledFor: '2026-07-18T09:00:00.000Z',
        message: 'Complete parcel onboarding with guided verification and support links.',
        createdAt: '2026-07-17T08:00:00.000Z',
        updatedAt: '2026-07-17T08:30:00.000Z',
      },
      {
        id: 2,
        name: 'Mortgage reminder SMS',
        channel: 'sms',
        audience: 'borrowers_pending_docs',
        status: 'scheduled',
        scheduledFor: '2026-07-18T11:00:00.000Z',
        message: 'Please complete your outstanding mortgage documents to continue underwriting.',
        createdAt: '2026-07-17T09:00:00.000Z',
        updatedAt: '2026-07-17T09:10:00.000Z',
      },
      {
        id: 3,
        name: 'Support portal push campaign',
        channel: 'push',
        audience: 'active_users',
        status: 'draft',
        scheduledFor: '2026-07-19T10:00:00.000Z',
        message: 'Explore the new support and privacy workspaces from your account dashboard.',
        createdAt: '2026-07-17T09:20:00.000Z',
        updatedAt: '2026-07-17T09:20:00.000Z',
      },
    ],
    landingPages: [
      {
        id: 1,
        name: 'Registry self-service launch',
        slug: 'registry-self-service',
        headline: 'Start secure land-registry transactions online',
        body: 'Guide applicants through parcel search, verification, payment, and support workflows from one trusted platform.',
        ctaLabel: 'Start application',
        variant: 'A',
        updatedAt: '2026-07-17T08:45:00.000Z',
      },
      {
        id: 2,
        name: 'Mortgage onboarding variant',
        slug: 'mortgage-onboarding',
        headline: 'Accelerate mortgage submissions with document-driven prefill',
        body: 'Reduce manual entry, surface validation checks early, and move borrowers faster into underwriting.',
        ctaLabel: 'Apply for mortgage',
        variant: 'B',
        updatedAt: '2026-07-17T08:50:00.000Z',
      },
    ],
    experiments: [
      {
        id: 1,
        name: 'Mortgage CTA wording test',
        hypothesis: 'Direct benefit language increases borrower conversion.',
        status: 'running',
        variantA: 'Apply for mortgage',
        variantB: 'Get prefilled mortgage started',
        winner: 'inconclusive',
        conversionRateA: 0.18,
        conversionRateB: 0.22,
        updatedAt: '2026-07-17T09:00:00.000Z',
      },
      {
        id: 2,
        name: 'Support CTA placement experiment',
        hypothesis: 'Earlier access to support reduces abandonment.',
        status: 'completed',
        variantA: 'Footer support link',
        variantB: 'Primary navigation support link',
        winner: 'B',
        conversionRateA: 0.11,
        conversionRateB: 0.19,
        updatedAt: '2026-07-17T09:05:00.000Z',
      },
    ],
  };
}

async function loadStore(): Promise<MarketingStore> {
  return readJsonStore<MarketingStore>('marketing-store', defaultStore);
}

async function saveStore(store: MarketingStore) {
  await writeJsonStore('marketing-store', store);
}

export async function getMarketingOverview() {
  const store = await loadStore();
  const totals = {
    campaigns: store.campaigns.length,
    activeCampaigns: store.campaigns.filter((item) => item.status === 'active').length,
    landingPages: store.landingPages.length,
    experiments: store.experiments.length,
  };

  const campaignsByChannel = ['email', 'sms', 'push'].map((channel) => ({
    channel,
    count: store.campaigns.filter((item) => item.channel === channel).length,
  }));

  const analytics = {
    audienceReach: 18420,
    conversions: 1264,
    conversionRate: 6.86,
    topChannel: campaignsByChannel.slice().sort((a, b) => b.count - a.count)[0]?.channel || 'email',
  };

  return {
    totals,
    campaigns: store.campaigns.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    landingPages: store.landingPages.slice().sort((a, b) => a.name.localeCompare(b.name)),
    experiments: store.experiments.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    campaignsByChannel,
    analytics,
  };
}

export async function createCampaign(input: { name: string; channel: MarketingChannel; audience: string; scheduledFor: string; message: string }) {
  const store = await loadStore();
  const now = new Date().toISOString();
  const campaign: MarketingCampaignRecord = {
    id: store.nextCampaignId++,
    name: input.name,
    channel: input.channel,
    audience: input.audience,
    status: 'scheduled',
    scheduledFor: input.scheduledFor,
    message: input.message,
    createdAt: now,
    updatedAt: now,
  };
  store.campaigns.unshift(campaign);
  await saveStore(store);
  return campaign;
}

export async function updateCampaignStatus(input: { campaignId: number; status: CampaignStatus }) {
  const store = await loadStore();
  const campaign = store.campaigns.find((item) => item.id === input.campaignId);
  if (!campaign) {
    throw new Error('Campaign not found');
  }
  campaign.status = input.status;
  campaign.updatedAt = new Date().toISOString();
  await saveStore(store);
  return campaign;
}

export async function createLandingPage(input: { name: string; slug: string; headline: string; body: string; ctaLabel: string; variant: 'A' | 'B' }) {
  const store = await loadStore();
  const page: LandingPageRecord = {
    id: store.nextLandingPageId++,
    name: input.name,
    slug: input.slug,
    headline: input.headline,
    body: input.body,
    ctaLabel: input.ctaLabel,
    variant: input.variant,
    updatedAt: new Date().toISOString(),
  };
  store.landingPages.unshift(page);
  await saveStore(store);
  return page;
}

export async function createExperiment(input: { name: string; hypothesis: string; variantA: string; variantB: string }) {
  const store = await loadStore();
  const experiment: ExperimentRecord = {
    id: store.nextExperimentId++,
    name: input.name,
    hypothesis: input.hypothesis,
    status: 'running',
    variantA: input.variantA,
    variantB: input.variantB,
    winner: 'inconclusive',
    conversionRateA: 0,
    conversionRateB: 0,
    updatedAt: new Date().toISOString(),
  };
  store.experiments.unshift(experiment);
  await saveStore(store);
  return experiment;
}
