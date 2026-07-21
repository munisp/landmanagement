/**
 * Notification Inbox
 * ====================
 * Mobile-first notification inbox with:
 * - Swipe-to-dismiss gesture (via pointer events)
 * - Tap to mark as read
 * - Bulk mark all as read
 * - Clear read notifications
 * - Infinite scroll pagination
 * - Unread badge count
 */

import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from 'sonner';
import {
  Bell,
  CheckCheck,
  Trash2,
  AlertTriangle,
  FileText,
  Zap,
  DollarSign,
  Settings,
  MapPin,
  Building2,
  TrendingUp,
  X,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
  data?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification icon mapping
// ─────────────────────────────────────────────────────────────────────────────

function getNotificationIcon(type: string) {
  const iconClass = "w-4 h-4";
  const map: Record<string, React.ReactNode> = {
    transaction_approved: <Zap className={`${iconClass} text-green-600`} />,
    transaction_rejected: <Zap className={`${iconClass} text-red-600`} />,
    document_uploaded: <FileText className={`${iconClass} text-purple-600`} />,
    parcel_verified: <MapPin className={`${iconClass} text-blue-600`} />,
    payment_completed: <DollarSign className={`${iconClass} text-green-600`} />,
    system_alert: <Settings className={`${iconClass} text-gray-600`} />,
    dispute_filed: <AlertTriangle className={`${iconClass} text-red-600`} />,
    mortgage_update: <Building2 className={`${iconClass} text-orange-600`} />,
    valuation_updated: <TrendingUp className={`${iconClass} text-teal-600`} />,
  };
  return map[type] ?? <Bell className={`${iconClass} text-gray-500`} />;
}

function getNotificationBg(type: string): string {
  const map: Record<string, string> = {
    transaction_approved: "bg-green-50",
    transaction_rejected: "bg-red-50",
    document_uploaded: "bg-purple-50",
    parcel_verified: "bg-blue-50",
    payment_completed: "bg-green-50",
    system_alert: "bg-gray-50",
    dispute_filed: "bg-red-50",
    mortgage_update: "bg-orange-50",
    valuation_updated: "bg-teal-50",
  };
  return map[type] ?? "bg-gray-50";
}

// ─────────────────────────────────────────────────────────────────────────────
// Swipeable notification row
// ─────────────────────────────────────────────────────────────────────────────

function SwipeableNotification({
  notification,
  onDismiss,
  onMarkRead,
}: {
  notification: Notification;
  onDismiss: (id: number) => void;
  onMarkRead: (id: number) => void;
}) {
  const startX = useRef<number>(0);
  const currentX = useRef<number>(0);
  const [translateX, setTranslateX] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);
  const DISMISS_THRESHOLD = 120;

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    currentX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (startX.current === 0) return;
    const delta = e.clientX - startX.current;
    if (delta < 0) {
      setTranslateX(Math.max(delta, -200));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const delta = e.clientX - startX.current;
    startX.current = 0;

    if (delta < -DISMISS_THRESHOLD) {
      setIsDismissing(true);
      setTranslateX(-400);
      setTimeout(() => onDismiss(notification.id), 300);
    } else {
      setTranslateX(0);
    }
  };

  return (
    <div
      className={`relative overflow-hidden rounded-lg transition-all duration-200 ${
        isDismissing ? "opacity-0 max-h-0" : "opacity-100"
      }`}
    >
      {/* Dismiss background */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end px-4 bg-red-500 rounded-lg">
        <div className="flex items-center gap-1 text-white text-sm font-medium">
          <X className="w-4 h-4" />
          Dismiss
        </div>
      </div>

      {/* Notification content */}
      <div
        className={`relative flex items-start gap-3 p-4 rounded-lg cursor-pointer select-none touch-pan-y ${
          notification.read ? "bg-white border border-gray-100" : "bg-blue-50 border border-blue-100"
        }`}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: translateX === 0 ? "transform 0.2s ease" : "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={() => {
          if (!notification.read) onMarkRead(notification.id);
        }}
      >
        {/* Icon */}
        <div className={`p-2 rounded-full shrink-0 ${getNotificationBg(notification.type)}`}>
          {getNotificationIcon(notification.type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-medium truncate ${notification.read ? "text-gray-700" : "text-gray-900"}`}>
              {notification.title}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {!notification.read && (
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              )}
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main inbox page
// ─────────────────────────────────────────────────────────────────────────────

export default function NotificationInbox() {
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const { data, isLoading, refetch } = trpc.notificationInbox.list.useQuery({
    limit: LIMIT,
    offset,
    unreadOnly,
  });

  const { data: countData } = trpc.notificationInbox.getUnreadCount.useQuery();

  const markAsReadMutation = trpc.notificationInbox.markAsRead.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationInbox"] });
    },
  });

  const markAllMutation = trpc.notificationInbox.markAllAsRead.useMutation({
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["notificationInbox"] });
      toast.success(`Marked ${result.count} notifications as read`);
    },
  });

  const dismissMutation = trpc.notificationInbox.dismiss.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationInbox"] });
    },
  });

  const clearReadMutation = trpc.notificationInbox.clearRead.useMutation({
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["notificationInbox"] });
      toast.success(`Cleared ${result.cleared} read notifications`);
    },
  });

  const notifications = (data?.notifications ?? []) as Notification[];
  const total = data?.total ?? 0;
  const unreadCount = countData?.count ?? 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <Badge className="bg-blue-600 text-white">{unreadCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="gap-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark All Read
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => clearReadMutation.mutate()}
            disabled={clearReadMutation.isPending}
            className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Read
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => { setUnreadOnly(false); setOffset(0); }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !unreadOnly
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All ({total})
        </button>
        <button
          onClick={() => { setUnreadOnly(true); setOffset(0); }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            unreadOnly
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Swipe hint */}
      {notifications.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Swipe left to dismiss · Tap to mark as read
        </p>
      )}

      {/* Notifications list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">
              {unreadOnly ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {unreadOnly
                ? "You're all caught up!"
                : "Notifications will appear here when there is activity on your parcels and transactions."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <SwipeableNotification
              key={notification.id}
              notification={notification}
              onDismiss={(id) => dismissMutation.mutate({ notificationId: id })}
              onMarkRead={(id) => markAsReadMutation.mutate({ notificationId: id })}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-500">
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
