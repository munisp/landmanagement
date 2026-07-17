import { useEffect, useCallback } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';

export type RealTimeEvent = 
  | { type: 'comment_added'; entityType: string; entityId: string; comment: any }
  | { type: 'comment_edited'; entityType: string; entityId: string; commentId: string; content: string }
  | { type: 'comment_deleted'; entityType: string; entityId: string; commentId: string }
  | { type: 'activity_update'; activity: any };

export function useRealTimeUpdates(
  onEvent: (event: RealTimeEvent) => void,
  deps: any[] = []
) {
  const { user } = useAuth();

  const handleEvent = useCallback(onEvent, deps);

  useEffect(() => {
    if (!user) return;

    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/notifications/ws?userId=${user.id}`;
    
    console.log('[Notifications] Connecting to:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Notifications] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[Notifications] Received:', data);

        // Handle real-time collaboration events
        if (data.type === 'comment_added' || 
            data.type === 'comment_edited' || 
            data.type === 'comment_deleted' ||
            data.type === 'activity_update') {
          handleEvent(data as RealTimeEvent);
        }
      } catch (error) {
        console.error('[Notifications] Error parsing message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[Notifications] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[Notifications] WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [user, handleEvent]);
}
