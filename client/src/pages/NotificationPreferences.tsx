/**
 * Notification Preferences Screen
 * ================================
 * Full-featured notification settings page allowing users to:
 * - Toggle delivery channels (email, push, SMS, in-app, webhook)
 * - Customize per-category alert settings
 * - Set quiet hours
 * - Register push notification tokens
 * - Configure email digest frequency
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from 'sonner';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  Globe,
  Moon,
  Clock,
  Zap,
  FileText,
  AlertTriangle,
  DollarSign,
  MapPin,
  Building2,
  TrendingUp,
  Settings,
  CheckCircle2,
  Webhook,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Channel = "push" | "email" | "sms" | "in_app";
type DigestFrequency = "realtime" | "hourly" | "daily" | "weekly";

interface ChannelGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  channels: Channel[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel toggle component
// ─────────────────────────────────────────────────────────────────────────────

function ChannelBadge({
  channel,
  active,
  onToggle,
}: {
  channel: Channel;
  active: boolean;
  onToggle: () => void;
}) {
  const labels: Record<Channel, string> = {
    push: "Push",
    email: "Email",
    sms: "SMS",
    in_app: "In-App",
  };
  const colors: Record<Channel, string> = {
    push: "bg-blue-100 text-blue-800 border-blue-200",
    email: "bg-purple-100 text-purple-800 border-purple-200",
    sms: "bg-green-100 text-green-800 border-green-200",
    in_app: "bg-orange-100 text-orange-800 border-orange-200",
  };

  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
        active
          ? colors[channel]
          : "bg-gray-100 text-gray-400 border-gray-200 opacity-60"
      }`}
    >
      {active && <CheckCircle2 className="w-3 h-3" />}
      {labels[channel]}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function NotificationPreferences() {
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = trpc.notificationPreferences.getMyPreferences.useQuery();

  const updateMutation = trpc.notificationPreferences.updatePreferences.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationPreferences"] });
      toast.success('Preferences saved', { description: "Your notification settings have been updated." });
    },
    onError: (err) => {
      toast.error('Error', { description: err.message });
    },
  });

  const registerPushMutation = trpc.notificationPreferences.registerPushToken.useMutation({
    onSuccess: () => {
      toast.success('Push notifications enabled', { description: "You will now receive push notifications." });
    },
  });

  // Local state mirrors the server preferences
  const [channels, setChannels] = useState<Record<string, Channel[]>>({
    transactionUpdates: ["push", "email", "in_app"],
    documentEvents: ["push", "in_app"],
    disputeAlerts: ["push", "email", "sms"],
    systemAlerts: ["push", "email"],
    marketplaceUpdates: ["in_app"],
    parcelChanges: ["push", "in_app"],
    mortgageAlerts: ["push", "email", "sms"],
  });

  const [globalSettings, setGlobalSettings] = useState({
    pushEnabled: true,
    emailEnabled: true,
    smsEnabled: false,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    emailDigest: "realtime" as DigestFrequency,
    webhookEnabled: false,
    webhookUrl: "",
  });

  // Sync from server
  useEffect(() => {
    if (!prefs) return;
    setChannels({
      transactionUpdates: (prefs.transactionUpdates as Channel[]) ?? ["push", "email", "in_app"],
      documentEvents: (prefs.documentEvents as Channel[]) ?? ["push", "in_app"],
      disputeAlerts: (prefs.disputeAlerts as Channel[]) ?? ["push", "email", "sms"],
      systemAlerts: (prefs.systemAlerts as Channel[]) ?? ["push", "email"],
      marketplaceUpdates: (prefs.marketplaceUpdates as Channel[]) ?? ["in_app"],
      parcelChanges: (prefs.parcelChanges as Channel[]) ?? ["push", "in_app"],
      mortgageAlerts: (prefs.mortgageAlerts as Channel[]) ?? ["push", "email", "sms"],
    });
    setGlobalSettings({
      pushEnabled: prefs.pushEnabled ?? true,
      emailEnabled: prefs.emailEnabled ?? true,
      smsEnabled: prefs.smsEnabled ?? false,
      quietHoursEnabled: prefs.quietHoursEnabled ?? false,
      quietHoursStart: prefs.quietHoursStart ?? "22:00",
      quietHoursEnd: prefs.quietHoursEnd ?? "07:00",
      emailDigest: (prefs.emailDigest as DigestFrequency) ?? "realtime",
      webhookEnabled: prefs.webhookEnabled ?? false,
      webhookUrl: prefs.webhookUrl ?? "",
    });
  }, [prefs]);

  const toggleChannel = (category: string, channel: Channel) => {
    setChannels((prev) => {
      const current = prev[category] ?? [];
      const updated = current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel];
      return { ...prev, [category]: updated };
    });
  };

  const handleSave = () => {
    updateMutation.mutate({
      ...channels,
      pushEnabled: globalSettings.pushEnabled,
      emailEnabled: globalSettings.emailEnabled,
      smsEnabled: globalSettings.smsEnabled,
      quietHoursEnabled: globalSettings.quietHoursEnabled,
      quietHoursStart: globalSettings.quietHoursStart,
      quietHoursEnd: globalSettings.quietHoursEnd,
      emailDigest: globalSettings.emailDigest,
      webhookEnabled: globalSettings.webhookEnabled,
      webhookUrl: globalSettings.webhookUrl || null,
    });
  };

  const requestPushPermission = async () => {
    if (!("Notification" in window)) {
      toast.error('Not supported', { description: "Push notifications are not supported in this browser." });
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      // In production, get the actual FCM/VAPID token here
      const mockToken = `web-token-${Date.now()}`;
      registerPushMutation.mutate({ token: mockToken, platform: "web" });
    } else {
      toast.error('Permission denied', { description: "Please allow notifications in your browser settings." });
    }
  };

  const categoryGroups: ChannelGroup[] = [
    {
      key: "transactionUpdates",
      label: "Transaction Updates",
      icon: <Zap className="w-4 h-4 text-blue-500" />,
      description: "Status changes, approvals, and rejections for land transactions",
      channels: channels.transactionUpdates as Channel[],
    },
    {
      key: "documentEvents",
      label: "Document Events",
      icon: <FileText className="w-4 h-4 text-purple-500" />,
      description: "Document uploads, verifications, and expiry alerts",
      channels: channels.documentEvents as Channel[],
    },
    {
      key: "disputeAlerts",
      label: "Dispute Alerts",
      icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
      description: "New disputes, hearing schedules, and resolution updates",
      channels: channels.disputeAlerts as Channel[],
    },
    {
      key: "systemAlerts",
      label: "System Alerts",
      icon: <Settings className="w-4 h-4 text-gray-500" />,
      description: "Maintenance windows, security alerts, and platform announcements",
      channels: channels.systemAlerts as Channel[],
    },
    {
      key: "parcelChanges",
      label: "Parcel Changes",
      icon: <MapPin className="w-4 h-4 text-green-500" />,
      description: "Status changes for parcels you own or follow",
      channels: channels.parcelChanges as Channel[],
    },
    {
      key: "mortgageAlerts",
      label: "Mortgage Alerts",
      icon: <Building2 className="w-4 h-4 text-orange-500" />,
      description: "Payment reminders, approval updates, and rate changes",
      channels: channels.mortgageAlerts as Channel[],
    },
    {
      key: "marketplaceUpdates",
      label: "Marketplace Updates",
      icon: <TrendingUp className="w-4 h-4 text-teal-500" />,
      description: "New listings, bid activity, and price changes",
      channels: channels.marketplaceUpdates as Channel[],
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" />
            Notification Preferences
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Customize how and when you receive alerts across all channels.
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Global Channel Toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Channels</CardTitle>
          <CardDescription>Enable or disable entire delivery channels globally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { key: "pushEnabled", label: "Push", icon: <Smartphone className="w-4 h-4" /> },
              { key: "emailEnabled", label: "Email", icon: <Mail className="w-4 h-4" /> },
              { key: "smsEnabled", label: "SMS", icon: <MessageSquare className="w-4 h-4" /> },
              { key: "webhookEnabled", label: "Webhook", icon: <Webhook className="w-4 h-4" /> },
            ].map(({ key, label, icon }) => (
              <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {icon}
                  {label}
                </div>
                <Switch
                  checked={globalSettings[key as keyof typeof globalSettings] as boolean}
                  onCheckedChange={(v) =>
                    setGlobalSettings((s) => ({ ...s, [key]: v }))
                  }
                />
              </div>
            ))}
          </div>

          {/* Push notification setup */}
          {globalSettings.pushEnabled && (
            <div className="p-3 bg-blue-50 rounded-lg flex items-center justify-between">
              <div className="text-sm">
                <p className="font-medium text-blue-900">Browser Push Notifications</p>
                <p className="text-blue-700 text-xs mt-0.5">Receive alerts even when the app is closed.</p>
              </div>
              <Button size="sm" variant="outline" onClick={requestPushPermission}>
                Enable Push
              </Button>
            </div>
          )}

          {/* Webhook URL */}
          {globalSettings.webhookEnabled && (
            <div className="space-y-2">
              <Label htmlFor="webhookUrl" className="text-sm font-medium">
                Webhook URL
              </Label>
              <Input
                id="webhookUrl"
                placeholder="https://your-server.com/webhook"
                value={globalSettings.webhookUrl}
                onChange={(e) =>
                  setGlobalSettings((s) => ({ ...s, webhookUrl: e.target.value }))
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Digest Frequency */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email Digest Frequency
          </CardTitle>
          <CardDescription>Control how often email summaries are sent.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={globalSettings.emailDigest}
            onValueChange={(v) =>
              setGlobalSettings((s) => ({ ...s, emailDigest: v as DigestFrequency }))
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realtime">Real-time (immediate)</SelectItem>
              <SelectItem value="hourly">Hourly digest</SelectItem>
              <SelectItem value="daily">Daily digest</SelectItem>
              <SelectItem value="weekly">Weekly digest</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Moon className="w-4 h-4" />
            Quiet Hours
          </CardTitle>
          <CardDescription>Suppress non-critical notifications during these hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={globalSettings.quietHoursEnabled}
              onCheckedChange={(v) =>
                setGlobalSettings((s) => ({ ...s, quietHoursEnabled: v }))
              }
            />
            <span className="text-sm font-medium">Enable quiet hours</span>
          </div>
          {globalSettings.quietHoursEnabled && (
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">From</Label>
                <Input
                  type="time"
                  value={globalSettings.quietHoursStart}
                  onChange={(e) =>
                    setGlobalSettings((s) => ({ ...s, quietHoursStart: e.target.value }))
                  }
                  className="w-32"
                />
              </div>
              <Clock className="w-4 h-4 text-gray-400 mt-5" />
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">To</Label>
                <Input
                  type="time"
                  value={globalSettings.quietHoursEnd}
                  onChange={(e) =>
                    setGlobalSettings((s) => ({ ...s, quietHoursEnd: e.target.value }))
                  }
                  className="w-32"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Category Channel Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alert Categories</CardTitle>
          <CardDescription>
            Click a channel badge to toggle it for each alert category.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {categoryGroups.map((group) => (
            <div key={group.key} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{group.icon}</div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{group.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {(["push", "email", "sms", "in_app"] as Channel[]).map((ch) => (
                    <ChannelBadge
                      key={ch}
                      channel={ch}
                      active={group.channels.includes(ch)}
                      onToggle={() => toggleChannel(group.key, ch)}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save button (bottom) */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg">
          {updateMutation.isPending ? "Saving..." : "Save All Preferences"}
        </Button>
      </div>
    </div>
  );
}
