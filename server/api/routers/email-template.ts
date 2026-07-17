import { z } from 'zod';
import { protectedProcedure, router } from '../../_core/trpc';
import {
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  getEmailTemplates,
  getEmailTemplate,
  getDefaultEmailTemplate,
  renderEmailWithTemplate,
  getAvailableTemplateVariables,
} from '../../emailTemplateService';

export const emailTemplateRouter = router({
  /**
   * Create email template
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        subject: z.string().min(1),
        body: z.string().min(1),
        logoUrl: z.string().url().optional(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        footerText: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await createEmailTemplate({
        userId: ctx.user.id,
        ...input,
      });
    }),

  /**
   * Update email template
   */
  update: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        subject: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        logoUrl: z.string().url().optional(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        footerText: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { templateId, ...data } = input;
      return await updateEmailTemplate(templateId, ctx.user.id, data);
    }),

  /**
   * Delete email template
   */
  delete: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await deleteEmailTemplate(input.templateId, ctx.user.id);
    }),

  /**
   * Get all email templates
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return await getEmailTemplates(ctx.user.id);
  }),

  /**
   * Get email template by ID
   */
  get: protectedProcedure
    .input(z.object({ templateId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await getEmailTemplate(input.templateId, ctx.user.id);
    }),

  /**
   * Get default email template
   */
  getDefault: protectedProcedure.query(async ({ ctx }) => {
    return await getDefaultEmailTemplate(ctx.user.id);
  }),

  /**
   * Preview email with template
   */
  preview: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        variables: z.record(z.string(), z.string()),
      })
    )
    .query(async ({ ctx, input }) => {
      return await renderEmailWithTemplate(
        input.templateId,
        ctx.user.id,
        input.variables
      );
    }),

  /**
   * Get available template variables
   */
  getVariables: protectedProcedure.query(() => {
    return getAvailableTemplateVariables();
  }),
});
