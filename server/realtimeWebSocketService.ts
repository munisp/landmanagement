import { WebSocket, WebSocketServer } from 'ws';
import { getDb } from './db';
import { mortgageApplications, brokerCommissions, loanPools } from '../drizzle/schema';
import { eq, desc } from 'drizzle-orm';

export interface MortgageEvent {
  type: 'application_submitted' | 'application_approved' | 'application_rejected' | 
        'commission_paid' | 'pool_created' | 'payment_received' | 'payment_failed';
  id: string;
  timestamp: string;
  data: Record<string, any>;
  userId?: number;
}

class RealtimeWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, { ws: WebSocket; userId?: number }> = new Map();
  private eventHistory: MortgageEvent[] = [];
  private maxHistorySize = 100;

  /**
   * Initialize WebSocket server
   */
  initialize(server: any) {
    this.wss = new WebSocketServer({ server, path: '/ws/mortgage-events' });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      const clientId = this.generateClientId();
      console.log(`[WebSocket] New client connected: ${clientId}`);

      // Store client connection
      this.clients.set(clientId, { ws });

      // Send connection success message
      ws.send(JSON.stringify({
        type: 'connection_established',
        clientId,
        timestamp: new Date().toISOString(),
      }));

      // Send recent event history
      ws.send(JSON.stringify({
        type: 'event_history',
        events: this.eventHistory.slice(-20), // Last 20 events
        timestamp: new Date().toISOString(),
      }));

      // Handle incoming messages
      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleClientMessage(clientId, data);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log(`[WebSocket] Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[WebSocket] Error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });
    });

    console.log('[WebSocket] Server initialized at /ws/mortgage-events');
  }

  /**
   * Handle messages from clients
   */
  private handleClientMessage(clientId: string, data: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (data.type) {
      case 'authenticate':
        // Store user ID for targeted broadcasts
        client.userId = data.userId;
        this.clients.set(clientId, client);
        client.ws.send(JSON.stringify({
          type: 'authenticated',
          userId: data.userId,
          timestamp: new Date().toISOString(),
        }));
        break;

      case 'ping':
        client.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date().toISOString(),
        }));
        break;

      case 'request_history':
        client.ws.send(JSON.stringify({
          type: 'event_history',
          events: this.eventHistory.slice(-50),
          timestamp: new Date().toISOString(),
        }));
        break;

      default:
        console.warn(`[WebSocket] Unknown message type: ${data.type}`);
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcastEvent(event: MortgageEvent) {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const message = JSON.stringify({
      type: 'mortgage_event',
      event,
      timestamp: new Date().toISOString(),
    });

    // Broadcast to all clients (or filter by userId if specified)
    this.clients.forEach((client, clientId) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        // If event has userId, only send to that user's connections
        if (!event.userId || client.userId === event.userId) {
          client.ws.send(message);
        }
      }
    });

    console.log(`[WebSocket] Broadcasted event: ${event.type} (${event.id})`);
  }

  /**
   * Send event to specific user
   */
  sendToUser(userId: number, event: MortgageEvent) {
    const message = JSON.stringify({
      type: 'mortgage_event',
      event,
      timestamp: new Date().toISOString(),
    });

    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.clients.size,
      authenticatedConnections: Array.from(this.clients.values()).filter(c => c.userId).length,
      eventHistorySize: this.eventHistory.length,
    };
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown() {
    if (this.wss) {
      this.clients.forEach((client) => {
        client.ws.close();
      });
      this.wss.close();
      console.log('[WebSocket] Server shut down');
    }
  }
}

// Singleton instance
export const realtimeWebSocketService = new RealtimeWebSocketService();

/**
 * Helper functions to broadcast specific mortgage events
 */

export async function broadcastApplicationSubmitted(applicationId: number) {
  const db = await getDb();
  if (!db) return;
  const application = await db.select().from(mortgageApplications).where(eq(mortgageApplications.id, applicationId)).limit(1);
  
  if (application.length > 0) {
    const app = application[0];
    realtimeWebSocketService.broadcastEvent({
      type: 'application_submitted',
      id: `app_${applicationId}`,
      timestamp: new Date().toISOString(),
      data: {
        applicationId,
        parcelId: app.parcelId,
        loanAmount: app.loanAmount,
        status: app.status,
      },
      userId: app.applicantId,
    });
  }
}

export async function broadcastApplicationApproved(applicationId: number) {
  const db = await getDb();
  if (!db) return;
  const application = await db.select().from(mortgageApplications).where(eq(mortgageApplications.id, applicationId)).limit(1);
  
  if (application.length > 0) {
    const app = application[0];
    realtimeWebSocketService.broadcastEvent({
      type: 'application_approved',
      id: `app_${applicationId}`,
      timestamp: new Date().toISOString(),
      data: {
        applicationId,
        parcelId: app.parcelId,
        loanAmount: app.loanAmount,
        interestRate: app.interestRate,
        loanTerm: app.loanTerm,
      },
      userId: app.applicantId,
    });
  }
}

export async function broadcastApplicationRejected(applicationId: number, reason: string) {
  const db = await getDb();
  if (!db) return;
  const application = await db.select().from(mortgageApplications).where(eq(mortgageApplications.id, applicationId)).limit(1);
  
  if (application.length > 0) {
    const app = application[0];
    realtimeWebSocketService.broadcastEvent({
      type: 'application_rejected',
      id: `app_${applicationId}`,
      timestamp: new Date().toISOString(),
      data: {
        applicationId,
        parcelId: app.parcelId,
        loanAmount: app.loanAmount,
        reason,
      },
      userId: app.applicantId,
    });
  }
}

export async function broadcastCommissionPaid(commissionId: number) {
  const db = await getDb();
  if (!db) return;
  const commission = await db.select().from(brokerCommissions).where(eq(brokerCommissions.id, commissionId)).limit(1);
  
  if (commission.length > 0) {
    const comm = commission[0];
    realtimeWebSocketService.broadcastEvent({
      type: 'commission_paid',
      id: `comm_${commissionId}`,
      timestamp: new Date().toISOString(),
      data: {
        commissionId,
        brokerId: comm.brokerId,
        amount: comm.commissionAmount,
        applicationId: comm.applicationId,
      },
    });
  }
}

export async function broadcastPoolCreated(poolId: number) {
  const db = await getDb();
  if (!db) return;
  const pool = await db.select().from(loanPools).where(eq(loanPools.id, poolId)).limit(1);
  
  if (pool.length > 0) {
    const p = pool[0];
    realtimeWebSocketService.broadcastEvent({
      type: 'pool_created',
      id: `pool_${poolId}`,
      timestamp: new Date().toISOString(),
      data: {
        poolId,
        name: p.poolName,
        totalValue: p.totalLoanAmount,
        riskTier: p.riskTier,
        status: p.status,
      },
    });
  }
}

export function broadcastPaymentReceived(paymentId: number, amount: number, applicationId: number) {
  realtimeWebSocketService.broadcastEvent({
    type: 'payment_received',
    id: `payment_${paymentId}`,
    timestamp: new Date().toISOString(),
    data: {
      paymentId,
      amount,
      applicationId,
    },
  });
}

export function broadcastPaymentFailed(paymentId: number, amount: number, applicationId: number, reason: string) {
  realtimeWebSocketService.broadcastEvent({
    type: 'payment_failed',
    id: `payment_${paymentId}`,
    timestamp: new Date().toISOString(),
    data: {
      paymentId,
      amount,
      applicationId,
      reason,
    },
  });
}
