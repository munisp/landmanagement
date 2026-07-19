import { sendEmail, sendSMS } from './notificationDelivery';
import { notificationWS } from './notificationWebSocketService';
import { requireDb } from './db';
import { users, userPreferences } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

interface MortgageApplication {
  id: number;
  applicationId: string;
  applicantId: number;
  loanAmount: number;
  interestRate: string;
  loanTerm: number;
  monthlyPayment: number;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  rejectionReason?: string | null;
  parcelId: number;
}

/**
 * Send mortgage application status change notification
 */
export async function notifyMortgageStatusChange(
  application: MortgageApplication,
  previousStatus: string
): Promise<void> {
  try {
    const db = await requireDb();

    // Get applicant details
    const [applicant] = await db
      .select({
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, application.applicantId));

    if (!applicant) {
      console.error(`[MortgageNotification] Applicant ${application.applicantId} not found`);
      return;
    }

    // Get notification preferences
    const [preferences] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, application.applicantId));

    const notificationSettings = preferences?.notificationSettings as any || {
      email: true,
      sms: true,
      push: true,
    };

    // Generate notification content based on status
    const { subject, emailBody, smsMessage, webNotification } = generateNotificationContent(
      application,
      previousStatus,
      applicant.name
    );

    // Send email notification
    if (notificationSettings.email && applicant.email) {
      await sendEmail({
        to: applicant.email,
        subject,
        html: emailBody,
      });
      console.log(`[MortgageNotification] Email sent to ${applicant.email}`);
    }

    // Send SMS notification
    if (notificationSettings.sms && applicant.phone) {
      await sendSMS({
        to: applicant.phone,
        message: smsMessage,
      });
      console.log(`[MortgageNotification] SMS sent to ${applicant.phone}`);
    }

    // Send in-app notification via WebSocket
    if (notificationSettings.push) {
      await notificationWS.notifyUser(application.applicantId, {
        type: 'mortgage_update',
        priority: application.status === 'approved' ? 'high' : 'medium',
        title: webNotification.title,
        message: webNotification.message,
        metadata: {
          applicationId: application.applicationId,
          status: application.status,
          loanAmount: application.loanAmount,
          parcelId: application.parcelId,
        },
      });
      console.log(`[MortgageNotification] WebSocket notification sent to user ${application.applicantId}`);
    }
  } catch (error) {
    console.error('[MortgageNotification] Error sending notification:', error);
  }
}

/**
 * Generate notification content based on application status
 */
function generateNotificationContent(
  application: MortgageApplication,
  previousStatus: string,
  applicantName: string
): {
  subject: string;
  emailBody: string;
  smsMessage: string;
  webNotification: { title: string; message: string };
} {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const loanAmountFormatted = formatCurrency(application.loanAmount);
  const monthlyPaymentFormatted = formatCurrency(application.monthlyPayment);

  switch (application.status) {
    case 'under_review':
      return {
        subject: 'Mortgage Application Under Review',
        emailBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Mortgage Application Under Review</h2>
            <p>Dear ${applicantName},</p>
            <p>Your mortgage application <strong>${application.applicationId}</strong> is now under review by our loan officers.</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Loan Amount:</strong> ${loanAmountFormatted}</p>
              <p style="margin: 5px 0;"><strong>Interest Rate:</strong> ${application.interestRate}%</p>
              <p style="margin: 5px 0;"><strong>Loan Term:</strong> ${application.loanTerm} months</p>
              <p style="margin: 5px 0;"><strong>Monthly Payment:</strong> ${monthlyPaymentFormatted}</p>
            </div>
            <p>We will notify you once a decision has been made. This typically takes 3-5 business days.</p>
            <p>If you have any questions, please contact our support team.</p>
            <p>Best regards,<br>IDLR-PTS Mortgage Team</p>
          </div>
        `,
        smsMessage: `Your mortgage application ${application.applicationId} for ${loanAmountFormatted} is now under review. You will be notified once a decision is made.`,
        webNotification: {
          title: 'Application Under Review',
          message: `Your mortgage application ${application.applicationId} is being reviewed by our loan officers.`,
        },
      };

    case 'approved':
      return {
        subject: '🎉 Mortgage Application Approved!',
        emailBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Congratulations! Your Mortgage Application is Approved</h2>
            <p>Dear ${applicantName},</p>
            <p>We are pleased to inform you that your mortgage application <strong>${application.applicationId}</strong> has been <strong style="color: #16a34a;">APPROVED</strong>!</p>
            <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
              <p style="margin: 5px 0;"><strong>Loan Amount:</strong> ${loanAmountFormatted}</p>
              <p style="margin: 5px 0;"><strong>Interest Rate:</strong> ${application.interestRate}%</p>
              <p style="margin: 5px 0;"><strong>Loan Term:</strong> ${application.loanTerm} months (${Math.floor(application.loanTerm / 12)} years)</p>
              <p style="margin: 5px 0;"><strong>Monthly Payment:</strong> ${monthlyPaymentFormatted}</p>
            </div>
            <h3>Next Steps:</h3>
            <ol>
              <li>Log in to your dashboard to view your payment schedule</li>
              <li>Complete the loan agreement documentation</li>
              <li>Set up automatic payment instructions</li>
              <li>Your first payment will be due 30 days from disbursement</li>
            </ol>
            <p>Visit your <a href="/mortgage-dashboard" style="color: #2563eb;">Mortgage Dashboard</a> to view your payment schedule and manage your loan.</p>
            <p>Congratulations on your new property!</p>
            <p>Best regards,<br>IDLR-PTS Mortgage Team</p>
          </div>
        `,
        smsMessage: `🎉 Congratulations! Your mortgage application ${application.applicationId} for ${loanAmountFormatted} has been APPROVED! Monthly payment: ${monthlyPaymentFormatted}. Visit your dashboard for details.`,
        webNotification: {
          title: '🎉 Mortgage Approved!',
          message: `Your application ${application.applicationId} for ${loanAmountFormatted} has been approved. View your payment schedule now.`,
        },
      };

    case 'rejected':
      return {
        subject: 'Mortgage Application Decision',
        emailBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Mortgage Application Update</h2>
            <p>Dear ${applicantName},</p>
            <p>Thank you for your interest in obtaining a mortgage through IDLR-PTS. After careful review, we regret to inform you that we are unable to approve your application <strong>${application.applicationId}</strong> at this time.</p>
            ${
              application.rejectionReason
                ? `
            <div style="background-color: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <p style="margin: 0;"><strong>Reason:</strong> ${application.rejectionReason}</p>
            </div>
            `
                : ''
            }
            <h3>What You Can Do:</h3>
            <ul>
              <li>Review and improve your credit score</li>
              <li>Reduce existing debt obligations</li>
              <li>Increase your down payment amount</li>
              <li>Consider a co-applicant with strong credit</li>
              <li>Reapply after 6 months with improved financials</li>
            </ul>
            <p>If you have questions about this decision or would like to discuss your options, please contact our mortgage team.</p>
            <p>We appreciate your interest and hope to serve you in the future.</p>
            <p>Best regards,<br>IDLR-PTS Mortgage Team</p>
          </div>
        `,
        smsMessage: `Your mortgage application ${application.applicationId} could not be approved at this time. ${
          application.rejectionReason ? `Reason: ${application.rejectionReason}. ` : ''
        }Please check your email for details and next steps.`,
        webNotification: {
          title: 'Application Decision',
          message: `Your mortgage application ${application.applicationId} requires further review. Please check your email for details.`,
        },
      };

    case 'pending':
    default:
      return {
        subject: 'Mortgage Application Received',
        emailBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Mortgage Application Received</h2>
            <p>Dear ${applicantName},</p>
            <p>Thank you for submitting your mortgage application <strong>${application.applicationId}</strong>.</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Loan Amount:</strong> ${loanAmountFormatted}</p>
              <p style="margin: 5px 0;"><strong>Interest Rate:</strong> ${application.interestRate}%</p>
              <p style="margin: 5px 0;"><strong>Loan Term:</strong> ${application.loanTerm} months</p>
              <p style="margin: 5px 0;"><strong>Monthly Payment:</strong> ${monthlyPaymentFormatted}</p>
            </div>
            <p>Your application is being processed and will be reviewed by our loan officers shortly.</p>
            <p>You will receive updates via email and SMS as your application progresses.</p>
            <p>Best regards,<br>IDLR-PTS Mortgage Team</p>
          </div>
        `,
        smsMessage: `Your mortgage application ${application.applicationId} for ${loanAmountFormatted} has been received and is being processed. You will be notified of updates.`,
        webNotification: {
          title: 'Application Received',
          message: `Your mortgage application ${application.applicationId} has been received and is being processed.`,
        },
      };
  }
}

/**
 * Send mortgage payment reminder notification
 */
export async function notifyPaymentReminder(
  application: MortgageApplication,
  dueDate: Date,
  amountDue: number
): Promise<void> {
  try {
    const db = await requireDb();

    const [applicant] = await db
      .select({
        name: users.name,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, application.applicantId));

    if (!applicant) return;

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
      }).format(amount);
    };

    const dueDateFormatted = dueDate.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Send email
    if (applicant.email) {
      await sendEmail({
        to: applicant.email,
        subject: 'Mortgage Payment Reminder',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Mortgage Payment Reminder</h2>
            <p>Dear ${applicant.name},</p>
            <p>This is a friendly reminder that your mortgage payment is due soon.</p>
            <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <p style="margin: 5px 0;"><strong>Application ID:</strong> ${application.applicationId}</p>
              <p style="margin: 5px 0;"><strong>Amount Due:</strong> ${formatCurrency(amountDue)}</p>
              <p style="margin: 5px 0;"><strong>Due Date:</strong> ${dueDateFormatted}</p>
            </div>
            <p>Please ensure payment is made on or before the due date to avoid late fees.</p>
            <p>Visit your <a href="/mortgage-dashboard" style="color: #2563eb;">Mortgage Dashboard</a> to make a payment.</p>
            <p>Best regards,<br>IDLR-PTS Mortgage Team</p>
          </div>
        `,
      });
    }

    // Send SMS
    if (applicant.phone) {
      await sendSMS({
        to: applicant.phone,
        message: `Mortgage payment reminder: ${formatCurrency(amountDue)} due on ${dueDateFormatted} for loan ${application.applicationId}. Visit your dashboard to pay.`,
      });
    }

    // Send in-app notification
    await notificationWS.notifyUser(application.applicantId, {
      type: 'payment_reminder',
      priority: 'high',
      title: 'Payment Due Soon',
      message: `Your mortgage payment of ${formatCurrency(amountDue)} is due on ${dueDateFormatted}`,
      metadata: {
        applicationId: application.applicationId,
        amountDue,
        dueDate: dueDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('[MortgageNotification] Error sending payment reminder:', error);
  }
}
