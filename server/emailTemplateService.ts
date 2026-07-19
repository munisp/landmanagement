import { requireDb } from './db';
import {
  email_templates,
  EmailTemplate,
  InsertEmailTemplate,
} from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Email Template Service
 * Manages customizable email templates for report delivery
 */

/**
 * Template variable replacement
 */
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

/**
 * Create email template
 */
export async function createEmailTemplate(data: {
  userId: number;
  name: string;
  description?: string;
  subject: string;
  body: string;
  logoUrl?: string;
  primaryColor?: string;
  footerText?: string;
  isDefault?: boolean;
}): Promise<EmailTemplate> {
  const db = await requireDb();

  // If setting as default, unset other defaults for this user
  if (data.isDefault) {
    await db
      .update(email_templates)
      .set({ isDefault: false })
      .where(
        and(
          eq(email_templates.userId, data.userId),
          eq(email_templates.isDefault, true)
        )
      );
  }

  const [template] = await db
    .insert(email_templates)
    .values({
      userId: data.userId,
      name: data.name,
      description: data.description,
      subject: data.subject,
      body: data.body,
      logoUrl: data.logoUrl,
      primaryColor: data.primaryColor || '#3b82f6',
      footerText: data.footerText,
      isDefault: data.isDefault || false,
    })
    .returning();

  return template;
}

/**
 * Update email template
 */
export async function updateEmailTemplate(
  templateId: number,
  userId: number,
  data: {
    name?: string;
    description?: string;
    subject?: string;
    body?: string;
    logoUrl?: string;
    primaryColor?: string;
    footerText?: string;
    isDefault?: boolean;
  }
): Promise<EmailTemplate | null> {
  const db = await requireDb();

  // If setting as default, unset other defaults for this user
  if (data.isDefault) {
    await db
      .update(email_templates)
      .set({ isDefault: false })
      .where(
        and(
          eq(email_templates.userId, userId),
          eq(email_templates.isDefault, true)
        )
      );
  }

  const updates: any = { updatedAt: new Date() };
  if (data.name) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.subject) updates.subject = data.subject;
  if (data.body) updates.body = data.body;
  if (data.logoUrl !== undefined) updates.logoUrl = data.logoUrl;
  if (data.primaryColor) updates.primaryColor = data.primaryColor;
  if (data.footerText !== undefined) updates.footerText = data.footerText;
  if (data.isDefault !== undefined) updates.isDefault = data.isDefault;

  const [updated] = await db
    .update(email_templates)
    .set(updates)
    .where(
      and(
        eq(email_templates.id, templateId),
        eq(email_templates.userId, userId)
      )
    )
    .returning();

  return updated || null;
}

/**
 * Delete email template
 */
export async function deleteEmailTemplate(
  templateId: number,
  userId: number
): Promise<boolean> {
  const db = await requireDb();

  await db
    .delete(email_templates)
    .where(
      and(
        eq(email_templates.id, templateId),
        eq(email_templates.userId, userId)
      )
    );

  return true;
}

/**
 * Get all email templates for a user
 */
export async function getEmailTemplates(userId: number): Promise<EmailTemplate[]> {
  const db = await requireDb();

  return await db
    .select()
    .from(email_templates)
    .where(eq(email_templates.userId, userId));
}

/**
 * Get email template by ID
 */
export async function getEmailTemplate(
  templateId: number,
  userId: number
): Promise<EmailTemplate | null> {
  const db = await requireDb();

  const [template] = await db
    .select()
    .from(email_templates)
    .where(
      and(
        eq(email_templates.id, templateId),
        eq(email_templates.userId, userId)
      )
    );

  return template || null;
}

/**
 * Get default email template for a user
 */
export async function getDefaultEmailTemplate(
  userId: number
): Promise<EmailTemplate | null> {
  const db = await requireDb();

  const [template] = await db
    .select()
    .from(email_templates)
    .where(
      and(
        eq(email_templates.userId, userId),
        eq(email_templates.isDefault, true)
      )
    );

  return template || null;
}

/**
 * Render email with template
 */
export async function renderEmailWithTemplate(
  templateId: number,
  userId: number,
  variables: Record<string, string>
): Promise<{ subject: string; html: string } | null> {
  const template = await getEmailTemplate(templateId, userId);
  if (!template) return null;

  const subject = replaceTemplateVariables(template.subject, variables);
  const bodyContent = replaceTemplateVariables(template.body, variables);

  // Build HTML email with branding
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      padding: 20px 0;
      border-bottom: 3px solid ${template.primaryColor || '#3b82f6'};
    }
    .header img {
      max-width: 200px;
      height: auto;
    }
    .content {
      padding: 30px 0;
    }
    .footer {
      text-align: center;
      padding: 20px 0;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 14px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: ${template.primaryColor || '#3b82f6'};
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    ${template.logoUrl ? `<img src="${template.logoUrl}" alt="Logo">` : '<h1>Report Delivery</h1>'}
  </div>
  <div class="content">
    ${bodyContent}
  </div>
  <div class="footer">
    ${template.footerText || 'This is an automated message. Please do not reply.'}
  </div>
</body>
</html>
  `.trim();

  return { subject, html };
}

/**
 * Get available template variables
 */
export function getAvailableTemplateVariables(): Record<string, string> {
  return {
    reportName: 'Name of the report',
    date: 'Current date',
    recipientName: 'Recipient name',
    reportType: 'Type of report (Analytics, Commission, etc.)',
    frequency: 'Report frequency (Daily, Weekly, Monthly)',
    downloadUrl: 'URL to download the report',
    userName: 'Name of the user who created the schedule',
  };
}
