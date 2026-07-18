import { boolean, decimal, integer, json, jsonb, index, pgEnum, pgTable, real, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */

// Define enums for PostgreSQL
export const roleEnum = pgEnum("role", ["user", "surveyor", "registrar", "admin"]);
export const entityTypeEnum = pgEnum("entity_type", ["parcel", "transaction"]);

export const users: any = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  suspended: boolean("suspended").default(false).notNull(),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: integer("suspended_by").references(() => users.id),
  suspensionReason: text("suspension_reason"),
  lastActive: timestamp("last_active").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Comments table for parcels and transactions
 */
export const comments = pgTable("comments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: entityTypeEnum("entityType").notNull(),
  entityId: varchar("entityId", { length: 64 }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

/**
 * Activity logs for tracking user actions
 */
export const activityLogs = pgTable("activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar("type", { length: 64 }).notNull(),
  description: text("description").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

/**
 * Saved searches for quick access to frequently used queries
 */
export const savedSearches = pgTable("saved_searches", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  query: json("query").notNull(),
  isFavorite: boolean("isFavorite").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SavedSearch = typeof savedSearches.$inferSelect;
export type InsertSavedSearch = typeof savedSearches.$inferInsert;

/**
 * Verification status enum
 */
export const verificationStatusEnum = pgEnum("verification_status", [
  "draft",
  "submitted", 
  "under_review",
  "approved",
  "rejected"
]);

/**
 * Verification requests for parcels
 */
export const verificationRequests = pgTable("verification_requests", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: varchar("parcel_id", { length: 64 }).notNull(),
  requesterId: integer("requester_id").notNull().references(() => users.id),
  reviewerId: integer("reviewer_id").references(() => users.id),
  status: verificationStatusEnum("status").default("draft").notNull(),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  blockchainTxHash: varchar("blockchain_tx_hash", { length: 128 }),
  notes: text("notes"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type VerificationRequest = typeof verificationRequests.$inferSelect;
export type InsertVerificationRequest = typeof verificationRequests.$inferInsert;

/**
 * Verification documents uploaded as part of the verification process
 */
export const verificationDocuments = pgTable("verification_documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  verificationRequestId: integer("verification_request_id").notNull().references(() => verificationRequests.id, { onDelete: 'cascade' }),
  documentType: varchar("document_type", { length: 64 }).notNull(), // survey_plan, title_deed, etc.
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  mimeType: varchar("mime_type", { length: 64 }).notNull(),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  verified: boolean("verified").default(false).notNull(),
  verifiedBy: integer("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VerificationDocument = typeof verificationDocuments.$inferSelect;
export type InsertVerificationDocument = typeof verificationDocuments.$inferInsert;

/**
 * Verification workflow history for audit trail
 */
export const verificationHistory = pgTable("verification_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  verificationRequestId: integer("verification_request_id").notNull().references(() => verificationRequests.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id),
  action: varchar("action", { length: 64 }).notNull(), // created, submitted, assigned, approved, rejected, etc.
  previousStatus: verificationStatusEnum("previous_status"),
  newStatus: verificationStatusEnum("new_status"),
  comment: text("comment"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VerificationHistory = typeof verificationHistory.$inferSelect;
export type InsertVerificationHistory = typeof verificationHistory.$inferInsert;

/**
 * Scheduled Reports and Report History
 */
export const reportFrequencyEnum = pgEnum("report_frequency", ["once", "daily", "weekly", "monthly", "custom"]);
export const reportFormatEnum = pgEnum("report_format", ["pdf", "excel", "csv"]);
export const reportStatusEnum = pgEnum("report_status", ["pending", "generating", "completed", "failed"]);

export const scheduled_reports = pgTable("scheduled_reports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  reportType: varchar("report_type", { length: 64 }).notNull(), // 'parcel_registry', 'transaction_summary', 'verification_status', 'custom'
  frequency: reportFrequencyEnum("frequency").notNull(),
  cronExpression: varchar("cron_expression", { length: 128 }), // For custom frequency
  format: reportFormatEnum("format").notNull(),
  emailDelivery: boolean("email_delivery").default(false).notNull(),
  emailRecipients: text("email_recipients"), // JSON array of email addresses
  filters: text("filters"), // JSON object with report filters
  selectedFields: text("selected_fields"), // JSON array of field names for custom reports
  isActive: boolean("is_active").default(true).notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const report_history = pgTable("report_history", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scheduledReportId: integer("scheduled_report_id").references(() => scheduled_reports.id, { onDelete: 'set null' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  reportName: text("report_name").notNull(),
  reportType: varchar("report_type", { length: 64 }).notNull(),
  format: reportFormatEnum("format").notNull(),
  status: reportStatusEnum("status").notNull(),
  fileUrl: text("file_url"),
  fileSize: integer("file_size"), // in bytes
  filters: text("filters"), // JSON object
  selectedFields: text("selected_fields"), // JSON array
  errorMessage: text("error_message"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // Optional expiration for auto-cleanup
});

export const report_templates = pgTable("report_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  reportType: varchar("report_type", { length: 64 }).notNull(),
  defaultFields: text("default_fields"), // JSON array of default field names
  defaultFilters: text("default_filters"), // JSON object with default filters
  isSystemTemplate: boolean("is_system_template").default(false).notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Email Templates Table for customizable report email delivery
 */
export const email_templates = pgTable("email_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // Branding options
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }), // hex color
  footerText: text("footer_text"),
  // Metadata
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Webhook Endpoints Table for external system notifications
 */
export const webhookStatusEnum = pgEnum("webhook_status", ["active", "inactive", "failed"]);

export const webhook_endpoints = pgTable("webhook_endpoints", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  secret: varchar("secret", { length: 128 }), // for HMAC signature
  // Event configuration
  events: text("events").notNull(), // JSON array of event types
  // Status and retry
  status: webhookStatusEnum("status").default("active").notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  lastTriggeredAt: timestamp("last_triggered_at"),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  lastFailureReason: text("last_failure_reason"),
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Webhook Delivery Log Table for tracking webhook executions
 */
export const webhookDeliveryStatusEnum = pgEnum("webhook_delivery_status", ["success", "failed", "pending"]);

export const webhook_delivery_log = pgTable("webhook_delivery_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  webhookId: integer("webhook_id").notNull().references(() => webhook_endpoints.id, { onDelete: 'cascade' }),
  event: varchar("event", { length: 64 }).notNull(),
  payload: text("payload").notNull(), // JSON payload sent
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  status: webhookDeliveryStatusEnum("status").notNull(),
  errorMessage: text("error_message"),
  attemptNumber: integer("attempt_number").default(1).notNull(),
  deliveredAt: timestamp("delivered_at").defaultNow().notNull(),
});

export type ScheduledReport = typeof scheduled_reports.$inferSelect;
export type InsertScheduledReport = typeof scheduled_reports.$inferInsert;
export type ReportHistory = typeof report_history.$inferSelect;
export type InsertReportHistory = typeof report_history.$inferInsert;
export type ReportTemplate = typeof report_templates.$inferSelect;
export type InsertReportTemplate = typeof report_templates.$inferInsert;
export type EmailTemplate = typeof email_templates.$inferSelect;
export type InsertEmailTemplate = typeof email_templates.$inferInsert;
export type WebhookEndpoint = typeof webhook_endpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhook_endpoints.$inferInsert;
export type WebhookDeliveryLog = typeof webhook_delivery_log.$inferSelect;
export type InsertWebhookDeliveryLog = typeof webhook_delivery_log.$inferInsert;

/**
 * Admin notifications table for real-time alerts
 */
export const notificationTypeEnum = pgEnum("notification_type", [
  "user_registration",
  "suspicious_activity",
  "system_error",
  "verification_request",
  "verification_approved",
  "verification_rejected",
  "transaction_initiated",
  "transaction_completed",
  "document_uploaded",
  "role_changed",
  "user_suspended"
]);

export const notificationPriorityEnum = pgEnum("notification_priority", ["low", "medium", "high", "critical"]);

export const adminNotifications = pgTable("admin_notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  recipientId: integer("recipient_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: notificationTypeEnum("type").notNull(),
  priority: notificationPriorityEnum("priority").default("medium").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata"), // Additional context (user ID, parcel ID, etc.)
  read: boolean("read").default(false).notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  recipientIdx: index("admin_notifications_recipient_idx").on(table.recipientId),
  typeIdx: index("admin_notifications_type_idx").on(table.type),
  readIdx: index("admin_notifications_read_idx").on(table.read),
  createdAtIdx: index("admin_notifications_created_at_idx").on(table.createdAt),
}));

export type AdminNotification = typeof adminNotifications.$inferSelect;
export type InsertAdminNotification = typeof adminNotifications.$inferInsert;

/**
 * Email logs for tracking email delivery
 */
export const emailStatusEnum = pgEnum("email_status", ["pending", "sent", "failed", "bounced"]);

export const emailLogs = pgTable("email_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: emailStatusEnum("status").default("pending").notNull(),
  sentAt: timestamp("sent_at"),
  failedAt: timestamp("failed_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("email_logs_status_idx").on(table.status),
  recipientIdx: index("email_logs_recipient_idx").on(table.recipientEmail),
}));

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

/**
 * Email queue for retry logic
 */
export const emailQueue = pgTable("email_queue", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 20 }).default('pending').notNull(), // pending, sent, failed
  scheduledAt: timestamp("scheduled_at").defaultNow().notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  nextRetryIdx: index("email_queue_next_retry_idx").on(table.nextRetryAt),
  statusIdx: index("email_queue_status_idx").on(table.status),
  scheduledAtIdx: index("email_queue_scheduled_at_idx").on(table.scheduledAt),
}));

export type EmailQueue = typeof emailQueue.$inferSelect;
export type InsertEmailQueue = typeof emailQueue.$inferInsert;

/**
 * Analytics daily metrics for aggregated data
 */
export const analyticsDailyMetrics = pgTable("analytics_daily_metrics", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: varchar("date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
  totalTransactions: integer("total_transactions").default(0).notNull(),
  totalRevenue: integer("total_revenue").default(0).notNull(),
  totalParcels: integer("total_parcels").default(0).notNull(),
  newParcels: integer("new_parcels").default(0).notNull(),
  verificationRequests: integer("verification_requests").default(0).notNull(),
  verificationsApproved: integer("verifications_approved").default(0).notNull(),
  verificationsRejected: integer("verifications_rejected").default(0).notNull(),
  avgProcessingTimeHours: integer("avg_processing_time_hours").default(0).notNull(),
  activeUsers: integer("active_users").default(0).notNull(),
  newUsers: integer("new_users").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  dateIdx: index("analytics_daily_metrics_date_idx").on(table.date),
}));

export type AnalyticsDailyMetrics = typeof analyticsDailyMetrics.$inferSelect;
export type InsertAnalyticsDailyMetrics = typeof analyticsDailyMetrics.$inferInsert;

/**
 * Security events for monitoring
 */
export const securityEventTypeEnum = pgEnum("security_event_type", [
  "failed_login",
  "suspicious_activity",
  "unusual_access",
  "account_lockout",
  "ip_blocked",
  "password_reset",
  "role_escalation"
]);

export const securityEvents = pgTable("security_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }),
  eventType: securityEventTypeEnum("event_type").notNull(),
  severity: varchar("severity", { length: 20 }).notNull(), // low, medium, high, critical
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  userAgent: text("user_agent"),
  description: text("description").notNull(),
  metadata: jsonb("metadata"),
  resolved: boolean("resolved").default(false).notNull(),
  resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("security_events_user_idx").on(table.userId),
  eventTypeIdx: index("security_events_type_idx").on(table.eventType),
  severityIdx: index("security_events_severity_idx").on(table.severity),
  createdAtIdx: index("security_events_created_at_idx").on(table.createdAt),
}));

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type InsertSecurityEvent = typeof securityEvents.$inferInsert;

/**
 * Blocked IPs for security
 */
export const blockedIps = pgTable("blocked_ips", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ipAddress: varchar("ip_address", { length: 45 }).notNull().unique(),
  reason: text("reason").notNull(),
  blockedBy: integer("blocked_by").notNull().references(() => users.id),
  blockedAt: timestamp("blocked_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // null = permanent
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata"),
}, (table) => ({
  ipIdx: index("blocked_ips_ip_idx").on(table.ipAddress),
  activeIdx: index("blocked_ips_active_idx").on(table.isActive),
}));

export type BlockedIp = typeof blockedIps.$inferSelect;
export type InsertBlockedIp = typeof blockedIps.$inferInsert;

/**
 * Login attempts for tracking
 */
export const loginAttempts = pgTable("login_attempts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  email: varchar("email", { length: 320 }),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  userAgent: text("user_agent"),
  success: boolean("success").notNull(),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("login_attempts_user_idx").on(table.userId),
  ipIdx: index("login_attempts_ip_idx").on(table.ipAddress),
  successIdx: index("login_attempts_success_idx").on(table.success),
  createdAtIdx: index("login_attempts_created_at_idx").on(table.createdAt),
}));

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type InsertLoginAttempt = typeof loginAttempts.$inferInsert;

/**
 * Document AI processing results
 */
export const documentProcessingResults = pgTable("document_processing_results", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  verificationDocumentId: integer("verification_document_id").notNull().references(() => verificationDocuments.id, { onDelete: 'cascade' }),
  documentType: varchar("document_type", { length: 64 }).notNull(),
  extractedText: text("extracted_text"),
  extractedData: jsonb("extracted_data"), // Structured data extracted from document
  fraudScore: integer("fraud_score"), // 0-100
  fraudIndicators: jsonb("fraud_indicators"), // Array of detected issues
  validationStatus: varchar("validation_status", { length: 20 }).notNull(), // pending, approved, rejected
  validatedBy: integer("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at"),
  validationNotes: text("validation_notes"),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  docIdx: index("document_processing_results_doc_idx").on(table.verificationDocumentId),
  statusIdx: index("document_processing_results_status_idx").on(table.validationStatus),
}));

export type DocumentProcessingResult = typeof documentProcessingResults.$inferSelect;
export type InsertDocumentProcessingResult = typeof documentProcessingResults.$inferInsert;

/**
 * Field data submissions from mobile surveyors
 */
export const fieldData = pgTable("field_data", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  parcelNumber: varchar("parcel_number", { length: 64 }).notNull(),
  location: jsonb("location"), // {lat, lng}
  area: varchar("area", { length: 64 }),
  boundaries: text("boundaries"),
  notes: text("notes"),
  photos: jsonb("photos"), // Array of photo URLs
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("field_data_user_idx").on(table.userId),
  parcelIdx: index("field_data_parcel_idx").on(table.parcelNumber),
}));

export type FieldData = typeof fieldData.$inferSelect;
export type InsertFieldData = typeof fieldData.$inferInsert;

/**
 * API Keys for programmatic access
 */
export const apiKeys = pgTable("api_keys", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  revoked: boolean("revoked").default(false).notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("api_keys_user_idx").on(table.userId),
  keyHashIdx: index("api_keys_key_hash_idx").on(table.keyHash),
}));

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

/**
 * Parcels table - core land parcel registry
 */
export const parcels = pgTable("parcels", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: varchar("parcel_id", { length: 64 }).notNull().unique(),
  titleNumber: varchar("title_number", { length: 128 }),
  ownerId: integer("owner_id").references(() => users.id),
  state: varchar("state", { length: 64 }).notNull(),
  lga: varchar("lga", { length: 64 }).notNull(), // Local Government Area
  ward: varchar("ward", { length: 64 }),
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  areaSquareMeters: decimal("area_square_meters", { precision: 12, scale: 2 }),
  landUseType: varchar("land_use_type", { length: 64 }), // residential, commercial, agricultural, industrial
  status: varchar("status", { length: 32 }).default("pending").notNull(), // pending, verified, disputed, transferred
  estimatedValue: decimal("estimated_value", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  metadata: jsonb("metadata"), // survey plans, coordinates, boundary data
  registeredAt: timestamp("registered_at"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: integer("verified_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerIdx: index("parcels_owner_idx").on(table.ownerId),
  stateIdx: index("parcels_state_idx").on(table.state),
  lgaIdx: index("parcels_lga_idx").on(table.lga),
  statusIdx: index("parcels_status_idx").on(table.status),
  locationIdx: index("parcels_location_idx").on(table.latitude, table.longitude),
}));

export type Parcel = typeof parcels.$inferSelect;
export type InsertParcel = typeof parcels.$inferInsert;

/**
 * Transactions table - property transactions (sales, transfers, mortgages)
 */
export const transactionStatusEnum = pgEnum("transaction_status", [
  "draft",
  "pending",
  "under_review",
  "approved",
  "completed",
  "cancelled",
  "disputed"
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "sale",
  "transfer",
  "mortgage",
  "lease",
  "subdivision",
  "consolidation"
]);

export const transactions = pgTable("transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transactionRef: varchar("transaction_ref", { length: 64 }).notNull().unique(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").default("draft").notNull(),
  sellerId: integer("seller_id").references(() => users.id),
  buyerId: integer("buyer_id").references(() => users.id),
  agentId: integer("agent_id").references(() => users.id),
  amount: decimal("amount", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  depositAmount: decimal("deposit_amount", { precision: 18, scale: 2 }),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }),
  commissionAmount: decimal("commission_amount", { precision: 18, scale: 2 }),
  contractUrl: text("contract_url"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("transactions_parcel_idx").on(table.parcelId),
  sellerIdx: index("transactions_seller_idx").on(table.sellerId),
  buyerIdx: index("transactions_buyer_idx").on(table.buyerId),
  statusIdx: index("transactions_status_idx").on(table.status),
  typeIdx: index("transactions_type_idx").on(table.type),
}));

export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;

/**
 * Documents table - property documents and certificates
 */
export const documents = pgTable("documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: integer("parcel_id").references(() => parcels.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  uploadedBy: integer("uploaded_by").notNull().references(() => users.id),
  documentType: varchar("document_type", { length: 64 }).notNull(), // title_deed, survey_plan, c_of_o, contract
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 64 }),
  documentNumber: varchar("document_number", { length: 128 }),
  issueDate: timestamp("issue_date"),
  expiryDate: timestamp("expiry_date"),
  verified: boolean("verified").default(false).notNull(),
  verifiedBy: integer("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("documents_parcel_idx").on(table.parcelId),
  transactionIdx: index("documents_transaction_idx").on(table.transactionId),
  typeIdx: index("documents_type_idx").on(table.documentType),
}));

export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;

/**
 * Payments table - payment records for transactions
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded"
]);

export const payments = pgTable("payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  paymentRef: varchar("payment_ref", { length: 64 }).notNull().unique(),
  transactionId: integer("transaction_id").notNull().references(() => transactions.id),
  payerId: integer("payer_id").notNull().references(() => users.id),
  payeeId: integer("payee_id").references(() => users.id),
  amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  paymentMethod: varchar("payment_method", { length: 64 }), // bank_transfer, card, ussd, mojaloop
  paymentGateway: varchar("payment_gateway", { length: 64 }), // paystack, flutterwave, mojaloop
  gatewayRef: varchar("gateway_ref", { length: 128 }),
  status: paymentStatusEnum("status").default("pending").notNull(),
  paidAt: timestamp("paid_at"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("payments_transaction_idx").on(table.transactionId),
  payerIdx: index("payments_payer_idx").on(table.payerId),
  statusIdx: index("payments_status_idx").on(table.status),
}));

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Disputes table - land and transaction disputes
 */
export const disputeStatusEnum = pgEnum("dispute_status", [
  "filed",
  "under_review",
  "mediation",
  "resolved",
  "escalated",
  "closed"
]);

export const disputes = pgTable("disputes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  disputeRef: varchar("dispute_ref", { length: 64 }).notNull().unique(),
  parcelId: integer("parcel_id").references(() => parcels.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  filedBy: integer("filed_by").notNull().references(() => users.id),
  againstUserId: integer("against_user_id").references(() => users.id),
  disputeType: varchar("dispute_type", { length: 64 }).notNull(), // ownership, boundary, fraud, payment
  description: text("description").notNull(),
  evidenceUrls: jsonb("evidence_urls"),
  status: disputeStatusEnum("status").default("filed").notNull(),
  priority: varchar("priority", { length: 20 }).default("medium").notNull(),
  assignedTo: integer("assigned_to").references(() => users.id),
  resolution: text("resolution"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("disputes_parcel_idx").on(table.parcelId),
  filedByIdx: index("disputes_filed_by_idx").on(table.filedBy),
  statusIdx: index("disputes_status_idx").on(table.status),
}));

export type Dispute = typeof disputes.$inferSelect;
export type InsertDispute = typeof disputes.$inferInsert;

/**
 * Mortgages table - mortgage applications and management
 */
export const mortgageStatusEnum = pgEnum("mortgage_status", [
  "application",
  "underwriting",
  "approved",
  "active",
  "defaulted",
  "paid_off",
  "rejected"
]);

export const mortgages = pgTable("mortgages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  mortgageRef: varchar("mortgage_ref", { length: 64 }).notNull().unique(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  borrowerId: integer("borrower_id").notNull().references(() => users.id),
  lenderId: integer("lender_id").references(() => users.id),
  principalAmount: decimal("principal_amount", { precision: 18, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }).notNull(),
  termMonths: integer("term_months").notNull(),
  monthlyPayment: decimal("monthly_payment", { precision: 18, scale: 2 }),
  outstandingBalance: decimal("outstanding_balance", { precision: 18, scale: 2 }),
  status: mortgageStatusEnum("status").default("application").notNull(),
  approvedAt: timestamp("approved_at"),
  startDate: timestamp("start_date"),
  maturityDate: timestamp("maturity_date"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("mortgages_parcel_idx").on(table.parcelId),
  borrowerIdx: index("mortgages_borrower_idx").on(table.borrowerId),
  statusIdx: index("mortgages_status_idx").on(table.status),
}));

export type Mortgage = typeof mortgages.$inferSelect;
export type InsertMortgage = typeof mortgages.$inferInsert;

/**
 * Mortgage applications table
 */
export const mortgageApplications = pgTable("mortgage_applications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  applicationRef: varchar("application_ref", { length: 64 }).notNull().unique(),
  applicantId: integer("applicant_id").notNull().references(() => users.id),
  parcelId: integer("parcel_id").references(() => parcels.id),
  requestedAmount: decimal("requested_amount", { precision: 18, scale: 2 }).notNull(),
  downPayment: decimal("down_payment", { precision: 18, scale: 2 }),
  employmentStatus: varchar("employment_status", { length: 64 }),
  annualIncome: decimal("annual_income", { precision: 18, scale: 2 }),
  creditScore: integer("credit_score"),
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  approvalNotes: text("approval_notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  applicantIdx: index("mortgage_applications_applicant_idx").on(table.applicantId),
  statusIdx: index("mortgage_applications_status_idx").on(table.status),
}));

export type MortgageApplication = typeof mortgageApplications.$inferSelect;
export type InsertMortgageApplication = typeof mortgageApplications.$inferInsert;

/**
 * Marketplace listings table
 */
export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "active",
  "under_offer",
  "sold",
  "withdrawn",
  "expired"
]);

export const marketplaceListings = pgTable("marketplace_listings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  listingRef: varchar("listing_ref", { length: 64 }).notNull().unique(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  sellerId: integer("seller_id").notNull().references(() => users.id),
  agentId: integer("agent_id").references(() => users.id),
  listingType: varchar("listing_type", { length: 32 }).notNull(), // sale, lease, rent
  askingPrice: decimal("asking_price", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  negotiable: boolean("negotiable").default(true).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  features: jsonb("features"), // amenities, utilities, access
  images: jsonb("images"), // array of image URLs
  virtualTourUrl: text("virtual_tour_url"),
  status: listingStatusEnum("status").default("draft").notNull(),
  featured: boolean("featured").default(false).notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  soldAt: timestamp("sold_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("marketplace_listings_parcel_idx").on(table.parcelId),
  sellerIdx: index("marketplace_listings_seller_idx").on(table.sellerId),
  statusIdx: index("marketplace_listings_status_idx").on(table.status),
}));

export type MarketplaceListing = typeof marketplaceListings.$inferSelect;
export type InsertMarketplaceListing = typeof marketplaceListings.$inferInsert;

/**
 * Property valuations table
 */
export const valuations = pgTable("valuations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  valuedBy: integer("valued_by").references(() => users.id),
  valuationMethod: varchar("valuation_method", { length: 64 }), // comparative, income, cost
  estimatedValue: decimal("estimated_value", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  confidence: varchar("confidence", { length: 20 }), // low, medium, high
  comparables: jsonb("comparables"), // similar properties used
  adjustments: jsonb("adjustments"),
  reportUrl: text("report_url"),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("valuations_parcel_idx").on(table.parcelId),
}));

export type Valuation = typeof valuations.$inferSelect;
export type InsertValuation = typeof valuations.$inferInsert;

/**
 * Notifications table - user notifications
 */
export const userNotifications = pgTable("user_notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  actionUrl: text("action_url"),
  read: boolean("read").default(false).notNull(),
  readAt: timestamp("read_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("user_notifications_user_idx").on(table.userId),
  readIdx: index("user_notifications_read_idx").on(table.read),
}));

export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = typeof userNotifications.$inferInsert;

/**
 * Audit trail table - comprehensive audit logging
 */
export const auditTrail = pgTable("audit_trail", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 128 }).notNull(),
  entityType: varchar("entity_type", { length: 64 }),
  entityId: varchar("entity_id", { length: 64 }),
  changes: jsonb("changes"), // before/after diff
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("audit_trail_user_idx").on(table.userId),
  entityIdx: index("audit_trail_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("audit_trail_created_at_idx").on(table.createdAt),
}));

export type AuditTrail = typeof auditTrail.$inferSelect;
export type InsertAuditTrail = typeof auditTrail.$inferInsert;

/**
 * System settings table
 */
export const systemSettings = pgTable("system_settings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

/**
 * Blockchain records table - blockchain anchoring records
 */
export const blockchainRecords = pgTable("blockchain_records", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: varchar("entity_type", { length: 64 }).notNull(), // parcel, transaction, document
  entityId: integer("entity_id").notNull(),
  blockchainNetwork: varchar("blockchain_network", { length: 64 }).notNull(), // ethereum, hyperledger, polygon
  transactionHash: varchar("transaction_hash", { length: 128 }).notNull(),
  blockNumber: integer("block_number"),
  dataHash: varchar("data_hash", { length: 128 }).notNull(),
  smartContractAddress: varchar("smart_contract_address", { length: 128 }),
  status: varchar("status", { length: 32 }).default("confirmed").notNull(),
  confirmations: integer("confirmations").default(0).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("blockchain_records_entity_idx").on(table.entityType, table.entityId),
  txHashIdx: index("blockchain_records_tx_hash_idx").on(table.transactionHash),
}));

export type BlockchainRecord = typeof blockchainRecords.$inferSelect;
export type InsertBlockchainRecord = typeof blockchainRecords.$inferInsert;

/**
 * Integration logs table - external API integration logs
 */
export const integrationLogs = pgTable("integration_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integration: varchar("integration", { length: 64 }).notNull(), // firs, nin, bvn, cac, paystack
  action: varchar("action", { length: 128 }).notNull(),
  requestData: jsonb("request_data"),
  responseData: jsonb("response_data"),
  statusCode: integer("status_code"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  integrationIdx: index("integration_logs_integration_idx").on(table.integration),
  createdAtIdx: index("integration_logs_created_at_idx").on(table.createdAt),
}));

export type IntegrationLog = typeof integrationLogs.$inferSelect;
export type InsertIntegrationLog = typeof integrationLogs.$inferInsert;

/**
 * Tax assessments table - property tax records
 */
export const taxAssessments = pgTable("tax_assessments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  assessmentYear: integer("assessment_year").notNull(),
  assessedValue: decimal("assessed_value", { precision: 18, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 18, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  status: varchar("status", { length: 32 }).default("assessed").notNull(), // assessed, billed, paid, overdue
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  paymentRef: varchar("payment_ref", { length: 64 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("tax_assessments_parcel_idx").on(table.parcelId),
  yearIdx: index("tax_assessments_year_idx").on(table.assessmentYear),
  statusIdx: index("tax_assessments_status_idx").on(table.status),
}));

export type TaxAssessment = typeof taxAssessments.$inferSelect;
export type InsertTaxAssessment = typeof taxAssessments.$inferInsert;

/**
 * Survey records table - land survey data
 */
export const surveyRecords = pgTable("survey_records", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  surveyorId: integer("surveyor_id").notNull().references(() => users.id),
  surveyNumber: varchar("survey_number", { length: 128 }).notNull(),
  surveyDate: timestamp("survey_date").notNull(),
  coordinates: jsonb("coordinates").notNull(), // boundary coordinates
  area: decimal("area", { precision: 12, scale: 2 }),
  beaconNumbers: jsonb("beacon_numbers"),
  planUrl: text("plan_url"),
  approved: boolean("approved").default(false).notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("survey_records_parcel_idx").on(table.parcelId),
  surveyorIdx: index("survey_records_surveyor_idx").on(table.surveyorId),
}));

export type SurveyRecord = typeof surveyRecords.$inferSelect;
export type InsertSurveyRecord = typeof surveyRecords.$inferInsert;

/**
 * User preferences table
 */
export const userPreferences = pgTable("user_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  theme: varchar("theme", { length: 20 }).default("light").notNull(),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Africa/Lagos").notNull(),
  dateFormat: varchar("date_format", { length: 32 }).default("DD/MM/YYYY").notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  notificationSettings: jsonb("notification_settings"),
  dashboardLayout: jsonb("dashboard_layout").default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = typeof userPreferences.$inferInsert;

/**
 * Titles table - land title certificates
 */
export const titles = pgTable("titles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  titleNumber: varchar("title_number", { length: 128 }).notNull().unique(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  titleType: varchar("title_type", { length: 64 }).notNull(), // c_of_o, deed, lease
  issueDate: timestamp("issue_date").notNull(),
  expiryDate: timestamp("expiry_date"),
  issuingAuthority: varchar("issuing_authority", { length: 255 }),
  documentUrl: text("document_url"),
  status: varchar("status", { length: 32 }).default("active").notNull(), // active, expired, revoked, transferred
  revokedAt: timestamp("revoked_at"),
  revocationReason: text("revocation_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("titles_parcel_idx").on(table.parcelId),
  ownerIdx: index("titles_owner_idx").on(table.ownerId),
  statusIdx: index("titles_status_idx").on(table.status),
}));

export type Title = typeof titles.$inferSelect;
export type InsertTitle = typeof titles.$inferInsert;

/**
 * Workflow definitions table
 */
export const workflowDefinitions = pgTable("workflow_definitions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  entityType: varchar("entity_type", { length: 64 }).notNull(), // parcel, transaction, mortgage
  steps: jsonb("steps").notNull(), // array of workflow steps
  active: boolean("active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type InsertWorkflowDefinition = typeof workflowDefinitions.$inferInsert;

/**
 * Workflow instances table
 */
export const workflowInstances = pgTable("workflow_instances", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  definitionId: integer("definition_id").notNull().references(() => workflowDefinitions.id),
  entityType: varchar("entity_type", { length: 64 }).notNull(),
  entityId: integer("entity_id").notNull(),
  currentStep: integer("current_step").default(0).notNull(),
  status: varchar("status", { length: 32 }).default("running").notNull(), // running, completed, failed, cancelled
  data: jsonb("data"),
  startedBy: integer("started_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("workflow_instances_entity_idx").on(table.entityType, table.entityId),
  statusIdx: index("workflow_instances_status_idx").on(table.status),
}));

export type WorkflowInstance = typeof workflowInstances.$inferSelect;
export type InsertWorkflowInstance = typeof workflowInstances.$inferInsert;

/**
 * Event outbox table - transactional outbox for event streaming
 */
export const eventOutbox = pgTable("event_outbox", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  backend: varchar("backend", { length: 32 }).notNull(), // kafka, redis, pulsar
  topic: varchar("topic", { length: 128 }).notNull(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 64 }),
  aggregateId: varchar("aggregate_id", { length: 64 }),
  payload: jsonb("payload").notNull(),
  deliveryStatus: varchar("delivery_status", { length: 32 }).default("pending").notNull(), // pending, delivered, failed
  deliveredAt: timestamp("delivered_at"),
  failureReason: text("failure_reason"),
  retryCount: integer("retry_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  topicIdx: index("event_outbox_topic_idx").on(table.topic),
  statusIdx: index("event_outbox_status_idx").on(table.deliveryStatus),
  aggregateIdx: index("event_outbox_aggregate_idx").on(table.aggregateType, table.aggregateId),
}));

export type EventOutbox = typeof eventOutbox.$inferSelect;
export type InsertEventOutbox = typeof eventOutbox.$inferInsert;

/**
 * Stream consumer checkpoints table
 */
export const streamConsumerCheckpoints = pgTable("stream_consumer_checkpoints", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  backend: varchar("backend", { length: 32 }).notNull(),
  consumerGroup: varchar("consumer_group", { length: 128 }).notNull(),
  topic: varchar("topic", { length: 128 }).notNull(),
  partition: integer("partition").default(0).notNull(),
  offsetValue: varchar("offset_value", { length: 64 }).notNull(),
  lastMessageKey: varchar("last_message_key", { length: 128 }),
  lastProcessedAt: timestamp("last_processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  consumerIdx: index("stream_consumer_checkpoints_consumer_idx").on(table.consumerGroup, table.topic),
}));

export type StreamConsumerCheckpoint = typeof streamConsumerCheckpoints.$inferSelect;
export type InsertStreamConsumerCheckpoint = typeof streamConsumerCheckpoints.$inferInsert;

/**
 * Data lakehouse tables - analytics staging
 */
export const lakehouseIngestRuns = pgTable("lakehouse_ingest_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  source: varchar("source", { length: 128 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(), // running, completed, failed
  recordsIngested: integer("records_ingested").default(0).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sourceIdx: index("lakehouse_ingest_runs_source_idx").on(table.source),
  statusIdx: index("lakehouse_ingest_runs_status_idx").on(table.status),
}));

export type LakehouseIngestRun = typeof lakehouseIngestRuns.$inferSelect;
export type InsertLakehouseIngestRun = typeof lakehouseIngestRuns.$inferInsert;

/**
 * Lakehouse query audit table
 */
export const lakehouseQueryAudit = pgTable("lakehouse_query_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id),
  queryText: text("query_text").notNull(),
  queryType: varchar("query_type", { length: 64 }),
  executionTimeMs: integer("execution_time_ms"),
  rowsReturned: integer("rows_returned"),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("lakehouse_query_audit_user_idx").on(table.userId),
  createdAtIdx: index("lakehouse_query_audit_created_at_idx").on(table.createdAt),
}));

export type LakehouseQueryAudit = typeof lakehouseQueryAudit.$inferSelect;
export type InsertLakehouseQueryAudit = typeof lakehouseQueryAudit.$inferInsert;

// ---------------------------------------------------------------------------
// Next-generation feature domain (2026-07-18)
// Title Risk Copilot, Registry Integrity Monitoring, Programmable Escrow
// Settlement, Explainable Mortgage Decisioning, Federated Clearance Exchange,
// Privacy-Aware Data Exchange Gateway
// ---------------------------------------------------------------------------

export const riskBandEnum = pgEnum("risk_band", ["low", "medium", "high", "critical"]);
export const integrityFindingSeverityEnum = pgEnum("integrity_finding_severity", ["info", "low", "medium", "high", "critical"]);
export const integrityFindingStatusEnum = pgEnum("integrity_finding_status", ["open", "acknowledged", "resolved", "dismissed"]);
export const settlementStatusEnum = pgEnum("settlement_status", ["draft", "pending", "release_ready", "released", "blocked", "cancelled"]);
export const checkpointStatusEnum = pgEnum("checkpoint_status", ["pending", "fulfilled", "waived", "failed"]);
export const clearanceStatusEnum = pgEnum("clearance_status", ["pending", "submitted", "approved", "rejected", "expired"]);
export const exchangeDecisionEnum = pgEnum("exchange_decision", ["allowed", "denied", "conditional"]);

/** Title Risk Copilot — persisted risk assessments per parcel/transaction. */
export const titleRiskAssessments = pgTable("title_risk_assessments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: integer("parcel_id").references(() => parcels.id),
  transactionId: integer("transaction_id").references(() => transactions.id),
  overallScore: integer("overall_score").notNull(),
  riskBand: riskBandEnum("risk_band").notNull(),
  factorScores: jsonb("factor_scores"),
  drivers: jsonb("drivers"),
  recommendations: jsonb("recommendations"),
  assessedBy: integer("assessed_by").references(() => users.id),
  assessedAt: timestamp("assessed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("title_risk_assessments_parcel_idx").on(table.parcelId),
  bandIdx: index("title_risk_assessments_band_idx").on(table.riskBand),
  assessedAtIdx: index("title_risk_assessments_assessed_at_idx").on(table.assessedAt),
}));

/** Registry Integrity Monitoring — anomaly findings with operator review queue. */
export const registryIntegrityFindings = pgTable("registry_integrity_findings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  checkType: varchar("check_type", { length: 64 }).notNull(),
  severity: integrityFindingSeverityEnum("severity").default("medium").notNull(),
  status: integrityFindingStatusEnum("status").default("open").notNull(),
  parcelId: integer("parcel_id").references(() => parcels.id),
  relatedEntityType: varchar("related_entity_type", { length: 64 }),
  relatedEntityId: integer("related_entity_id"),
  description: text("description").notNull(),
  evidence: jsonb("evidence"),
  detectedBy: varchar("detected_by", { length: 64 }).default("manual").notNull(),
  scanRunId: varchar("scan_run_id", { length: 64 }),
  acknowledgedBy: integer("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("registry_integrity_findings_status_idx").on(table.status),
  severityIdx: index("registry_integrity_findings_severity_idx").on(table.severity),
  checkTypeIdx: index("registry_integrity_findings_check_type_idx").on(table.checkType),
  parcelIdx: index("registry_integrity_findings_parcel_idx").on(table.parcelId),
}));

/** Programmable Escrow & Settlement Orchestrator — settlement envelopes. */
export const escrowSettlements = pgTable("escrow_settlements", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  settlementRef: varchar("settlement_ref", { length: 64 }).notNull().unique(),
  transactionId: integer("transaction_id").references(() => transactions.id),
  amount: decimal("amount", { precision: 18, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  status: settlementStatusEnum("status").default("draft").notNull(),
  releaseDecision: jsonb("release_decision"),
  blockingReasons: jsonb("blocking_reasons"),
  releasedAt: timestamp("released_at"),
  releasedBy: integer("released_by").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("escrow_settlements_status_idx").on(table.status),
  transactionIdx: index("escrow_settlements_transaction_idx").on(table.transactionId),
}));

/** Settlement checkpoints — deterministic release conditions. */
export const settlementCheckpoints = pgTable("settlement_checkpoints", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  settlementId: integer("settlement_id").references(() => escrowSettlements.id).notNull(),
  checkpointKey: varchar("checkpoint_key", { length: 64 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  required: boolean("required").default(true).notNull(),
  status: checkpointStatusEnum("status").default("pending").notNull(),
  evidence: jsonb("evidence"),
  fulfilledBy: integer("fulfilled_by").references(() => users.id),
  fulfilledAt: timestamp("fulfilled_at"),
  waivedBy: integer("waived_by").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  settlementIdx: index("settlement_checkpoints_settlement_idx").on(table.settlementId),
  statusIdx: index("settlement_checkpoints_status_idx").on(table.status),
}));

/** Explainable Mortgage Decisioning — persisted underwriting explanations. */
export const mortgageDecisionExplanations = pgTable("mortgage_decision_explanations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  applicationId: integer("application_id").references(() => mortgageApplications.id).notNull(),
  overallRecommendation: varchar("overall_recommendation", { length: 64 }).notNull(),
  overallScore: integer("overall_score").notNull(),
  factors: jsonb("factors"),
  policyVersion: varchar("policy_version", { length: 32 }).default("v1").notNull(),
  generatedBy: integer("generated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("mortgage_decision_explanations_application_idx").on(table.applicationId),
}));

/** Federated Inter-Agency Clearance Exchange — per-agency clearance states. */
export const agencyClearances = pgTable("agency_clearances", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transactionId: integer("transaction_id").references(() => transactions.id).notNull(),
  agency: varchar("agency", { length: 64 }).notNull(),
  status: clearanceStatusEnum("status").default("pending").notNull(),
  referenceNumber: varchar("reference_number", { length: 128 }),
  slaDueAt: timestamp("sla_due_at"),
  submittedAt: timestamp("submitted_at"),
  decidedAt: timestamp("decided_at"),
  decisionNotes: text("decision_notes"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("agency_clearances_transaction_idx").on(table.transactionId),
  agencyIdx: index("agency_clearances_agency_idx").on(table.agency),
  statusIdx: index("agency_clearances_status_idx").on(table.status),
}));

/** Privacy-Aware Data Exchange Gateway — export authorization audit trail. */
export const dataExchangeAudits = pgTable("data_exchange_audits", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  subjectUserId: integer("subject_user_id").references(() => users.id),
  requestorUserId: integer("requestor_user_id").references(() => users.id),
  requestorRole: varchar("requestor_role", { length: 64 }).notNull(),
  purpose: varchar("purpose", { length: 128 }).notNull(),
  jurisdiction: varchar("jurisdiction", { length: 64 }).default("NG").notNull(),
  dataCategories: jsonb("data_categories"),
  decision: exchangeDecisionEnum("decision").notNull(),
  decisionReasons: jsonb("decision_reasons"),
  conditions: jsonb("conditions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  subjectIdx: index("data_exchange_audits_subject_idx").on(table.subjectUserId),
  decisionIdx: index("data_exchange_audits_decision_idx").on(table.decision),
  purposeIdx: index("data_exchange_audits_purpose_idx").on(table.purpose),
}));

export type TitleRiskAssessment = typeof titleRiskAssessments.$inferSelect;
export type InsertTitleRiskAssessment = typeof titleRiskAssessments.$inferInsert;
export type RegistryIntegrityFinding = typeof registryIntegrityFindings.$inferSelect;
export type InsertRegistryIntegrityFinding = typeof registryIntegrityFindings.$inferInsert;
export type EscrowSettlement = typeof escrowSettlements.$inferSelect;
export type InsertEscrowSettlement = typeof escrowSettlements.$inferInsert;
export type SettlementCheckpoint = typeof settlementCheckpoints.$inferSelect;
export type InsertSettlementCheckpoint = typeof settlementCheckpoints.$inferInsert;
export type MortgageDecisionExplanation = typeof mortgageDecisionExplanations.$inferSelect;
export type InsertMortgageDecisionExplanation = typeof mortgageDecisionExplanations.$inferInsert;
export type AgencyClearance = typeof agencyClearances.$inferSelect;
export type InsertAgencyClearance = typeof agencyClearances.$inferInsert;
export type DataExchangeAudit = typeof dataExchangeAudits.$inferSelect;
export type InsertDataExchangeAudit = typeof dataExchangeAudits.$inferInsert;
