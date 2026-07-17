import { useEffect, useState, useCallback } from 'react';
import { useWebSocket, WebSocketMessage } from './useWebSocket';
import { toast } from 'sonner';

export interface MortgageEvent {
  type: 'application_submitted' | 'application_approved' | 'application_rejected' | 
        'commission_paid' | 'pool_created' | 'payment_received' | 'payment_failed';
  id: string;
  timestamp: string;
  data: Record<string, any>;
  userId?: number;
}

export interface UseMortgageEventsOptions {
  userId?: number;
  onEvent?: (event: MortgageEvent) => void;
  showToastNotifications?: boolean;
  autoRefreshDashboard?: boolean;
}

export interface UseMortgageEventsReturn {
  events: MortgageEvent[];
  isConnected: boolean;
  reconnect: () => void;
  clearEvents: () => void;
}

export function useMortgageEvents(options: UseMortgageEventsOptions = {}): UseMortgageEventsReturn {
  const {
    userId,
    onEvent,
    showToastNotifications = true,
    autoRefreshDashboard = false,
  } = options;

  const [events, setEvents] = useState<MortgageEvent[]>([]);

  const handleMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'connection_established':
        console.log('[useMortgageEvents] Connected with client ID:', message.clientId);
        break;

      case 'authenticated':
        console.log('[useMortgageEvents] Authenticated as user:', message.userId);
        break;

      case 'event_history':
        console.log('[useMortgageEvents] Received event history:', message.events?.length || 0);
        if (message.events) {
          setEvents(message.events);
        }
        break;

      case 'mortgage_event':
        const event = message.event as MortgageEvent;
        console.log('[useMortgageEvents] New event:', event.type, event.id);
        
        // Add to events list
        setEvents((prev) => [...prev, event]);

        // Call custom event handler
        onEvent?.(event);

        // Show toast notification
        if (showToastNotifications) {
          showEventNotification(event);
        }

        // Trigger dashboard refresh if enabled
        if (autoRefreshDashboard) {
          // Dispatch custom event for dashboard components to listen to
          window.dispatchEvent(new CustomEvent('mortgage-event-received', { detail: event }));
        }
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.warn('[useMortgageEvents] Unknown message type:', message.type);
    }
  }, [onEvent, showToastNotifications, autoRefreshDashboard]);

  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/mortgage-events`;

  const { isConnected, reconnect } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    userId,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
  });

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    events,
    isConnected,
    reconnect,
    clearEvents,
  };
}

/**
 * Show toast notification for mortgage event
 */
function showEventNotification(event: MortgageEvent) {
  const { type, data } = event;

  switch (type) {
    case 'application_submitted':
      toast.info('New Application Submitted', {
        description: `Loan amount: ₦${Number(data.loanAmount).toLocaleString()}`,
      });
      break;

    case 'application_approved':
      toast.success('Application Approved', {
        description: `Loan amount: ₦${Number(data.loanAmount).toLocaleString()} at ${data.interestRate}% for ${data.loanTerm} months`,
      });
      break;

    case 'application_rejected':
      toast.error('Application Rejected', {
        description: data.reason || 'Application did not meet approval criteria',
      });
      break;

    case 'commission_paid':
      toast.success('Commission Paid', {
        description: `Amount: ₦${Number(data.amount).toLocaleString()}`,
      });
      break;

    case 'pool_created':
      toast.info('New Loan Pool Created', {
        description: `${data.name} - Total value: ₦${Number(data.totalValue).toLocaleString()}`,
      });
      break;

    case 'payment_received':
      toast.success('Payment Received', {
        description: `Amount: ₦${Number(data.amount).toLocaleString()}`,
      });
      break;

    case 'payment_failed':
      toast.error('Payment Failed', {
        description: data.reason || 'Payment processing failed',
      });
      break;

    default:
      toast.info('Mortgage Event', {
        description: `Event type: ${type}`,
      });
  }
}
