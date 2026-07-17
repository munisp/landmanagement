import { pgTable, integer, varchar, timestamp, boolean, text, index, pgEnum } from "drizzle-orm/pg-core";
import { mortgageApplications } from "./schema";

/**
 * Mortgage Payment Schedule Table
 * Tracks individual scheduled payments for each mortgage
 */
export const mortgagePaymentSchedule = pgTable("mortgage_payment_schedule", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scheduleId: varchar("schedule_id", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  
  // Payment details
  paymentNumber: integer("payment_number").notNull(), // 1, 2, 3... up to loan term
  dueDate: timestamp("due_date").notNull(),
  principalAmount: integer("principal_amount").notNull(), // in smallest currency unit
  interestAmount: integer("interest_amount").notNull(),
  totalAmount: integer("total_amount").notNull(),
  remainingBalance: integer("remaining_balance").notNull(),
  
  // Payment status
  isPaid: boolean("is_paid").default(false).notNull(),
  paidAmount: integer("paid_amount").default(0).notNull(),
  paidAt: timestamp("paid_at"),
  paymentMethod: varchar("payment_method", { length: 50 }), // e.g., "auto_debit", "manual", "bank_transfer"
  
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
 * Records all payment transactions (scheduled, early, extra)
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
  "cancelled"
]);

export const mortgagePaymentTransactions = pgTable("mortgage_payment_transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  transactionId: varchar("transaction_id", { length: 64 }).notNull().unique(),
  applicationId: integer("application_id").notNull().references(() => mortgageApplications.id),
  scheduleId: integer("schedule_id").references(() => mortgagePaymentSchedule.id), // null for extra payments
  
  // Payment details
  amount: integer("amount").notNull(),
  principalPaid: integer("principal_paid").notNull(),
  interestPaid: integer("interest_paid").notNull(),
  lateFee: integer("late_fee").default(0).notNull(),
  
  // Payment method
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // "auto_debit", "manual", "bank_transfer", "card"
  paymentGateway: varchar("payment_gateway", { length: 50 }), // "paystack", "flutterwave", "bank"
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
  metadata: text("metadata"), // JSON string for additional data
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => ({
  applicationIdx: index("mortgage_payment_transactions_application_idx").on(table.applicationId),
  scheduleIdx: index("mortgage_payment_transactions_schedule_idx").on(table.scheduleId),
  statusIdx: index("mortgage_payment_transactions_status_idx").on(table.status),
  initiatedAtIdx: index("mortgage_payment_transactions_initiated_at_idx").on(table.initiatedAt),
}));

export type MortgagePaymentTransaction = typeof mortgagePaymentTransactions.$inferSelect;
export type InsertMortgagePaymentTransaction = typeof mortgagePaymentTransactions.$inferInsert;

/**
 * Auto Debit Mandates Table
 * Stores automatic payment authorization details
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
  maxAmount: integer("max_amount").notNull(), // Maximum amount per debit
  frequency: varchar("frequency", { length: 20 }).notNull().default("monthly"), // "monthly", "bi-weekly"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // null for indefinite
  
  // Gateway integration
  gatewayProvider: varchar("gateway_provider", { length: 50 }).notNull(), // "paystack", "flutterwave"
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
