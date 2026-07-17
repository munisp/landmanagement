import { getDb } from './db';
import {
  scheduled_reports,
  report_history,
  users,
} from '../drizzle/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { sendEmail } from './notificationDelivery';
import {
  generateAnalyticsReportPDF as generateProductionAnalyticsPDF,
  generateCommissionStatementPDF as generateProductionCommissionPDF,
} from './pdfGenerationService';
import { triggerWebhookEvent } from './webhookService';

/**
 * Email Report Scheduler Service
 * Automatically generates and emails PDF reports (analytics, commission statements) on configured schedules
 */

export interface ReportSchedule {
  id: number;
  userId: number;
  name: string;
  description?: string;
  reportType: 'mortgage_analytics' | 'commission_statement' | 'broker_performance' | 'investor_roi' | 'compliance_report';
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
  cronExpression?: string;
  format: 'pdf' | 'csv' | 'excel';
  emailDelivery: boolean;
  emailRecipients?: string; // JSON array
  filters?: string; // JSON object
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportGenerationResult {
  success: boolean;
  reportId?: number;
  fileUrl?: string;
  fileSize?: number;
  error?: string;
}

/**
 * Generate analytics report PDF
 */
async function generateAnalyticsReportPDF(
  filters: any
): Promise<{ buffer: Buffer; filename: string }> {
  // Use production PDF generation service with real data and charts
  return generateProductionAnalyticsPDF(filters);
}

/**
 * Generate commission statement PDF
 */
async function generateCommissionStatementPDF(
  brokerId: number,
  startDate: Date,
  endDate: Date
): Promise<{ buffer: Buffer; filename: string }> {
  // Use production PDF generation service with real data and formatted tables
  return generateProductionCommissionPDF(brokerId.toString(), startDate, endDate);
}

/**
 * Generate report based on type
 */
async function generateReport(
  reportType: string,
  format: string,
  filters: any
): Promise<{ buffer: Buffer; filename: string }> {
  switch (reportType) {
    case 'mortgage_analytics':
      return generateAnalyticsReportPDF(filters);
    
    case 'commission_statement':
      const { brokerId, startDate, endDate } = filters;
      return generateCommissionStatementPDF(
        brokerId,
        new Date(startDate),
        new Date(endDate)
      );
    
    case 'broker_performance':
    case 'investor_roi':
    case 'compliance_report':
      // Similar implementations for other report types
      return generateAnalyticsReportPDF(filters);
    
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

/**
 * Execute a scheduled report
 */
export async function executeScheduledReport(
  scheduleId: number
): Promise<ReportGenerationResult> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  try {
    // Get schedule details
    const schedules = await db
      .select()
      .from(scheduled_reports)
      .where(eq(scheduled_reports.id, scheduleId))
      .limit(1);

    if (schedules.length === 0) {
      return { success: false, error: 'Schedule not found' };
    }

    const schedule = schedules[0];

    // Parse filters
    const filters = schedule.filters ? JSON.parse(schedule.filters) : {};

    // Generate report
    const { buffer, filename } = await generateReport(
      schedule.reportType,
      schedule.format,
      filters
    );

    // In production, upload to S3 and get URL
    const fileUrl = `/api/reports/${filename}`;
    const fileSize = buffer.length;

    // Trigger webhook: report.generation.started
    await triggerWebhookEvent({
      eventType: 'report_generated',
      eventId: `report-start-${scheduleId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        status: 'started',
        scheduleId,
        scheduleName: schedule.name,
        reportType: schedule.reportType,
        format: schedule.format,
        userId: schedule.userId,
      },
    });

    // Save to report history
    const historyResult = await db
      .insert(report_history)
      .values({
        scheduledReportId: scheduleId,
        userId: schedule.userId,
        reportName: schedule.name,
        reportType: schedule.reportType,
        format: schedule.format,
        status: 'completed',
        fileUrl,
        fileSize,
        filters: schedule.filters,
        selectedFields: schedule.selectedFields,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })
      .returning();

    const reportId = historyResult[0].id;

    // Trigger webhook: report.generation.completed
    await triggerWebhookEvent({
      eventType: 'report_generated',
      eventId: `report-complete-${reportId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        status: 'completed',
        reportId,
        scheduleId,
        scheduleName: schedule.name,
        reportType: schedule.reportType,
        format: schedule.format,
        fileUrl,
        fileSize,
        userId: schedule.userId,
      },
    });

    // Send email if enabled
    if (schedule.emailDelivery && schedule.emailRecipients) {
      const recipients = JSON.parse(schedule.emailRecipients);
      
      for (const recipient of recipients) {
        await sendEmail({
          to: recipient,
          subject: `Scheduled Report: ${schedule.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Scheduled Report Ready</h2>
              <p style="color: #666; line-height: 1.6;">
                Your scheduled report "${schedule.name}" has been generated and is ready for download.
              </p>
              <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 20px;">
                <h3 style="color: #333; margin-top: 0;">Report Details:</h3>
                <p><strong>Type:</strong> ${schedule.reportType}</p>
                <p><strong>Format:</strong> ${schedule.format.toUpperCase()}</p>
                <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>File Size:</strong> ${(fileSize / 1024).toFixed(2)} KB</p>
              </div>
              <div style="margin-top: 30px; text-align: center;">
                <a href="${fileUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Download Report
                </a>
              </div>
              <p style="color: #999; font-size: 12px; margin-top: 30px;">
                This report will be available for 30 days.
              </p>
            </div>
          `,
        });
      }
    }

    // Update last run time and calculate next run
    const nextRunAt = calculateNextRunTime(
      schedule.frequency,
      schedule.cronExpression
    );

    await db
      .update(scheduled_reports)
      .set({
        lastRunAt: new Date(),
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(scheduled_reports.id, scheduleId));

    return {
      success: true,
      reportId,
      fileUrl,
      fileSize,
    };
  } catch (error) {
    console.error('[EmailReportScheduler] Error executing scheduled report:', error);

    // Trigger webhook: report.generation.failed
    try {
      const schedule = await db
        .select()
        .from(scheduled_reports)
        .where(eq(scheduled_reports.id, scheduleId))
        .limit(1);

      if (schedule.length > 0) {
        await triggerWebhookEvent({
          eventType: 'report_generated',
          eventId: `report-failed-${scheduleId}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          data: {
            status: 'failed',
            scheduleId,
            scheduleName: schedule[0].name,
            reportType: schedule[0].reportType,
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: schedule[0].userId,
          },
        });
      }
    } catch (webhookError) {
      console.error('[EmailReportScheduler] Error triggering failure webhook:', webhookError);
    }

    // Log failure to report history
    await db.insert(report_history).values({
      scheduledReportId: scheduleId,
      userId: 0, // System
      reportName: 'Failed Report',
      reportType: 'unknown',
      format: 'pdf',
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      generatedAt: new Date(),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Calculate next run time based on frequency
 */
function calculateNextRunTime(
  frequency: string,
  cronExpression?: string | null
): Date {
  const now = new Date();

  switch (frequency) {
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    case 'monthly':
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    
    case 'quarterly':
      const nextQuarter = new Date(now);
      nextQuarter.setMonth(nextQuarter.getMonth() + 3);
      return nextQuarter;
    
    case 'custom':
      // In production, parse cron expression to calculate next run
      // For now, default to 1 day
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

/**
 * Process all due scheduled reports
 */
export async function processDueReports(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  try {
    // Get all active schedules that are due
    const dueSchedules = await db
      .select()
      .from(scheduled_reports)
      .where(
        and(
          eq(scheduled_reports.isActive, true),
          lte(scheduled_reports.nextRunAt, new Date())
        )
      );

    console.log(`[EmailReportScheduler] Found ${dueSchedules.length} due reports`);

    for (const schedule of dueSchedules) {
      const result = await executeScheduledReport(schedule.id);
      
      if (result.success) {
        processed++;
      } else {
        failed++;
        errors.push(`Schedule ${schedule.id}: ${result.error}`);
      }
    }

    return { processed, failed, errors };
  } catch (error) {
    console.error('[EmailReportScheduler] Error processing due reports:', error);
    return {
      processed,
      failed: failed + 1,
      errors: [...errors, error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Start report scheduler (run every 5 minutes)
 */
export function startReportScheduler() {
  console.log('[EmailReportScheduler] Starting report scheduler');

  // Run immediately on start
  processDueReports().then((result) => {
    console.log('[EmailReportScheduler] Initial run:', result);
  });

  // Run every 5 minutes
  setInterval(async () => {
    const result = await processDueReports();
    if (result.processed > 0 || result.failed > 0) {
      console.log('[EmailReportScheduler] Processed reports:', result);
    }
  }, 5 * 60 * 1000);
}
