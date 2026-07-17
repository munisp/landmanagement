import { FileText, User, MapPin, CheckCircle2, XCircle, Edit, Upload, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export type ActivityType =
  | 'parcel_created'
  | 'parcel_updated'
  | 'transaction_initiated'
  | 'transaction_approved'
  | 'transaction_rejected'
  | 'document_uploaded'
  | 'document_verified'
  | 'comment_added'
  | 'user_assigned';

export interface Activity {
  id: string;
  type: ActivityType;
  userId: number;
  userName: string;
  userAvatar?: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

interface ActivityFeedProps {
  activities: Activity[];
  maxItems?: number;
  showAvatar?: boolean;
  compact?: boolean;
}

const activityConfig: Record<
  ActivityType,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  parcel_created: {
    icon: MapPin,
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  parcel_updated: {
    icon: Edit,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  transaction_initiated: {
    icon: FileText,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  transaction_approved: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  transaction_rejected: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  document_uploaded: {
    icon: Upload,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  document_verified: {
    icon: CheckCircle2,
    color: 'text-teal-600',
    bgColor: 'bg-teal-100',
  },
  comment_added: {
    icon: FileText,
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  user_assigned: {
    icon: User,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
};

export function ActivityFeed({
  activities,
  maxItems = 10,
  showAvatar = true,
  compact = false,
}: ActivityFeedProps) {
  const displayedActivities = activities.slice(0, maxItems);

  const getUserInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-muted-foreground">No recent activity</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {displayedActivities.map((activity, index) => {
            const config = activityConfig[activity.type];
            const Icon = config.icon;

            return (
              <div
                key={activity.id}
                className={cn(
                  'flex gap-3',
                  index !== displayedActivities.length - 1 && 'pb-4 border-b'
                )}
              >
                {/* Icon */}
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    config.bgColor
                  )}
                >
                  <Icon className={cn('h-4 w-4', config.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      {showAvatar && !compact && (
                        <div className="flex items-center gap-2 mb-1">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={activity.userAvatar} />
                            <AvatarFallback className="text-xs">
                              {getUserInitials(activity.userName)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{activity.userName}</span>
                        </div>
                      )}
                      <p className={cn('text-sm', compact ? 'font-medium' : '')}>
                        {activity.description}
                      </p>
                      {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.entries(activity.metadata).map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key}: {String(value)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {activities.length > maxItems && (
          <div className="mt-4 pt-4 border-t text-center">
            <p className="text-sm text-muted-foreground">
              Showing {maxItems} of {activities.length} activities
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
