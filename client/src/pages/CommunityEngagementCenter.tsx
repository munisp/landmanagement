import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { MessageSquare, CalendarRange, Lightbulb, Vote, Bell } from 'lucide-react';

export default function CommunityEngagementCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.community.overview.useQuery();
  const [forumTitle, setForumTitle] = useState('Land access concern near Parcel 1110');
  const [forumCategory, setForumCategory] = useState('land_issue');
  const [forumAuthor, setForumAuthor] = useState('Residents Association');
  const [forumExcerpt, setForumExcerpt] = useState('Community members request review of access arrangements and boundary signage.');
  const [meetingTitle, setMeetingTitle] = useState('Quarterly Land Governance Town Hall');
  const [meetingDate, setMeetingDate] = useState(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [meetingVenue, setMeetingVenue] = useState('Municipal Assembly Hall');
  const [feedbackSubject, setFeedbackSubject] = useState('Need clearer parcel appeal process');
  const [feedbackSubmitter, setFeedbackSubmitter] = useState('Chinedu Okafor');
  const [feedbackChannel, setFeedbackChannel] = useState('portal');
  const [pollQuestion, setPollQuestion] = useState('Should the ward reserve more land for flood buffers?');
  const [pollOptions, setPollOptions] = useState('Yes,No,Need more study');
  const [proposalTitle, setProposalTitle] = useState('Community green corridor proposal');
  const [proposalProposer, setProposalProposer] = useState('Urban Youth Forum');
  const [proposalArea, setProposalArea] = useState('Parcel 1122');
  const [budgetInitiative, setBudgetInitiative] = useState('Pedestrian walkway and drainage improvements');
  const [budgetAmount, setBudgetAmount] = useState(15000000);
  const [budgetStatus, setBudgetStatus] = useState<'draft' | 'voting' | 'approved'>('voting');
  const [notificationTitle, setNotificationTitle] = useState('Community consultation opened');
  const [notificationMessage, setNotificationMessage] = useState('Residents can now review and comment on the proposed community green corridor.');
  const [notificationAudience, setNotificationAudience] = useState('ward_residents');

  const refresh = async () => {
    await utils.community.overview.invalidate();
  };

  const createForumPost = trpc.community.createForumPost.useMutation({ onSuccess: async () => { toast.success('Forum topic created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create forum topic') });
  const createTownHall = trpc.community.createTownHall.useMutation({ onSuccess: async () => { toast.success('Town hall scheduled'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to schedule town hall') });
  const createFeedback = trpc.community.createFeedback.useMutation({ onSuccess: async () => { toast.success('Feedback captured'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to capture feedback') });
  const createPoll = trpc.community.createPoll.useMutation({ onSuccess: async () => { toast.success('Community poll created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create poll') });
  const createProposal = trpc.community.createProposal.useMutation({ onSuccess: async () => { toast.success('Land-use proposal created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create proposal') });
  const createBudget = trpc.community.createBudget.useMutation({ onSuccess: async () => { toast.success('Participatory budget initiative created'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create budget initiative') });
  const createNotification = trpc.community.createNotification.useMutation({ onSuccess: async () => { toast.success('Community notification sent'); await refresh(); }, onError: (e) => toast.error(e.message || 'Unable to create notification') });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading community engagement workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Community Engagement Center</h1>
        <p className="text-muted-foreground mt-2">Run community forums, town halls, feedback collection, polls, land-use proposals, participatory budgeting, and resident notifications from one workspace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Forum topics</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.forumTopics ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Scheduled meetings</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.scheduledMeetings ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Open polls</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.openPolls ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Active notices</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.activeNotifications ?? 0}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="forum" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-[980px]">
          <TabsTrigger value="forum"><MessageSquare className="mr-2 h-4 w-4" />Forum</TabsTrigger>
          <TabsTrigger value="meetings"><CalendarRange className="mr-2 h-4 w-4" />Town Halls</TabsTrigger>
          <TabsTrigger value="feedback"><Lightbulb className="mr-2 h-4 w-4" />Feedback</TabsTrigger>
          <TabsTrigger value="polls"><Vote className="mr-2 h-4 w-4" />Polls & Budget</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="mr-2 h-4 w-4" />Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="forum">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Community forum for land issues</CardTitle><CardDescription>Create issue threads and community proposal discussions.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Topic title</Label><Input value={forumTitle} onChange={(e) => setForumTitle(e.target.value)} /></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Category</Label><Input value={forumCategory} onChange={(e) => setForumCategory(e.target.value)} /></div><div className="space-y-2"><Label>Author</Label><Input value={forumAuthor} onChange={(e) => setForumAuthor(e.target.value)} /></div></div>
                <div className="space-y-2"><Label>Summary</Label><Textarea rows={4} value={forumExcerpt} onChange={(e) => setForumExcerpt(e.target.value)} /></div>
                <Button onClick={() => createForumPost.mutate({ title: forumTitle, category: forumCategory, author: forumAuthor, excerpt: forumExcerpt })} disabled={createForumPost.isPending}>Create Forum Topic</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Community topics</CardTitle><CardDescription>Current forum discussions and land-use proposal topics.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{(data?.forumPosts || []).map((item: any) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.author} • {item.category}</p></div><Badge variant="outline">{new Date(item.createdAt).toLocaleDateString()}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{item.excerpt}</p></div>)}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="meetings">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Town hall meeting scheduler</CardTitle><CardDescription>Schedule public sessions and stakeholder hearings.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Meeting title</Label><Input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} /></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Scheduled for</Label><Input type="datetime-local" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} /></div><div className="space-y-2"><Label>Venue</Label><Input value={meetingVenue} onChange={(e) => setMeetingVenue(e.target.value)} /></div></div>
                <Button onClick={() => createTownHall.mutate({ title: meetingTitle, scheduledFor: new Date(meetingDate).toISOString(), venue: meetingVenue, status: 'scheduled' })} disabled={createTownHall.isPending}>Schedule Town Hall</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Meeting calendar</CardTitle><CardDescription>Scheduled and completed community sessions.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{(data?.townHalls || []).map((item: any) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.venue}</p></div><Badge variant={item.status === 'scheduled' ? 'default' : 'outline'}>{item.status}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{new Date(item.scheduledFor).toLocaleString()}</p></div>)}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="feedback">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Feedback and suggestions</CardTitle><CardDescription>Capture stakeholder feedback and land-use proposals.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Feedback subject</Label><Input value={feedbackSubject} onChange={(e) => setFeedbackSubject(e.target.value)} /></div>
                <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Submitter</Label><Input value={feedbackSubmitter} onChange={(e) => setFeedbackSubmitter(e.target.value)} /></div><div className="space-y-2"><Label>Channel</Label><Input value={feedbackChannel} onChange={(e) => setFeedbackChannel(e.target.value)} /></div></div>
                <Button onClick={() => createFeedback.mutate({ subject: feedbackSubject, submitter: feedbackSubmitter, channel: feedbackChannel })} disabled={createFeedback.isPending}>Capture Feedback</Button>
                <div className="pt-4 border-t space-y-4">
                  <Label>Community land-use proposal</Label>
                  <Input value={proposalTitle} onChange={(e) => setProposalTitle(e.target.value)} placeholder="Proposal title" />
                  <Input value={proposalProposer} onChange={(e) => setProposalProposer(e.target.value)} placeholder="Proposer" />
                  <Input value={proposalArea} onChange={(e) => setProposalArea(e.target.value)} placeholder="Affected area" />
                  <Button variant="outline" onClick={() => createProposal.mutate({ title: proposalTitle, proposer: proposalProposer, area: proposalArea })} disabled={createProposal.isPending}>Create Proposal</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Feedback and proposals</CardTitle><CardDescription>Current suggestions and land-use proposals in review.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{(data?.feedback || []).map((item: any) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.subject}</p><p className="text-sm text-muted-foreground">{item.submitter} • {item.channel}</p></div><Badge variant="outline">{item.status}</Badge></div></div>)}{(data?.proposals || []).map((item: any) => <div key={`proposal-${item.id}`} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.proposer} • {item.area}</p></div><Badge>{item.status}</Badge></div></div>)}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="polls">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Polls, surveys, and participatory budgeting</CardTitle><CardDescription>Create community polls and budget initiatives for participatory planning.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Poll question</Label><Input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} /></div>
                <div className="space-y-2"><Label>Options (comma-separated)</Label><Input value={pollOptions} onChange={(e) => setPollOptions(e.target.value)} /></div>
                <Button onClick={() => createPoll.mutate({ question: pollQuestion, options: pollOptions.split(',').map((item) => item.trim()).filter(Boolean) })} disabled={createPoll.isPending}>Create Poll</Button>
                <div className="pt-4 border-t space-y-4">
                  <Label>Participatory budgeting initiative</Label>
                  <Input value={budgetInitiative} onChange={(e) => setBudgetInitiative(e.target.value)} placeholder="Initiative" />
                  <Input type="number" value={budgetAmount} onChange={(e) => setBudgetAmount(Number(e.target.value))} placeholder="Allocated amount" />
                  <Input value={budgetStatus} onChange={(e) => setBudgetStatus(e.target.value as typeof budgetStatus)} placeholder="Status" />
                  <Button variant="outline" onClick={() => createBudget.mutate({ initiative: budgetInitiative, allocatedAmount: budgetAmount, status: budgetStatus })} disabled={createBudget.isPending}>Create Budget Initiative</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Polls and budgets</CardTitle><CardDescription>Open community polls and participatory budget items.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{(data?.polls || []).map((item: any) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.question}</p><p className="text-sm text-muted-foreground">{item.options.join(' / ')}</p></div><Badge variant="outline">{item.status}</Badge></div></div>)}{(data?.budgets || []).map((item: any) => <div key={`budget-${item.id}`} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.initiative}</p><p className="text-sm text-muted-foreground">₦{item.allocatedAmount.toLocaleString()}</p></div><Badge>{item.status}</Badge></div></div>)}</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
            <Card>
              <CardHeader><CardTitle>Community notification system</CardTitle><CardDescription>Send resident notifications for proposals, hearings, and engagement milestones.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>Title</Label><Input value={notificationTitle} onChange={(e) => setNotificationTitle(e.target.value)} /></div>
                <div className="space-y-2"><Label>Message</Label><Textarea rows={4} value={notificationMessage} onChange={(e) => setNotificationMessage(e.target.value)} /></div>
                <div className="space-y-2"><Label>Audience</Label><Input value={notificationAudience} onChange={(e) => setNotificationAudience(e.target.value)} /></div>
                <Button onClick={() => createNotification.mutate({ title: notificationTitle, message: notificationMessage, audience: notificationAudience })} disabled={createNotification.isPending}>Send Notification</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Notification history</CardTitle><CardDescription>Recent community announcements.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{(data?.notifications || []).map((item: any) => <div key={item.id} className="rounded-lg border p-4"><div className="flex items-center justify-between"><div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.audience}</p></div><Badge variant="outline">{new Date(item.createdAt).toLocaleDateString()}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{item.message}</p></div>)}</CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
