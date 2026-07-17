import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { Server } from 'http';

export interface Notification {
  id: string;
  type: 'transaction_approved' | 'transaction_rejected' | 'document_uploaded' | 'parcel_verified' | 'payment_completed' | 'system_alert' | 'comment_added' | 'comment_edited' | 'comment_deleted' | 'activity_update';
  title: string;
  message: string;
  userId: number;
  data?: any;
  createdAt: Date;
  read: boolean;
}

interface ClientConnection {
  ws: WebSocket;
  userId: number;
  userName?: string;
  currentPage?: string;
}

interface PresenceInfo {
  userId: number;
  userName: string;
  joinedAt: Date;
}

export class NotificationService {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, ClientConnection[]> = new Map();
  private notifications: Map<number, Notification[]> = new Map();
  // Presence tracking: Map<pageId, Map<userId, PresenceInfo>>
  private presence: Map<string, Map<number, PresenceInfo>> = new Map();

  initialize(server: Server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/api/notifications/ws'
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('[Notifications] New WebSocket connection');

      // Extract userId from query params
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const userId = parseInt(url.searchParams.get('userId') || '0');

      if (!userId) {
        ws.close(1008, 'User ID required');
        return;
      }

      // Store client connection
      const connection: ClientConnection = { ws, userId };
      if (!this.clients.has(userId)) {
        this.clients.set(userId, []);
      }
      this.clients.get(userId)!.push(connection);

      console.log(`[Notifications] User ${userId} connected. Total connections: ${this.clients.get(userId)!.length}`);

      // Send pending notifications
      this.sendPendingNotifications(userId);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'mark_read') {
            this.markAsRead(userId, data.notificationId);
          } else if (data.type === 'mark_all_read') {
            this.markAllAsRead(userId);
          } else if (data.type === 'join_page') {
            this.handleUserJoinedPage(userId, data.userName, data.pageId);
            connection.userName = data.userName;
            connection.currentPage = data.pageId;
          } else if (data.type === 'leave_page') {
            this.handleUserLeftPage(userId, data.pageId);
            connection.currentPage = undefined;
          }
        } catch (error) {
          console.error('[Notifications] Error processing message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`[Notifications] User ${userId} disconnected`);
        
        // Clean up presence if user was on a page
        if (connection.currentPage) {
          this.handleUserLeftPage(userId, connection.currentPage);
        }
        
        const connections = this.clients.get(userId) || [];
        const index = connections.indexOf(connection);
        if (index > -1) {
          connections.splice(index, 1);
        }
        if (connections.length === 0) {
          this.clients.delete(userId);
        }
      });

      ws.on('error', (error: Error) => {
        console.error('[Notifications] WebSocket error:', error);
      });
    });

    console.log('[Notifications] WebSocket server initialized on /api/notifications/ws');
  }

  private sendPendingNotifications(userId: number) {
    const userNotifications = this.notifications.get(userId) || [];
    const unreadNotifications = userNotifications.filter(n => !n.read);

    if (unreadNotifications.length > 0) {
      this.sendToUser(userId, {
        type: 'pending_notifications',
        notifications: unreadNotifications,
      });
    }
  }

  sendNotification(notification: Notification) {
    // Store notification
    if (!this.notifications.has(notification.userId)) {
      this.notifications.set(notification.userId, []);
    }
    this.notifications.get(notification.userId)!.push(notification);

    // Send to connected clients
    this.sendToUser(notification.userId, {
      type: 'new_notification',
      notification,
    });

    console.log(`[Notifications] Sent notification to user ${notification.userId}: ${notification.title}`);
  }

  private sendToUser(userId: number, data: any) {
    const connections = this.clients.get(userId) || [];
    const message = JSON.stringify(data);

    connections.forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  markAsRead(userId: number, notificationId: string) {
    const userNotifications = this.notifications.get(userId) || [];
    const notification = userNotifications.find(n => n.id === notificationId);
    
    if (notification) {
      notification.read = true;
      this.sendToUser(userId, {
        type: 'notification_read',
        notificationId,
      });
    }
  }

  markAllAsRead(userId: number) {
    const userNotifications = this.notifications.get(userId) || [];
    userNotifications.forEach(n => n.read = true);
    
    this.sendToUser(userId, {
      type: 'all_notifications_read',
    });
  }

  getUserNotifications(userId: number): Notification[] {
    return this.notifications.get(userId) || [];
  }

  getUnreadCount(userId: number): number {
    const userNotifications = this.notifications.get(userId) || [];
    return userNotifications.filter(n => !n.read).length;
  }

  // Helper methods to create specific notification types
  createTransactionApprovedNotification(userId: number, transactionId: number, parcelNumber: string): Notification {
    return {
      id: `txn-approved-${transactionId}-${Date.now()}`,
      type: 'transaction_approved',
      title: 'Transaction Approved',
      message: `Your transaction for parcel ${parcelNumber} has been approved`,
      userId,
      data: { transactionId, parcelNumber },
      createdAt: new Date(),
      read: false,
    };
  }

  createTransactionRejectedNotification(userId: number, transactionId: number, parcelNumber: string, reason: string): Notification {
    return {
      id: `txn-rejected-${transactionId}-${Date.now()}`,
      type: 'transaction_rejected',
      title: 'Transaction Rejected',
      message: `Your transaction for parcel ${parcelNumber} was rejected: ${reason}`,
      userId,
      data: { transactionId, parcelNumber, reason },
      createdAt: new Date(),
      read: false,
    };
  }

  createDocumentUploadedNotification(userId: number, documentId: number, fileName: string): Notification {
    return {
      id: `doc-uploaded-${documentId}-${Date.now()}`,
      type: 'document_uploaded',
      title: 'Document Uploaded',
      message: `Document "${fileName}" has been successfully uploaded`,
      userId,
      data: { documentId, fileName },
      createdAt: new Date(),
      read: false,
    };
  }

  createParcelVerifiedNotification(userId: number, parcelId: number, parcelNumber: string): Notification {
    return {
      id: `parcel-verified-${parcelId}-${Date.now()}`,
      type: 'parcel_verified',
      title: 'Parcel Verified',
      message: `Parcel ${parcelNumber} has been verified and is now active`,
      userId,
      data: { parcelId, parcelNumber },
      createdAt: new Date(),
      read: false,
    };
  }

  createPaymentCompletedNotification(userId: number, paymentId: number, amount: number): Notification {
    return {
      id: `payment-completed-${paymentId}-${Date.now()}`,
      type: 'payment_completed',
      title: 'Payment Completed',
      message: `Your payment of ₦${amount.toLocaleString()} has been processed successfully`,
      userId,
      data: { paymentId, amount },
      createdAt: new Date(),
      read: false,
    };
  }

  // Verification workflow notifications
  notifyNewVerificationRequest(requestId: number, parcelId: string) {
    console.log(`[Notifications] New verification request ${requestId} for parcel ${parcelId}`);
    // In production, notify all admins/registrars
  }

  notifyVerificationAssigned(requestId: number, reviewerId: number) {
    const notification: Notification = {
      id: `verification-assigned-${requestId}-${Date.now()}`,
      type: 'system_alert',
      title: 'Verification Assigned',
      message: `You have been assigned to review verification request #${requestId}`,
      userId: reviewerId,
      data: { requestId },
      createdAt: new Date(),
      read: false,
    };
    this.sendNotification(notification);
  }

  notifyVerificationApproved(requestId: number, requesterId: number) {
    const notification: Notification = {
      id: `verification-approved-${requestId}-${Date.now()}`,
      type: 'parcel_verified',
      title: 'Verification Approved',
      message: `Your verification request #${requestId} has been approved`,
      userId: requesterId,
      data: { requestId },
      createdAt: new Date(),
      read: false,
    };
    this.sendNotification(notification);
  }

  notifyVerificationRejected(requestId: number, requesterId: number, reason: string) {
    const notification: Notification = {
      id: `verification-rejected-${requestId}-${Date.now()}`,
      type: 'system_alert',
      title: 'Verification Rejected',
      message: `Your verification request #${requestId} was rejected: ${reason}`,
      userId: requesterId,
      data: { requestId, reason },
      createdAt: new Date(),
      read: false,
    };
    this.sendNotification(notification);
  }

  // Real-time collaboration events
  broadcastCommentAdded(entityType: string, entityId: string, comment: any) {
    // Broadcast to all connected clients (for now, can be refined to specific entity watchers)
    this.clients.forEach((connections, userId) => {
      connections.forEach(({ ws }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'comment_added',
            entityType,
            entityId,
            comment,
          }));
        }
      });
    });
    console.log(`[Notifications] Broadcast comment_added for ${entityType}:${entityId}`);
  }

  broadcastCommentEdited(entityType: string, entityId: string, commentId: string, content: string) {
    this.clients.forEach((connections, userId) => {
      connections.forEach(({ ws }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'comment_edited',
            entityType,
            entityId,
            commentId,
            content,
          }));
        }
      });
    });
    console.log(`[Notifications] Broadcast comment_edited for ${entityType}:${entityId}`);
  }

  broadcastCommentDeleted(entityType: string, entityId: string, commentId: string) {
    this.clients.forEach((connections, userId) => {
      connections.forEach(({ ws }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'comment_deleted',
            entityType,
            entityId,
            commentId,
          }));
        }
      });
    });
    console.log(`[Notifications] Broadcast comment_deleted for ${entityType}:${entityId}`);
  }

  broadcastActivityUpdate(activity: any) {
    this.clients.forEach((connections, userId) => {
      connections.forEach(({ ws }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'activity_update',
            activity,
          }));
        }
      });
    });
    console.log(`[Notifications] Broadcast activity_update`);
  }

  // Presence tracking methods
  private handleUserJoinedPage(userId: number, userName: string, pageId: string) {
    if (!this.presence.has(pageId)) {
      this.presence.set(pageId, new Map());
    }
    
    const pagePresence = this.presence.get(pageId)!;
    pagePresence.set(userId, {
      userId,
      userName,
      joinedAt: new Date(),
    });

    // Broadcast presence update to all users on this page
    this.broadcastPresenceUpdate(pageId);
    console.log(`[Presence] User ${userId} (${userName}) joined page ${pageId}`);
  }

  private handleUserLeftPage(userId: number, pageId: string) {
    const pagePresence = this.presence.get(pageId);
    if (pagePresence) {
      pagePresence.delete(userId);
      
      // Clean up empty page presence
      if (pagePresence.size === 0) {
        this.presence.delete(pageId);
      } else {
        // Broadcast presence update to remaining users
        this.broadcastPresenceUpdate(pageId);
      }
    }
    console.log(`[Presence] User ${userId} left page ${pageId}`);
  }

  private broadcastPresenceUpdate(pageId: string) {
    const pagePresence = this.presence.get(pageId);
    if (!pagePresence) return;

    const presenceList = Array.from(pagePresence.values());
    
    // Send to all users currently on this page
    pagePresence.forEach((info) => {
      this.sendToUser(info.userId, {
        type: 'presence_update',
        pageId,
        users: presenceList,
      });
    });
  }

  getPagePresence(pageId: string): PresenceInfo[] {
    const pagePresence = this.presence.get(pageId);
    return pagePresence ? Array.from(pagePresence.values()) : [];
  }
}

export const notificationService = new NotificationService();
