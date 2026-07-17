import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import { getDb } from '../../db';
import {
  scheduled_reports,
  report_history,
} from '../../../drizzle/schema';
import { eq, desc, and } from 'drizzle-orm';
import { executeScheduledReport } from '../../emailReportScheduler';
import {
  getAllTemplates,
  getTemplatesByCategory,
  getTemplateById,
  createScheduleFromTemplate,
} from '../../reportScheduleTemplates';

/**
 * Report Scheduler tRPC Router
 * Manage scheduled email reports with PDF attachments
 */

export const reportSchedulerRouter = router({
  /**
   * Create a new scheduled report
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        reportType: z.enum([
          'mortgage_analytics',
          'commission_statement',
          'broker_performance',
          'investor_roi',
          'compliance_report',
        ]),
        frequency: z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']),
        cronExpression: z.string().optional(),
        format: z.enum(['pdf', 'csv', 'excel']),
        emailDelivery: z.boolean().default(true),
        emailRecipients: z.array(z.string().email()).optional(),
        filters: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      // Calculate next run time
      const nextRunAt = calculateNextRunTime(input.frequency, input.cronExpression || null);

      const result = await db
        .insert(scheduled_reports)
        .values({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          reportType: input.reportType,
          frequency: input.frequency,
          cronExpression: input.cronExpression,
          format: input.format,
          emailDelivery: input.emailDelivery,
          emailRecipients: input.emailRecipients
            ? JSON.stringify(input.emailRecipients)
            : null,
          filters: input.filters ? JSON.stringify(input.filters) : null,
          isActive: true,
          nextRunAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return result[0];
    }),

  /**
   * Get all scheduled reports for current user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database connection failed');

    const schedules = await db
      .select()
      .from(scheduled_reports)
      .where(eq(scheduled_reports.userId, ctx.user.id))
      .orderBy(desc(scheduled_reports.createdAt));

    return schedules.map((schedule) => ({
      ...schedule,
      emailRecipients: schedule.emailRecipients
        ? JSON.parse(schedule.emailRecipients)
        : [],
      filters: schedule.filters ? JSON.parse(schedule.filters) : {},
    }));
  }),

  /**
   * Get a specific scheduled report
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      const schedules = await db
        .select()
        .from(scheduled_reports)
        .where(
          and(
            eq(scheduled_reports.id, input.id),
            eq(scheduled_reports.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (schedules.length === 0) {
        throw new Error('Schedule not found');
      }

      const schedule = schedules[0];

      return {
        ...schedule,
        emailRecipients: schedule.emailRecipients
          ? JSON.parse(schedule.emailRecipients)
          : [],
        filters: schedule.filters ? JSON.parse(schedule.filters) : {},
      };
    }),

  /**
   * Update a scheduled report
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        reportType: z
          .enum([
            'mortgage_analytics',
            'commission_statement',
            'broker_performance',
            'investor_roi',
            'compliance_report',
          ])
          .optional(),
        frequency: z.enum(['once', 'daily', 'weekly', 'monthly', 'custom']).optional(),
        cronExpression: z.string().optional(),
        format: z.enum(['pdf', 'csv', 'excel']).optional(),
        emailDelivery: z.boolean().optional(),
        emailRecipients: z.array(z.string().email()).optional(),
        filters: z.record(z.string(), z.any()).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      const { id, ...updates } = input;

      // Calculate new next run time if frequency changed
      let nextRunAt: Date | undefined;
      if (updates.frequency) {
        nextRunAt = calculateNextRunTime(updates.frequency, updates.cronExpression || null);
      }

      const result = await db
        .update(scheduled_reports)
        .set({
          ...updates,
          emailRecipients: updates.emailRecipients
            ? JSON.stringify(updates.emailRecipients)
            : undefined,
          filters: updates.filters ? JSON.stringify(updates.filters) : undefined,
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scheduled_reports.id, id),
            eq(scheduled_reports.userId, ctx.user.id)
          )
        )
        .returning();

      if (result.length === 0) {
        throw new Error('Schedule not found or unauthorized');
      }

      return result[0];
    }),

  /**
   * Delete a scheduled report
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      const result = await db
        .delete(scheduled_reports)
        .where(
          and(
            eq(scheduled_reports.id, input.id),
            eq(scheduled_reports.userId, ctx.user.id)
          )
        )
        .returning();

      if (result.length === 0) {
        throw new Error('Schedule not found or unauthorized');
      }

      return { success: true };
    }),

  /**
   * Toggle schedule active status
   */
  toggleActive: protectedProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      const result = await db
        .update(scheduled_reports)
        .set({
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scheduled_reports.id, input.id),
            eq(scheduled_reports.userId, ctx.user.id)
          )
        )
        .returning();

      if (result.length === 0) {
        throw new Error('Schedule not found or unauthorized');
      }

      return result[0];
    }),

  /**
   * Run a scheduled report immediately
   */
  runNow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      // Verify ownership
      const schedules = await db
        .select()
        .from(scheduled_reports)
        .where(
          and(
            eq(scheduled_reports.id, input.id),
            eq(scheduled_reports.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (schedules.length === 0) {
        throw new Error('Schedule not found or unauthorized');
      }

      // Execute the report
      const result = await executeScheduledReport(input.id);

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate report');
      }

      return {
        success: true,
        reportId: result.reportId,
        fileUrl: result.fileUrl,
        fileSize: result.fileSize,
      };
    }),

  /**
   * Get report history for a schedule
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        scheduleId: z.number().optional(),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      const conditions = [eq(report_history.userId, ctx.user.id)];

      if (input.scheduleId) {
        conditions.push(eq(report_history.scheduledReportId, input.scheduleId));
      }

      const history = await db
        .select()
        .from(report_history)
        .where(and(...conditions))
        .orderBy(desc(report_history.generatedAt))
        .limit(input.limit);

      return history.map((record) => ({
        ...record,
        filters: record.filters ? JSON.parse(record.filters) : {},
        selectedFields: record.selectedFields
          ? JSON.parse(record.selectedFields)
          : [],
      }));
    }),

  /**
   * Get report statistics
   */
  getStatistics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database connection failed');

    const schedules = await db
      .select()
      .from(scheduled_reports)
      .where(eq(scheduled_reports.userId, ctx.user.id));

    const history = await db
      .select()
      .from(report_history)
      .where(eq(report_history.userId, ctx.user.id));

    const activeSchedules = schedules.filter((s) => s.isActive).length;
    const totalReports = history.length;
    const successfulReports = history.filter((h) => h.status === 'completed').length;
    const failedReports = history.filter((h) => h.status === 'failed').length;

    return {
      totalSchedules: schedules.length,
      activeSchedules,
      inactiveSchedules: schedules.length - activeSchedules,
      totalReports,
      successfulReports,
      failedReports,
      successRate:
        totalReports > 0 ? ((successfulReports / totalReports) * 100).toFixed(1) : '0',
    };
  }),

  /**
   * Get all report schedule templates
   */
  getTemplates: protectedProcedure.query(async () => {
    return getAllTemplates();
  }),

  /**
   * Get templates by category
   */
  getTemplatesByCategory: protectedProcedure
    .input(
      z.object({
        category: z.enum(['broker', 'investor', 'compliance', 'analytics']),
      })
    )
    .query(async ({ input }) => {
      return getTemplatesByCategory(input.category);
    }),

  /**
   * Create schedule from template
   */
  createFromTemplate: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        customName: z.string().optional(),
        customRecipients: z.array(z.string().email()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      const template = getTemplateById(input.templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      const scheduleData = createScheduleFromTemplate(
        template,
        ctx.user.id,
        input.customName,
        input.customRecipients
      );

      // Calculate next run time
      const nextRunAt = calculateNextRunTime(
        scheduleData.frequency,
        scheduleData.cronExpression || null
      );

      const result = await db
        .insert(scheduled_reports)
        .values({
          ...scheduleData,
          nextRunAt,
        })
        .returning();

      return result[0];
    }),
});

/**
 * Helper: Calculate next run time based on frequency
 */
function calculateNextRunTime(frequency: string, cronExpression: string | null): Date {
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
      // In production, parse cron expression
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);

    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}
