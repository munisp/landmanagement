import { bigint, boolean, decimal, doublePrecision, integer, json, jsonb, index, pgEnum, pgTable, real, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

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
  // Nullable: anonymous audit events (failed logins, rejected API keys) have
  // no attributable user.
  userId: integer("userId").references(() => users.id, { onDelete: 'cascade' }),
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
  parcelId: varchar("parcel_id", { length: 64 }),
  latitude: varchar("latitude", { length: 20 }).notNull(),
  longitude: varchar("longitude", { length: 20 }).notNull(),
  accuracy: integer("accuracy"), // GPS accuracy in meters
  photos: jsonb("photos"), // Array of photo URLs
  notes: text("notes"),
  formData: jsonb("form_data"), // Additional structured data
  syncStatus: varchar("sync_status", { length: 20 }).default("synced").notNull(), // pending, synced
  capturedAt: timestamp("captured_at").notNull(),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("field_data_user_idx").on(table.userId),
  parcelIdx: index("field_data_parcel_idx").on(table.parcelId),
  syncStatusIdx: index("field_data_sync_status_idx").on(table.syncStatus),
}));

export type FieldData = typeof fieldData.$inferSelect;
export type InsertFieldData = typeof fieldData.$inferInsert;

/**
 * Blockchain transactions for audit trail
 */
export const blockchainTransactions = pgTable("blockchain_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  transactionType: varchar("transaction_type", { length: 64 }).notNull(), // property_transfer, escrow_create, escrow_deposit, escrow_release
  parcelId: varchar("parcel_id", { length: 64 }),
  txHash: varchar("tx_hash", { length: 128 }).notNull().unique(),
  blockNumber: integer("block_number"),
  fromAddress: varchar("from_address", { length: 64 }).notNull(),
  toAddress: varchar("to_address", { length: 64 }),
  contractAddress: varchar("contract_address", { length: 64 }),
  gasUsed: varchar("gas_used", { length: 32 }),
  gasFee: varchar("gas_fee", { length: 32 }),
  status: varchar("status", { length: 20 }).notNull(), // pending, confirmed, failed
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
}, (table) => ({
  userIdx: index("blockchain_transactions_user_idx").on(table.userId),
  txHashIdx: index("blockchain_transactions_tx_hash_idx").on(table.txHash),
  statusIdx: index("blockchain_transactions_status_idx").on(table.status),
}));

export type BlockchainTransaction = typeof blockchainTransactions.$inferSelect;
export type InsertBlockchainTransaction = typeof blockchainTransactions.$inferInsert;

/**
 * Parcels table for land registry
 */
export const parcelStatusEnum = pgEnum("parcel_status", ["draft", "pending_verification", "verified", "registered", "transferred", "disputed", "archived"]);

export const parcels = pgTable("parcels", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parcelId: varchar("parcel_id", { length: 64 }).notNull().unique(),
  ownerId: integer("owner_id").references(() => users.id),
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 128 }),
  country: varchar("country", { length: 128 }).default("Nigeria").notNull(),
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 }),
  area: doublePrecision("area"), // in square meters
  landUse: varchar("land_use", { length: 64 }), // residential, commercial, agricultural, etc.
  status: parcelStatusEnum("status").default("draft").notNull(),
  titleNumber: varchar("title_number", { length: 64 }),
  surveyPlanNumber: varchar("survey_plan_number", { length: 64 }),
  registrationDate: timestamp("registration_date"),
  lastTransferDate: timestamp("last_transfer_date"),
  // --- Domain-repository columns (migration 0012) ---
  parcelNumber: varchar("parcel_number", { length: 64 }).unique(),
  lga: varchar("lga", { length: 128 }),
  ward: varchar("ward", { length: 128 }),
  estimatedValue: bigint("estimated_value", { mode: "number" }),
  geometryGeoJSON: text("geometry_geojson"),
  boundaryCoordinates: text("boundary_coordinates"),
  surveyorId: varchar("surveyor_id", { length: 64 }),
  verifierId: varchar("verifier_id", { length: 64 }),
  verifiedAt: timestamp("verified_at"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  ownerIdx: index("parcels_owner_idx").on(table.ownerId),
  parcelIdIdx: index("parcels_parcel_id_idx").on(table.parcelId),
  statusIdx: index("parcels_status_idx").on(table.status),
  lgaIdx: index("parcels_lga_idx").on(table.lga),
  // Composite indexes for common filter combinations
  stateStatusIdx: index("parcels_state_status_idx").on(table.state, table.status),
  landUseStatusIdx: index("parcels_land_use_status_idx").on(table.landUse, table.status),
  stateLgaIdx: index("parcels_state_lga_idx").on(table.state, table.lga),
  createdAtIdx: index("parcels_created_at_idx").on(table.createdAt),
}));

export type Parcel = typeof parcels.$inferSelect;
export type InsertParcel = typeof parcels.$inferInsert;

/**
 * API Keys table for programmatic access
 */
export const apiKeys = pgTable("api_keys", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  requestCount: integer("request_count").default(0).notNull(),
  rateLimit: integer("rate_limit").default(1000).notNull(), // requests per hour
}, (table) => ({
  userIdx: index("api_keys_user_idx").on(table.userId),
  keyIdx: index("api_keys_key_idx").on(table.key),
  isActiveIdx: index("api_keys_is_active_idx").on(table.isActive),
}));

/**
 * Real per-event usage telemetry for API keys. validateApiKey appends a
 * 'request' event on every validated call; the enforcing gateway/middleware
 * appends 'rate_limit_hit' and 'error' events. getUsageStats aggregates this
 * table — no simulated metrics.
 */
export const apiKeyUsageEvents = pgTable("api_key_usage_events", {
  id: serial("id").primaryKey(),
  keyId: varchar("key_id", { length: 64 }).notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  event: varchar("event", { length: 32 }).notNull(), // 'request' | 'rate_limit_hit' | 'error'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  keyIdx: index("api_key_usage_events_key_idx").on(table.keyId),
  createdAtIdx: index("api_key_usage_events_created_at_idx").on(table.createdAt),
}));

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

/**
 * Mojaloop Payment Integration Tables
 */

// Payment status enum
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "quote_received",
  "reserved",
  "committed",
  "completed",
  "failed",
  "rejected"
]);

// Payment transaction type enum
export const paymentTransactionTypeEnum = pgEnum("payment_transaction_type", [
  "transfer",
  "deposit",
  "withdrawal",
  "property_purchase",
  "registration_fee",
  "survey_fee"
]);

/**
 * Mojaloop Payment Transactions
 * Tracks all payment transactions through the Mojaloop network
 */
export const mojaloopTransactions = pgTable("mojaloop_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  // Transaction identifiers
  transactionId: varchar("transaction_id", { length: 128 }).notNull().unique(),
  transferId: varchar("transfer_id", { length: 128 }).unique(),
  quoteId: varchar("quote_id", { length: 128 }).unique(),
  
  // User and property references
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  propertyId: varchar("property_id", { length: 64 }),
  escrowContractAddress: varchar("escrow_contract_address", { length: 128 }),
  
  // Payment details
  amount: real("amount").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default('USD'),
  
  // Payer information
  payerFspId: varchar("payer_fsp_id", { length: 64 }).notNull(),
  payerPartyIdType: varchar("payer_party_id_type", { length: 32 }).notNull(),
  payerPartyIdentifier: varchar("payer_party_identifier", { length: 128 }).notNull(),
  payerName: varchar("payer_name", { length: 255 }),
  
  // Payee information
  payeeFspId: varchar("payee_fsp_id", { length: 64 }).notNull(),
  payeePartyIdType: varchar("payee_party_id_type", { length: 32 }).notNull(),
  payeePartyIdentifier: varchar("payee_party_identifier", { length: 128 }).notNull(),
  payeeName: varchar("payee_name", { length: 255 }),
  
  // Transaction status
  status: paymentStatusEnum("status").notNull().default('pending'),
  errorCode: varchar("error_code", { length: 64 }),
  errorDescription: text("error_description"),
  
  // Quote details
  quoteAmount: real("quote_amount"),
  quoteFees: real("quote_fees"),
  quoteExpiration: timestamp("quote_expiration"),
  
  // Transfer details
  transferState: varchar("transfer_state", { length: 32 }),
  transferFulfilment: text("transfer_fulfilment"),
  transferCondition: text("transfer_condition"),
  
  // Metadata
  note: text("note"),
  transactionType: paymentTransactionTypeEnum("transaction_type").notNull().default('transfer'),
  purpose: varchar("purpose", { length: 255 }),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  
  // Reconciliation
  reconciledAt: timestamp("reconciled_at"),
  blockchainTxHash: varchar("blockchain_tx_hash", { length: 128 }),
}, (table) => ({
  userIdx: index("mojaloop_transactions_user_idx").on(table.userId),
  statusIdx: index("mojaloop_transactions_status_idx").on(table.status),
  transactionIdIdx: index("mojaloop_transactions_transaction_id_idx").on(table.transactionId),
  propertyIdx: index("mojaloop_transactions_property_idx").on(table.propertyId),
}));

export type MojaloopTransaction = typeof mojaloopTransactions.$inferSelect;
export type InsertMojaloopTransaction = typeof mojaloopTransactions.$inferInsert;

/**
 * Mojaloop Payment Events Log
 * Tracks all events in the payment lifecycle for audit trail
 */
export const mojaloopPaymentEvents = pgTable("mojaloop_payment_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  transactionId: varchar("transaction_id", { length: 128 }).notNull(),
  eventType: varchar("event_type", { length: 64 }).notNull(),
  eventStatus: varchar("event_status", { length: 32 }).notNull(),
  
  // Event payload
  requestPayload: text("request_payload"),
  responsePayload: text("response_payload"),
  
  // Error details
  errorCode: varchar("error_code", { length: 64 }),
  errorMessage: text("error_message"),
  
  // Metadata
  fspId: varchar("fsp_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  transactionIdIdx: index("mojaloop_payment_events_transaction_id_idx").on(table.transactionId),
  eventTypeIdx: index("mojaloop_payment_events_event_type_idx").on(table.eventType),
}));

export type MojaloopPaymentEvent = typeof mojaloopPaymentEvents.$inferSelect;
export type InsertMojaloopPaymentEvent = typeof mojaloopPaymentEvents.$inferInsert;

/**
 * FSP (Financial Service Provider) Configuration
 * Stores configuration for connecting to different FSPs in the Mojaloop network
 */
export const mojaloopFspConfig = pgTable("mojaloop_fsp_config", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  fspId: varchar("fsp_id", { length: 64 }).notNull().unique(),
  fspName: varchar("fsp_name", { length: 255 }).notNull(),
  
  // API Configuration
  apiBaseUrl: varchar("api_base_url", { length: 512 }).notNull(),
  apiVersion: varchar("api_version", { length: 16 }).notNull().default('1.1'),
  
  // Authentication
  authType: varchar("auth_type", { length: 32 }).notNull().default('BEARER'),
  authToken: text("auth_token"),
  certificatePath: varchar("certificate_path", { length: 512 }),
  
  // Capabilities
  supportedCurrencies: text("supported_currencies").notNull().default('USD'),
  supportedTransactionTypes: text("supported_transaction_types").notNull().default('TRANSFER'),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  fspIdIdx: index("mojaloop_fsp_config_fsp_id_idx").on(table.fspId),
  isActiveIdx: index("mojaloop_fsp_config_is_active_idx").on(table.isActive),
}));

export type MojaloopFspConfig = typeof mojaloopFspConfig.$inferSelect;
export type InsertMojaloopFspConfig = typeof mojaloopFspConfig.$inferInsert;


/**
 * ========================================
 * PHASE 4: ADVANCED INTEGRATION TABLES
 * ========================================
 */

/**
 * Mortgage Applications Table
 * Tracks mortgage applications linked to property transactions
 */
export const mortgageStatusEnum = pgEnum("mortgage_status", [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "disbursed",
  "cancelled"
]);

export const mortgageApplications = pgTable("mortgage_applications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  applicationId: varchar("application_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  applicantId: integer("applicant_id").notNull().references(() => users.id),
  
  // Mortgage details
  loanAmount: integer("loan_amount").notNull(), // in smallest currency unit
  interestRate: varchar("interest_rate", { length: 10 }).notNull(), // e.g., "5.5"
  loanTerm: integer("loan_term").notNull(), // in months
  monthlyPayment: integer("monthly_payment").notNull(),
  downPayment: integer("down_payment").notNull(),
  monthlyIncome: integer("monthly_income"),
  employmentStatus: varchar("employment_status", { length: 32 }),
  creditScore: integer("credit_score"),
  affordabilityRatio: doublePrecision("affordability_ratio"),
  outstandingBalance: integer("outstanding_balance"),
  
  // Bank/Lender information
  bankName: varchar("bank_name", { length: 255 }).notNull(),
  bankBranch: varchar("bank_branch", { length: 255 }),
  loanOfficer: varchar("loan_officer", { length: 255 }),
  loanOfficerContact: varchar("loan_officer_contact", { length: 50 }),
  
  // Status and tracking
  status: mortgageStatusEnum("status").default("pending").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  disbursedAt: timestamp("disbursed_at"),
  rejectionReason: text("rejection_reason"),
  
  // Documents
  documents: jsonb("documents"), // Array of document URLs
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("mortgage_applications_transaction_idx").on(table.transactionId),
  parcelIdx: index("mortgage_applications_parcel_idx").on(table.parcelId),
  applicantIdx: index("mortgage_applications_applicant_idx").on(table.applicantId),
  statusIdx: index("mortgage_applications_status_idx").on(table.status),
}));

/** Mortgage workflow events — lifecycle audit trail per application. */
export const mortgageWorkflowEvents = pgTable("mortgage_workflow_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  applicationId: varchar("application_id", { length: 64 }).notNull(),
  status: mortgageStatusEnum("status").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  actorId: integer("actor_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("mortgage_workflow_events_application_idx").on(table.applicationId),
}));

export type MortgageWorkflowEventRow = typeof mortgageWorkflowEvents.$inferSelect;

export type MortgageApplication = typeof mortgageApplications.$inferSelect;
export type InsertMortgageApplication = typeof mortgageApplications.$inferInsert;

/**
 * Mortgage Payment Schedule Table
 * Tracks individual scheduled payments for each mortgage
 */
export const mortgagePaymentSchedule = pgTable("mortgage_payment_schedule", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scheduleId: varchar("schedule_id", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Payment details
  paymentNumber: integer("payment_number").notNull(),
  dueDate: timestamp("due_date").notNull(),
  principalAmount: integer("principal_amount").notNull(),
  interestAmount: integer("interest_amount").notNull(),
  totalAmount: integer("total_amount").notNull(),
  remainingBalance: integer("remaining_balance").notNull(),
  
  // Payment status
  isPaid: boolean("is_paid").default(false).notNull(),
  paidAmount: integer("paid_amount").default(0).notNull(),
  paidAt: timestamp("paid_at"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  
  // Late payment tracking
  isOverdue: boolean("is_overdue").default(false).notNull(),
  lateFee: integer("late_fee").default(0).notNull(),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("mortgage_payment_schedule_application_idx").on(table.applicationId),
  dueDateIdx: index("mortgage_payment_schedule_due_date_idx").on(table.dueDate),
  isPaidIdx: index("mortgage_payment_schedule_is_paid_idx").on(table.isPaid),
}));

export type MortgagePaymentSchedule = typeof mortgagePaymentSchedule.$inferSelect;
export type InsertMortgagePaymentSchedule = typeof mortgagePaymentSchedule.$inferInsert;

/**
 * Mortgage Payment Transactions Table
 * Uses existing paymentStatusEnum from Mojaloop payments section
 */
export const mortgagePaymentTransactions = pgTable("mortgage_payment_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transactionId: varchar("transaction_id", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  scheduleId: integer("schedule_id").references(() => mortgagePaymentSchedule.id),
  
  // Payment details
  amount: integer("amount").notNull(),
  principalPaid: integer("principal_paid").notNull(),
  interestPaid: integer("interest_paid").notNull(),
  lateFee: integer("late_fee").default(0).notNull(),
  
  // Payment method
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  paymentGateway: varchar("payment_gateway", { length: 50 }),
  gatewayReference: varchar("gateway_reference", { length: 128 }),
  
  // Status tracking
  status: paymentStatusEnum("status").default("pending").notNull(),
  initiatedAt: timestamp("initiated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  failedAt: timestamp("failed_at"),
  failureReason: text("failure_reason"),
  
  // Receipt
  receiptUrl: text("receipt_url"),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("mortgage_payment_transactions_application_idx").on(table.applicationId),
  scheduleIdx: index("mortgage_payment_transactions_schedule_idx").on(table.scheduleId),
  statusIdx: index("mortgage_payment_transactions_status_idx").on(table.status),
}));

export type MortgagePaymentTransaction = typeof mortgagePaymentTransactions.$inferSelect;
export type InsertMortgagePaymentTransaction = typeof mortgagePaymentTransactions.$inferInsert;

/**
 * Auto Debit Mandates Table
 */
export const mandateStatusEnum = pgEnum("mandate_status", [
  "pending",
  "active",
  "suspended",
  "cancelled",
  "expired"
]);

export const autoDebitMandates = pgTable("auto_debit_mandates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  mandateId: varchar("mandate_id", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Bank account details
  accountNumber: varchar("account_number", { length: 50 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  bankCode: varchar("bank_code", { length: 20 }).notNull(),
  bankName: varchar("bank_name", { length: 255 }).notNull(),
  
  // Mandate details
  maxAmount: integer("max_amount").notNull(),
  frequency: varchar("frequency", { length: 20 }).notNull().default("monthly"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  
  // Gateway integration
  gatewayProvider: varchar("gateway_provider", { length: 50 }).notNull(),
  gatewayMandateCode: varchar("gateway_mandate_code", { length: 128 }).notNull(),
  
  // Status
  status: mandateStatusEnum("status").default("pending").notNull(),
  activatedAt: timestamp("activated_at"),
  suspendedAt: timestamp("suspended_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  
  // Tracking
  lastDebitAt: timestamp("last_debit_at"),
  nextDebitAt: timestamp("next_debit_at"),
  failedDebitsCount: integer("failed_debits_count").default(0).notNull(),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("auto_debit_mandates_application_idx").on(table.applicationId),
  statusIdx: index("auto_debit_mandates_status_idx").on(table.status),
  nextDebitAtIdx: index("auto_debit_mandates_next_debit_at_idx").on(table.nextDebitAt),
}));

export type AutoDebitMandate = typeof autoDebitMandates.$inferSelect;
export type InsertAutoDebitMandate = typeof autoDebitMandates.$inferInsert;

/**
 * Tax Clearances Table
 * Tracks property tax clearance certificates
 */
export const taxClearanceStatusEnum = pgEnum("tax_clearance_status", [
  "pending",
  "in_progress",
  "verified",
  "issued",
  "rejected",
  "expired"
]);

export const taxClearances = pgTable("tax_clearances", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  clearanceId: varchar("clearance_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }).notNull(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  
  // Tax details
  taxYear: integer("tax_year").notNull(),
  taxAmount: integer("tax_amount").notNull(), // in smallest currency unit
  paidAmount: integer("paid_amount").notNull(),
  outstandingAmount: integer("outstanding_amount").notNull(),
  
  // FIRS integration
  firsReferenceNumber: varchar("firs_reference_number", { length: 128 }),
  firsVerificationDate: timestamp("firs_verification_date"),
  
  // Status and tracking
  status: taxClearanceStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  verifiedAt: timestamp("verified_at"),
  issuedAt: timestamp("issued_at"),
  expiresAt: timestamp("expires_at"),
  certificateUrl: text("certificate_url"),
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("tax_clearances_transaction_idx").on(table.transactionId),
  parcelIdx: index("tax_clearances_parcel_idx").on(table.parcelId),
  ownerIdx: index("tax_clearances_owner_idx").on(table.ownerId),
  statusIdx: index("tax_clearances_status_idx").on(table.status),
}));

export type TaxClearance = typeof taxClearances.$inferSelect;
export type InsertTaxClearance = typeof taxClearances.$inferInsert;

/**
 * Insurance Policies Table
 * Tracks property insurance policies
 */
export const insurancePolicyStatusEnum = pgEnum("insurance_policy_status", [
  "pending",
  "active",
  "expired",
  "cancelled",
  "suspended"
]);

export const insurancePolicies = pgTable("insurance_policies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  policyId: varchar("policy_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  policyHolderId: integer("policy_holder_id").notNull().references(() => users.id),
  
  // Insurance provider details
  providerName: varchar("provider_name", { length: 255 }).notNull(),
  providerContact: varchar("provider_contact", { length: 100 }),
  agentName: varchar("agent_name", { length: 255 }),
  agentContact: varchar("agent_contact", { length: 100 }),
  
  // Policy details
  policyType: varchar("policy_type", { length: 100 }).notNull(), // e.g., "Building", "Contents", "Comprehensive"
  coverageAmount: integer("coverage_amount").notNull(),
  premiumAmount: integer("premium_amount").notNull(),
  deductible: integer("deductible"),
  
  // Status and tracking
  status: insurancePolicyStatusEnum("status").default("pending").notNull(),
  effectiveDate: timestamp("effective_date").notNull(),
  expiryDate: timestamp("expiry_date").notNull(),
  lastRenewalDate: timestamp("last_renewal_date"),
  nextRenewalDate: timestamp("next_renewal_date"),
  
  // Documents
  policyDocumentUrl: text("policy_document_url"),
  certificateUrl: text("certificate_url"),
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("insurance_policies_transaction_idx").on(table.transactionId),
  parcelIdx: index("insurance_policies_parcel_idx").on(table.parcelId),
  policyHolderIdx: index("insurance_policies_policy_holder_idx").on(table.policyHolderId),
  statusIdx: index("insurance_policies_status_idx").on(table.status),
}));

export type InsurancePolicy = typeof insurancePolicies.$inferSelect;
export type InsertInsurancePolicy = typeof insurancePolicies.$inferInsert;

/**
 * Legal Documents Table
 * Tracks legal documents for property transactions
 */
export const legalDocumentTypeEnum = pgEnum("legal_document_type", [
  "deed_of_assignment",
  "power_of_attorney",
  "contract_of_sale",
  "lease_agreement",
  "mortgage_deed",
  "certificate_of_occupancy",
  "governor_consent",
  "other"
]);

export const legalDocumentStatusEnum = pgEnum("legal_document_status", [
  "draft",
  "pending_review",
  "approved",
  "signed",
  "registered",
  "rejected"
]);

export const legalDocuments = pgTable("legal_documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  documentId: varchar("document_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }).notNull(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  
  // Document details
  documentType: legalDocumentTypeEnum("document_type").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  documentUrl: text("document_url"),
  
  // Legal professional details
  lawyerName: varchar("lawyer_name", { length: 255 }),
  lawyerBarNumber: varchar("lawyer_bar_number", { length: 100 }),
  lawyerContact: varchar("lawyer_contact", { length: 100 }),
  lawFirm: varchar("law_firm", { length: 255 }),
  
  // Status and tracking
  status: legalDocumentStatusEnum("status").default("draft").notNull(),
  draftedAt: timestamp("drafted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  signedAt: timestamp("signed_at"),
  registeredAt: timestamp("registered_at"),
  registrationNumber: varchar("registration_number", { length: 128 }),
  
  // Signatories
  signatories: jsonb("signatories"), // Array of signatory objects
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("legal_documents_transaction_idx").on(table.transactionId),
  parcelIdx: index("legal_documents_parcel_idx").on(table.parcelId),
  documentTypeIdx: index("legal_documents_document_type_idx").on(table.documentType),
  statusIdx: index("legal_documents_status_idx").on(table.status),
}));

export type LegalDocument = typeof legalDocuments.$inferSelect;
export type InsertLegalDocument = typeof legalDocuments.$inferInsert;

/**
 * Cadastral Surveys Table
 * Tracks cadastral survey plans and approvals
 */
export const cadastralSurveyStatusEnum = pgEnum("cadastral_survey_status", [
  "pending",
  "in_progress",
  "completed",
  "approved",
  "rejected",
  "expired"
]);

export const cadastralSurveys = pgTable("cadastral_surveys", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  surveyId: varchar("survey_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  
  // Survey details
  surveyPlanNumber: varchar("survey_plan_number", { length: 128 }).notNull().unique(),
  surveyDate: timestamp("survey_date").notNull(),
  surveyorName: varchar("surveyor_name", { length: 255 }).notNull(),
  surveyorLicenseNumber: varchar("surveyor_license_number", { length: 100 }).notNull(),
  surveyFirm: varchar("survey_firm", { length: 255 }),
  
  // Coordinates and boundaries
  coordinates: jsonb("coordinates").notNull(), // GeoJSON format
  area: integer("area").notNull(), // in square meters
  perimeter: integer("perimeter"), // in meters
  boundaryPoints: jsonb("boundary_points"), // Array of coordinate points
  
  // Status and tracking
  status: cadastralSurveyStatusEnum("status").default("pending").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by", { length: 255 }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  expiresAt: timestamp("expires_at"),
  
  // Documents
  surveyPlanUrl: text("survey_plan_url"),
  approvalCertificateUrl: text("approval_certificate_url"),
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("cadastral_surveys_transaction_idx").on(table.transactionId),
  parcelIdx: index("cadastral_surveys_parcel_idx").on(table.parcelId),
  surveyPlanNumberIdx: index("cadastral_surveys_survey_plan_number_idx").on(table.surveyPlanNumber),
  statusIdx: index("cadastral_surveys_status_idx").on(table.status),
}));

export type CadastralSurvey = typeof cadastralSurveys.$inferSelect;
export type InsertCadastralSurvey = typeof cadastralSurveys.$inferInsert;

/**
 * Environmental Assessments Table
 * Tracks environmental impact assessments
 */
export const environmentalAssessmentStatusEnum = pgEnum("environmental_assessment_status", [
  "pending",
  "under_review",
  "approved",
  "conditional_approval",
  "rejected",
  "expired"
]);

export const environmentalAssessments = pgTable("environmental_assessments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  assessmentId: varchar("assessment_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  
  // Assessment details
  assessmentType: varchar("assessment_type", { length: 100 }).notNull(), // e.g., "EIA", "Environmental Audit"
  assessorName: varchar("assessor_name", { length: 255 }).notNull(),
  assessorLicense: varchar("assessor_license", { length: 100 }),
  assessorFirm: varchar("assessor_firm", { length: 255 }),
  
  // Environmental factors
  soilQuality: varchar("soil_quality", { length: 50 }),
  waterQuality: varchar("water_quality", { length: 50 }),
  airQuality: varchar("air_quality", { length: 50 }),
  floodRisk: varchar("flood_risk", { length: 50 }),
  erosionRisk: varchar("erosion_risk", { length: 50 }),
  contaminationLevel: varchar("contamination_level", { length: 50 }),
  
  // Protected areas
  isProtectedArea: boolean("is_protected_area").default(false).notNull(),
  protectedAreaType: varchar("protected_area_type", { length: 100 }),
  
  // Status and tracking
  status: environmentalAssessmentStatusEnum("status").default("pending").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  conditions: text("conditions"), // Conditions for conditional approval
  rejectionReason: text("rejection_reason"),
  expiresAt: timestamp("expires_at"),
  
  // Documents
  reportUrl: text("report_url"),
  certificateUrl: text("certificate_url"),
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("environmental_assessments_transaction_idx").on(table.transactionId),
  parcelIdx: index("environmental_assessments_parcel_idx").on(table.parcelId),
  statusIdx: index("environmental_assessments_status_idx").on(table.status),
}));

export type EnvironmentalAssessment = typeof environmentalAssessments.$inferSelect;
export type InsertEnvironmentalAssessment = typeof environmentalAssessments.$inferInsert;

/**
 * Public Notices Table
 * Tracks public notice publications for property transactions
 */
export const publicNoticeStatusEnum = pgEnum("public_notice_status", [
  "pending",
  "published",
  "objection_filed",
  "objection_resolved",
  "completed",
  "cancelled"
]);

export const publicNotices = pgTable("public_notices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  noticeId: varchar("notice_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }).notNull(),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  
  // Notice details
  noticeType: varchar("notice_type", { length: 100 }).notNull(), // e.g., "Transfer", "Acquisition"
  noticeTitle: varchar("notice_title", { length: 255 }).notNull(),
  noticeContent: text("notice_content").notNull(),
  
  // Publication details
  publicationDate: timestamp("publication_date").notNull(),
  publicationPeriodDays: integer("publication_period_days").notNull().default(30),
  expiryDate: timestamp("expiry_date").notNull(),
  newspaperName: varchar("newspaper_name", { length: 255 }),
  newspaperEdition: varchar("newspaper_edition", { length: 100 }),
  publicationUrl: text("publication_url"),
  
  // Objections
  hasObjections: boolean("has_objections").default(false).notNull(),
  objectionsCount: integer("objections_count").default(0).notNull(),
  objections: jsonb("objections"), // Array of objection objects
  
  // Status and tracking
  status: publicNoticeStatusEnum("status").default("pending").notNull(),
  publishedAt: timestamp("published_at"),
  completedAt: timestamp("completed_at"),
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("public_notices_transaction_idx").on(table.transactionId),
  parcelIdx: index("public_notices_parcel_idx").on(table.parcelId),
  statusIdx: index("public_notices_status_idx").on(table.status),
  publicationDateIdx: index("public_notices_publication_date_idx").on(table.publicationDate),
}));

export type PublicNotice = typeof publicNotices.$inferSelect;
export type InsertPublicNotice = typeof publicNotices.$inferInsert;

/**
 * Land Use Plans Table
 * Tracks land use planning compliance and approvals
 */
export const landUsePlanStatusEnum = pgEnum("land_use_plan_status", [
  "pending",
  "under_review",
  "approved",
  "conditional_approval",
  "rejected",
  "expired"
]);

export const landUsePlans = pgTable("land_use_plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  planId: varchar("plan_id", { length: 64 }).notNull().unique(),
  transactionId: varchar("transaction_id", { length: 64 }),
  parcelId: integer("parcel_id").notNull().references(() => parcels.id),
  
  // Land use details
  currentLandUse: varchar("current_land_use", { length: 100 }).notNull(),
  proposedLandUse: varchar("proposed_land_use", { length: 100 }).notNull(),
  zoningClassification: varchar("zoning_classification", { length: 100 }),
  developmentType: varchar("development_type", { length: 100 }),
  
  // Planning authority
  planningAuthority: varchar("planning_authority", { length: 255 }).notNull(),
  planningOfficer: varchar("planning_officer", { length: 255 }),
  planningOfficerContact: varchar("planning_officer_contact", { length: 100 }),
  
  // Compliance
  isCompliant: boolean("is_compliant"),
  complianceNotes: text("compliance_notes"),
  restrictions: text("restrictions"),
  conditions: text("conditions"),
  
  // Status and tracking
  status: landUsePlanStatusEnum("status").default("pending").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  expiresAt: timestamp("expires_at"),
  
  // Documents
  applicationUrl: text("application_url"),
  approvalCertificateUrl: text("approval_certificate_url"),
  
  // Metadata
  metadata: jsonb("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("land_use_plans_transaction_idx").on(table.transactionId),
  parcelIdx: index("land_use_plans_parcel_idx").on(table.parcelId),
  statusIdx: index("land_use_plans_status_idx").on(table.status),
}));

export type LandUsePlan = typeof landUsePlans.$inferSelect;
export type InsertLandUsePlan = typeof landUsePlans.$inferInsert;

/**
 * User Preferences Table
 * Stores user-specific preferences and settings
 */
export const userPreferences = pgTable("user_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  
  // Display preferences
  theme: varchar("theme", { length: 20 }).default("system").notNull(), // light, dark, system
  language: varchar("language", { length: 10 }).default("en").notNull(),
  timezone: varchar("timezone", { length: 50 }).default("Africa/Lagos").notNull(),
  dateFormat: varchar("date_format", { length: 20 }).default("DD/MM/YYYY").notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN").notNull(),
  
  // Notification preferences
  notificationSettings: jsonb("notification_settings").default({
    email: true,
    sms: true,
    push: true,
    transactionUpdates: true,
    systemAlerts: true,
  }).notNull(),
  
  // Dashboard customization
  dashboardLayout: jsonb("dashboard_layout").default([]).notNull(),
  
  // Metadata
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("user_preferences_user_idx").on(table.userId),
}));
export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;


// ============================================
// MARKETPLACE TABLES
// ============================================

export const marketplaceListings = pgTable('marketplace_listings', {
  id: serial('id').primaryKey(),
  parcelId: integer('parcel_id').notNull().references(() => parcels.id),
  sellerId: integer('seller_id').notNull().references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  listingType: varchar('listing_type', { length: 20 }).notNull(), // 'sale', 'lease', 'auction'
  price: decimal('price', { precision: 15, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('NGN'),
  duration: integer('duration'), // Lease duration in months
  auctionEndDate: timestamp('auction_end_date'),
  minimumBid: decimal('minimum_bid', { precision: 15, scale: 2 }),
  currentBid: decimal('current_bid', { precision: 15, scale: 2 }),
  images: json('images').$type<string[]>().default([]),
  features: json('features').$type<string[]>().default([]),
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'sold', 'cancelled', 'expired'
  viewCount: integer('view_count').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const marketplaceBids = pgTable('marketplace_bids', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').notNull().references(() => marketplaceListings.id),
  bidderId: integer('bidder_id').notNull().references(() => users.id),
  bidAmount: decimal('bid_amount', { precision: 15, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'), // 'active', 'outbid', 'won', 'withdrawn'
  message: text('message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const marketplaceEscrow = pgTable('marketplace_escrow', {
  id: serial('id').primaryKey(),
  listingId: integer('listing_id').notNull().references(() => marketplaceListings.id),
  sellerId: integer('seller_id').notNull().references(() => users.id),
  buyerId: integer('buyer_id').notNull().references(() => users.id),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'pending', 'funded', 'released', 'refunded', 'disputed'
  terms: text('terms').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }),
  paymentReference: varchar('payment_reference', { length: 255 }),
  fundedAt: timestamp('funded_at'),
  releasedAt: timestamp('released_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const marketplaceFavorites = pgTable('marketplace_favorites', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  listingId: integer('listing_id').notNull().references(() => marketplaceListings.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Mortgage Insurance Policies Table
 * Uses existing insurancePolicyStatusEnum from property insurance section
 */
export const mortgageInsurancePolicies = pgTable("mortgage_insurance_policies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  policyNumber: varchar("policy_number", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Insurance details
  insuranceProvider: varchar("insurance_provider", { length: 255 }).notNull(),
  policyType: varchar("policy_type", { length: 100 }).notNull(), // homeowners, flood, PMI, etc.
  coverageAmount: integer("coverage_amount").notNull(),
  annualPremium: integer("annual_premium").notNull(),
  monthlyPremium: integer("monthly_premium").notNull(),
  
  // Policy period
  effectiveDate: timestamp("effective_date").notNull(),
  expirationDate: timestamp("expiration_date").notNull(),
  renewalDate: timestamp("renewal_date"),
  
  // Status
  status: insurancePolicyStatusEnum("status").default("pending").notNull(),
  
  // Payment tracking
  lastPremiumPaidDate: timestamp("last_premium_paid_date"),
  nextPremiumDueDate: timestamp("next_premium_due_date"),
  
  // Documents
  policyDocumentUrl: text("policy_document_url"),
  certificateUrl: text("certificate_url"),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("mortgage_insurance_policies_application_idx").on(table.applicationId),
  statusIdx: index("mortgage_insurance_policies_status_idx").on(table.status),
  expirationIdx: index("mortgage_insurance_policies_expiration_idx").on(table.expirationDate),
}));

export type MortgageInsurancePolicy = typeof mortgageInsurancePolicies.$inferSelect;
export type InsertMortgageInsurancePolicy = typeof mortgageInsurancePolicies.$inferInsert;

/**
 * Escrow Accounts Table
 */
export const escrowTransactionTypeEnum = pgEnum("escrow_transaction_type", [
  "deposit",
  "withdrawal",
  "insurance_payment",
  "tax_payment",
  "adjustment",
  "refund",
]);

export const escrowAccounts = pgTable("escrow_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  accountNumber: varchar("account_number", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Balance tracking
  currentBalance: integer("current_balance").default(0).notNull(),
  requiredBalance: integer("required_balance").notNull(),
  
  // Monthly contribution
  monthlyContribution: integer("monthly_contribution").notNull(),
  
  // Account status
  isActive: boolean("is_active").default(true).notNull(),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("escrow_accounts_application_idx").on(table.applicationId),
  isActiveIdx: index("escrow_accounts_is_active_idx").on(table.isActive),
}));

export type EscrowAccount = typeof escrowAccounts.$inferSelect;
export type InsertEscrowAccount = typeof escrowAccounts.$inferInsert;

/**
 * Escrow Transactions Table
 */
export const escrowTransactions = pgTable("escrow_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transactionId: varchar("transaction_id", { length: 64 }).notNull().unique(),
  escrowAccountId: integer("escrow_account_id").notNull().references(() => escrowAccounts.id),
  
  // Transaction details
  transactionType: escrowTransactionTypeEnum("transaction_type").notNull(),
  amount: integer("amount").notNull(),
  description: text("description"),
  
  // Related entities
  policyId: integer("policy_id").references(() => mortgageInsurancePolicies.id),
  paymentTransactionId: integer("payment_transaction_id").references(() => mortgagePaymentTransactions.id),
  
  // Balance after transaction
  balanceAfter: integer("balance_after").notNull(),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  escrowAccountIdx: index("escrow_transactions_escrow_account_idx").on(table.escrowAccountId),
  transactionTypeIdx: index("escrow_transactions_transaction_type_idx").on(table.transactionType),
  createdAtIdx: index("escrow_transactions_created_at_idx").on(table.createdAt),
}));

export type EscrowTransaction = typeof escrowTransactions.$inferSelect;
export type InsertEscrowTransaction = typeof escrowTransactions.$inferInsert;


/**
 * Document Verification Tables
 */
export const documentTypeEnum = pgEnum("document_type", [
  "income_statement",
  "employment_letter",
  "bank_statement",
  "tax_return",
  "pay_stub",
  "identification",
  "proof_of_address",
  "credit_report",
  "other",
]);

export const documentVerificationStatusEnum = pgEnum("document_verification_status", [
  "pending",
  "processing",
  "verified",
  "rejected",
  "requires_review",
]);

export const documentVerifications = pgTable("document_verifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  verificationId: varchar("verification_id", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Document details
  documentType: documentTypeEnum("document_type").notNull(),
  documentUrl: text("document_url").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  
  // Verification status
  status: documentVerificationStatusEnum("status").default("pending").notNull(),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: integer("verified_by").references(() => users.id),
  
  // OCR results
  ocrText: text("ocr_text"),
  ocrConfidence: integer("ocr_confidence"), // 0-100
  ocrEngine: varchar("ocr_engine", { length: 50 }), // paddleocr, vlm, docling
  
  // Extracted data
  extractedData: text("extracted_data"), // JSON string
  
  // Fraud detection
  fraudScore: integer("fraud_score"), // 0-100
  fraudFlags: text("fraud_flags"), // JSON array of detected issues
  authenticityScore: integer("authenticity_score"), // 0-100
  
  // Review notes
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("document_verifications_application_idx").on(table.applicationId),
  statusIdx: index("document_verifications_status_idx").on(table.status),
  documentTypeIdx: index("document_verifications_document_type_idx").on(table.documentType),
}));

export type DocumentVerification = typeof documentVerifications.$inferSelect;
export type InsertDocumentVerification = typeof documentVerifications.$inferInsert;

/**
 * Verification Audit Log
 */
export const verificationAuditLog = pgTable("verification_audit_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  verificationId: integer("verification_id").notNull().references(() => documentVerifications.id),
  
  // Action details
  action: varchar("action", { length: 100 }).notNull(),
  performedBy: integer("performed_by").references(() => users.id),
  previousStatus: documentVerificationStatusEnum("previous_status"),
  newStatus: documentVerificationStatusEnum("new_status"),
  
  // Details
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  verificationIdx: index("verification_audit_log_verification_idx").on(table.verificationId),
  createdAtIdx: index("verification_audit_log_created_at_idx").on(table.createdAt),
}));

export type VerificationAuditLog = typeof verificationAuditLog.$inferSelect;
export type InsertVerificationAuditLog = typeof verificationAuditLog.$inferInsert;


/**
 * Mortgage Broker Tables
 */
export const brokerStatusEnum = pgEnum("broker_status", [
  "pending",
  "active",
  "suspended",
  "inactive",
]);

export const mortgageBrokers = pgTable("mortgage_brokers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  brokerId: varchar("broker_id", { length: 64 }).notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  
  // Broker details
  companyName: varchar("company_name", { length: 255 }).notNull(),
  licenseNumber: varchar("license_number", { length: 100 }).notNull().unique(),
  licenseExpiryDate: timestamp("license_expiry_date").notNull(),
  
  // Contact information
  businessPhone: varchar("business_phone", { length: 20 }).notNull(),
  businessEmail: varchar("business_email", { length: 255 }).notNull(),
  businessAddress: text("business_address").notNull(),
  
  // Status
  status: brokerStatusEnum("status").default("pending").notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by").references(() => users.id),
  
  // Commission structure
  defaultCommissionRate: integer("default_commission_rate").notNull(), // basis points (e.g., 100 = 1%)
  
  // Performance metrics
  totalApplications: integer("total_applications").default(0).notNull(),
  approvedApplications: integer("approved_applications").default(0).notNull(),
  totalCommissionEarned: integer("total_commission_earned").default(0).notNull(),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("mortgage_brokers_user_idx").on(table.userId),
  statusIdx: index("mortgage_brokers_status_idx").on(table.status),
}));

export type MortgageBroker = typeof mortgageBrokers.$inferSelect;
export type InsertMortgageBroker = typeof mortgageBrokers.$inferInsert;

/**
 * Broker Clients Table
 */
export const brokerClients = pgTable("broker_clients", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  brokerId: integer("broker_id").notNull().references(() => mortgageBrokers.id),
  
  // Client details
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  clientNIN: varchar("client_nin", { length: 20 }),
  
  // Relationship
  addedAt: timestamp("added_at").defaultNow().notNull(),
  lastContactDate: timestamp("last_contact_date"),
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  
  // Metadata
  notes: text("notes"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  brokerIdx: index("broker_clients_broker_idx").on(table.brokerId),
  emailIdx: index("broker_clients_email_idx").on(table.clientEmail),
}));

export type BrokerClient = typeof brokerClients.$inferSelect;
export type InsertBrokerClient = typeof brokerClients.$inferInsert;

/**
 * Broker Commission Structure Table
 */
export const commissionTierEnum = pgEnum("commission_tier", [
  "standard",
  "premium",
  "platinum",
  "custom",
]);

export const brokerCommissionStructures = pgTable("broker_commission_structures", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  brokerId: integer("broker_id").notNull().references(() => mortgageBrokers.id),
  
  // Commission details
  tier: commissionTierEnum("tier").notNull(),
  commissionRate: integer("commission_rate").notNull(), // basis points
  minLoanAmount: integer("min_loan_amount").notNull(),
  maxLoanAmount: integer("max_loan_amount"),
  
  // Effective period
  effectiveFrom: timestamp("effective_from").notNull(),
  effectiveTo: timestamp("effective_to"),
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  brokerIdx: index("broker_commission_structures_broker_idx").on(table.brokerId),
  tierIdx: index("broker_commission_structures_tier_idx").on(table.tier),
}));

export type BrokerCommissionStructure = typeof brokerCommissionStructures.$inferSelect;
export type InsertBrokerCommissionStructure = typeof brokerCommissionStructures.$inferInsert;

/**
 * Broker Commissions Table
 */
export const commissionStatusEnum = pgEnum("commission_status", [
  "pending",
  "approved",
  "paid",
  "cancelled",
]);

export const brokerCommissions = pgTable("broker_commissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  commissionId: varchar("commission_id", { length: 64 }).notNull().unique(),
  brokerId: integer("broker_id").notNull().references(() => mortgageBrokers.id),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Commission calculation
  loanAmount: integer("loan_amount").notNull(),
  commissionRate: integer("commission_rate").notNull(), // basis points
  commissionAmount: integer("commission_amount").notNull(),
  
  // Status tracking
  status: commissionStatusEnum("status").default("pending").notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by").references(() => users.id),
  paidAt: timestamp("paid_at"),
  paymentReference: varchar("payment_reference", { length: 128 }),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  brokerIdx: index("broker_commissions_broker_idx").on(table.brokerId),
  applicationIdx: index("broker_commissions_application_idx").on(table.applicationId),
  statusIdx: index("broker_commissions_status_idx").on(table.status),
}));

export type BrokerCommission = typeof brokerCommissions.$inferSelect;
export type InsertBrokerCommission = typeof brokerCommissions.$inferInsert;

/**
 * Broker Application Submissions Table (links brokers to applications)
 */
export const brokerApplicationSubmissions = pgTable("broker_application_submissions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  brokerId: integer("broker_id").notNull().references(() => mortgageBrokers.id),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  clientId: integer("client_id").references(() => brokerClients.id),
  
  // Submission details
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  submissionNotes: text("submission_notes"),
  
  // Metadata
  metadata: text("metadata"),
}, (table) => ({
  brokerIdx: index("broker_application_submissions_broker_idx").on(table.brokerId),
  applicationIdx: index("broker_application_submissions_application_idx").on(table.applicationId),
}));

export type BrokerApplicationSubmission = typeof brokerApplicationSubmissions.$inferSelect;
export type InsertBrokerApplicationSubmission = typeof brokerApplicationSubmissions.$inferInsert;


/**
 * Secondary Market Tables
 */
export const loanPoolStatusEnum = pgEnum("loan_pool_status", [
  "draft",
  "active",
  "closed",
  "sold",
]);

export const riskTierEnum = pgEnum("risk_tier", [
  "aaa",
  "aa",
  "a",
  "bbb",
  "bb",
  "b",
]);

export const loanPools = pgTable("loan_pools", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  poolId: varchar("pool_id", { length: 64 }).notNull().unique(),
  
  // Pool details
  poolName: varchar("pool_name", { length: 255 }).notNull(),
  description: text("description"),
  riskTier: riskTierEnum("risk_tier").notNull(),
  
  // Financial details
  totalLoanAmount: integer("total_loan_amount").default(0).notNull(),
  averageInterestRate: integer("average_interest_rate").default(0).notNull(), // basis points
  weightedAverageMaturity: integer("weighted_average_maturity").default(0).notNull(), // months
  
  // Pool composition
  loanCount: integer("loan_count").default(0).notNull(),
  minLoanAmount: integer("min_loan_amount"),
  maxLoanAmount: integer("max_loan_amount"),
  
  // Status
  status: loanPoolStatusEnum("status").default("draft").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  closedAt: timestamp("closed_at"),
  soldAt: timestamp("sold_at"),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("loan_pools_status_idx").on(table.status),
  riskTierIdx: index("loan_pools_risk_tier_idx").on(table.riskTier),
}));

export type LoanPool = typeof loanPools.$inferSelect;
export type InsertLoanPool = typeof loanPools.$inferInsert;

/**
 * Loan Pool Loans Table (many-to-many relationship)
 */
export const loanPoolLoans = pgTable("loan_pool_loans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  poolId: integer("pool_id").notNull().references(() => loanPools.id),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Loan details at time of pooling
  principalAmount: integer("principal_amount").notNull(),
  interestRate: integer("interest_rate").notNull(), // basis points
  remainingTerm: integer("remaining_term").notNull(), // months
  
  // Risk assessment
  creditScore: integer("credit_score"),
  loanToValue: integer("loan_to_value"), // basis points
  
  addedAt: timestamp("added_at").defaultNow().notNull(),
  metadata: text("metadata"),
}, (table) => ({
  poolIdx: index("loan_pool_loans_pool_idx").on(table.poolId),
  applicationIdx: index("loan_pool_loans_application_idx").on(table.applicationId),
}));

export type LoanPoolLoan = typeof loanPoolLoans.$inferSelect;
export type InsertLoanPoolLoan = typeof loanPoolLoans.$inferInsert;

/**
 * Investors Table
 */
export const investorTypeEnum = pgEnum("investor_type", [
  "institutional",
  "individual",
  "fund",
  "bank",
]);

export const investorStatusEnum = pgEnum("investor_status", [
  "active",
  "inactive",
  "suspended",
]);

export const investors = pgTable("investors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  investorId: varchar("investor_id", { length: 64 }).notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  
  // Investor details
  investorName: varchar("investor_name", { length: 255 }).notNull(),
  investorType: investorTypeEnum("investor_type").notNull(),
  
  // Contact information
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  contactPhone: varchar("contact_phone", { length: 20 }).notNull(),
  
  // Investment preferences
  minInvestmentAmount: integer("min_investment_amount").notNull(),
  maxInvestmentAmount: integer("max_investment_amount"),
  preferredRiskTiers: text("preferred_risk_tiers"), // JSON array
  
  // Status
  status: investorStatusEnum("status").default("active").notNull(),
  
  // Performance metrics
  totalInvested: integer("total_invested").default(0).notNull(),
  totalReturns: integer("total_returns").default(0).notNull(),
  activeInvestments: integer("active_investments").default(0).notNull(),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("investors_user_idx").on(table.userId),
  statusIdx: index("investors_status_idx").on(table.status),
  typeIdx: index("investors_type_idx").on(table.investorType),
}));

export type Investor = typeof investors.$inferSelect;
export type InsertInvestor = typeof investors.$inferInsert;

/**
 * Pool Investments Table
 */
export const investmentStatusEnum = pgEnum("investment_status", [
  "pending",
  "active",
  "matured",
  "cancelled",
]);

export const poolInvestments = pgTable("pool_investments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  investmentId: varchar("investment_id", { length: 64 }).notNull().unique(),
  poolId: integer("pool_id").notNull().references(() => loanPools.id),
  investorId: integer("investor_id").notNull().references(() => investors.id),
  
  // Investment details
  investmentAmount: integer("investment_amount").notNull(),
  expectedReturn: integer("expected_return").notNull(),
  expectedReturnRate: integer("expected_return_rate").notNull(), // basis points
  
  // Term
  investmentDate: timestamp("investment_date").defaultNow().notNull(),
  maturityDate: timestamp("maturity_date").notNull(),
  
  // Status
  status: investmentStatusEnum("status").default("pending").notNull(),
  
  // Performance tracking
  totalDistributions: integer("total_distributions").default(0).notNull(),
  lastDistributionDate: timestamp("last_distribution_date"),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  poolIdx: index("pool_investments_pool_idx").on(table.poolId),
  investorIdx: index("pool_investments_investor_idx").on(table.investorId),
  statusIdx: index("pool_investments_status_idx").on(table.status),
}));

export type PoolInvestment = typeof poolInvestments.$inferSelect;
export type InsertPoolInvestment = typeof poolInvestments.$inferInsert;

/**
 * Investment Distributions Table
 */
export const distributionTypeEnum = pgEnum("distribution_type", [
  "interest",
  "principal",
  "fee",
]);

export const investmentDistributions = pgTable("investment_distributions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  distributionId: varchar("distribution_id", { length: 64 }).notNull().unique(),
  investmentId: integer("investment_id").notNull().references(() => poolInvestments.id),
  
  // Distribution details
  distributionType: distributionTypeEnum("distribution_type").notNull(),
  amount: integer("amount").notNull(),
  distributionDate: timestamp("distribution_date").notNull(),
  
  // Payment details
  paymentReference: varchar("payment_reference", { length: 128 }),
  paidAt: timestamp("paid_at"),
  
  // Metadata
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  investmentIdx: index("investment_distributions_investment_idx").on(table.investmentId),
  distributionDateIdx: index("investment_distributions_distribution_date_idx").on(table.distributionDate),
}));

export type InvestmentDistribution = typeof investmentDistributions.$inferSelect;
export type InsertInvestmentDistribution = typeof investmentDistributions.$inferInsert;

/**
 * Servicing Rights Transfer Table
 */
export const transferStatusEnum = pgEnum("transfer_status", [
  "pending",
  "approved",
  "completed",
  "cancelled",
]);

export const servicingRightsTransfers = pgTable("servicing_rights_transfers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transferId: varchar("transfer_id", { length: 64 }).notNull().unique(),
  poolId: integer("pool_id").notNull().references(() => loanPools.id),
  
  // Transfer details
  fromServicer: varchar("from_servicer", { length: 255 }).notNull(),
  toServicer: varchar("to_servicer", { length: 255 }).notNull(),
  transferDate: timestamp("transfer_date").notNull(),
  
  // Financial details
  transferFee: integer("transfer_fee").notNull(),
  
  // Status
  status: transferStatusEnum("status").default("pending").notNull(),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  
  // Metadata
  notes: text("notes"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  poolIdx: index("servicing_rights_transfers_pool_idx").on(table.poolId),
  statusIdx: index("servicing_rights_transfers_status_idx").on(table.status),
}));

export type ServicingRightsTransfer = typeof servicingRightsTransfers.$inferSelect;
export type InsertServicingRightsTransfer = typeof servicingRightsTransfers.$inferInsert;


// ============================================================================
// Webhook Integration System
// ============================================================================

export const webhookEventTypeEnum = pgEnum("webhook_event_type", [
  "loan_status_changed",
  "commission_paid",
  "pool_created",
  "pool_closed",
  "application_submitted",
  "application_approved",
  "application_rejected",
  "payment_received",
  "payment_failed",
]);

// webhookDeliveryStatusEnum and webhook tables moved to line 266-279

/**
 * Legacy Webhook Endpoints (replaced by webhook_endpoints at line 241)
 * Keeping for reference, will be removed after migration
 */
/*
export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  // Endpoint details
  url: varchar("url", { length: 500 }).notNull(),
  secret: varchar("secret", { length: 255 }).notNull(), // HMAC secret
  description: text("description"),
  
  // Event subscriptions
  eventTypes: text("event_types").notNull(), // JSON array of subscribed event types
  
  // Status
  active: boolean("active").default(true).notNull(),
  
  // Metadata
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastDeliveryAt: timestamp("last_delivery_at"),
  
  // Stats
  totalDeliveries: integer("total_deliveries").default(0).notNull(),
  successfulDeliveries: integer("successful_deliveries").default(0).notNull(),
  failedDeliveries: integer("failed_deliveries").default(0).notNull(),
}, (table) => ({
  activeIdx: index("webhook_endpoints_active_idx").on(table.active),
}));

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type InsertWebhookEndpoint = typeof webhookEndpoints.$inferInsert;

// Webhook Delivery Logs (replaced by webhook_delivery_log at line 268)
export const webhookDeliveryLogs = pgTable("webhook_delivery_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  
  // Endpoint reference
  endpointId: integer("endpoint_id").references(() => webhookEndpoints.id).notNull(),
  
  // Event details
  eventType: webhookEventTypeEnum("event_type").notNull(),
  eventId: varchar("event_id", { length: 255 }).notNull(), // Reference to source event
  payload: text("payload").notNull(), // JSON payload
  
  // Delivery details
  status: webhookDeliveryStatusEnum("status").default("pending").notNull(),
  httpStatus: integer("http_status"),
  responseBody: text("response_body"),
  errorMessage: text("error_message"),
  
  // Retry tracking
  attemptCount: integer("attempt_count").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(5).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  
  // Timing
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
  
  // Signature
  signature: varchar("signature", { length: 255 }), // HMAC-SHA256 signature
}, (table) => ({
  endpointIdx: index("webhook_delivery_logs_endpoint_idx").on(table.endpointId),
  statusIdx: index("webhook_delivery_logs_status_idx").on(table.status),
  eventTypeIdx: index("webhook_delivery_logs_event_type_idx").on(table.eventType),
  nextRetryIdx: index("webhook_delivery_logs_next_retry_idx").on(table.nextRetryAt),
}));

export type WebhookDeliveryLog = typeof webhookDeliveryLogs.$inferSelect;
export type InsertWebhookDeliveryLog = typeof webhookDeliveryLogs.$inferInsert;
*/


// -----------------------------------------------------------------------------
// Integration governance, federation, authorization, streaming, and platform
// operations tables added during the infrastructure-completeness audit.
// -----------------------------------------------------------------------------

export const authProviderTypeEnum = pgEnum("auth_provider_type", [
  "manus_oauth",
  "keycloak",
  "oidc",
  "saml",
  "local",
]);

export const integrationKindEnum = pgEnum("integration_kind", [
  "keycloak",
  "permify",
  "apisix",
  "dapr",
  "fluvio",
  "openappsec",
  "lakehouse",
  "tigerbeetle",
  "temporal",
  "redis",
  "postgres",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "draft",
  "configured",
  "active",
  "degraded",
  "failed",
  "disabled",
]);

export const integrationSyncStatusEnum = pgEnum("integration_sync_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "partial",
  "skipped",
]);

export const authorizationSubjectTypeEnum = pgEnum("authorization_subject_type", [
  "user",
  "group",
  "role",
  "service",
]);

export const authorizationResourceTypeEnum = pgEnum("authorization_resource_type", [
  "parcel",
  "transaction",
  "title",
  "document",
  "workflow",
  "report",
  "marketplace_listing",
  "admin_surface",
  "system",
]);

export const apiGatewayResourceTypeEnum = pgEnum("api_gateway_resource_type", [
  "route",
  "upstream",
  "service",
  "consumer",
  "plugin",
  "certificate",
]);

export const streamBackendEnum = pgEnum("stream_backend", [
  "kafka",
  "fluvio",
  "dapr_pubsub",
]);

export const streamDeliveryStatusEnum = pgEnum("stream_delivery_status", [
  "pending",
  "published",
  "acked",
  "failed",
  "dead_lettered",
]);

export const wafPolicyModeEnum = pgEnum("waf_policy_mode", [
  "detect",
  "prevent",
  "disabled",
]);

export const wafIncidentSeverityEnum = pgEnum("waf_incident_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const lakehouseJobTypeEnum = pgEnum("lakehouse_job_type", [
  "ingest",
  "export",
  "sync",
  "backfill",
  "analytics_refresh",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "revoked",
  "expired",
]);

export const mfaFactorTypeEnum = pgEnum("mfa_factor_type", [
  "totp",
  "sms",
  "email",
  "recovery_code",
]);

export const identityProviders = pgTable("identity_providers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  providerType: authProviderTypeEnum("provider_type").notNull(),
  issuer: text("issuer"),
  clientId: varchar("client_id", { length: 255 }),
  clientSecretRef: varchar("client_secret_ref", { length: 255 }),
  realm: varchar("realm", { length: 120 }),
  authorizationUrl: text("authorization_url"),
  tokenUrl: text("token_url"),
  userInfoUrl: text("user_info_url"),
  jwksUrl: text("jwks_url"),
  scopes: text("scopes"),
  enabled: boolean("enabled").default(true).notNull(),
  configuration: jsonb("configuration"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("identity_providers_type_idx").on(table.providerType),
  enabledIdx: index("identity_providers_enabled_idx").on(table.enabled),
}));

export const externalIdentities = pgTable("external_identities", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").notNull().references(() => identityProviders.id, { onDelete: "cascade" }),
  externalSubject: varchar("external_subject", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }),
  email: varchar("email", { length: 320 }),
  claims: jsonb("claims"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  providerSubjectIdx: index("external_identities_provider_subject_idx").on(table.providerId, table.externalSubject),
  userIdx: index("external_identities_user_idx").on(table.userId),
}));

export const userSessions = pgTable("user_sessions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionTokenHash: varchar("session_token_hash", { length: 255 }).notNull().unique(),
  status: sessionStatusEnum("status").default("active").notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  deviceName: varchar("device_name", { length: 255 }),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("user_sessions_user_idx").on(table.userId),
  statusIdx: index("user_sessions_status_idx").on(table.status),
  expiresIdx: index("user_sessions_expires_idx").on(table.expiresAt),
}));

export const mfaFactors = pgTable("mfa_factors", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  factorType: mfaFactorTypeEnum("factor_type").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  secretRef: varchar("secret_ref", { length: 255 }),
  phoneNumber: varchar("phone_number", { length: 32 }),
  emailAddress: varchar("email_address", { length: 320 }),
  recoveryCodes: jsonb("recovery_codes"),
  enabled: boolean("enabled").default(true).notNull(),
  verifiedAt: timestamp("verified_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("mfa_factors_user_idx").on(table.userId),
  typeIdx: index("mfa_factors_type_idx").on(table.factorType),
}));

export const trustedDevices = pgTable("trusted_devices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }).notNull(),
  deviceName: varchar("device_name", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userDeviceIdx: index("trusted_devices_user_device_idx").on(table.userId, table.deviceFingerprint),
}));

export const integrationRegistry = pgTable("integration_registry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationKey: integrationKindEnum("integration_key").notNull().unique(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  status: integrationStatusEnum("status").default("draft").notNull(),
  endpoint: text("endpoint"),
  namespace: varchar("namespace", { length: 120 }),
  version: varchar("version", { length: 64 }),
  healthStatus: varchar("health_status", { length: 32 }),
  configuration: jsonb("configuration"),
  capabilities: jsonb("capabilities"),
  lastCheckedAt: timestamp("last_checked_at"),
  lastHealthyAt: timestamp("last_healthy_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("integration_registry_status_idx").on(table.status),
}));

export const integrationSyncRuns = pgTable("integration_sync_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").notNull().references(() => integrationRegistry.id, { onDelete: "cascade" }),
  operation: varchar("operation", { length: 120 }).notNull(),
  status: integrationSyncStatusEnum("status").default("pending").notNull(),
  correlationId: varchar("correlation_id", { length: 128 }),
  requestPayload: jsonb("request_payload"),
  responsePayload: jsonb("response_payload"),
  errorMessage: text("error_message"),
  recordsProcessed: integer("records_processed").default(0).notNull(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  integrationIdx: index("integration_sync_runs_integration_idx").on(table.integrationId),
  statusIdx: index("integration_sync_runs_status_idx").on(table.status),
}));

export const authorizationRelationships = pgTable("authorization_relationships", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  engine: varchar("engine", { length: 50 }).default("permify").notNull(),
  subjectType: authorizationSubjectTypeEnum("subject_type").notNull(),
  subjectId: varchar("subject_id", { length: 128 }).notNull(),
  relation: varchar("relation", { length: 100 }).notNull(),
  resourceType: authorizationResourceTypeEnum("resource_type").notNull(),
  resourceId: varchar("resource_id", { length: 128 }).notNull(),
  caveat: jsonb("caveat"),
  sourceIntegrationId: integer("source_integration_id").references(() => integrationRegistry.id),
  syncedAt: timestamp("synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  subjectIdx: index("authorization_relationships_subject_idx").on(table.subjectType, table.subjectId),
  resourceIdx: index("authorization_relationships_resource_idx").on(table.resourceType, table.resourceId),
}));

export const authorizationDecisionAudit = pgTable("authorization_decision_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").references(() => integrationRegistry.id),
  actorUserId: integer("actor_user_id").references(() => users.id),
  subjectType: authorizationSubjectTypeEnum("subject_type").notNull(),
  subjectId: varchar("subject_id", { length: 128 }).notNull(),
  relation: varchar("relation", { length: 100 }).notNull(),
  resourceType: authorizationResourceTypeEnum("resource_type").notNull(),
  resourceId: varchar("resource_id", { length: 128 }).notNull(),
  decision: boolean("decision").notNull(),
  reason: text("reason"),
  context: jsonb("context"),
  checkedAt: timestamp("checked_at").defaultNow().notNull(),
}, (table) => ({
  checkedIdx: index("authorization_decision_audit_checked_idx").on(table.checkedAt),
  actorIdx: index("authorization_decision_audit_actor_idx").on(table.actorUserId),
}));

export const apiGatewayResources = pgTable("api_gateway_resources", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").references(() => integrationRegistry.id),
  resourceType: apiGatewayResourceTypeEnum("resource_type").notNull(),
  externalId: varchar("external_id", { length: 128 }),
  name: varchar("name", { length: 255 }).notNull(),
  routePath: text("route_path"),
  methods: text("methods"),
  upstreamUrl: text("upstream_url"),
  plugins: jsonb("plugins"),
  enabled: boolean("enabled").default(true).notNull(),
  syncStatus: integrationSyncStatusEnum("sync_status").default("pending").notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  typeIdx: index("api_gateway_resources_type_idx").on(table.resourceType),
  nameIdx: index("api_gateway_resources_name_idx").on(table.name),
}));

export const daprComponents = pgTable("dapr_components", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").references(() => integrationRegistry.id),
  componentType: varchar("component_type", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  version: varchar("version", { length: 64 }),
  namespace: varchar("namespace", { length: 120 }),
  configuration: jsonb("configuration"),
  secrets: jsonb("secrets"),
  enabled: boolean("enabled").default(true).notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const eventOutbox = pgTable("event_outbox", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  backend: streamBackendEnum("backend").notNull(),
  topic: varchar("topic", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 120 }),
  aggregateId: varchar("aggregate_id", { length: 128 }),
  payload: jsonb("payload").notNull(),
  headers: jsonb("headers"),
  partitionKey: varchar("partition_key", { length: 255 }),
  deliveryStatus: streamDeliveryStatusEnum("delivery_status").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  availableAt: timestamp("available_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  backendIdx: index("event_outbox_backend_idx").on(table.backend),
  statusIdx: index("event_outbox_status_idx").on(table.deliveryStatus),
  availableIdx: index("event_outbox_available_idx").on(table.availableAt),
}));

export const streamConsumerCheckpoints = pgTable("stream_consumer_checkpoints", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  backend: streamBackendEnum("backend").notNull(),
  consumerGroup: varchar("consumer_group", { length: 255 }).notNull(),
  topic: varchar("topic", { length: 255 }).notNull(),
  partitionId: integer("partition_id").default(0).notNull(),
  offsetValue: varchar("offset_value", { length: 128 }).notNull(),
  lastMessageKey: varchar("last_message_key", { length: 255 }),
  lastProcessedAt: timestamp("last_processed_at"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  groupTopicIdx: index("stream_consumer_checkpoints_group_topic_idx").on(table.consumerGroup, table.topic, table.partitionId),
}));

export const wafPolicies = pgTable("waf_policies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").references(() => integrationRegistry.id),
  name: varchar("name", { length: 255 }).notNull(),
  mode: wafPolicyModeEnum("mode").default("detect").notNull(),
  policyVersion: varchar("policy_version", { length: 64 }),
  managedBy: varchar("managed_by", { length: 100 }).default("openappsec").notNull(),
  configuration: jsonb("configuration"),
  enabled: boolean("enabled").default(true).notNull(),
  deployedAt: timestamp("deployed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  modeIdx: index("waf_policies_mode_idx").on(table.mode),
}));

export const wafIncidents = pgTable("waf_incidents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  policyId: integer("policy_id").references(() => wafPolicies.id, { onDelete: "set null" }),
  integrationId: integer("integration_id").references(() => integrationRegistry.id),
  severity: wafIncidentSeverityEnum("severity").default("medium").notNull(),
  sourceIp: varchar("source_ip", { length: 64 }),
  requestPath: text("request_path"),
  ruleId: varchar("rule_id", { length: 128 }),
  actionTaken: varchar("action_taken", { length: 64 }),
  requestMetadata: jsonb("request_metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  severityIdx: index("waf_incidents_severity_idx").on(table.severity),
  createdIdx: index("waf_incidents_created_idx").on(table.createdAt),
}));

export const lakehouseSyncJobs = pgTable("lakehouse_sync_jobs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").references(() => integrationRegistry.id),
  jobType: lakehouseJobTypeEnum("job_type").notNull(),
  tableName: varchar("table_name", { length: 255 }).notNull(),
  sourceEntity: varchar("source_entity", { length: 120 }),
  status: integrationSyncStatusEnum("status").default("pending").notNull(),
  cursorValue: varchar("cursor_value", { length: 255 }),
  payload: jsonb("payload"),
  resultSummary: jsonb("result_summary"),
  recordsProcessed: integer("records_processed").default(0).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tableIdx: index("lakehouse_sync_jobs_table_idx").on(table.tableName),
  statusIdx: index("lakehouse_sync_jobs_status_idx").on(table.status),
}));

export const lakehouseQueryAudit = pgTable("lakehouse_query_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  integrationId: integer("integration_id").references(() => integrationRegistry.id),
  actorUserId: integer("actor_user_id").references(() => users.id),
  queryType: varchar("query_type", { length: 64 }).notNull(),
  targetTable: varchar("target_table", { length: 255 }),
  queryText: text("query_text"),
  filters: jsonb("filters"),
  resultRowCount: integer("result_row_count").default(0).notNull(),
  status: integrationSyncStatusEnum("status").default("succeeded").notNull(),
  errorMessage: text("error_message"),
  executedAt: timestamp("executed_at").defaultNow().notNull(),
}, (table) => ({
  actorIdx: index("lakehouse_query_audit_actor_idx").on(table.actorUserId),
  executedIdx: index("lakehouse_query_audit_executed_idx").on(table.executedAt),
}));

export type IdentityProvider = typeof identityProviders.$inferSelect;
export type InsertIdentityProvider = typeof identityProviders.$inferInsert;
export type ExternalIdentity = typeof externalIdentities.$inferSelect;
export type InsertExternalIdentity = typeof externalIdentities.$inferInsert;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;
export type MfaFactor = typeof mfaFactors.$inferSelect;
export type InsertMfaFactor = typeof mfaFactors.$inferInsert;
export type TrustedDevice = typeof trustedDevices.$inferSelect;
export type InsertTrustedDevice = typeof trustedDevices.$inferInsert;
export type IntegrationRegistryRecord = typeof integrationRegistry.$inferSelect;
export type InsertIntegrationRegistryRecord = typeof integrationRegistry.$inferInsert;
export type IntegrationSyncRun = typeof integrationSyncRuns.$inferSelect;
export type InsertIntegrationSyncRun = typeof integrationSyncRuns.$inferInsert;
export type AuthorizationRelationship = typeof authorizationRelationships.$inferSelect;
export type InsertAuthorizationRelationship = typeof authorizationRelationships.$inferInsert;
export type AuthorizationDecisionAudit = typeof authorizationDecisionAudit.$inferSelect;
export type InsertAuthorizationDecisionAudit = typeof authorizationDecisionAudit.$inferInsert;
export type ApiGatewayResource = typeof apiGatewayResources.$inferSelect;
export type InsertApiGatewayResource = typeof apiGatewayResources.$inferInsert;
export type DaprComponent = typeof daprComponents.$inferSelect;
export type InsertDaprComponent = typeof daprComponents.$inferInsert;
export type EventOutboxRecord = typeof eventOutbox.$inferSelect;
export type InsertEventOutboxRecord = typeof eventOutbox.$inferInsert;
export type StreamConsumerCheckpoint = typeof streamConsumerCheckpoints.$inferSelect;
export type InsertStreamConsumerCheckpoint = typeof streamConsumerCheckpoints.$inferInsert;
export type WafPolicy = typeof wafPolicies.$inferSelect;
export type InsertWafPolicy = typeof wafPolicies.$inferInsert;
export type WafIncident = typeof wafIncidents.$inferSelect;
export type InsertWafIncident = typeof wafIncidents.$inferInsert;
export type LakehouseSyncJob = typeof lakehouseSyncJobs.$inferSelect;
export type InsertLakehouseSyncJob = typeof lakehouseSyncJobs.$inferInsert;
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
  transactionId: integer("transaction_id").references(() => registryTransactions.id),
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
  transactionId: integer("transaction_id").references(() => registryTransactions.id),
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
  transactionId: integer("transaction_id").references(() => registryTransactions.id).notNull(),
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

// ---------------------------------------------------------------------------
// Core repository persistence (migration 0012)
// These tables back the domain repositories that previously persisted to JSON
// files under server/data/. All records are now stored in PostgreSQL.
// ---------------------------------------------------------------------------

/**
 * Registry transactions — workflow state machine for transfers, mortgages,
 * and title perfection. Distinct from the legacy `transactions` table used by
 * smart-contract/reporting services.
 */
export const registryTransactions = pgTable("registry_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  type: varchar("type", { length: 64 }).notNull(),
  parcelId: integer("parcel_id").notNull(),
  initiatorId: integer("initiator_id").notNull(),
  initiatorName: varchar("initiator_name", { length: 255 }).notNull(),
  counterpartyName: varchar("counterparty_name", { length: 255 }),
  titleId: integer("title_id"),
  status: varchar("status", { length: 32 }).default("pending_approval").notNull(),
  considerationAmount: bigint("consideration_amount", { mode: "number" }).default(0).notNull(),
  workflowStage: varchar("workflow_stage", { length: 64 }).default("submission").notNull(),
  paymentStatus: varchar("payment_status", { length: 16 }).default("unpaid").notNull(),
  documentStatus: varchar("document_status", { length: 16 }).default("pending").notNull(),
  externalReference: varchar("external_reference", { length: 128 }).unique(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("registry_transactions_parcel_idx").on(table.parcelId),
  statusIdx: index("registry_transactions_status_idx").on(table.status),
  // Composite indexes for common query patterns
  parcelStatusIdx: index("registry_transactions_parcel_status_idx").on(table.parcelId, table.status),
  initiatorStatusIdx: index("registry_transactions_initiator_status_idx").on(table.initiatorId, table.status),
  typeStatusIdx: index("registry_transactions_type_status_idx").on(table.type, table.status),
  createdAtIdx: index("registry_transactions_created_at_idx").on(table.createdAt),
}));

export type RegistryTransaction = typeof registryTransactions.$inferSelect;
export type InsertRegistryTransaction = typeof registryTransactions.$inferInsert;

/**
 * Payments — real persisted payment records. A payment reaches 'completed'
 * only through explicit confirmation (provider webhook / bank reconciliation),
 * never automatically at creation time.
 */
export const payments = pgTable("payments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transactionId: integer("transaction_id").notNull().references(() => registryTransactions.id),
  payerId: integer("payer_id").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  feeAmount: bigint("fee_amount", { mode: "number" }).notNull(),
  totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  method: varchar("method", { length: 32 }).notNull(),
  status: varchar("status", { length: 16 }).default("pending").notNull(),
  reference: varchar("reference", { length: 64 }).notNull().unique(),
  receiptNumber: varchar("receipt_number", { length: 64 }),
  channelReference: varchar("channel_reference", { length: 128 }),
  bankName: varchar("bank_name", { length: 255 }),
  bankAccountName: varchar("bank_account_name", { length: 255 }),
  bankAccountNumber: varchar("bank_account_number", { length: 32 }),
  ussdCode: varchar("ussd_code", { length: 64 }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  transactionIdx: index("payments_transaction_idx").on(table.transactionId),
  statusIdx: index("payments_status_idx").on(table.status),
}));

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Titles — ownership instruments per parcel.
 */
export const titles = pgTable("titles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  titleNumber: varchar("title_number", { length: 64 }).notNull().unique(),
  parcelId: integer("parcel_id").notNull(),
  ownerId: integer("owner_id").notNull(),
  ownerName: varchar("owner_name", { length: 255 }).notNull(),
  ownershipType: varchar("ownership_type", { length: 32 }).notNull(),
  ownershipPercentage: integer("ownership_percentage").default(100).notNull(),
  titleType: varchar("title_type", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).default("pending_verification").notNull(),
  issuedAt: timestamp("issued_at"),
  verifiedAt: timestamp("verified_at"),
  encumbranceNotes: text("encumbrance_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  parcelIdx: index("titles_parcel_idx").on(table.parcelId),
  ownerIdx: index("titles_owner_idx").on(table.ownerId),
}));

export type Title = typeof titles.$inferSelect;
export type InsertTitle = typeof titles.$inferInsert;

/**
 * Repository document stores (migration 0013) — JSONB persistence for the
 * secondary feature repositories. One row per repository collection.
 */
export const repositoryStores = pgTable("repository_stores", {
  collection: varchar("collection", { length: 128 }).primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RepositoryStore = typeof repositoryStores.$inferSelect;
export type InsertRepositoryStore = typeof repositoryStores.$inferInsert;



// --- NEW SCHEMA TABLES FOR INTEGRATIONS ---

export const tigerbeetleLedgerAccounts = pgTable("tigerbeetle_ledger_accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  ledgerId: integer("ledger_id").notNull(),
  accountId: varchar("account_id", { length: 128 }).notNull().unique(),
  accountType: varchar("account_type", { length: 32 }).notNull(),
  code: integer("code").notNull(),
  userId: integer("user_id").references(() => users.id),
  parcelId: integer("parcel_id").references(() => parcels.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const temporalWorkflowAudit = pgTable("temporal_workflow_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workflowId: varchar("workflow_id", { length: 255 }).notNull(),
  runId: varchar("run_id", { length: 255 }).notNull(),
  workflowType: varchar("workflow_type", { length: 128 }).notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  input: jsonb("input"),
  output: jsonb("output"),
  error: text("error"),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const keycloakSessionSync = pgTable("keycloak_session_sync", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().references(() => users.id),
  keycloakSessionId: varchar("keycloak_session_id", { length: 255 }).notNull().unique(),
  keycloakUserId: varchar("keycloak_user_id", { length: 255 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});

export const fluvioTopicRegistry = pgTable("fluvio_topic_registry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  topicName: varchar("topic_name", { length: 255 }).notNull().unique(),
  partitions: integer("partitions").default(1).notNull(),
  replicationFactor: integer("replication_factor").default(1).notNull(),
  retentionTime: varchar("retention_time", { length: 32 }),
  status: varchar("status", { length: 32 }).default('active').notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apisixRoutePersistence = pgTable("apisix_route_persistence", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  routeId: varchar("route_id", { length: 128 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  uris: jsonb("uris").notNull(),
  methods: jsonb("methods"),
  upstreamId: varchar("upstream_id", { length: 128 }),
  plugins: jsonb("plugins"),
  status: varchar("status", { length: 32 }).default('active').notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const permifySchemaSync = pgTable("permify_schema_sync", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  version: varchar("version", { length: 128 }).notNull().unique(),
  schemaDefinition: text("schema_definition").notNull(),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  status: varchar("status", { length: 32 }).default('applied').notNull(),
  appliedBy: varchar("applied_by", { length: 128 }),
});

export const openappsecPolicyAudit = pgTable("openappsec_policy_audit", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  policyId: varchar("policy_id", { length: 128 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  mode: varchar("mode", { length: 32 }).notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  changes: jsonb("changes"),
  appliedAt: timestamp("applied_at").defaultNow().notNull(),
  appliedBy: varchar("applied_by", { length: 128 }),
});
