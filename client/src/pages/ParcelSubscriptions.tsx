/**
 * Parcel Subscriptions Page
 * ==========================
 * Allows operators to manage which parcels they follow and
 * which events trigger notifications for each parcel.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from 'sonner';
import {
  MapPin,
  Bell,
  BellOff,
  Plus,
  Trash2,
  Settings,
  CheckCircle2,
  AlertTriangle,
  FileText,
  DollarSign,
  Building2,
  TrendingUp,
  Ruler,
  CreditCard,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Event definitions
// ─────────────────────────────────────────────────────────────────────────────

const ALL_EVENTS = [
  { key: "status_change", label: "Status Change", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { key: "ownership_transfer", label: "Ownership Transfer", icon: <Building2 className="w-3.5 h-3.5" /> },
  { key: "document_uploaded", label: "Document Uploaded", icon: <FileText className="w-3.5 h-3.5" /> },
  { key: "dispute_filed", label: "Dispute Filed", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { key: "valuation_updated", label: "Valuation Updated", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: "mortgage_registered", label: "Mortgage Registered", icon: <CreditCard className="w-3.5 h-3.5" /> },
  { key: "encumbrance_added", label: "Encumbrance Added", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { key: "survey_completed", label: "Survey Completed", icon: <Ruler className="w-3.5 h-3.5" /> },
  { key: "payment_received", label: "Payment Received", icon: <DollarSign className="w-3.5 h-3.5" /> },
] as const;

type EventKey = typeof ALL_EVENTS[number]["key"];

// ─────────────────────────────────────────────────────────────────────────────
// Subscribe dialog
// ─────────────────────────────────────────────────────────────────────────────

function SubscribeDialog({ onSubscribed }: { onSubscribed: () => void }) {
  const [open, setOpen] = useState(false);
  const [parcelId, setParcelId] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<EventKey[]>([
    "status_change",
    "ownership_transfer",
    "document_uploaded",
  ]);

  const subscribeMutation = trpc.parcelSubscriptions.subscribe.useMutation({
    onSuccess: (data) => {
      toast.success(data.action === "created" ? "Subscribed!" : "Updated!", { description: `You will now receive notifications for parcel ${parcelId}.` });
      setOpen(false);
      setParcelId("");
      onSubscribed();
    },
    onError: (err) => {
      toast.error('Error', { description: err.message });
    },
  });

  const toggleEvent = (event: EventKey) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Follow a Parcel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Follow a Parcel</DialogTitle>
          <DialogDescription>
            Enter a parcel ID and choose which events you want to be notified about.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="parcelId">Parcel ID</Label>
            <Input
              id="parcelId"
              type="number"
              placeholder="e.g. 1042"
              value={parcelId}
              onChange={(e) => setParcelId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Events to follow</Label>
            <div className="grid grid-cols-1 gap-2">
              {ALL_EVENTS.map((event) => (
                <div key={event.key} className="flex items-center gap-2.5">
                  <Checkbox
                    id={event.key}
                    checked={selectedEvents.includes(event.key)}
                    onCheckedChange={() => toggleEvent(event.key)}
                  />
                  <label
                    htmlFor={event.key}
                    className="flex items-center gap-1.5 text-sm cursor-pointer"
                  >
                    {event.icon}
                    {event.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              subscribeMutation.mutate({
                parcelId: parseInt(parcelId),
                events: selectedEvents,
              })
            }
            disabled={!parcelId || selectedEvents.length === 0 || subscribeMutation.isPending}
          >
            {subscribeMutation.isPending ? "Subscribing..." : "Follow Parcel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription card
// ─────────────────────────────────────────────────────────────────────────────

function SubscriptionCard({
  sub,
  onUnsubscribe,
}: {
  sub: {
    id: number;
    parcelId: number;
    parcelNumber: string | null;
    parcelAddress: string | null;
    parcelStatus: string | null;
    events: string[];
    isActive: boolean;
    createdAt: Date;
  };
  onUnsubscribe: (parcelId: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editEvents, setEditEvents] = useState<EventKey[]>(sub.events as EventKey[]);

  const updateMutation = trpc.parcelSubscriptions.updateEvents.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parcelSubscriptions"] });
      toast.success('Updated', { description: "Subscription events updated." });
      setEditOpen(false);
    },
  });

  const unsubscribeMutation = trpc.parcelSubscriptions.unsubscribe.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parcelSubscriptions"] });
      toast.success("Unsubscribed", { description: `Stopped following parcel ${sub.parcelId}.` });
      onUnsubscribe(sub.parcelId);
    },
  });

  const statusColors: Record<string, string> = {
    registered: "bg-green-100 text-green-800",
    draft: "bg-gray-100 text-gray-700",
    pending: "bg-yellow-100 text-yellow-800",
    disputed: "bg-red-100 text-red-800",
    transferred: "bg-blue-100 text-blue-800",
  };

  return (
    <Card className="relative">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 bg-blue-50 rounded-lg shrink-0">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm text-gray-900">
                  {sub.parcelNumber ?? `Parcel #${sub.parcelId}`}
                </p>
                {sub.parcelStatus && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      statusColors[sub.parcelStatus] ?? "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {sub.parcelStatus}
                  </span>
                )}
              </div>
              {sub.parcelAddress && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{sub.parcelAddress}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {(sub.events as string[]).map((ev) => {
                  const def = ALL_EVENTS.find((e) => e.key === ev);
                  return (
                    <span
                      key={ev}
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                    >
                      {def?.icon}
                      {def?.label ?? ev}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Edit events */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8">
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Edit Events</DialogTitle>
                  <DialogDescription>
                    Choose which events to follow for {sub.parcelNumber ?? `Parcel #${sub.parcelId}`}.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-2 py-2">
                  {ALL_EVENTS.map((event) => (
                    <div key={event.key} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`edit-${event.key}`}
                        checked={editEvents.includes(event.key)}
                        onCheckedChange={() =>
                          setEditEvents((prev) =>
                            prev.includes(event.key)
                              ? prev.filter((e) => e !== event.key)
                              : [...prev, event.key]
                          )
                        }
                      />
                      <label
                        htmlFor={`edit-${event.key}`}
                        className="flex items-center gap-1.5 text-sm cursor-pointer"
                      >
                        {event.icon}
                        {event.label}
                      </label>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() =>
                      updateMutation.mutate({ parcelId: sub.parcelId, events: editEvents })
                    }
                    disabled={editEvents.length === 0 || updateMutation.isPending}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Unsubscribe */}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => unsubscribeMutation.mutate({ parcelId: sub.parcelId })}
              disabled={unsubscribeMutation.isPending}
            >
              <BellOff className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function ParcelSubscriptions() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = trpc.parcelSubscriptions.listMySubscriptions.useQuery({
    activeOnly: true,
  });

  const subscriptions = data ?? [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" />
            Parcel Subscriptions
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Follow specific parcels to receive targeted notifications when they change.
          </p>
        </div>
        <SubscribeDialog onSubscribed={() => refetch()} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-blue-600">{subscriptions.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Active Subscriptions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-green-600">
              {subscriptions.filter((s) => s.parcelStatus === "registered").length}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Registered Parcels</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-orange-600">
              {subscriptions.reduce((acc, s) => acc + (s.events?.length ?? 0), 0)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Total Events Tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : subscriptions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No subscriptions yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Click "Follow a Parcel" to start receiving targeted notifications.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              sub={sub as any}
              onUnsubscribe={() => refetch()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
