import axios from 'axios';

/**
 * Email/SMS Notification Delivery Service
 * Integrates with SendGrid for email and Africa's Talking for SMS
 */

interface EmailNotification {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SMSNotification {
  to: string;
  message: string;
}

interface NotificationDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Email Templates
export const emailTemplates = {
  transactionApproved: (data: { parcelNumber: string; transactionType: string; userName: string }) => ({
    subject: `Transaction Approved - ${data.parcelNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9fafb; padding: 30px; }
          .button { background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Transaction Approved</h1>
          </div>
          <div class="content">
            <p>Dear ${data.userName},</p>
            <p>Your ${data.transactionType} transaction for parcel <strong>${data.parcelNumber}</strong> has been approved.</p>
            <p>You can now proceed with the next steps in the process.</p>
            <a href="${process.env.FRONTEND_URL || 'https://idlr-pts.manus.space'}/transactions" class="button">View Transaction</a>
          </div>
          <div class="footer">
            <p>IDLR-PTS - Integrated Digital Land Registry & Property Title System</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${data.userName},\n\nYour ${data.transactionType} transaction for parcel ${data.parcelNumber} has been approved.\n\nYou can view your transaction at: ${process.env.FRONTEND_URL || 'https://idlr-pts.manus.space'}/transactions\n\nIDLR-PTS Team`,
  }),

  transactionRejected: (data: { parcelNumber: string; transactionType: string; userName: string; reason: string }) => ({
    subject: `Transaction Rejected - ${data.parcelNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #ef4444; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9fafb; padding: 30px; }
          .reason { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; }
          .button { background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Transaction Rejected</h1>
          </div>
          <div class="content">
            <p>Dear ${data.userName},</p>
            <p>Your ${data.transactionType} transaction for parcel <strong>${data.parcelNumber}</strong> has been rejected.</p>
            <div class="reason">
              <strong>Reason:</strong> ${data.reason}
            </div>
            <p>Please review the rejection reason and contact support if you need assistance.</p>
            <a href="${process.env.FRONTEND_URL || 'https://idlr-pts.manus.space'}/transactions" class="button">View Transaction</a>
          </div>
          <div class="footer">
            <p>IDLR-PTS - Integrated Digital Land Registry & Property Title System</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${data.userName},\n\nYour ${data.transactionType} transaction for parcel ${data.parcelNumber} has been rejected.\n\nReason: ${data.reason}\n\nPlease review and contact support if needed.\n\nIDLR-PTS Team`,
  }),

  paymentConfirmation: (data: { userName: string; amount: number; reference: string; parcelNumber: string }) => ({
    subject: `Payment Confirmation - ₦${data.amount.toLocaleString()}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10b981; color: white; padding: 20px; text-align: center; }
          .content { background-color: #f9fafb; padding: 30px; }
          .receipt { background-color: white; border: 1px solid #e5e7eb; padding: 20px; margin: 20px 0; }
          .receipt-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .total { font-size: 18px; font-weight: bold; color: #10b981; }
          .button { background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Confirmed</h1>
          </div>
          <div class="content">
            <p>Dear ${data.userName},</p>
            <p>Your payment has been successfully processed.</p>
            <div class="receipt">
              <div class="receipt-row">
                <span>Reference Number:</span>
                <strong>${data.reference}</strong>
              </div>
              <div class="receipt-row">
                <span>Parcel Number:</span>
                <strong>${data.parcelNumber}</strong>
              </div>
              <div class="receipt-row total">
                <span>Amount Paid:</span>
                <span>₦${data.amount.toLocaleString()}</span>
              </div>
            </div>
            <p>A receipt has been sent to your email. Please keep this for your records.</p>
            <a href="${process.env.FRONTEND_URL || 'https://idlr-pts.manus.space'}/transactions" class="button">View Transaction</a>
          </div>
          <div class="footer">
            <p>IDLR-PTS - Integrated Digital Land Registry & Property Title System</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `Dear ${data.userName},\n\nYour payment has been successfully processed.\n\nReference: ${data.reference}\nParcel: ${data.parcelNumber}\nAmount: ₦${data.amount.toLocaleString()}\n\nIDLR-PTS Team`,
  }),
};

// SMS Templates
export const smsTemplates = {
  transactionApproved: (data: { parcelNumber: string; transactionType: string }) =>
    `IDLR-PTS: Your ${data.transactionType} for parcel ${data.parcelNumber} has been APPROVED. Login to view details.`,
  
  transactionRejected: (data: { parcelNumber: string }) =>
    `IDLR-PTS: Your transaction for parcel ${data.parcelNumber} has been REJECTED. Login to view reason.`,
  
  paymentConfirmation: (data: { amount: number; reference: string }) =>
    `IDLR-PTS: Payment of ₦${data.amount.toLocaleString()} confirmed. Ref: ${data.reference}`,
  
  documentUploaded: (data: { parcelNumber: string }) =>
    `IDLR-PTS: New document uploaded for parcel ${data.parcelNumber}. Login to review.`,
};

/**
 * Send email notification using SendGrid
 */
export async function sendEmail(notification: EmailNotification): Promise<NotificationDeliveryResult> {
  try {
    // In production, use actual SendGrid API
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    
    if (!SENDGRID_API_KEY) {
      console.warn('[Email] SendGrid API key not configured, skipping email send');
      return { success: false, error: 'Email service not configured' };
    }

    const response = await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [
          {
            to: [{ email: notification.to }],
            subject: notification.subject,
          },
        ],
        from: {
          email: process.env.FROM_EMAIL || 'noreply@idlr-pts.gov.ng',
          name: 'IDLR-PTS System',
        },
        content: [
          {
            type: 'text/html',
            value: notification.html,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${SENDGRID_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      success: true,
      messageId: response.headers['x-message-id'],
    };
  } catch (error: any) {
    console.error('[Email] Failed to send email:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send SMS notification using Africa's Talking
 */
export async function sendSMS(notification: SMSNotification): Promise<NotificationDeliveryResult> {
  try {
    // In production, use actual Africa's Talking API
    const AT_API_KEY = process.env.AFRICAS_TALKING_API_KEY;
    const AT_USERNAME = process.env.AFRICAS_TALKING_USERNAME || 'sandbox';
    
    if (!AT_API_KEY) {
      console.warn('[SMS] Africa\'s Talking API key not configured, skipping SMS send');
      return { success: false, error: 'SMS service not configured' };
    }

    const response = await axios.post(
      'https://api.africastalking.com/version1/messaging',
      new URLSearchParams({
        username: AT_USERNAME,
        to: notification.to,
        message: notification.message,
      }),
      {
        headers: {
          apiKey: AT_API_KEY,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return {
      success: true,
      messageId: response.data.SMSMessageData?.Recipients?.[0]?.messageId,
    };
  } catch (error: any) {
    console.error('[SMS] Failed to send SMS:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send notification via both email and SMS
 */
export async function sendNotification(params: {
  email?: string;
  phone?: string;
  emailTemplate?: EmailNotification;
  smsMessage?: string;
}): Promise<{ email?: NotificationDeliveryResult; sms?: NotificationDeliveryResult }> {
  const results: { email?: NotificationDeliveryResult; sms?: NotificationDeliveryResult } = {};

  if (params.email && params.emailTemplate) {
    results.email = await sendEmail({
      ...params.emailTemplate,
      to: params.email,
    });
  }

  if (params.phone && params.smsMessage) {
    results.sms = await sendSMS({
      to: params.phone,
      message: params.smsMessage,
    });
  }

  return results;
}
