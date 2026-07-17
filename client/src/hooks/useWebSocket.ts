import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface WebSocketOptions {
  url: string;
  onMessage?: (message: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  userId?: number;
}

export interface WebSocketHookReturn {
  isConnected: boolean;
  send: (message: any) => void;
  lastMessage: WebSocketMessage | null;
  reconnect: () => void;
  disconnect: () => void;
}

export function useWebSocket(options: WebSocketOptions): WebSocketHookReturn {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    userId,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[useWebSocket] Already connected');
      return;
    }

    try {
      console.log(`[useWebSocket] Connecting to ${url}...`);
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[useWebSocket] Connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        // Authenticate if userId is provided
        if (userId) {
          ws.send(JSON.stringify({
            type: 'authenticate',
            userId,
          }));
        }

        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          console.error('[useWebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[useWebSocket] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        onClose?.();

        // Attempt to reconnect
        if (
          shouldReconnectRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          reconnectAttemptsRef.current += 1;
          console.log(
            `[useWebSocket] Reconnecting... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.error('[useWebSocket] Max reconnect attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[useWebSocket] Error:', error);
        onError?.(error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[useWebSocket] Connection error:', error);
    }
  }, [url, userId, onMessage, onOpen, onClose, onError, reconnectInterval, maxReconnectAttempts]);

  const send = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[useWebSocket] Cannot send message: not connected');
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    shouldReconnectRef.current = true;
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect, disconnect]);

  useEffect(() => {
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    send,
    lastMessage,
    reconnect,
    disconnect,
  };
}
