import React from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { deleteFieldDraft, duplicateFieldDraft, listFieldDrafts, syncFieldDraft, type FieldDraft } from "../../services/fieldDrafts";

const statusColor: Record<FieldDraft["status"], string> = {
  pending: "#475569",
  syncing: "#1d4ed8",
  synced: "#166534",
  conflict: "#b45309",
  failed: "#b91c1c",
};

export function OfflineDraftsScreen() {
  const session = useMobileSession();
  const client = useQueryClient();
  const query = useQuery<FieldDraft[], Error>({ queryKey: ["field", "drafts"], queryFn: listFieldDrafts });
  const refresh = () => client.invalidateQueries({ queryKey: ["field", "drafts"] });

  const syncMutation = useMutation<FieldDraft, Error, string>({
    mutationFn: (id: string) => {
      if (!session.accessToken) throw new Error("Sign in is required before synchronizing field evidence");
      return syncFieldDraft(id, session.accessToken);
    },
    onSuccess: async (draft) => {
      await Haptics.notificationAsync(draft.status === "synced" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      await refresh();
      if (draft.status === "conflict") Alert.alert("Draft conflict", draft.conflictReason ?? "The server could not reconcile this field draft. Duplicate it to keep a new editable copy.");
      if (draft.status === "failed") Alert.alert("Synchronization failed", draft.lastError ?? "The draft remains on this device and can be retried.");
    },
  });
  const duplicateMutation = useMutation({ mutationFn: duplicateFieldDraft, onSuccess: refresh });
  const deleteMutation = useMutation({ mutationFn: deleteFieldDraft, onSuccess: refresh });

  const confirmDelete = (draft: FieldDraft) => Alert.alert(
    "Delete local draft?",
    "This removes the selected offline media and metadata from this device. It does not change any server evidence or analysis run.",
    [{ text: "Keep", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(draft.id) }],
  );

  const renderItem = ({ item }: { item: FieldDraft }) => {
    const canSync = ["pending", "failed", "conflict"].includes(item.status);
    return <View style={styles.card}>
      <View style={styles.cardHeader}><View style={styles.cardCopy}><Text style={styles.title}>{item.title || "Untitled field draft"}</Text><Text style={styles.meta}>Revision {item.revision} · {new Date(item.updatedAt).toLocaleString()}</Text></View><Text style={[styles.status, { color: statusColor[item.status] }]}>{item.status}</Text></View>
      <Text style={styles.purpose}>{item.purpose || "Purpose has not been completed."}</Text>
      <Text style={styles.location}>{item.captured.location.latitude.toFixed(6)}, {item.captured.location.longitude.toFixed(6)} · captured {new Date(item.captured.capturedAt).toLocaleString()}</Text>
      {item.synchronizedRunId ? <Text style={styles.synced}>Server run: {item.synchronizedRunId}</Text> : null}
      {item.conflictReason ? <Text style={styles.conflict}>{item.conflictReason}</Text> : null}
      {item.lastError ? <Text style={styles.failed}>{item.lastError}</Text> : null}
      <View style={styles.actions}>
        {canSync ? <Pressable disabled={syncMutation.isPending} onPress={() => syncMutation.mutate(item.id)} style={({ pressed }) => [styles.sync, (pressed || syncMutation.isPending) && styles.pressed]}><Text style={styles.syncText}>{syncMutation.isPending ? "Synchronizing…" : "Sync now"}</Text></Pressable> : null}
        {item.status === "conflict" ? <Pressable disabled={duplicateMutation.isPending} onPress={() => duplicateMutation.mutate(item.id)} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>Duplicate</Text></Pressable> : null}
        <Pressable disabled={deleteMutation.isPending} onPress={() => confirmDelete(item)} style={({ pressed }) => [styles.delete, pressed && styles.pressed]}><Text style={styles.deleteText}>Delete</Text></Pressable>
      </View>
    </View>;
  };

  return <View style={styles.container}>
    <View style={styles.notice}><Text style={styles.noticeTitle}>Explicit synchronization</Text><Text style={styles.noticeText}>Drafts never upload automatically. Review the device-local content and select Sync now only when you have connectivity and are ready to create a server-side evidence workflow.</Text></View>
    {(query.data?.length ?? 0) === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No offline field drafts</Text><Text style={styles.emptyText}>Captured evidence saved for offline work will appear here until you synchronize or delete it.</Text></View> : <FlatList<FieldDraft>
      data={query.data ?? []}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      refreshing={query.isFetching}
      onRefresh={() => void query.refetch()}
    />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 12 }, notice: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 }, noticeTitle: { color: "#1e3a8a", fontWeight: "800" }, noticeText: { color: "#334155", lineHeight: 18, fontSize: 12 },
  list: { gap: 10, paddingBottom: 30 }, emptyList: { flexGrow: 1 }, empty: { alignItems: "center", justifyContent: "center", flex: 1, paddingHorizontal: 30, gap: 7 }, emptyTitle: { color: "#334155", fontSize: 18, fontWeight: "800" }, emptyText: { color: "#64748b", textAlign: "center", lineHeight: 20 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 13, padding: 13, gap: 8 }, cardHeader: { flexDirection: "row", gap: 8, justifyContent: "space-between" }, cardCopy: { flex: 1, gap: 3 }, title: { color: "#0f172a", fontWeight: "800", fontSize: 15 }, meta: { color: "#64748b", fontSize: 11 }, status: { fontSize: 12, fontWeight: "800", textTransform: "capitalize" }, purpose: { color: "#475569", fontSize: 13, lineHeight: 18 }, location: { color: "#64748b", fontSize: 11, lineHeight: 16 }, synced: { color: "#166534", fontSize: 12, fontWeight: "700" }, conflict: { color: "#b45309", fontSize: 12, lineHeight: 17 }, failed: { color: "#b91c1c", fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: "row", gap: 8, marginTop: 2 }, sync: { flex: 1, backgroundColor: "#2563eb", padding: 10, borderRadius: 8, alignItems: "center" }, syncText: { color: "#ffffff", fontWeight: "800", fontSize: 12 }, secondary: { flex: 1, borderColor: "#93c5fd", borderWidth: 1, padding: 10, borderRadius: 8, alignItems: "center" }, secondaryText: { color: "#1d4ed8", fontWeight: "800", fontSize: 12 }, delete: { paddingHorizontal: 12, justifyContent: "center", alignItems: "center" }, deleteText: { color: "#b91c1c", fontWeight: "800", fontSize: 12 }, pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
});
