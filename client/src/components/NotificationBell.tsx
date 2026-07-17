/**
 * NotificationBell Component
 * Real-time notifications with bell icon, unread count, and dropdown
 */

import { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'comment' | 'activity' | 'system';
  read: boolean;
  createdAt: Date;
  relatedId?: number;
  relatedType?: 'parcel' | 'transaction';
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      title: 'New Comment',
      message: 'John Doe commented on Parcel #12345',
      type: 'comment',
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
      relatedId: 12345,
      relatedType: 'parcel',
    },
    {
      id: 2,
      title: 'Transaction Updated',
      message: 'Transaction #TX-2024-001 status changed to verified',
      type: 'activity',
      read: false,
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      relatedId: 1,
      relatedType: 'transaction',
    },
    {
      id: 3,
      title: 'System Notification',
      message: 'Database backup completed successfully',
      type: 'system',
      read: true,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    },
  ]);
  const [isOpen, setIsOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Listen for WebSocket notification events
  useEffect(() => {
    const ws = new WebSocket(
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/notifications/ws`
    );

    ws.onopen = () => {
      console.log('[NotificationBell] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'comment_added' || data.type === 'comment_edited' || data.type === 'activity_update') {
          // Add new notification
          const newNotification: Notification = {
            id: Date.now(),
            title: data.type === 'comment_added' ? 'New Comment' : 
                   data.type === 'comment_edited' ? 'Comment Updated' : 
                   'Activity Update',
            message: data.message || 'New activity on your watched items',
            type: data.type.startsWith('comment') ? 'comment' : 'activity',
            read: false,
            createdAt: new Date(),
            relatedId: data.resourceId,
            relatedType: data.resourceType,
          };

          setNotifications(prev => [newNotification, ...prev]);
          
          // Show toast for new notifications
          toast.info(newNotification.title, {
            description: newNotification.message,
          });
        }
      } catch (error) {
        console.error('[NotificationBell] Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[NotificationBell] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[NotificationBell] WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, []);

  const markAsRead = (id: number) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success('All notifications marked as read');
  };

  const deleteNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'comment':
        return '💬';
      case 'activity':
        return '📊';
      case 'system':
        return '⚙️';
      default:
        return '🔔';
    }
  };

  const getNotificationLink = (notification: Notification) => {
    if (notification.relatedType === 'parcel' && notification.relatedId) {
      return `/parcels/${notification.relatedId}`;
    }
    if (notification.relatedType === 'transaction' && notification.relatedId) {
      return `/transactions/${notification.relatedId}`;
    }
    return null;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="h-auto p-1 text-xs"
            >
              <CheckCheck className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No notifications</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            {notifications.map((notification) => {
              const link = getNotificationLink(notification);
              
              return (
                <DropdownMenuItem
                  key={notification.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer ${
                    !notification.read ? 'bg-accent/50' : ''
                  }`}
                  onClick={() => {
                    if (!notification.read) {
                      markAsRead(notification.id);
                    }
                    if (link) {
                      window.location.href = link;
                    }
                  }}
                >
                  <div className="text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-sm">{notification.title}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
