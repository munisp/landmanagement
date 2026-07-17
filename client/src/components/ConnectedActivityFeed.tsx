import { ActivityFeed, Activity } from './ActivityFeed';
import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

interface ConnectedActivityFeedProps {
  limit?: number;
}

export function ConnectedActivityFeed({ limit = 10 }: ConnectedActivityFeedProps) {
  const utils = trpc.useUtils();
  const { data: activities = [], isLoading } = trpc.activityLogs.list.useQuery({ limit });

  // Listen for real-time activity updates
  useRealTimeUpdates((event) => {
    if (event.type === 'activity_update') {
      utils.activityLogs.list.invalidate({ limit });
    }
  }, [limit, utils]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Transform API activities to ActivityFeed format
  const transformedActivities: Activity[] = activities.map((activity) => ({
    id: String(activity.id),
    type: activity.type as any, // Type will be validated by backend
    userId: activity.userId,
    userName: activity.userName || 'System',
    userAvatar: activity.userAvatar,
    description: activity.description,
    metadata: activity.metadata as Record<string, any> | undefined,
    createdAt: new Date(activity.createdAt),
  }));

  return <ActivityFeed activities={transformedActivities} />;
}
