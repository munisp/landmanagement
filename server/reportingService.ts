import { getDb, parcelService, transactionService } from './db';
import { scheduled_reports, report_history, report_templates, verificationRequests, users } from '../drizzle/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { storagePut } from './storage';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { queueEmail } from './emailQueueService';

type ReportFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
type ReportFormat = 'pdf' | 'excel' | 'csv';
type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';

interface CreateScheduledReportInput {
  userId: number;
  name: string;
  description?: string;
  reportType: string;
  frequency: ReportFrequency;
  cronExpression?: string;
  format: ReportFormat;
  emailDelivery: boolean;
  emailRecipients?: string[];
  filters?: Record<string, any>;
  selectedFields?: string[];
}

interface GenerateReportInput {
  reportType: string;
  format: ReportFormat;
  filters?: Record<string, any>;
  selectedFields?: string[];
}

/**
 * Create a new scheduled report
 */
export async function createScheduledReport(input: CreateScheduledReportInput) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const nextRunAt = calculateNextRunTime(input.frequency, input.cronExpression);

  const [report] = await db
    .insert(scheduled_reports)
    .values({
      userId: input.userId,
      name: input.name,
      description: input.description,
      reportType: input.reportType,
      frequency: input.frequency,
      cronExpression: input.cronExpression,
      format: input.format,
      emailDelivery: input.emailDelivery,
      emailRecipients: input.emailRecipients ? JSON.stringify(input.emailRecipients) : null,
      filters: input.filters ? JSON.stringify(input.filters) : null,
      selectedFields: input.selectedFields ? JSON.stringify(input.selectedFields) : null,
      nextRunAt,
    })
    .returning();

  console.log(`[ReportingService] Scheduled report ${report.id} created: ${input.name}`);
  return { success: true, reportId: report.id };
}

/**
 * Generate a report immediately
 */
export async function generateReport(
  userId: number,
  input: GenerateReportInput,
  scheduledReportId?: number
): Promise<{ success: boolean; historyId?: number; fileUrl?: string; error?: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  // Create history record
  const [history] = await db
    .insert(report_history)
    .values({
      scheduledReportId,
      userId,
      reportName: `${input.reportType}_${new Date().toISOString().split('T')[0]}`,
      reportType: input.reportType,
      format: input.format,
      status: 'generating' as ReportStatus,
      filters: input.filters ? JSON.stringify(input.filters) : null,
      selectedFields: input.selectedFields ? JSON.stringify(input.selectedFields) : null,
    })
    .returning();

  try {
    // Fetch data based on report type
    const data = await fetchReportData(input.reportType, input.filters);

    // Generate file based on format
    let fileBuffer: Buffer;
    let mimeType: string;
    let fileExtension: string;

    switch (input.format) {
      case 'pdf':
        fileBuffer = await generatePDFReport(data, input.reportType, input.selectedFields);
        mimeType = 'application/pdf';
        fileExtension = 'pdf';
        break;
      case 'excel':
        fileBuffer = await generateExcelReport(data, input.reportType, input.selectedFields);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileExtension = 'xlsx';
        break;
      case 'csv':
        fileBuffer = await generateCSVReport(data, input.reportType, input.selectedFields);
        mimeType = 'text/csv';
        fileExtension = 'csv';
        break;
      default:
        throw new Error(`Unsupported format: ${input.format}`);
    }

    // Upload to S3
    const fileName = `reports/${userId}/${input.reportType}_${Date.now()}.${fileExtension}`;
    const { url } = await storagePut(fileName, fileBuffer, mimeType);

    // Update history record
    await db
      .update(report_history)
      .set({
        status: 'completed' as ReportStatus,
        fileUrl: url,
        fileSize: fileBuffer.length,
      })
      .where(eq(report_history.id, history.id));

    console.log(`[ReportingService] Report ${history.id} generated successfully`);
    
    // Send email if this is a scheduled report with email delivery enabled
    if (scheduledReportId) {
      await sendReportEmailIfEnabled(scheduledReportId, userId, input.reportType, fileBuffer, fileName, mimeType);
    }
    
    return { success: true, historyId: history.id, fileUrl: url };
  } catch (error) {
    // Update history with error
    await db
      .update(report_history)
      .set({
        status: 'failed' as ReportStatus,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(report_history.id, history.id));

    console.error(`[ReportingService] Report ${history.id} failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Fetch data for report based on type and filters
 */
async function fetchReportData(reportType: string, filters?: Record<string, any>): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  switch (reportType) {
    case 'parcel_registry':
      // Fetch from parcel microservice
      const parcelResponse = await parcelService.get('/parcels');
      return parcelResponse.parcels || [];

    case 'transaction_summary':
      // Fetch from transaction microservice
      const txResponse = await transactionService.get('/transactions');
      return txResponse.transactions || [];

    case 'verification_status':
      let verifyQuery = db
        .select({
          id: verificationRequests.id,
          parcelId: verificationRequests.parcelId,
          status: verificationRequests.status,
          requesterName: users.name,
          submittedAt: verificationRequests.submittedAt,
          approvedAt: verificationRequests.approvedAt,
        })
        .from(verificationRequests)
        .leftJoin(users, eq(verificationRequests.requesterId, users.id));
      
      if (filters?.status) {
        verifyQuery = verifyQuery.where(eq(verificationRequests.status, filters.status)) as any;
      }
      return await verifyQuery;

    case 'user_activity':
      return await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          lastActive: users.lastActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.lastActive));

    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }
}

/**
 * Generate PDF report
 */
async function generatePDFReport(
  data: any[],
  reportType: string,
  selectedFields?: string[]
): Promise<Buffer> {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text(formatReportTitle(reportType), 14, 20);
  
  // Metadata
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  doc.text(`Total Records: ${data.length}`, 14, 36);

  if (data.length === 0) {
    doc.text('No data available for this report.', 14, 50);
  } else {
    // Prepare table data
    const fields = selectedFields || Object.keys(data[0]);
    const headers = [fields.map((f) => formatFieldName(f))];
    const rows = data.map((row) => fields.map((field) => formatCellValue(row[field])));

    // Add table
    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 45,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
    });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Generate Excel report
 */
async function generateExcelReport(
  data: any[],
  reportType: string,
  selectedFields?: string[]
): Promise<Buffer> {
  const workbook = XLSX.utils.book_new();
  
  // Prepare data
  const fields = selectedFields || (data.length > 0 ? Object.keys(data[0]) : []);
  const worksheetData = [
    fields.map((f) => formatFieldName(f)),
    ...data.map((row) => fields.map((field) => formatCellValue(row[field]))),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Set column widths
  worksheet['!cols'] = fields.map(() => ({ wch: 20 }));

  XLSX.utils.book_append_sheet(workbook, worksheet, formatReportTitle(reportType).substring(0, 31));

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Generate CSV report
 */
async function generateCSVReport(
  data: any[],
  reportType: string,
  selectedFields?: string[]
): Promise<Buffer> {
  const fields = selectedFields || (data.length > 0 ? Object.keys(data[0]) : []);
  
  // Header row
  const header = fields.map((f) => formatFieldName(f)).join(',');
  
  // Data rows
  const rows = data.map((row) =>
    fields.map((field) => {
      const value = formatCellValue(row[field]);
      // Escape commas and quotes
      return typeof value === 'string' && (value.includes(',') || value.includes('"'))
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    }).join(',')
  );

  const csv = [header, ...rows].join('\n');
  return Buffer.from(csv, 'utf-8');
}

/**
 * List scheduled reports for a user
 */
export async function listScheduledReports(userId: number, includeInactive = false) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  let conditions = [eq(scheduled_reports.userId, userId)];
  if (!includeInactive) {
    conditions.push(eq(scheduled_reports.isActive, true));
  }

  const query = db
    .select()
    .from(scheduled_reports)
    .where(and(...conditions));

  const reports = await query.orderBy(desc(scheduled_reports.createdAt));

  return reports.map((r) => ({
    ...r,
    emailRecipients: r.emailRecipients ? JSON.parse(r.emailRecipients) : [],
    filters: r.filters ? JSON.parse(r.filters) : {},
    selectedFields: r.selectedFields ? JSON.parse(r.selectedFields) : [],
  }));
}

/**
 * Get report history for a user
 */
export async function getReportHistory(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  return await db
    .select()
    .from(report_history)
    .where(eq(report_history.userId, userId))
    .orderBy(desc(report_history.generatedAt))
    .limit(limit);
}

/**
 * Delete scheduled report
 */
export async function deleteScheduledReport(reportId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db
    .delete(scheduled_reports)
    .where(and(eq(scheduled_reports.id, reportId), eq(scheduled_reports.userId, userId)))
    .returning();

  if (result.length === 0) {
    return { success: false, message: 'Report not found or unauthorized' };
  }

  console.log(`[ReportingService] Scheduled report ${reportId} deleted`);
  return { success: true };
}

/**
 * Update scheduled report
 */
export async function updateScheduledReport(
  reportId: number,
  userId: number,
  updates: Partial<CreateScheduledReportInput>
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const updateData: any = {
    ...updates,
    updatedAt: new Date(),
  };

  if (updates.emailRecipients) {
    updateData.emailRecipients = JSON.stringify(updates.emailRecipients);
  }
  if (updates.filters) {
    updateData.filters = JSON.stringify(updates.filters);
  }
  if (updates.selectedFields) {
    updateData.selectedFields = JSON.stringify(updates.selectedFields);
  }
  if (updates.frequency || updates.cronExpression) {
    updateData.nextRunAt = calculateNextRunTime(
      updates.frequency || 'once',
      updates.cronExpression
    );
  }

  const result = await db
    .update(scheduled_reports)
    .set(updateData)
    .where(and(eq(scheduled_reports.id, reportId), eq(scheduled_reports.userId, userId)))
    .returning();

  if (result.length === 0) {
    return { success: false, message: 'Report not found or unauthorized' };
  }

  console.log(`[ReportingService] Scheduled report ${reportId} updated`);
  return { success: true };
}

/**
 * Get available report templates
 */
export async function getReportTemplates() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const templates = await db.select().from(report_templates).orderBy(report_templates.name);

  return templates.map((t) => ({
    ...t,
    defaultFields: t.defaultFields ? JSON.parse(t.defaultFields) : [],
    defaultFilters: t.defaultFilters ? JSON.parse(t.defaultFilters) : {},
  }));
}

// Helper functions

function calculateNextRunTime(frequency: ReportFrequency, cronExpression?: string): Date | null {
  const now = new Date();

  switch (frequency) {
    case 'once':
      return null;
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    case 'custom':
      // For custom, would need a cron parser library
      // For now, default to daily
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

function formatReportTitle(reportType: string): string {
  return reportType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatCellValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}


/**
 * Send report email if scheduled report has email delivery enabled
 */
async function sendReportEmailIfEnabled(
  scheduledReportId: number,
  userId: number,
  reportType: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Get scheduled report details
    const [scheduledReport] = await db
      .select()
      .from(scheduled_reports)
      .where(eq(scheduled_reports.id, scheduledReportId));

    if (!scheduledReport || !scheduledReport.emailDelivery) {
      return; // Email delivery not enabled
    }

    // Parse email recipients
    const recipients = scheduledReport.emailRecipients
      ? (typeof scheduledReport.emailRecipients === 'string'
          ? JSON.parse(scheduledReport.emailRecipients)
          : scheduledReport.emailRecipients)
      : [];

    if (!Array.isArray(recipients) || recipients.length === 0) {
      console.warn(`[ReportingService] No email recipients for scheduled report ${scheduledReportId}`);
      return;
    }

    // Get user email as fallback
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    const allRecipients = Array.from(new Set([...recipients, user?.email].filter(Boolean)));

    // Queue email for each recipient
    for (const recipient of allRecipients) {
      await queueEmail({
        to: recipient as string,
        subject: `${scheduledReport.name} - ${formatReportTitle(reportType)} Report`,
        html: generateReportEmailHTML(scheduledReport.name, reportType, scheduledReport.format),
        text: generateReportEmailText(scheduledReport.name, reportType, scheduledReport.format),
        attachments: [
          {
            content: fileBuffer.toString('base64'),
            filename: fileName.split('/').pop() || 'report',
            type: mimeType,
            disposition: 'attachment',
          },
        ],
      });
    }

    console.log(`[ReportingService] Queued ${allRecipients.length} emails for scheduled report ${scheduledReportId}`);
  } catch (error) {
    console.error('[ReportingService] Failed to send report email:', error);
  }
}

/**
 * Generate HTML content for report email
 */
function generateReportEmailHTML(reportName: string, reportType: string, format: string): string {
  return `
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
          <h2>Your Scheduled Report is Ready</h2>
          <p>Hello,</p>
          <p>Your scheduled report "<strong>${reportName}</strong>" has been generated and is attached to this email.</p>
          <p>Report Type: <strong>${formatReportTitle(reportType)}</strong></p>
          <p>Format: <strong>${format.toUpperCase()}</strong></p>
          <p>Generated: <strong>${new Date().toLocaleString()}</strong></p>
          <p>Please find the report attached to this email.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.</p>
          <p>This is an automated email from your scheduled report.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate text content for report email
 */
function generateReportEmailText(reportName: string, reportType: string, format: string): string {
  return `
Your Scheduled Report is Ready

Hello,

Your scheduled report "${reportName}" has been generated and is attached to this email.

Report Type: ${formatReportTitle(reportType)}
Format: ${format.toUpperCase()}
Generated: ${new Date().toLocaleString()}

Please find the report attached to this email.

---
© ${new Date().getFullYear()} IDLR-PTS Platform. All rights reserved.
This is an automated email from your scheduled report.
  `;
}
