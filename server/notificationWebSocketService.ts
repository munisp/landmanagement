import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { getDb } from './db';
import { adminNotifications } from '../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  isAlive?: boolean;
}

export class NotificationWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, Set<AuthenticatedWebSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/api/notifications/ws',
    });

    this.wss.on('connection', (ws: AuthenticatedWebSocket, req) => {
      console.log('[WebSocket] New connection attempt');
      
      // Extract user ID from query parameters or headers
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');
      
      if (!userId || isNaN(parseInt(userId))) {
        console.log('[WebSocket] Connection rejected: invalid userId');
        ws.close(1008, 'Invalid userId');
        return;
      }

      ws.userId = parseInt(userId);
      ws.isAlive = true;

      // Add client to tracking
      if (!this.clients.has(ws.userId)) {
        this.clients.set(ws.userId, new Set());
      }
      this.clients.get(ws.userId)!.add(ws);

      console.log(`[WebSocket] User ${ws.userId} connected. Total clients: ${this.getTotalClients()}`);

      // Send initial unread count
      this.sendUnreadCount(ws.userId);

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
          console.error('[WebSocket] Error handling message:', error);
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
          console.log(`[WebSocket] User ${ws.userId} disconnected. Total clients: ${this.getTotalClients()}`);
        }
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Connection error:', error);
      });
    });

    // Start heartbeat to detect dead connections
    this.startHeartbeat();

    console.log('[Notifications] WebSocket server initialized on /api/notifications/ws');
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
      case 'mark_read':
        if (data.notificationId && ws.userId) {
          await this.markAsRead(data.notificationId, ws.userId);
        }
        break;
      case 'mark_all_read':
        if (ws.userId) {
          await this.markAllAsRead(ws.userId);
        }
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      default:
        console.log('[WebSocket] Unknown message type:', data.type);
    }
  }

  private async markAsRead(notificationId: number, userId: number) {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      await db
        .update(adminNotifications)
        .set({ read: true, readAt: new Date() })
        .where(
          and(
            eq(adminNotifications.id, notificationId),
            eq(adminNotifications.recipientId, userId)
          )
        );

      // Send updated unread count
      await this.sendUnreadCount(userId);
    } catch (error) {
      console.error('[WebSocket] Error marking notification as read:', error);
    }
  }

  private async markAllAsRead(userId: number) {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      await db
        .update(adminNotifications)
        .set({ read: true, readAt: new Date() })
        .where(
          and(
            eq(adminNotifications.recipientId, userId),
            eq(adminNotifications.read, false)
          )
        );

      // Send updated unread count
      await this.sendUnreadCount(userId);
    } catch (error) {
      console.error('[WebSocket] Error marking all notifications as read:', error);
    }
  }

  private async sendUnreadCount(userId: number) {
    try {
      const db = await getDb();
      if (!db) return;
      
      const unreadNotifications = await db
        .select()
        .from(adminNotifications)
        .where(
          and(
            eq(adminNotifications.recipientId, userId),
            eq(adminNotifications.read, false)
          )
        );

      const count = unreadNotifications.length;

      this.sendToUser(userId, {
        type: 'unread_count',
        count,
      });
    } catch (error) {
      console.error('[WebSocket] Error sending unread count:', error);
    }
  }

  /**
   * Send a notification to a specific user
   */
  async notifyUser(userId: number, notification: {
    type: string;
    priority: string;
    title: string;
    message: string;
    metadata?: any;
  }) {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      // Save to database
      const [saved] = await db
        .insert(adminNotifications)
        .values({
          recipientId: userId,
          type: notification.type as any,
          priority: notification.priority as any,
          title: notification.title,
          message: notification.message,
          metadata: notification.metadata || null,
        })
        .returning();

      // Send via WebSocket if user is connected
      this.sendToUser(userId, {
        type: 'new_notification',
        notification: saved,
      });

      // Update unread count
      await this.sendUnreadCount(userId);

      return saved;
    } catch (error) {
      console.error('[WebSocket] Error notifying user:', error);
      throw error;
    }
  }

  /**
   * Broadcast notification to all admins
   */
  async notifyAllAdmins(notification: {
    type: string;
    priority: string;
    title: string;
    message: string;
    metadata?: any;
  }) {
    try {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      
      // Get all admin users
      const { users } = await import('../drizzle/schema');
      const adminUsers = await db.select().from(users).where(eq(users.role, 'admin'));

      // Send to each admin
      const promises = adminUsers.map((admin: any) =>
        this.notifyUser(admin.id, notification)
      );

      await Promise.all(promises);
    } catch (error) {
      console.error('[WebSocket] Error notifying all admins:', error);
      throw error;
    }
  }

  /**
   * Send message to a specific user's WebSocket connections
   */
  private sendToUser(userId: number, data: any) {
    const userClients = this.clients.get(userId);
    if (userClients && userClients.size > 0) {
      const message = JSON.stringify(data);
      userClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
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
   * Cleanup on server shutdown
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
    console.log('[Notifications] WebSocket server shut down');
  }
}

// Export singleton instance
export const notificationWS = new NotificationWebSocketService();
