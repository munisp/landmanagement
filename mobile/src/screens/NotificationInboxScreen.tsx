/**
 * Notification Inbox Screen (React Native)
 * ==========================================
 * Mobile-native notification inbox with:
 * - Swipe-to-dismiss (left swipe) using react-native-gesture-handler
 * - Tap to mark as read
 * - Pull-to-refresh
 * - Haptic feedback on swipe dismiss
 * - Unread count badge
 * - Empty state illustration
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Animated,
  PanResponder,
  Vibration,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type MobileNotification,
} from '../services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Notification type icons
// ─────────────────────────────────────────────────────────────────────────────

const NOTIFICATION_ICONS: Record<string, { name: string; color: string; bg: string }> = {
  transaction_approved: { name: 'checkmark-circle', color: '#16a34a', bg: '#f0fdf4' },
  transaction_rejected: { name: 'close-circle', color: '#dc2626', bg: '#fef2f2' },
  document_uploaded: { name: 'document-text', color: '#7c3aed', bg: '#f5f3ff' },
  parcel_verified: { name: 'location', color: '#2563eb', bg: '#eff6ff' },
  payment_completed: { name: 'cash', color: '#16a34a', bg: '#f0fdf4' },
  system_alert: { name: 'warning', color: '#d97706', bg: '#fffbeb' },
  dispute_filed: { name: 'alert-circle', color: '#dc2626', bg: '#fef2f2' },
  mortgage_update: { name: 'home', color: '#ea580c', bg: '#fff7ed' },
  default: { name: 'notifications', color: '#6b7280', bg: '#f9fafb' },
};

function getIcon(type: string) {
  return NOTIFICATION_ICONS[type] ?? NOTIFICATION_ICONS.default;
}

// ─────────────────────────────────────────────────────────────────────────────
// Swipeable notification row
// ─────────────────────────────────────────────────────────────────────────────

interface SwipeableRowProps {
  notification: MobileNotification;
  onMarkRead: (id: number) => void;
  onDismiss: (id: number) => void;
}

function SwipeableRow({ notification, onMarkRead, onDismiss }: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const DISMISS_THRESHOLD = -100;
  const icon = getIcon(notification.type);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, -200));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < DISMISS_THRESHOLD) {
          // Dismiss
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          Animated.timing(translateX, {
            toValue: -500,
            duration: 250,
            useNativeDriver: true,
          }).start(() => onDismiss(notification.id));
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const timeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <View style={styles.rowContainer}>
      {/* Dismiss background */}
      <View style={styles.dismissBg}>
        <Ionicons name="trash-outline" size={24} color="#fff" />
        <Text style={styles.dismissText}>Dismiss</Text>
      </View>

      {/* Notification content */}
      <Animated.View
        style={[styles.notificationRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={[
            styles.notificationContent,
            !notification.read && styles.unreadRow,
          ]}
          onPress={() => {
            if (!notification.read) {
              Haptics.selectionAsync();
              onMarkRead(notification.id);
            }
          }}
          activeOpacity={0.7}
        >
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name as any} size={20} color={icon.color} />
          </View>

          {/* Text content */}
          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text
                style={[styles.title, !notification.read && styles.unreadTitle]}
                numberOfLines={1}
              >
                {notification.title}
              </Text>
              <Text style={styles.time}>{timeAgo(notification.createdAt)}</Text>
            </View>
            <Text style={styles.message} numberOfLines={2}>
              {notification.message}
            </Text>
          </View>

          {/* Unread dot */}
          {!notification.read && <View style={styles.unreadDot} />}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function NotificationInboxScreen() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['notifications', unreadOnly, page],
    queryFn: () => listNotifications({ limit: LIMIT, offset: page * LIMIT, unreadOnly }),
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert('Done', `Marked ${result.count} notifications as read`);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (notificationId: number) =>
      fetch(`/api/trpc/notificationInbox.dismiss`, {
        method: 'POST',
        body: JSON.stringify({ json: { notificationId } }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const unreadCount = data?.unreadCount ?? 0;

  const renderItem = useCallback(
    ({ item }: { item: MobileNotification }) => (
      <SwipeableRow
        notification={item}
        onMarkRead={(id) => markReadMutation.mutate(id)}
        onDismiss={(id) => dismissMutation.mutate(id)}
      />
    ),
    [markReadMutation, dismissMutation]
  );

  const ListHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTitle}>
        <Text style={styles.headerText}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount}</Text>
          </View>
        )}
      </View>
      {unreadCount > 0 && (
        <TouchableOpacity
          onPress={() => markAllMutation.mutate()}
          disabled={markAllMutation.isPending}
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const FilterTabs = () => (
    <View style={styles.filterRow}>
      <TouchableOpacity
        style={[styles.filterTab, !unreadOnly && styles.activeTab]}
        onPress={() => { setUnreadOnly(false); setPage(0); }}
      >
        <Text style={[styles.filterText, !unreadOnly && styles.activeTabText]}>
          All ({total})
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.filterTab, unreadOnly && styles.activeTab]}
        onPress={() => { setUnreadOnly(true); setPage(0); }}
      >
        <Text style={[styles.filterText, unreadOnly && styles.activeTabText]}>
          Unread ({unreadCount})
        </Text>
      </TouchableOpacity>
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="notifications-off-outline" size={56} color="#d1d5db" />
      <Text style={styles.emptyTitle}>
        {unreadOnly ? "You're all caught up!" : 'No notifications yet'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {unreadOnly
          ? 'No unread notifications.'
          : 'Notifications will appear here when there is activity on your parcels.'}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ListHeader />
      <FilterTabs />
      <Text style={styles.swipeHint}>← Swipe left to dismiss · Tap to mark as read</Text>
      <FlatList
        data={notifications}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#2563eb"
          />
        }
        ListEmptyComponent={<EmptyState />}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : undefined}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerText: { fontSize: 22, fontWeight: '700', color: '#111827' },
  badge: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  markAllText: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  activeTab: { backgroundColor: '#2563eb' },
  filterText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  activeTabText: { color: '#fff' },
  swipeHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#9ca3af',
    paddingVertical: 6,
    backgroundColor: '#f9fafb',
  },
  rowContainer: { position: 'relative', overflow: 'hidden', backgroundColor: '#f9fafb' },
  dismissBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 6,
  },
  dismissText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  notificationRow: { backgroundColor: '#f9fafb' },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#fff',
    gap: 12,
  },
  unreadRow: { backgroundColor: '#eff6ff' },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textContainer: { flex: 1 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: { fontSize: 14, color: '#374151', fontWeight: '500', flex: 1, marginRight: 8 },
  unreadTitle: { color: '#111827', fontWeight: '600' },
  time: { fontSize: 11, color: '#9ca3af', flexShrink: 0 },
  message: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
    marginTop: 4,
    flexShrink: 0,
  },
  separator: { height: 1, backgroundColor: '#f3f4f6' },
  emptyContainer: { flexGrow: 1 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
  emptySubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
