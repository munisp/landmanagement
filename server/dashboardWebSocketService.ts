/**
 * Dashboard WebSocket Service
 * Provides real-time updates for the unified transaction dashboard
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { authenticateWebSocketUpgrade, recordWebSocketAuthFailure } from './webSocketAuth';

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
        recordWebSocketAuthFailure(req, 'unauthenticated upgrade');
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
        client_pong: {
          // intentional no-op label target
        }
        break;
      default:
        break;
    }
  }
}
