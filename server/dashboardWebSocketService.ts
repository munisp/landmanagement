/**
 * Dashboard WebSocket Service
 * Provides real-time updates for the unified transaction dashboard
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { authenticateWebSocketUpgrade } from './webSocketAuth';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  isAlive?: boolean;
}

interface DashboardUpdate {
  type: 'transaction_status_update' | 'system_status_update' | 'transaction_created';
  transactionId: string;
  system?: string;
  status?: string;
  progress?: number;
  timestamp: Date;
  metadata?: any;
}

export class DashboardWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, Set<AuthenticatedWebSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/api/dashboard/ws',
    });

    this.wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
      console.log('[DashboardWS] New connection attempt');

      // Authenticate the upgrade request against the session pipeline and
      // derive the user identity from the verified session. The legacy
      // ?userId= query parameter is intentionally ignored — client-supplied
      // identities are trivially spoofable.
      const user = await authenticateWebSocketUpgrade(req);
      if (!user || typeof user.id !== 'number') {
        console.log('[DashboardWS] Connection rejected: unauthenticated');
        ws.close(1008, 'Authentication required');
        return;
      }

      const userId = user.id;
      ws.userId = userId;
      ws.isAlive = true;

      // Add client to tracking
      if (!this.clients.has(userId)) {
        this.clients.set(userId, new Set());
      }
      this.clients.get(userId)!.add(ws);

      console.log(`[DashboardWS] User ${userId} connected. Total clients: ${this.getTotalClients()}`);

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date(),
      }));

      // Handle pong responses
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle messages from client
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleClientMessage(ws, data);
        } catch (error) {
          console.error('[DashboardWS] Error handling message:', error);
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        if (ws.userId) {
          const userClients = this.clients.get(ws.userId);
          if (userClients) {
            userClients.delete(ws);
            if (userClients.size === 0) {
              this.clients.delete(ws.userId);
            }
          }
          console.log(`[DashboardWS] User ${ws.userId} disconnected. Total clients: ${this.getTotalClients()}`);
        }
      });

      ws.on('error', (error) => {
        console.error('[DashboardWS] Connection error:', error);
      });
    });

    // Start heartbeat to detect dead connections
    this.startHeartbeat();

    console.log('[DashboardWS] WebSocket server initialized on /api/dashboard/ws');
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws: WebSocket) => {
        const client = ws as AuthenticatedWebSocket;
        if (client.isAlive === false) {
          return client.terminate();
        }
        client.isAlive = false;
        client.ping();
      });
    }, 30000); // 30 seconds
  }

  private async handleClientMessage(ws: AuthenticatedWebSocket, data: any) {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
        break;
      case 'subscribe':
        // Client can subscribe to specific transaction updates
        console.log(`[DashboardWS] User ${ws.userId} subscribed to transaction ${data.transactionId}`);
        break;
      case 'unsubscribe':
        console.log(`[DashboardWS] User ${ws.userId} unsubscribed from transaction ${data.transactionId}`);
        break;
      default:
        console.log('[DashboardWS] Unknown message type:', data.type);
    }
  }

  /**
   * Broadcast transaction status update to relevant users
   */
  broadcastTransactionUpdate(update: DashboardUpdate) {
    const message = JSON.stringify({
      ...update,
      timestamp: update.timestamp.toISOString(),
    });

    // Broadcast to all connected clients
    // In production, you might want to filter by user permissions
    this.clients.forEach((userClients) => {
      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });

    console.log(`[DashboardWS] Broadcasted ${update.type} for transaction ${update.transactionId}`);
  }

  /**
   * Send update to a specific user
   */
  sendToUser(userId: number, update: DashboardUpdate) {
    const userClients = this.clients.get(userId);
    if (userClients && userClients.size > 0) {
      const message = JSON.stringify({
        ...update,
        timestamp: update.timestamp.toISOString(),
      });
      
      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });

      console.log(`[DashboardWS] Sent ${update.type} to user ${userId}`);
    }
  }

  /**
   * Notify about system status change
   */
  notifySystemStatusChange(
    transactionId: string,
    system: string,
    status: string,
    progress: number,
    metadata?: any
  ) {
    this.broadcastTransactionUpdate({
      type: 'system_status_update',
      transactionId,
      system,
      status,
      progress,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Notify about overall transaction status change
   */
  notifyTransactionStatusChange(
    transactionId: string,
    status: string,
    metadata?: any
  ) {
    this.broadcastTransactionUpdate({
      type: 'transaction_status_update',
      transactionId,
      status,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Notify about new transaction creation
   */
  notifyTransactionCreated(transactionId: string, metadata?: any) {
    this.broadcastTransactionUpdate({
      type: 'transaction_created',
      transactionId,
      timestamp: new Date(),
      metadata,
    });
  }

  /**
   * Get total number of connected clients
   */
  private getTotalClients(): number {
    let total = 0;
    this.clients.forEach((clients) => {
      total += clients.size;
    });
    return total;
  }

  /**
   * Shutdown the WebSocket server
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
    console.log('[DashboardWS] WebSocket server shut down');
  }
}

// Export singleton instance
export const dashboardWS = new DashboardWebSocketService();
