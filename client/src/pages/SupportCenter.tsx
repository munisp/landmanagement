import { useMemo, useState } from 'react';
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
import { LifeBuoy, MessageSquare, BookOpen, HelpCircle, Clock } from 'lucide-react';

type TicketFormState = {
  subject: string;
  category: 'account' | 'payments' | 'registry' | 'technical' | 'compliance';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  channel: 'portal' | 'live_chat' | 'email';
  customerName: string;
  customerEmail: string;
  message: string;
};

const defaultTicketForm: TicketFormState = {
  subject: '',
  category: 'technical',
  priority: 'medium',
  channel: 'portal',
  customerName: '',
  customerEmail: '',
  message: '',
};

type KnowledgeBaseFormState = {
  title: string;
  category: 'getting_started' | 'payments' | 'verification' | 'privacy' | 'registry';
  summary: string;
  content: string;
};

const defaultKnowledgeBaseForm: KnowledgeBaseFormState = {
  title: '',
  category: 'getting_started',
  summary: '',
  content: '',
};

type FaqFormState = {
  question: string;
  answer: string;
  category: string;
};

const defaultFaqForm: FaqFormState = {
  question: '',
  answer: '',
  category: 'support',
};

export default function SupportCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.support.overview.useQuery();
  const [ticketForm, setTicketForm] = useState(defaultTicketForm);
  const [knowledgeBaseForm, setKnowledgeBaseForm] = useState(defaultKnowledgeBaseForm);
  const [faqForm, setFaqForm] = useState(defaultFaqForm);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [chatMessage, setChatMessage] = useState('');

  const createTicket = trpc.support.createTicket.useMutation({
    onSuccess: async () => {
      await utils.support.overview.invalidate();
      toast.success('Support ticket created successfully');
      setTicketForm(defaultTicketForm);
    },
    onError: (error) => toast.error(error.message || 'Failed to create support ticket'),
  });

  const addMessage = trpc.support.addMessage.useMutation({
    onSuccess: async () => {
      await utils.support.overview.invalidate();
      toast.success('Support message sent');
      setChatMessage('');
    },
    onError: (error) => toast.error(error.message || 'Failed to send support message'),
  });

  const updateStatus = trpc.support.updateStatus.useMutation({
    onSuccess: async () => {
      await utils.support.overview.invalidate();
      toast.success('Ticket status updated');
    },
    onError: (error) => toast.error(error.message || 'Failed to update ticket status'),
  });

  const createKnowledgeBaseArticle = trpc.support.createKnowledgeBaseArticle.useMutation({
    onSuccess: async () => {
      await utils.support.overview.invalidate();
      toast.success('Knowledge-base article published');
      setKnowledgeBaseForm(defaultKnowledgeBaseForm);
    },
    onError: (error) => toast.error(error.message || 'Failed to publish knowledge-base article'),
  });

  const createFaq = trpc.support.createFaq.useMutation({
    onSuccess: async () => {
      await utils.support.overview.invalidate();
      toast.success('FAQ entry created');
      setFaqForm(defaultFaqForm);
    },
    onError: (error) => toast.error(error.message || 'Failed to create FAQ entry'),
  });

  const selectedTicket = useMemo(() => {
    const tickets = data?.tickets || [];
    return tickets.find((ticket: any) => ticket.id === selectedTicketId) || tickets[0] || null;
  }, [data?.tickets, selectedTicketId]);

  if (isLoading) {
    return <div className="container mx-auto py-8 text-sm text-muted-foreground">Loading support center...</div>;
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Support Center</h1>
        <p className="mt-2 text-muted-foreground">
          Manage helpdesk tickets, live support conversations, knowledge-base articles, FAQs, analytics, and SLA performance from one workspace.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total tickets</p>
            <p className="mt-2 text-2xl font-semibold">{data?.analytics?.totals?.tickets ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Open tickets</p>
            <p className="mt-2 text-2xl font-semibold">{data?.analytics?.totals?.openTickets ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">SLA breaches</p>
            <p className="mt-2 text-2xl font-semibold">{data?.analytics?.totals?.slaBreaches ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Avg. first response</p>
            <p className="mt-2 text-2xl font-semibold">{data?.analytics?.totals?.averageFirstResponseHours ?? 0}h</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tickets" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[720px]">
          <TabsTrigger value="tickets"><LifeBuoy className="mr-2 h-4 w-4" />Tickets</TabsTrigger>
          <TabsTrigger value="chat"><MessageSquare className="mr-2 h-4 w-4" />Live Support</TabsTrigger>
          <TabsTrigger value="knowledge"><BookOpen className="mr-2 h-4 w-4" />Knowledge Base</TabsTrigger>
          <TabsTrigger value="faq"><HelpCircle className="mr-2 h-4 w-4" />FAQ & SLA</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Open a support ticket</CardTitle>
                <CardDescription>Capture operational, payment, compliance, account, or technical issues with SLA-backed routing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ticket-subject">Subject</Label>
                    <Input id="ticket-subject" value={ticketForm.subject} onChange={(e) => setTicketForm((current) => ({ ...current, subject: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-name">Customer name</Label>
                    <Input id="ticket-name" value={ticketForm.customerName} onChange={(e) => setTicketForm((current) => ({ ...current, customerName: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ticket-email">Customer email</Label>
                    <Input id="ticket-email" type="email" value={ticketForm.customerEmail} onChange={(e) => setTicketForm((current) => ({ ...current, customerEmail: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={ticketForm.category} onValueChange={(value: TicketFormState['category']) => setTicketForm((current) => ({ ...current, category: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="account">Account</SelectItem>
                        <SelectItem value="payments">Payments</SelectItem>
                        <SelectItem value="registry">Registry</SelectItem>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="compliance">Compliance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={ticketForm.priority} onValueChange={(value: TicketFormState['priority']) => setTicketForm((current) => ({ ...current, priority: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={ticketForm.channel} onValueChange={(value: TicketFormState['channel']) => setTicketForm((current) => ({ ...current, channel: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portal">Portal</SelectItem>
                        <SelectItem value="live_chat">Live chat</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ticket-message">Issue details</Label>
                  <Textarea id="ticket-message" value={ticketForm.message} onChange={(e) => setTicketForm((current) => ({ ...current, message: e.target.value }))} rows={5} />
                </div>
                <Button onClick={() => createTicket.mutate(ticketForm)} disabled={createTicket.isPending}>
                  {createTicket.isPending ? 'Submitting...' : 'Create Support Ticket'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ticket queue</CardTitle>
                <CardDescription>Current support intake with status, routing, and SLA posture.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.tickets || []).map((ticket: any) => (
                  <button key={ticket.id} className="w-full rounded-lg border p-4 text-left hover:bg-muted/40" onClick={() => setSelectedTicketId(ticket.id)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{ticket.subject}</p>
                        <p className="text-sm text-muted-foreground">{ticket.customerName} • {ticket.assignedTo}</p>
                      </div>
                      <Badge variant={ticket.slaStatus === 'breached' ? 'destructive' : ticket.slaStatus === 'at_risk' ? 'secondary' : 'outline'}>
                        {ticket.slaStatus.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">{ticket.status}</Badge>
                      <Badge variant="outline">{ticket.priority}</Badge>
                      <Badge variant="outline">{ticket.channel.replace('_', ' ')}</Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="chat">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Live support threads</CardTitle>
                <CardDescription>Support conversations linked to tickets for guided issue resolution.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.tickets || []).map((ticket: any) => (
                  <button key={ticket.id} className="w-full rounded-lg border p-4 text-left hover:bg-muted/40" onClick={() => setSelectedTicketId(ticket.id)}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">#{ticket.id} {ticket.subject}</p>
                        <p className="text-sm text-muted-foreground">{ticket.customerName}</p>
                      </div>
                      <Badge variant="outline">{ticket.status}</Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selectedTicket ? `Ticket #${selectedTicket.id} conversation` : 'Conversation'}</CardTitle>
                <CardDescription>Send support follow-ups and adjust ticket state in one workflow.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTicket ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{selectedTicket.priority}</Badge>
                      <Badge variant="outline">{selectedTicket.category}</Badge>
                      <Badge variant="outline">SLA {selectedTicket.slaHours}h</Badge>
                      <Select value={selectedTicket.status} onValueChange={(value) => updateStatus.mutate({ ticketId: selectedTicket.id, status: value as any })}>
                        <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In progress</SelectItem>
                          <SelectItem value="waiting_on_customer">Waiting on customer</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="max-h-[320px] space-y-3 overflow-y-auto rounded-lg border p-4">
                      {selectedTicket.messages.map((message: any) => (
                        <div key={message.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{message.senderName}</p>
                            <p className="text-xs text-muted-foreground">{new Date(message.sentAt).toLocaleString()}</p>
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{message.message}</p>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="chat-message">Reply</Label>
                      <Textarea id="chat-message" value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} rows={4} />
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => addMessage.mutate({ ticketId: selectedTicket.id, senderType: 'customer', senderName: selectedTicket.customerName, message: chatMessage })} disabled={addMessage.isPending || !chatMessage.trim()}>
                        Send as Customer
                      </Button>
                      <Button onClick={() => addMessage.mutate({ ticketId: selectedTicket.id, senderType: 'support', senderName: selectedTicket.assignedTo, message: chatMessage })} disabled={addMessage.isPending || !chatMessage.trim()}>
                        Send as Support
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Select a ticket to review the conversation thread.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="knowledge">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Publish knowledge-base article</CardTitle>
                <CardDescription>Create structured support guidance for repeated operational issues.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kb-title">Title</Label>
                  <Input id="kb-title" value={knowledgeBaseForm.title} onChange={(e) => setKnowledgeBaseForm((current) => ({ ...current, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={knowledgeBaseForm.category} onValueChange={(value: KnowledgeBaseFormState['category']) => setKnowledgeBaseForm((current) => ({ ...current, category: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="getting_started">Getting started</SelectItem>
                      <SelectItem value="payments">Payments</SelectItem>
                      <SelectItem value="verification">Verification</SelectItem>
                      <SelectItem value="privacy">Privacy</SelectItem>
                      <SelectItem value="registry">Registry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-summary">Summary</Label>
                  <Textarea id="kb-summary" value={knowledgeBaseForm.summary} onChange={(e) => setKnowledgeBaseForm((current) => ({ ...current, summary: e.target.value }))} rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-content">Content</Label>
                  <Textarea id="kb-content" value={knowledgeBaseForm.content} onChange={(e) => setKnowledgeBaseForm((current) => ({ ...current, content: e.target.value }))} rows={6} />
                </div>
                <Button onClick={() => createKnowledgeBaseArticle.mutate(knowledgeBaseForm as any)} disabled={createKnowledgeBaseArticle.isPending}>
                  Publish Article
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Knowledge-base library</CardTitle>
                <CardDescription>Operational guidance available to users and support teams.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(data?.knowledgeBase || []).map((article: any) => (
                  <div key={article.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{article.title}</p>
                        <p className="text-sm text-muted-foreground">{article.summary}</p>
                      </div>
                      <Badge variant="outline">{article.category.replace('_', ' ')}</Badge>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{article.content}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="faq">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>FAQ and SLA management</CardTitle>
                <CardDescription>Create reusable answers while monitoring SLA distribution and category mix.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="faq-question">Question</Label>
                  <Input id="faq-question" value={faqForm.question} onChange={(e) => setFaqForm((current) => ({ ...current, question: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="faq-category">Category</Label>
                  <Input id="faq-category" value={faqForm.category} onChange={(e) => setFaqForm((current) => ({ ...current, category: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="faq-answer">Answer</Label>
                  <Textarea id="faq-answer" value={faqForm.answer} onChange={(e) => setFaqForm((current) => ({ ...current, answer: e.target.value }))} rows={5} />
                </div>
                <Button onClick={() => createFaq.mutate(faqForm)} disabled={createFaq.isPending}>Create FAQ Entry</Button>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>FAQ library</CardTitle>
                  <CardDescription>Common answers available to support teams and end users.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(data?.faqs || []).map((faq: any) => (
                    <div key={faq.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{faq.question}</p>
                        <Badge variant="outline">{faq.category}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>SLA and support analytics</CardTitle>
                  <CardDescription>Current support category load, detected support intent, and sentiment posture summary.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    {(data?.analytics?.byCategory || []).map((item: any) => (
                      <div key={item.category} className="flex items-center justify-between rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{String(item.category).replace('_', ' ')}</span>
                        </div>
                        <Badge variant="outline">{item.count} tickets</Badge>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Detected support intent</p>
                      {(data?.analytics?.byIntent || []).map((item: any) => (
                        <div key={item.intent} className="flex items-center justify-between rounded-lg border p-3">
                          <span className="capitalize">{String(item.intent).replace(/_/g, ' ')}</span>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Conversation sentiment</p>
                      {(data?.analytics?.bySentiment || []).map((item: any) => (
                        <div key={item.sentiment} className="flex items-center justify-between rounded-lg border p-3">
                          <span className="capitalize">{String(item.sentiment)}</span>
                          <Badge variant={item.sentiment === 'negative' ? 'destructive' : item.sentiment === 'positive' ? 'default' : 'outline'}>{item.count}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
