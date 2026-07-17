import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';

export interface Notification {
  id: string;
  type: 'transaction_approved' | 'transaction_rejected' | 'document_uploaded' | 'parcel_verified' | 'payment_completed' | 'system_alert';
  title: string;
  message: string;
  userId: number;
  data?: any;
  createdAt: Date;
  read: boolean;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!user?.id || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/notifications/ws?userId=${user.id}`;

    console.log('[Notifications] Connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Notifications] Connected');
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Notifications] Received:', data);

        if (data.type === 'new_notification') {
          setNotifications(prev => [data.notification, ...prev]);
          setUnreadCount(prev => prev + 1);
          
          // Show browser notification if permission granted
          if (Notification.permission === 'granted') {
            new Notification(data.notification.title, {
              body: data.notification.message,
              icon: '/favicon.ico',
            });
          }
        } else if (data.type === 'pending_notifications') {
          setNotifications(data.notifications);
          setUnreadCount(data.notifications.filter((n: Notification) => !n.read).length);
        } else if (data.type === 'notification_read') {
          setNotifications(prev =>
            prev.map(n =>
              n.id === data.notificationId ? { ...n, read: true } : n
            )
          );
          setUnreadCount(prev => Math.max(0, prev - 1));
        } else if (data.type === 'all_notifications_read') {
          setNotifications(prev => prev.map(n => ({ ...n, read: true })));
          setUnreadCount(0);
        }
      } catch (error) {
        console.error('[Notifications] Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Notifications] WebSocket error:', error);
      setConnected(false);
    };

    ws.onclose = () => {
      console.log('[Notifications] Disconnected');
      setConnected(false);
      wsRef.current = null;

      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        if (user?.id) {
          connect();
        }
      }, 3000);
    };
  }, [user?.id]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mark_read',
        notificationId,
      }));
    }
  }, []);

  const markAllAsRead = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'mark_all_read',
      }));
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return Notification.permission === 'granted';
  }, []);

  useEffect(() => {
    if (user?.id) {
      connect();
      requestPermission();
    }

    return () => {
      disconnect();
    };
  }, [user?.id, connect, disconnect, requestPermission]);

  return {
    notifications,
    unreadCount,
    connected,
    markAsRead,
    markAllAsRead,
    requestPermission,
  };
}
