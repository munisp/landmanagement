/**
 * Parcel Subscription & Notification Preferences Router
 * ======================================================
 * Allows operators/users to:
 * 1. Subscribe to specific parcels for event notifications
 * 2. Manage notification preferences per channel (email, push, SMS, in-app)
 * 3. Dismiss and mark notifications as read (for mobile inbox UX)
 */

import { z } from "zod";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../../_core/trpc";
import { requireDb } from "../../db";
import {
  parcelSubscriptions,
  notificationPreferences,
  adminNotifications,
  parcels,
} from "../../../drizzle/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Parcel Subscription Router
// ─────────────────────────────────────────────────────────────────────────────

export const parcelSubscriptionsRouter = router({
  /**
   * Subscribe to a parcel to receive event notifications.
   * Operators can choose which events to follow.
   */
  subscribe: protectedProcedure
    .input(
      z.object({
        parcelId: z.number().int().positive(),
        events: z
          .array(
            z.enum([
              "status_change",
              "ownership_transfer",
              "document_uploaded",
              "dispute_filed",
              "valuation_updated",
              "mortgage_registered",
              "encumbrance_added",
              "survey_completed",
              "payment_received",
            ])
          )
          .min(1, "Select at least one event to follow"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      // Verify parcel exists
      const [parcel] = await db
        .select({ id: parcels.id, parcelNumber: parcels.parcelNumber })
        .from(parcels)
        .where(eq(parcels.id, input.parcelId))
        .limit(1);

      if (!parcel) {
        throw new Error(`Parcel ${input.parcelId} not found`);
      }

      // Check for existing subscription
      const existing = await db
        .select()
        .from(parcelSubscriptions)
        .where(
          and(
            eq(parcelSubscriptions.userId, ctx.user.id),
            eq(parcelSubscriptions.parcelId, input.parcelId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const [updated] = await db
          .update(parcelSubscriptions)
          .set({
            events: input.events,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(parcelSubscriptions.id, existing[0].id))
          .returning();
        return { action: "updated", subscription: updated };
      }

      const [created] = await db
        .insert(parcelSubscriptions)
        .values({
          userId: ctx.user.id,
          parcelId: input.parcelId,
          events: input.events,
          isActive: true,
        })
        .returning();

      return { action: "created", subscription: created };
    }),

  /**
   * Unsubscribe from a parcel.
   */
  unsubscribe: protectedProcedure
    .input(z.object({ parcelId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .update(parcelSubscriptions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(parcelSubscriptions.userId, ctx.user.id),
            eq(parcelSubscriptions.parcelId, input.parcelId)
          )
        );
      return { success: true };
    }),

  /**
   * List all parcels the current user is subscribed to.
   */
  listMySubscriptions: protectedProcedure
    .input(
      z.object({
        activeOnly: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(parcelSubscriptions.userId, ctx.user.id)];
      if (input.activeOnly) {
        conditions.push(eq(parcelSubscriptions.isActive, true));
      }

      const subs = await db
        .select({
          id: parcelSubscriptions.id,
          parcelId: parcelSubscriptions.parcelId,
          events: parcelSubscriptions.events,
          isActive: parcelSubscriptions.isActive,
          createdAt: parcelSubscriptions.createdAt,
          parcelNumber: parcels.parcelNumber,
          parcelStatus: parcels.status,
          parcelAddress: parcels.address,
        })
        .from(parcelSubscriptions)
        .leftJoin(parcels, eq(parcelSubscriptions.parcelId, parcels.id))
        .where(and(...conditions))
        .orderBy(desc(parcelSubscriptions.createdAt));

      return subs;
    }),

  /**
   * Check if the current user is subscribed to a specific parcel.
   */
  getSubscriptionStatus: protectedProcedure
    .input(z.object({ parcelId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const [sub] = await db
        .select()
        .from(parcelSubscriptions)
        .where(
          and(
            eq(parcelSubscriptions.userId, ctx.user.id),
            eq(parcelSubscriptions.parcelId, input.parcelId),
            eq(parcelSubscriptions.isActive, true)
          )
        )
        .limit(1);

      return {
        isSubscribed: !!sub,
        subscription: sub ?? null,
      };
    }),

  /**
   * Update which events to follow for a subscribed parcel.
   */
  updateEvents: protectedProcedure
    .input(
      z.object({
        parcelId: z.number().int().positive(),
        events: z.array(
          z.enum([
            "status_change",
            "ownership_transfer",
            "document_uploaded",
            "dispute_filed",
            "valuation_updated",
            "mortgage_registered",
            "encumbrance_added",
            "survey_completed",
            "payment_received",
          ])
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const [updated] = await db
        .update(parcelSubscriptions)
        .set({ events: input.events, updatedAt: new Date() })
        .where(
          and(
            eq(parcelSubscriptions.userId, ctx.user.id),
            eq(parcelSubscriptions.parcelId, input.parcelId)
          )
        )
        .returning();

      if (!updated) {
        throw new Error("Subscription not found");
      }
      return updated;
    }),

  /**
   * Get all subscribers for a parcel (admin/operator use).
   */
  getParcelSubscribers: protectedProcedure
    .input(z.object({ parcelId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const subs = await db
        .select({
          userId: parcelSubscriptions.userId,
          events: parcelSubscriptions.events,
          isActive: parcelSubscriptions.isActive,
          createdAt: parcelSubscriptions.createdAt,
        })
        .from(parcelSubscriptions)
        .where(
          and(
            eq(parcelSubscriptions.parcelId, input.parcelId),
            eq(parcelSubscriptions.isActive, true)
          )
        );
      return subs;
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Notification Preferences Router
// ─────────────────────────────────────────────────────────────────────────────

export const notificationPreferencesRouter = router({
  /**
   * Get the current user's notification preferences.
   * Creates default preferences if none exist.
   */
  getMyPreferences: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, ctx.user.id))
      .limit(1);

    if (prefs) return prefs;

    // Create default preferences
    const [created] = await db
      .insert(notificationPreferences)
      .values({
        userId: ctx.user.id,
        transactionUpdates: ["push", "email", "in_app"],
        documentEvents: ["push", "in_app"],
        disputeAlerts: ["push", "email", "sms"],
        systemAlerts: ["push", "email"],
        marketplaceUpdates: ["in_app"],
        parcelChanges: ["push", "in_app"],
        mortgageAlerts: ["push", "email", "sms"],
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        pushEnabled: true,
        emailEnabled: true,
        emailDigest: "realtime",
        smsEnabled: false,
        webhookEnabled: false,
      })
      .returning();

    return created;
  }),

  /**
   * Update notification preferences.
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        transactionUpdates: z.array(z.enum(["push", "email", "sms", "in_app"])).optional(),
        documentEvents: z.array(z.enum(["push", "email", "sms", "in_app"])).optional(),
        disputeAlerts: z.array(z.enum(["push", "email", "sms", "in_app"])).optional(),
        systemAlerts: z.array(z.enum(["push", "email", "sms", "in_app"])).optional(),
        marketplaceUpdates: z.array(z.enum(["push", "email", "sms", "in_app"])).optional(),
        parcelChanges: z.array(z.enum(["push", "email", "sms", "in_app"])).optional(),
        mortgageAlerts: z.array(z.enum(["push", "email", "sms", "in_app"])).optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        pushEnabled: z.boolean().optional(),
        pushToken: z.string().nullable().optional(),
        pushPlatform: z.string().nullable().optional(),
        emailEnabled: z.boolean().optional(),
        emailDigest: z.enum(["realtime", "hourly", "daily", "weekly"]).optional(),
        smsEnabled: z.boolean().optional(),
        smsPhone: z.string().nullable().optional(),
        webhookEnabled: z.boolean().optional(),
        webhookUrl: z.string().url().nullable().optional(),
        webhookSecret: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const existing = await db
        .select({ id: notificationPreferences.id })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, ctx.user.id))
        .limit(1);

      const updateData = {
        ...input,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        const [updated] = await db
          .update(notificationPreferences)
          .set(updateData)
          .where(eq(notificationPreferences.userId, ctx.user.id))
          .returning();
        return updated;
      }

      const [created] = await db
        .insert(notificationPreferences)
        .values({
          userId: ctx.user.id,
          transactionUpdates: input.transactionUpdates ?? ["push", "email", "in_app"],
          documentEvents: input.documentEvents ?? ["push", "in_app"],
          disputeAlerts: input.disputeAlerts ?? ["push", "email", "sms"],
          systemAlerts: input.systemAlerts ?? ["push", "email"],
          marketplaceUpdates: input.marketplaceUpdates ?? ["in_app"],
          parcelChanges: input.parcelChanges ?? ["push", "in_app"],
          mortgageAlerts: input.mortgageAlerts ?? ["push", "email", "sms"],
          quietHoursEnabled: input.quietHoursEnabled ?? false,
          quietHoursStart: input.quietHoursStart ?? "22:00",
          quietHoursEnd: input.quietHoursEnd ?? "07:00",
          pushEnabled: input.pushEnabled ?? true,
          pushToken: input.pushToken ?? null,
          pushPlatform: input.pushPlatform ?? null,
          emailEnabled: input.emailEnabled ?? true,
          emailDigest: input.emailDigest ?? "realtime",
          smsEnabled: input.smsEnabled ?? false,
          smsPhone: input.smsPhone ?? null,
          webhookEnabled: input.webhookEnabled ?? false,
          webhookUrl: input.webhookUrl ?? null,
          webhookSecret: input.webhookSecret ?? null,
        })
        .returning();
      return created;
    }),

  /**
   * Register a push notification token (web/iOS/Android).
   */
  registerPushToken: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1),
        platform: z.enum(["web", "ios", "android"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const existing = await db
        .select({ id: notificationPreferences.id })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, ctx.user.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(notificationPreferences)
          .set({
            pushToken: input.token,
            pushPlatform: input.platform,
            pushEnabled: true,
            updatedAt: new Date(),
          })
          .where(eq(notificationPreferences.userId, ctx.user.id));
      } else {
        await db.insert(notificationPreferences).values({
          userId: ctx.user.id,
          pushToken: input.token,
          pushPlatform: input.platform,
          pushEnabled: true,
          emailEnabled: true,
          smsEnabled: false,
          webhookEnabled: false,
          transactionUpdates: ["push", "email", "in_app"],
          documentEvents: ["push", "in_app"],
          disputeAlerts: ["push", "email", "sms"],
          systemAlerts: ["push", "email"],
          marketplaceUpdates: ["in_app"],
          parcelChanges: ["push", "in_app"],
          mortgageAlerts: ["push", "email", "sms"],
          quietHoursEnabled: false,
          emailDigest: "realtime",
        });
      }
      return { success: true };
    }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Notification Inbox Router (with swipe-to-dismiss + mark-as-read)
// ─────────────────────────────────────────────────────────────────────────────

export const notificationInboxRouter = router({
  /**
   * List notifications with pagination for mobile inbox.
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
        unreadOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [
        eq(adminNotifications.recipientId, ctx.user.id),
      ];
      if (input.unreadOnly) {
        conditions.push(eq(adminNotifications.read, false));
      }

      const [notifications, countResult] = await Promise.all([
        db
          .select()
          .from(adminNotifications)
          .where(and(...conditions))
          .orderBy(desc(adminNotifications.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(adminNotifications)
          .where(and(...conditions)),
      ]);

      return {
        notifications,
        total: Number(countResult[0]?.count ?? 0),
        hasMore:
          input.offset + input.limit <
          Number(countResult[0]?.count ?? 0),
      };
    }),

  /**
   * Mark a single notification as read (tap gesture).
   */
  markAsRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .update(adminNotifications)
        .set({ read: true, readAt: new Date() })
        .where(
          and(
            eq(adminNotifications.id, input.notificationId),
            eq(adminNotifications.recipientId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  /**
   * Mark multiple notifications as read (bulk action).
   */
  markManyAsRead: protectedProcedure
    .input(
      z.object({ notificationIds: z.array(z.number().int().positive()) })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .update(adminNotifications)
        .set({ read: true, readAt: new Date() })
        .where(
          and(
            inArray(adminNotifications.id, input.notificationIds),
            eq(adminNotifications.recipientId, ctx.user.id)
          )
        );
      return { success: true, count: input.notificationIds.length };
    }),

  /**
   * Mark all notifications as read.
   */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const result = await db
      .update(adminNotifications)
      .set({ read: true, readAt: new Date() })
      .where(
        and(
          eq(adminNotifications.recipientId, ctx.user.id),
          eq(adminNotifications.read, false)
        )
      )
      .returning({ id: adminNotifications.id });
    return { success: true, count: result.length };
  }),

  /**
   * Dismiss (swipe-to-dismiss) a notification.
   */
  dismiss: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db
        .update(adminNotifications)
        .set({ read: true, readAt: new Date() })
        .where(
          and(
            eq(adminNotifications.id, input.notificationId),
            eq(adminNotifications.recipientId, ctx.user.id)
          )
        );
      return { success: true };
    }),

  /**
   * Dismiss all read notifications (clear inbox).
   */
  clearRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const result = await db
      .delete(adminNotifications)
      .where(
        and(
          eq(adminNotifications.recipientId, ctx.user.id),
          eq(adminNotifications.read, true)
        )
      )
      .returning({ id: adminNotifications.id });
    return { success: true, cleared: result.length };
  }),

  /**
   * Get unread count for badge display.
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(adminNotifications)
      .where(
        and(
          eq(adminNotifications.recipientId, ctx.user.id),
          eq(adminNotifications.read, false)
        )
      );
    return { count: Number(result?.count ?? 0) };
  }),
});
