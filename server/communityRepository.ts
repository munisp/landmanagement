import fs from 'fs';
import path from 'path';

export interface ForumPostRecord {
  id: number;
  title: string;
  category: string;
  author: string;
  excerpt: string;
  createdAt: string;
}

export interface TownHallRecord {
  id: number;
  title: string;
  scheduledFor: string;
  venue: string;
  status: 'scheduled' | 'completed';
}

export interface FeedbackRecord {
  id: number;
  subject: string;
  submitter: string;
  channel: string;
  status: 'new' | 'reviewed';
  createdAt: string;
}

export interface PollRecord {
  id: number;
  question: string;
  options: string[];
  votes: number[];
  status: 'open' | 'closed';
}

export interface ProposalRecord {
  id: number;
  title: string;
  proposer: string;
  area: string;
  status: 'submitted' | 'reviewed' | 'approved';
}

export interface BudgetRecord {
  id: number;
  initiative: string;
  allocatedAmount: number;
  status: 'draft' | 'voting' | 'approved';
}

export interface CommunityNotificationRecord {
  id: number;
  title: string;
  message: string;
  audience: string;
  createdAt: string;
}

interface CommunityStore {
  nextForumId: number;
  nextTownHallId: number;
  nextFeedbackId: number;
  nextPollId: number;
  nextProposalId: number;
  nextBudgetId: number;
  nextNotificationId: number;
  forumPosts: ForumPostRecord[];
  townHalls: TownHallRecord[];
  feedback: FeedbackRecord[];
  polls: PollRecord[];
  proposals: ProposalRecord[];
  budgets: BudgetRecord[];
  notifications: CommunityNotificationRecord[];
}

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const STORE_PATH = path.join(DATA_DIR, 'community-store.json');

function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function defaultStore(): CommunityStore {
  return {
    nextForumId: 3,
    nextTownHallId: 3,
    nextFeedbackId: 3,
    nextPollId: 3,
    nextProposalId: 3,
    nextBudgetId: 3,
    nextNotificationId: 3,
    forumPosts: [
      { id: 1, title: 'Encroachment concerns near Parcel 1105', category: 'land_dispute', author: 'Residents Association', excerpt: 'Community members are requesting a demarcation review for the adjoining corridor.', createdAt: '2026-07-17T09:00:00.000Z' },
      { id: 2, title: 'Market access road improvement proposal', category: 'infrastructure', author: 'Ward Planning Forum', excerpt: 'Stakeholders propose a phased access-road upgrade tied to land-use approvals.', createdAt: '2026-07-17T09:30:00.000Z' },
    ],
    townHalls: [
      { id: 1, title: 'West Corridor Land Use Hearing', scheduledFor: '2026-07-25T10:00:00.000Z', venue: 'Municipal Hall', status: 'scheduled' },
      { id: 2, title: 'Community Boundary Clarification Session', scheduledFor: '2026-07-18T14:00:00.000Z', venue: 'Ward Office', status: 'scheduled' },
    ],
    feedback: [
      { id: 1, subject: 'Need clearer parcel objection guidance', submitter: 'Amina Bello', channel: 'portal', status: 'new', createdAt: '2026-07-17T10:00:00.000Z' },
      { id: 2, subject: 'Survey visibility in community dashboard', submitter: 'Ward Planning Forum', channel: 'town_hall', status: 'reviewed', createdAt: '2026-07-17T10:15:00.000Z' },
    ],
    polls: [
      { id: 1, question: 'Should the market expansion parcel reserve 20% of area for community parking?', options: ['Yes', 'No'], votes: [42, 11], status: 'open' },
      { id: 2, question: 'Preferred venue for the next land governance session?', options: ['Municipal Hall', 'Ward Office', 'Virtual'], votes: [18, 7, 21], status: 'open' },
    ],
    proposals: [
      { id: 1, title: 'Neighborhood footpath easement proposal', proposer: 'Community Design Group', area: 'Parcel 1107', status: 'submitted' },
      { id: 2, title: 'Public green buffer around school parcel', proposer: 'Education Trust Forum', area: 'Parcel 1120', status: 'reviewed' },
    ],
    budgets: [
      { id: 1, initiative: 'Access road grading and signage', allocatedAmount: 12000000, status: 'voting' },
      { id: 2, initiative: 'Drainage and flood-mitigation works', allocatedAmount: 18500000, status: 'approved' },
    ],
    notifications: [
      { id: 1, title: 'Town hall scheduled', message: 'The West Corridor Land Use Hearing has been scheduled for July 25.', audience: 'all_residents', createdAt: '2026-07-17T10:45:00.000Z' },
      { id: 2, title: 'Poll open for parking allocation', message: 'Residents can vote on the parking reservation proposal through the community portal.', audience: 'ward_7', createdAt: '2026-07-17T11:00:00.000Z' },
    ],
  };
}

function loadStore(): CommunityStore {
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as CommunityStore;
    if (!parsed || !Array.isArray(parsed.forumPosts) || !Array.isArray(parsed.townHalls) || !Array.isArray(parsed.feedback) || !Array.isArray(parsed.polls) || !Array.isArray(parsed.proposals) || !Array.isArray(parsed.budgets) || !Array.isArray(parsed.notifications)) {
      const store = defaultStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
      return store;
    }
    return parsed;
  } catch {
    const store = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    return store;
  }
}

function saveStore(store: CommunityStore) { ensureDataDir(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2)); }

export function getCommunityOverview() {
  const store = loadStore();
  return {
    forumPosts: store.forumPosts,
    townHalls: store.townHalls,
    feedback: store.feedback,
    polls: store.polls,
    proposals: store.proposals,
    budgets: store.budgets,
    notifications: store.notifications,
    metrics: {
      forumTopics: store.forumPosts.length,
      scheduledMeetings: store.townHalls.filter((item) => item.status === 'scheduled').length,
      openPolls: store.polls.filter((item) => item.status === 'open').length,
      activeNotifications: store.notifications.length,
    },
  };
}

export function createForumPost(input: Omit<ForumPostRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: ForumPostRecord = { id: store.nextForumId++, createdAt: new Date().toISOString(), ...input };
  store.forumPosts.unshift(created); saveStore(store); return created;
}

export function createTownHall(input: Omit<TownHallRecord, 'id'>) {
  const store = loadStore();
  const created: TownHallRecord = { id: store.nextTownHallId++, ...input };
  store.townHalls.unshift(created); saveStore(store); return created;
}

export function createFeedback(input: Omit<FeedbackRecord, 'id' | 'createdAt' | 'status'>) {
  const store = loadStore();
  const created: FeedbackRecord = { id: store.nextFeedbackId++, status: 'new', createdAt: new Date().toISOString(), ...input };
  store.feedback.unshift(created); saveStore(store); return created;
}

export function createPoll(input: Omit<PollRecord, 'id' | 'votes' | 'status'>) {
  const store = loadStore();
  const created: PollRecord = { id: store.nextPollId++, votes: input.options.map(() => 0), status: 'open', ...input };
  store.polls.unshift(created); saveStore(store); return created;
}

export function createProposal(input: Omit<ProposalRecord, 'id' | 'status'>) {
  const store = loadStore();
  const created: ProposalRecord = { id: store.nextProposalId++, status: 'submitted', ...input };
  store.proposals.unshift(created); saveStore(store); return created;
}

export function createBudget(input: Omit<BudgetRecord, 'id'>) {
  const store = loadStore();
  const created: BudgetRecord = { id: store.nextBudgetId++, ...input };
  store.budgets.unshift(created); saveStore(store); return created;
}

export function createCommunityNotification(input: Omit<CommunityNotificationRecord, 'id' | 'createdAt'>) {
  const store = loadStore();
  const created: CommunityNotificationRecord = { id: store.nextNotificationId++, createdAt: new Date().toISOString(), ...input };
  store.notifications.unshift(created); saveStore(store); return created;
}
