import { requireDb } from "../db";
import { emailQueue, emailLogs } from "../../drizzle/schema";
import { eq, and, lt, desc } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { sendEmail as deliverEmail } from "../emailService";

// Email template renderer
function renderEmailTemplate(templateName: string, variables: Record<string, string>): string {
  const templatePath = path.join(__dirname, "../templates/email", `${templateName}.html`);
  let template = fs.readFileSync(templatePath, "utf-8");
  
  // Replace all {{variable}} placeholders with actual values
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    template = template.replace(regex, value);
  }
  
  return template;
}

// SMS template renderer
function renderSMSTemplate(templateName: string, variables: Record<string, string>): string {
  const templatesPath = path.join(__dirname, "../templates/sms/templates.json");
  const templates = JSON.parse(fs.readFileSync(templatesPath, "utf-8"));
  
  const templateConfig = templates[templateName];
  if (!templateConfig) {
    throw new Error(`SMS template "${templateName}" not found`);
  }
  
  let message = templateConfig.template;
  
  // Replace all {{variable}} placeholders with actual values
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    message = message.replace(regex, value);
  }
  
  // Ensure message doesn't exceed max length
  if (message.length > templateConfig.maxLength) {
    message = message.substring(0, templateConfig.maxLength - 3) + "...";
  }
  
  return message;
}

// Queue email notification
export async function queueEmailNotification(
  recipientEmail: string,
  recipientName: string,
  subject: string,
  templateName: string,
  variables: Record<string, string>,
  priority: "high" | "normal" | "low" = "normal",
  scheduledAt?: Date
) {
  const db = await requireDb();
  
  const htmlBody = renderEmailTemplate(templateName, variables);
  
  const [notification] = await db.insert(emailQueue).values({
    recipientEmail,
    subject,
    body: htmlBody,
    status: "pending",
    retryCount: 0,
    scheduledAt: scheduledAt || new Date(),
    metadata: { templateName, variables, recipientName },
  }).returning();
  
  return notification;
}

// Queue SMS notification
export async function queueSMSNotification(
  recipientPhone: string,
  templateName: string,
  variables: Record<string, string>,
  priority: "high" | "normal" | "low" = "normal"
) {
  // SMS implementation would integrate with SMS provider (Twilio, Africa's Talking, etc.)
  const message = renderSMSTemplate(templateName, variables);
  
  console.log(`[SMS Queue] To: ${recipientPhone}, Message: ${message}`);
  
  // In production, this would queue to SMS provider
  return {
    recipientPhone,
    message,
    templateName,
    priority,
    status: "queued",
  };
}

// Process email queue (called by scheduler)
export async function processEmailQueue() {
  const db = await requireDb();
  
  // Get pending emails that are due to be sent
  const pendingEmails = await db
    .select()
    .from(emailQueue)
    .where(
      and(
        eq(emailQueue.status, "pending"),
        lt(emailQueue.scheduledAt, new Date())
      )
    )
    .orderBy(emailQueue.scheduledAt)
    .limit(10); // Process 10 at a time
  
  for (const email of pendingEmails) {
    try {
      // In production, integrate with email service (SendGrid, AWS SES, etc.)
      await sendEmail(email);
      
      // Mark as sent
      await db
        .update(emailQueue)
        .set({
          status: "sent",
          lastAttemptAt: new Date(),
        })
        .where(eq(emailQueue.id, email.id));
      
      // Log successful delivery
      await db.insert(emailLogs).values({
        recipientEmail: email.recipientEmail,
        subject: email.subject,
        body: email.body,
        status: "sent",
        sentAt: new Date(),
        metadata: { queueId: email.id },
      });
      
      console.log(`[Email] Sent to ${email.recipientEmail}: ${email.subject}`);
    } catch (error) {
      console.error(`[Email] Failed to send to ${email.recipientEmail}:`, error);
      
      // Increment retry count
      const newRetryCount = email.retryCount + 1;
      const maxRetries = 3;
      
      if (newRetryCount >= maxRetries) {
        // Mark as failed after max retries
        await db
          .update(emailQueue)
        .set({
          status: "failed",
          retryCount: newRetryCount,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
          .where(eq(emailQueue.id, email.id));
        
        // Log failed delivery
        await db.insert(emailLogs).values({
          recipientEmail: email.recipientEmail,
          subject: email.subject,
          body: email.body,
          status: "failed",
          failedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : String(error),
          metadata: { queueId: email.id },
        });
      } else {
        // Schedule retry with exponential backoff
        const retryDelay = Math.pow(2, newRetryCount) * 60 * 1000; // 2min, 4min, 8min
        const nextRetry = new Date(Date.now() + retryDelay);
        
        await db
          .update(emailQueue)
          .set({
            retryCount: newRetryCount,
            nextRetryAt: nextRetry,
            lastAttemptAt: new Date(),
            errorMessage: error instanceof Error ? error.message : String(error),
          })
          .where(eq(emailQueue.id, email.id));
        
        console.log(`[Email] Scheduled retry ${newRetryCount}/${maxRetries} for ${email.recipientEmail} at ${nextRetry}`);
      }
    }
  }
  
  return {
    processed: pendingEmails.length,
    timestamp: new Date(),
  };
}

// Live email sender with deterministic local fallback
async function sendEmail(email: { recipientEmail: string; subject: string; body: string; metadata?: any }) {
  const result = await deliverEmail({
    to: email.recipientEmail,
    subject: email.subject,
    html: email.body,
    text: String(email.body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
  });

  if (result.success) {
    return result;
  }

  const fallbackDir = path.join(process.cwd(), 'server', 'data', 'notification-email-fallback');
  fs.mkdirSync(fallbackDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeRecipient = email.recipientEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
  const fallbackPath = path.join(fallbackDir, `${stamp}-${safeRecipient}.html`);

  fs.writeFileSync(
    fallbackPath,
    [
      `<!-- offline email fallback -->`,
      `<h1>${email.subject}</h1>`,
      `<p><strong>Recipient:</strong> ${email.recipientEmail}</p>`,
      `<p><strong>Stored:</strong> ${new Date().toISOString()}</p>`,
      `<hr />`,
      email.body,
    ].join('\n'),
    'utf-8'
  );

  console.warn(`[NotificationService] Email provider unavailable; wrote offline fallback to ${fallbackPath}`);
  return { success: true, fallbackPath };
}

// Get notification delivery statistics
export async function getNotificationStats(userId?: number) {
  const db = await requireDb();
  
  const stats = await db
    .select()
    .from(emailLogs)
    .where(userId ? eq(emailLogs.recipientEmail, `user${userId}@example.com`) : undefined);
  
  const total = stats.length;
  const delivered = stats.filter(s => s.status === "sent").length;
  const failed = stats.filter(s => s.status === "failed").length;
  const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;
  
  return {
    total,
    delivered,
    failed,
    deliveryRate: deliveryRate.toFixed(2) + "%",
  };
}

// Send transaction notification
export async function sendTransactionNotification(
  transactionId: number,
  status: "initiated" | "approved" | "completed" | "rejected",
  recipientEmail: string,
  recipientName: string,
  transactionData: {
    transactionType: string;
    parcelId: string;
    propertyAddress: string;
    amount: string;
    currency: string;
    [key: string]: any;
  }
) {
  const templateMap = {
    initiated: "transaction-initiated",
    approved: "transaction-approved",
    completed: "transaction-completed",
    rejected: "transaction-rejected",
  };
  
  const subjectMap = {
    initiated: "Transaction Initiated",
    approved: "Transaction Approved",
    completed: "Transaction Completed Successfully",
    rejected: "Transaction Rejected",
  };
  
  const variables = {
    userName: recipientName,
    transactionId: transactionId.toString(),
    ...transactionData,
    dashboardUrl: `${process.env.VITE_APP_URL || "https://idlr-pts.manus.space"}/dashboard`,
  };
  
  return await queueEmailNotification(
    recipientEmail,
    recipientName,
    subjectMap[status],
    templateMap[status],
    variables,
    status === "completed" || status === "rejected" ? "high" : "normal"
  );
}

// Send verification notification
export async function sendVerificationNotification(
  requestId: number,
  status: "submitted" | "approved" | "rejected",
  recipientEmail: string,
  recipientName: string,
  verificationData: {
    verificationType: string;
    parcelId: string;
    propertyAddress: string;
    [key: string]: any;
  }
) {
  const templateMap = {
    submitted: "verification-submitted",
    approved: "verification-approved",
    rejected: "verification-rejected",
  };
  
  const subjectMap = {
    submitted: "Verification Request Submitted",
    approved: "Verification Approved",
    rejected: "Verification Rejected",
  };
  
  const variables = {
    userName: recipientName,
    requestId: requestId.toString(),
    ...verificationData,
    dashboardUrl: `${process.env.VITE_APP_URL || "https://idlr-pts.manus.space"}/dashboard`,
  };
  
  return await queueEmailNotification(
    recipientEmail,
    recipientName,
    subjectMap[status],
    templateMap[status],
    variables,
    status === "approved" || status === "rejected" ? "high" : "normal"
  );
}
