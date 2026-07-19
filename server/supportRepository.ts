import { readJsonStore, writeJsonStore } from './jsonStore';

export type SupportTicketStatus = 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportChannel = 'portal' | 'live_chat' | 'email';
export type SupportCategory = 'account' | 'payments' | 'registry' | 'technical' | 'compliance';

export interface SupportMessageRecord {
  id: number;
  ticketId: number;
  senderType: 'customer' | 'support';
  senderName: string;
  message: string;
  sentAt: string;
}

export interface SupportTicketRecord {
  id: number;
  subject: string;
  category: SupportCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  channel: SupportChannel;
  customerName: string;
  customerEmail: string;
  assignedTo: string;
  slaHours: number;
  createdAt: string;
  updatedAt: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  tags: string[];
}

export type SupportSentiment = 'positive' | 'neutral' | 'negative';
export type SupportIntent = 'incident_resolution' | 'payment_follow_up' | 'data_request' | 'guidance' | 'account_help';

export interface KnowledgeBaseArticleRecord {
  id: number;
  title: string;
  category: 'getting_started' | 'payments' | 'verification' | 'privacy' | 'registry';
  summary: string;
  content: string;
  updatedAt: string;
}

export interface FaqRecord {
  id: number;
  question: string;
  answer: string;
  category: string;
  updatedAt: string;
}

interface SupportStore {
  nextTicketId: number;
  nextMessageId: number;
  nextArticleId: number;
  nextFaqId: number;
  tickets: SupportTicketRecord[];
  messages: SupportMessageRecord[];
  knowledgeBase: KnowledgeBaseArticleRecord[];
  faqs: FaqRecord[];
}


function defaultStore(): SupportStore {
  return {
    nextTicketId: 4,
    nextMessageId: 7,
    nextArticleId: 4,
    nextFaqId: 4,
    tickets: [
      {
        id: 1,
        subject: 'Unable to view updated title metadata after verification',
        category: 'registry',
        priority: 'high',
        status: 'in_progress',
        channel: 'portal',
        customerName: 'Amina Bello',
        customerEmail: 'amina.bello@example.com',
        assignedTo: 'Registry Support Desk',
        slaHours: 8,
        createdAt: '2026-07-16T08:30:00.000Z',
        updatedAt: '2026-07-16T10:05:00.000Z',
        firstResponseAt: '2026-07-16T09:00:00.000Z',
        tags: ['title', 'verification'],
      },
      {
        id: 2,
        subject: 'Borrower payment portal confirmation not received',
        category: 'payments',
        priority: 'urgent',
        status: 'waiting_on_customer',
        channel: 'live_chat',
        customerName: 'Moses Adeyemi',
        customerEmail: 'moses.adeyemi@example.com',
        assignedTo: 'Payments Support Desk',
        slaHours: 4,
        createdAt: '2026-07-16T11:15:00.000Z',
        updatedAt: '2026-07-16T11:45:00.000Z',
        firstResponseAt: '2026-07-16T11:20:00.000Z',
        tags: ['payment', 'notification'],
      },
      {
        id: 3,
        subject: 'How do I export my privacy data package?',
        category: 'compliance',
        priority: 'medium',
        status: 'resolved',
        channel: 'email',
        customerName: 'Grace Okonkwo',
        customerEmail: 'grace.okonkwo@example.com',
        assignedTo: 'Privacy Operations',
        slaHours: 24,
        createdAt: '2026-07-15T14:00:00.000Z',
        updatedAt: '2026-07-15T18:00:00.000Z',
        firstResponseAt: '2026-07-15T14:30:00.000Z',
        resolvedAt: '2026-07-15T18:00:00.000Z',
        tags: ['privacy', 'export'],
      },
    ],
    messages: [
      { id: 1, ticketId: 1, senderType: 'customer', senderName: 'Amina Bello', message: 'The title record still shows the previous ownership notes after verification approval.', sentAt: '2026-07-16T08:30:00.000Z' },
      { id: 2, ticketId: 1, senderType: 'support', senderName: 'Registry Support Desk', message: 'We are reconciling the registry cache and verification state. We will update you shortly.', sentAt: '2026-07-16T09:00:00.000Z' },
      { id: 3, ticketId: 2, senderType: 'customer', senderName: 'Moses Adeyemi', message: 'I completed payment but did not receive the confirmation message.', sentAt: '2026-07-16T11:15:00.000Z' },
      { id: 4, ticketId: 2, senderType: 'support', senderName: 'Payments Support Desk', message: 'Please confirm the transaction reference so we can trace the delivery log.', sentAt: '2026-07-16T11:20:00.000Z' },
      { id: 5, ticketId: 2, senderType: 'customer', senderName: 'Moses Adeyemi', message: 'Reference is PAY-44710.', sentAt: '2026-07-16T11:45:00.000Z' },
      { id: 6, ticketId: 3, senderType: 'support', senderName: 'Privacy Operations', message: 'Use Settings → Privacy to export personal data or prepare a portable package.', sentAt: '2026-07-15T14:30:00.000Z' },
    ],
    knowledgeBase: [
      {
        id: 1,
        title: 'Submitting a support request from the portal',
        category: 'getting_started',
        summary: 'How to open, monitor, and update support tickets from the platform.',
        content: 'Open the Support Center, create a ticket with the relevant category and priority, then monitor SLA and message updates in the ticket thread.',
        updatedAt: '2026-07-17T09:00:00.000Z',
      },
      {
        id: 2,
        title: 'Troubleshooting borrower payment confirmations',
        category: 'payments',
        summary: 'Steps to reconcile payment references, gateway updates, and portal notifications.',
        content: 'Validate the payment reference, review the transaction timeline, inspect delivery status, and escalate to the payments desk when confirmation remains delayed.',
        updatedAt: '2026-07-17T09:15:00.000Z',
      },
      {
        id: 3,
        title: 'Privacy data export and portability workflow',
        category: 'privacy',
        summary: 'How users can export personal data, generate portability packages, and manage consent.',
        content: 'Use the Settings privacy workspace to export personal data, create CSV portability packages, manage consent, acknowledge policy, and trigger anonymization requests.',
        updatedAt: '2026-07-17T09:30:00.000Z',
      },
    ],
    faqs: [
      {
        id: 1,
        question: 'How quickly should support respond to urgent payment issues?',
        answer: 'Urgent payment issues target a first-response SLA of four hours through the support desk.',
        category: 'payments',
        updatedAt: '2026-07-17T10:00:00.000Z',
      },
      {
        id: 2,
        question: 'Where can I track my open support tickets?',
        answer: 'Use the Support Center to monitor ticket status, assigned team, SLA, and conversation history.',
        category: 'support',
        updatedAt: '2026-07-17T10:00:00.000Z',
      },
      {
        id: 3,
        question: 'How do I request a privacy data export?',
        answer: 'Navigate to Settings, open the Privacy tab, and choose Export Personal Data or Create Portable Package.',
        category: 'privacy',
        updatedAt: '2026-07-17T10:00:00.000Z',
      },
    ],
  };
}

async function loadStore(): Promise<SupportStore> {
  return readJsonStore<SupportStore>('support-store', defaultStore);
}

async function saveStore(store: SupportStore) {
  await writeJsonStore('support-store', store);
}

function deriveTicketText(ticket: SupportTicketRecord, messages: SupportMessageRecord[]) {
  return [ticket.subject, ...messages.map((message) => message.message), ticket.tags.join(' ')].join(' ').toLowerCase();
}

function deriveSentiment(text: string): SupportSentiment {
  const negativeSignals = ['unable', 'not received', 'failed', 'error', 'issue', 'problem', 'delayed', 'discrepancy'];
  const positiveSignals = ['thanks', 'resolved', 'great', 'successful', 'appreciate', 'completed'];

  const negativeScore = negativeSignals.filter((signal) => text.includes(signal)).length;
  const positiveScore = positiveSignals.filter((signal) => text.includes(signal)).length;

  if (negativeScore > positiveScore) return 'negative';
  if (positiveScore > negativeScore) return 'positive';
  return 'neutral';
}

function deriveIntent(ticket: SupportTicketRecord, text: string): SupportIntent {
  if (ticket.category === 'payments' || text.includes('payment') || text.includes('refund') || text.includes('confirmation')) {
    return 'payment_follow_up';
  }
  if (ticket.category === 'compliance' || text.includes('privacy') || text.includes('export') || text.includes('data package')) {
    return 'data_request';
  }
  if (ticket.category === 'account' || text.includes('login') || text.includes('access') || text.includes('password')) {
    return 'account_help';
  }
  if (text.includes('how do i') || text.includes('how can i') || text.includes('guide') || text.includes('help me')) {
    return 'guidance';
  }
  return 'incident_resolution';
}

function computeSlaStatus(ticket: SupportTicketRecord) {
  const deadline = new Date(ticket.createdAt).getTime() + ticket.slaHours * 60 * 60 * 1000;
  const now = Date.now();
  if (ticket.status === 'resolved') {
    return 'met' as const;
  }
  if (deadline < now) {
    return 'breached' as const;
  }
  if (deadline - now < 2 * 60 * 60 * 1000) {
    return 'at_risk' as const;
  }
  return 'on_track' as const;
}

export async function listSupportTickets() {
  const store = await loadStore();
  return store.tickets
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map((ticket) => {
      const messages = store.messages.filter((message) => message.ticketId === ticket.id);
      const ticketText = deriveTicketText(ticket, messages);
      return {
        ...ticket,
        slaStatus: computeSlaStatus(ticket),
        sentiment: deriveSentiment(ticketText),
        detectedIntent: deriveIntent(ticket, ticketText),
        messages,
      };
    });
}

export async function createSupportTicket(input: {
  subject: string;
  category: SupportCategory;
  priority: SupportTicketPriority;
  channel: SupportChannel;
  customerName: string;
  customerEmail: string;
  message: string;
}) {
  const store = await loadStore();
  const now = new Date().toISOString();
  const id = store.nextTicketId++;
  const ticket: SupportTicketRecord = {
    id,
    subject: input.subject,
    category: input.category,
    priority: input.priority,
    status: 'open',
    channel: input.channel,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    assignedTo: input.category === 'payments' ? 'Payments Support Desk' : input.category === 'compliance' ? 'Privacy Operations' : 'Registry Support Desk',
    slaHours: input.priority === 'urgent' ? 4 : input.priority === 'high' ? 8 : input.priority === 'medium' ? 24 : 48,
    createdAt: now,
    updatedAt: now,
    tags: [input.category, input.priority],
  };

  const message: SupportMessageRecord = {
    id: store.nextMessageId++,
    ticketId: id,
    senderType: 'customer',
    senderName: input.customerName,
    message: input.message,
    sentAt: now,
  };

  store.tickets.unshift(ticket);
  store.messages.push(message);
  await saveStore(store);
  return { ...ticket, slaStatus: computeSlaStatus(ticket), messages: [message] };
}

export async function addSupportMessage(input: { ticketId: number; senderType: 'customer' | 'support'; senderName: string; message: string }) {
  const store = await loadStore();
  const ticket = store.tickets.find((item) => item.id === input.ticketId);
  if (!ticket) {
    throw new Error('Support ticket not found');
  }

  const now = new Date().toISOString();
  const message: SupportMessageRecord = {
    id: store.nextMessageId++,
    ticketId: input.ticketId,
    senderType: input.senderType,
    senderName: input.senderName,
    message: input.message,
    sentAt: now,
  };

  if (!ticket.firstResponseAt && input.senderType === 'support') {
    ticket.firstResponseAt = now;
    ticket.status = 'in_progress';
  }
  ticket.updatedAt = now;
  store.messages.push(message);
  await saveStore(store);
  return message;
}

export async function updateSupportTicketStatus(input: { ticketId: number; status: SupportTicketStatus }) {
  const store = await loadStore();
  const ticket = store.tickets.find((item) => item.id === input.ticketId);
  if (!ticket) {
    throw new Error('Support ticket not found');
  }

  ticket.status = input.status;
  ticket.updatedAt = new Date().toISOString();
  if (input.status === 'resolved') {
    ticket.resolvedAt = ticket.updatedAt;
  }
  await saveStore(store);
  return ticket;
}

export async function listKnowledgeBaseArticles() {
  return (await loadStore()).knowledgeBase.slice().sort((a, b) => a.title.localeCompare(b.title));
}

export async function createKnowledgeBaseArticle(input: { title: string; category: KnowledgeBaseArticleRecord['category']; summary: string; content: string }) {
  const store = await loadStore();
  const article: KnowledgeBaseArticleRecord = {
    id: store.nextArticleId++,
    title: input.title,
    category: input.category,
    summary: input.summary,
    content: input.content,
    updatedAt: new Date().toISOString(),
  };
  store.knowledgeBase.unshift(article);
  await saveStore(store);
  return article;
}

export async function listFaqs() {
  return (await loadStore()).faqs.slice().sort((a, b) => a.question.localeCompare(b.question));
}

export async function createFaq(input: { question: string; answer: string; category: string }) {
  const store = await loadStore();
  const faq: FaqRecord = {
    id: store.nextFaqId++,
    question: input.question,
    answer: input.answer,
    category: input.category,
    updatedAt: new Date().toISOString(),
  };
  store.faqs.unshift(faq);
  await saveStore(store);
  return faq;
}

export async function getSupportAnalytics() {
  const tickets = await listSupportTickets();
  const openTickets = tickets.filter((ticket) => ticket.status !== 'resolved').length;
  const resolvedTickets = tickets.filter((ticket) => ticket.status === 'resolved').length;
  const slaBreaches = tickets.filter((ticket) => ticket.slaStatus === 'breached').length;
  const firstResponseSamples = tickets
    .filter((ticket) => ticket.firstResponseAt)
    .map((ticket) => (new Date(ticket.firstResponseAt!).getTime() - new Date(ticket.createdAt).getTime()) / (60 * 60 * 1000));

  const averageFirstResponseHours = firstResponseSamples.length
    ? Number((firstResponseSamples.reduce((sum, value) => sum + value, 0) / firstResponseSamples.length).toFixed(2))
    : 0;

  const byCategory = ['account', 'payments', 'registry', 'technical', 'compliance'].map((category) => ({
    category,
    count: tickets.filter((ticket) => ticket.category === category).length,
  }));

  const bySentiment = ['positive', 'neutral', 'negative'].map((sentiment) => ({
    sentiment,
    count: tickets.filter((ticket: any) => ticket.sentiment === sentiment).length,
  }));

  const byIntent = ['incident_resolution', 'payment_follow_up', 'data_request', 'guidance', 'account_help'].map((intent) => ({
    intent,
    count: tickets.filter((ticket: any) => ticket.detectedIntent === intent).length,
  }));

  return {
    totals: {
      tickets: tickets.length,
      openTickets,
      resolvedTickets,
      slaBreaches,
      averageFirstResponseHours,
    },
    byCategory,
    bySentiment,
    byIntent,
    recentTickets: tickets.slice(0, 5),
  };
}
