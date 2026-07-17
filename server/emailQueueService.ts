/**
 * Email Queue Service
 * Handles email queue processing with retry logic and delivery tracking
 */

import { getDb } from './db';
import { sql } from 'drizzle-orm';
import { sendEmail, type SendEmailOptions, type EmailAttachment } from './emailService';

export interface QueuedEmail {
  id: number;
  recipient: string;
  subject: string;
  htmlContent: string;
  textContent: string | null;
  attachments: EmailAttachment[] | null;
  status: 'pending' | 'sent' | 'failed';
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  scheduledAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Add email to queue
 */
export async function queueEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  scheduledAt?: Date;
  maxRetries?: number;
}): Promise<{ success: boolean; queueId?: number }> {
  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const result = await db.execute(sql`
      INSERT INTO email_queue (
        recipient, subject, html_content, text_content, attachments,
        scheduled_at, max_retries, created_at, updated_at
      )
      VALUES (
        ${options.to},
        ${options.subject},
        ${options.html},
        ${options.text || null},
        ${options.attachments ? JSON.stringify(options.attachments) : null},
        ${options.scheduledAt || new Date()},
        ${options.maxRetries || 3},
        NOW(),
        NOW()
      )
      RETURNING id
    `);

    const queueId = (Array.from(result)[0] as any)?.id;

    console.log(`[EmailQueue] Email queued: ${queueId} to ${options.to}`);

    return { success: true, queueId };
  } catch (error: any) {
    console.error('[EmailQueue] Failed to queue email:', error);
    return { success: false };
  }
}

/**
 * Process pending emails in queue
 */
export async function processEmailQueue(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;

  try {
    // Get pending emails that are ready to send
    const result = await db.execute(sql`
      SELECT *
      FROM email_queue
      WHERE status = 'pending'
        AND scheduled_at <= NOW()
        AND retry_count < max_retries
      ORDER BY scheduled_at ASC
      LIMIT 50
    `);

    const pendingEmails = Array.from(result) as any[];

    for (const email of pendingEmails) {
      processed++;

      try {
        // Parse attachments if present
        const attachments = email.attachments
          ? (typeof email.attachments === 'string'
              ? JSON.parse(email.attachments)
              : email.attachments)
          : undefined;

        // Send email
        const sendResult = await sendEmail({
          to: email.recipient,
          subject: email.subject,
          html: email.html_content,
          text: email.text_content || undefined,
          attachments,
        });

        if (sendResult.success) {
          // Mark as sent
          await db.execute(sql`
            UPDATE email_queue
            SET status = 'sent',
                sent_at = NOW(),
                updated_at = NOW()
            WHERE id = ${email.id}
          `);
          sent++;
          console.log(`[EmailQueue] Email sent: ${email.id} to ${email.recipient}`);
        } else {
          // Increment retry count
          const newRetryCount = email.retry_count + 1;
          const newStatus = newRetryCount >= email.max_retries ? 'failed' : 'pending';

          await db.execute(sql`
            UPDATE email_queue
            SET retry_count = ${newRetryCount},
                status = ${newStatus},
                last_error = ${sendResult.error || 'Unknown error'},
                updated_at = NOW()
            WHERE id = ${email.id}
          `);

          if (newStatus === 'failed') {
            failed++;
            console.error(`[EmailQueue] Email failed permanently: ${email.id} to ${email.recipient}`);
          } else {
            console.warn(`[EmailQueue] Email send failed, will retry: ${email.id} (attempt ${newRetryCount}/${email.max_retries})`);
          }
        }
      } catch (error: any) {
        console.error(`[EmailQueue] Error processing email ${email.id}:`, error);
        
        // Increment retry count on error
        const newRetryCount = email.retry_count + 1;
        const newStatus = newRetryCount >= email.max_retries ? 'failed' : 'pending';

        await db.execute(sql`
          UPDATE email_queue
          SET retry_count = ${newRetryCount},
              status = ${newStatus},
              last_error = ${error.message || 'Unknown error'},
              updated_at = NOW()
          WHERE id = ${email.id}
        `);

        if (newStatus === 'failed') {
          failed++;
        }
      }
    }

    if (processed > 0) {
      console.log(`[EmailQueue] Processed ${processed} emails: ${sent} sent, ${failed} failed`);
    }

    return { processed, sent, failed };
  } catch (error) {
    console.error('[EmailQueue] Error processing email queue:', error);
    return { processed, sent, failed };
  }
}

/**
 * Get email queue statistics
 */
export async function getEmailQueueStats(): Promise<{
  pending: number;
  sent: number;
  failed: number;
  total: number;
}> {
  try {
    const db = await getDb();
    if (!db) {
      return { pending: 0, sent: 0, failed: 0, total: 0 };
    }

    const result = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM email_queue
    `);

    const stats = Array.from(result)[0] as any;

    return {
      pending: Number(stats.pending || 0),
      sent: Number(stats.sent || 0),
      failed: Number(stats.failed || 0),
      total: Number(stats.total || 0),
    };
  } catch (error) {
    console.error('[EmailQueue] Error getting queue stats:', error);
    return { pending: 0, sent: 0, failed: 0, total: 0 };
  }
}

/**
 * Retry failed emails
 */
export async function retryFailedEmails(): Promise<{ retriedCount: number }> {
  try {
    const db = await getDb();
    if (!db) {
      return { retriedCount: 0 };
    }

    const result = await db.execute(sql`
      UPDATE email_queue
      SET status = 'pending',
          retry_count = 0,
          last_error = NULL,
          updated_at = NOW()
      WHERE status = 'failed'
        AND retry_count < max_retries
      RETURNING id
    `);

    const retriedCount = Array.from(result).length;

    if (retriedCount > 0) {
      console.log(`[EmailQueue] Retrying ${retriedCount} failed emails`);
    }

    return { retriedCount };
  } catch (error) {
    console.error('[EmailQueue] Error retrying failed emails:', error);
    return { retriedCount: 0 };
  }
}

/**
 * Clean up old sent emails (older than 30 days)
 */
export async function cleanupOldEmails(): Promise<{ deletedCount: number }> {
  try {
    const db = await getDb();
    if (!db) {
      return { deletedCount: 0 };
    }

    const result = await db.execute(sql`
      DELETE FROM email_queue
      WHERE status = 'sent'
        AND sent_at < NOW() - INTERVAL '30 days'
      RETURNING id
    `);

    const deletedCount = Array.from(result).length;

    if (deletedCount > 0) {
      console.log(`[EmailQueue] Cleaned up ${deletedCount} old emails`);
    }

    return { deletedCount };
  } catch (error) {
    console.error('[EmailQueue] Error cleaning up old emails:', error);
    return { deletedCount: 0 };
  }
}

// Start email queue processor (runs every 2 minutes)
let queueProcessorInterval: NodeJS.Timeout | null = null;

export function startEmailQueueProcessor(): void {
  if (queueProcessorInterval) {
    console.warn('[EmailQueue] Processor already running');
    return;
  }

  console.log('[EmailQueue] Starting email queue processor');

  // Process immediately
  processEmailQueue();

  // Then process every 2 minutes
  queueProcessorInterval = setInterval(() => {
    processEmailQueue();
  }, 2 * 60 * 1000); // 2 minutes

  // Clean up old emails daily
  setInterval(() => {
    cleanupOldEmails();
  }, 24 * 60 * 60 * 1000); // 24 hours
}

export function stopEmailQueueProcessor(): void {
  if (queueProcessorInterval) {
    clearInterval(queueProcessorInterval);
    queueProcessorInterval = null;
    console.log('[EmailQueue] Email queue processor stopped');
  }
}
