/**
 * Drizzle ORM Relations — Land Management Platform
 *
 * Defines the full relational graph for all major entities.
 * Enables `db.query.*` with `with:` eager loading, eliminating N+1 patterns.
 *
 * Usage example:
 *   const parcel = await db.query.parcels.findFirst({
 *     where: eq(parcels.id, id),
 *     with: {
 *       owner: true,
 *       titles: true,
 *       transactions: { limit: 10, orderBy: desc(registryTransactions.createdAt) },
 *       verificationRequests: { where: eq(verificationRequests.status, 'submitted') },
 *     },
 *   });
 */

import { relations } from 'drizzle-orm';
import {
  users,
  parcels,
  registryTransactions,
  titles,
  payments,
  verificationRequests,
  apiKeys,
  apiKeyUsageEvents,
  adminNotifications,
  securityEvents,
  loginAttempts,
  fieldData,
  blockchainTransactions,
  registryIntegrityFindings,
} from './schema';

// ─────────────────────────────────────────────────────────────────────────────
// users ↔ everything
// ─────────────────────────────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  ownedParcels: many(parcels, { relationName: 'parcelOwner' }),
  initiatedTransactions: many(registryTransactions, { relationName: 'transactionInitiator' }),
  ownedTitles: many(titles, { relationName: 'titleOwner' }),
  payments: many(payments, { relationName: 'paymentPayer' }),
  apiKeys: many(apiKeys, { relationName: 'userApiKeys' }),
  notifications: many(adminNotifications, { relationName: 'notificationRecipient' }),
  securityEvents: many(securityEvents, { relationName: 'userSecurityEvents' }),
  loginAttempts: many(loginAttempts, { relationName: 'userLoginAttempts' }),
  fieldData: many(fieldData, { relationName: 'userFieldData' }),
  blockchainTransactions: many(blockchainTransactions, { relationName: 'userBlockchainTx' }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// parcels ↔ everything
// ─────────────────────────────────────────────────────────────────────────────
export const parcelsRelations = relations(parcels, ({ one, many }) => ({
  owner: one(users, {
    fields: [parcels.ownerId],
    references: [users.id],
    relationName: 'parcelOwner',
  }),
  transactions: many(registryTransactions, { relationName: 'parcelTransactions' }),
  titles: many(titles, { relationName: 'parcelTitles' }),
  verificationRequests: many(verificationRequests, { relationName: 'parcelVerifications' }),
  integrityFindings: many(registryIntegrityFindings, { relationName: 'parcelIntegrityFindings' }),
  fieldData: many(fieldData, { relationName: 'parcelFieldData' }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// registryTransactions ↔ everything
// ─────────────────────────────────────────────────────────────────────────────
export const registryTransactionsRelations = relations(registryTransactions, ({ one, many }) => ({
  parcel: one(parcels, {
    fields: [registryTransactions.parcelId],
    references: [parcels.id],
    relationName: 'parcelTransactions',
  }),
  initiator: one(users, {
    fields: [registryTransactions.initiatorId],
    references: [users.id],
    relationName: 'transactionInitiator',
  }),
  title: one(titles, {
    fields: [registryTransactions.titleId],
    references: [titles.id],
    relationName: 'transactionTitle',
  }),
  payments: many(payments, { relationName: 'transactionPayments' }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// titles ↔ everything
// ─────────────────────────────────────────────────────────────────────────────
export const titlesRelations = relations(titles, ({ one, many }) => ({
  parcel: one(parcels, {
    fields: [titles.parcelId],
    references: [parcels.id],
    relationName: 'parcelTitles',
  }),
  owner: one(users, {
    fields: [titles.ownerId],
    references: [users.id],
    relationName: 'titleOwner',
  }),
  transactions: many(registryTransactions, { relationName: 'transactionTitle' }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// payments ↔ everything
// ─────────────────────────────────────────────────────────────────────────────
export const paymentsRelations = relations(payments, ({ one }) => ({
  transaction: one(registryTransactions, {
    fields: [payments.transactionId],
    references: [registryTransactions.id],
    relationName: 'transactionPayments',
  }),
  payer: one(users, {
    fields: [payments.payerId],
    references: [users.id],
    relationName: 'paymentPayer',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// verificationRequests ↔ parcels
// ─────────────────────────────────────────────────────────────────────────────
export const verificationRequestsRelations = relations(verificationRequests, ({ one }) => ({
  parcel: one(parcels, {
    fields: [verificationRequests.parcelId],
    references: [parcels.id],
    relationName: 'parcelVerifications',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// apiKeys ↔ users, apiKeyUsageEvents
// ─────────────────────────────────────────────────────────────────────────────
export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
    relationName: 'userApiKeys',
  }),
  usageEvents: many(apiKeyUsageEvents, { relationName: 'keyUsageEvents' }),
}));

export const apiKeyUsageEventsRelations = relations(apiKeyUsageEvents, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [apiKeyUsageEvents.keyId],
    references: [apiKeys.id],
    relationName: 'keyUsageEvents',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// adminNotifications ↔ users
// ─────────────────────────────────────────────────────────────────────────────
export const adminNotificationsRelations = relations(adminNotifications, ({ one }) => ({
  recipient: one(users, {
    fields: [adminNotifications.recipientId],
    references: [users.id],
    relationName: 'notificationRecipient',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// securityEvents ↔ users
// ─────────────────────────────────────────────────────────────────────────────
export const securityEventsRelations = relations(securityEvents, ({ one }) => ({
  user: one(users, {
    fields: [securityEvents.userId],
    references: [users.id],
    relationName: 'userSecurityEvents',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// loginAttempts ↔ users
// ─────────────────────────────────────────────────────────────────────────────
export const loginAttemptsRelations = relations(loginAttempts, ({ one }) => ({
  user: one(users, {
    fields: [loginAttempts.userId],
    references: [users.id],
    relationName: 'userLoginAttempts',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// fieldData ↔ users, parcels
// ─────────────────────────────────────────────────────────────────────────────
export const fieldDataRelations = relations(fieldData, ({ one }) => ({
  user: one(users, {
    fields: [fieldData.userId],
    references: [users.id],
    relationName: 'userFieldData',
  }),
  parcel: one(parcels, {
    fields: [fieldData.parcelId],
    references: [parcels.id],
    relationName: 'parcelFieldData',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// blockchainTransactions ↔ users
// ─────────────────────────────────────────────────────────────────────────────
export const blockchainTransactionsRelations = relations(blockchainTransactions, ({ one }) => ({
  user: one(users, {
    fields: [blockchainTransactions.userId],
    references: [users.id],
    relationName: 'userBlockchainTx',
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// registryIntegrityFindings ↔ parcels
// ─────────────────────────────────────────────────────────────────────────────
export const registryIntegrityFindingsRelations = relations(registryIntegrityFindings, ({ one }) => ({
  parcel: one(parcels, {
    fields: [registryIntegrityFindings.parcelId],
    references: [parcels.id],
    relationName: 'parcelIntegrityFindings',
  }),
}));
