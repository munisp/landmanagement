/**
 * PresenceIndicator Component
 * Shows active users viewing the current page with avatars and count
 */

import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Users } from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';

interface PresenceUser {
  userId: number;
  userName: string;
  joinedAt: Date;
}

interface PresenceIndicatorProps {
  pageId: string;
}

export function PresenceIndicator({ pageId }: PresenceIndicatorProps) {
  const { user } = useAuth();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    if (!user) return;

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/notifications/ws?userId=${user.id}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('[Presence] WebSocket connected');
      
      // Join page
      websocket.send(JSON.stringify({
        type: 'join_page',
        pageId,
        userName: user.name || user.email,
      }));
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'presence_update' && data.pageId === pageId) {
          // Filter out current user
          const otherUsers = data.users.filter((u: PresenceUser) => u.userId !== user.id);
          setUsers(otherUsers);
        }
      } catch (error) {
        console.error('[Presence] Error processing message:', error);
      }
    };

    websocket.onerror = (error) => {
      console.error('[Presence] WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('[Presence] WebSocket disconnected');
    };

    setWs(websocket);

    // Cleanup on unmount
    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({
          type: 'leave_page',
          pageId,
        }));
        websocket.close();
      }
    };
  }, [user, pageId]);

  if (!user || users.length === 0) {
    return null;
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (userId: number) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-yellow-500',
      'bg-indigo-500',
      'bg-red-500',
      'bg-teal-500',
    ];
    return colors[userId % colors.length];
  };

  return (
    <div className="flex items-center gap-2">
      {/* User Avatars */}
      <div className="flex -space-x-2">
        {users.slice(0, 3).map((u) => (
          <Avatar
            key={u.userId}
            className={`h-8 w-8 border-2 border-background ${getAvatarColor(u.userId)}`}
            title={u.userName}
          >
            <AvatarFallback className="text-xs text-white">
              {getInitials(u.userName)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>

      {/* Count Badge */}
      <Badge variant="secondary" className="gap-1.5">
        <Users className="h-3.5 w-3.5" />
        <span>
          {users.length} {users.length === 1 ? 'user' : 'users'} viewing
        </span>
      </Badge>

      {/* Additional users tooltip */}
      {users.length > 3 && (
        <span className="text-xs text-muted-foreground">
          +{users.length - 3} more
        </span>
      )}
    </div>
  );
}
