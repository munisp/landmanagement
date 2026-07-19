/**
 * Email Service
 * Handles email delivery via SendGrid with templates and queue management
 */

import sgMail from '@sendgrid/mail';
import { requireDb } from './db';
import { sql } from 'drizzle-orm';

// Initialize SendGrid (API key from environment)
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@idlr-pts.com';
const FROM_NAME = process.env.FROM_NAME || 'IDLR-PTS Platform';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface EmailAttachment {
  content: string; // Base64 encoded content
  filename: string;
  type: string; // MIME type
  disposition?: 'attachment' | 'inline';
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

/**
 * Send email via SendGrid
 */
export async function sendEmail(options: SendEmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  if (!SENDGRID_API_KEY) {
    console.warn('[EmailService] SendGrid API key not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const msg = {
      to: options.to,
      from: {
        email: FROM_EMAIL,
        name: FROM_NAME,
      },
      subject: options.subject,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      html: options.html,
      attachments: options.attachments,
      replyTo: options.replyTo,
    };

    const [response] = await sgMail.send(msg);
    
    // Log email delivery
    await logEmailDelivery({
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      status: 'sent',
      messageId: response.headers['x-message-id'] as string,
    });

    return {
      success: true,
      messageId: response.headers['x-message-id'] as string,
    };
  } catch (error: any) {
    console.error('[EmailService] Failed to send email:', error);
    
    // Log failed delivery
    await logEmailDelivery({
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      status: 'failed',
      error: error.message,
    });

    return {
      success: false,
      error: error.message || 'Failed to send email',
    };
  }
}

/**
 * Send report email with attachment
 */
export async function sendReportEmail(
  to: string,
  reportName: string,
  reportType: string,
  fileContent: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ success: boolean; error?: string }> {
  const template = getReportEmailTemplate(reportName, reportType);
  
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
    attachments: [
      {
        content: fileContent.toString('base64'),
        filename: fileName,
        type: mimeType,
        disposition: 'attachment',
      },
    ],
  });
}

/**
 * Send notification email
 */
export async function sendNotificationEmail(
  to: string,
  title: string,
  message: string,
  actionUrl?: string,
  actionText?: string
): Promise<{ success: boolean; error?: string }> {
  const template = getNotificationEmailTemplate(title, message, actionUrl, actionText);
  
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send verification request notification email
 */
export async function sendVerificationRequestEmail(
  to: string,
  parcelId: string,
  requesterName: string,
  actionUrl: string
): Promise<{ success: boolean; error?: string }> {
  const template = getVerificationRequestEmailTemplate(parcelId, requesterName, actionUrl);
  
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Send verification status update email
 */
export async function sendVerificationStatusEmail(
  to: string,
  parcelId: string,
  status: 'approved' | 'rejected',
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const template = getVerificationStatusEmailTemplate(parcelId, status, reason);
  
  return sendEmail({
    to,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}

/**
 * Log email delivery to database
 */
async function logEmailDelivery(log: {
  to: string;
  subject: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
}): Promise<void> {
  try {
    const db = await requireDb();

    await db.execute(sql`
      INSERT INTO email_logs (recipient, subject, status, message_id, error, created_at)
      VALUES (${log.to}, ${log.subject}, ${log.status}, ${log.messageId || null}, ${log.error || null}, NOW())
    `);
  } catch (error) {
    console.error('[EmailService] Failed to log email delivery:', error);
  }
}

/**
 * Get report email template
 */
function getReportEmailTemplate(reportName: string, reportType: string): EmailTemplate {
  return {
    subject: `${reportName} - ${reportType} Report`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IDLR-PTS Platform</h1>
          </div>
          <div class="content">
            <h2>Your ${reportType} Report is Ready</h2>
            <p>Hello,</p>
            <p>Your requested report "<strong>${reportName}</strong>" has been generated and is attached to this email.</p>
            <p>Report Type: <strong>${reportType}</strong></p>
            <p>Generated: <strong>${new Date().toLocaleString()}</strong></p>
            <p>Please find the report attached to this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Your ${reportType} Report is Ready

Hello,

Your requested report "${reportName}" has been generated and is attached to this email.

Report Type: ${reportType}
Generated: ${new Date().toLocaleString()}

Please find the report attached to this email.

---
© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.
This is an automated email. Please do not reply.
    `,
  };
}

/**
 * Get notification email template
 */
function getNotificationEmailTemplate(
  title: string,
  message: string,
  actionUrl?: string,
  actionText?: string
): EmailTemplate {
  const actionButton = actionUrl && actionText
    ? `<p style="text-align: center; margin: 30px 0;">
         <a href="${actionUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
           ${actionText}
         </a>
       </p>`
    : '';

  return {
    subject: title,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IDLR-PTS Platform</h1>
          </div>
          <div class="content">
            <h2>${title}</h2>
            <p>${message}</p>
            ${actionButton}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
${title}

${message}

${actionUrl ? `\n${actionText}: ${actionUrl}` : ''}

---
© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.
    `,
  };
}

/**
 * Get verification request email template
 */
function getVerificationRequestEmailTemplate(
  parcelId: string,
  requesterName: string,
  actionUrl: string
): EmailTemplate {
  return {
    subject: `New Verification Request for Parcel ${parcelId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .info-box { background: white; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IDLR-PTS Platform</h1>
          </div>
          <div class="content">
            <h2>New Verification Request</h2>
            <p>A new verification request has been submitted and requires your review.</p>
            <div class="info-box">
              <p><strong>Parcel ID:</strong> ${parcelId}</p>
              <p><strong>Requester:</strong> ${requesterName}</p>
              <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
            </div>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${actionUrl}" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Review Request
              </a>
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
New Verification Request

A new verification request has been submitted and requires your review.

Parcel ID: ${parcelId}
Requester: ${requesterName}
Submitted: ${new Date().toLocaleString()}

Review Request: ${actionUrl}

---
© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.
    `,
  };
}

/**
 * Get verification status email template
 */
function getVerificationStatusEmailTemplate(
  parcelId: string,
  status: 'approved' | 'rejected',
  reason?: string
): EmailTemplate {
  const statusColor = status === 'approved' ? '#10b981' : '#ef4444';
  const statusText = status === 'approved' ? 'Approved' : 'Rejected';
  const reasonSection = reason
    ? `<div class="info-box" style="border-left-color: ${statusColor};">
         <p><strong>Reason:</strong> ${reason}</p>
       </div>`
    : '';

  return {
    subject: `Verification Request ${statusText} for Parcel ${parcelId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .info-box { background: white; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0; }
          .status { display: inline-block; padding: 8px 16px; border-radius: 4px; color: white; background: ${statusColor}; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>IDLR-PTS Platform</h1>
          </div>
          <div class="content">
            <h2>Verification Request Update</h2>
            <p>Your verification request has been reviewed.</p>
            <div class="info-box">
              <p><strong>Parcel ID:</strong> ${parcelId}</p>
              <p><strong>Status:</strong> <span class="status">${statusText}</span></p>
              <p><strong>Reviewed:</strong> ${new Date().toLocaleString()}</p>
            </div>
            ${reasonSection}
            ${status === 'approved' 
              ? '<p>Your parcel verification has been approved and recorded on the blockchain.</p>'
              : '<p>Please review the rejection reason and submit a new request if needed.</p>'}
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Verification Request Update

Your verification request has been reviewed.

Parcel ID: ${parcelId}
Status: ${statusText}
Reviewed: ${new Date().toLocaleString()}
${reason ? `\nReason: ${reason}` : ''}

${status === 'approved' 
  ? 'Your parcel verification has been approved and recorded on the blockchain.'
  : 'Please review the rejection reason and submit a new request if needed.'}

---
© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.
    `,
  };
}
