import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import {
  approveGeoAiArcgisOperation,
  executeApprovedGeoAiArcgisOperation,
  getGeoAiArcgisOperation,
  refreshGeoAiArcgisOperation,
  type GeoArcgisOperation,
} from "../../services/api";
import { GeoAiStatusBadge } from "../../components/GeoAiStatusBadge";
import { AppScreen } from "../../components/AppScreen";

function operationIdFrom(value: string | string[] | undefined) {
  const result = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(result) && result > 0 ? result : null;
}

export function ArcgisOperationDetailScreen() {
  const { operationId: rawOperationId } = useLocalSearchParams<{ operationId: string }>();
  const operationId = operationIdFrom(rawOperationId);
  const router = useRouter();
  const session = useMobileSession();
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState("");
  const [externalJobId, setExternalJobId] = useState("");

  const query = useQuery<GeoArcgisOperation, Error>({
    queryKey: ["geoai", "arcgis-operation", operationId],
    queryFn: () => getGeoAiArcgisOperation(operationId as number, session.accessToken),
    enabled: Boolean(operationId && session.accessToken),
    refetchInterval: 10_000,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["geoai", "arcgis-operation", operationId] }),
      client.invalidateQueries({ queryKey: ["geoai", "arcgis-operations"] }),
    ]);
  };
  const approveMutation = useMutation({
    mutationFn: () => approveGeoAiArcgisOperation(operationId as number, externalJobId.trim() || undefined, session.accessToken),
    onSuccess: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await refresh(); },
    onError: (error: Error) => Alert.alert("Approval was not recorded", error.message),
  });
  const executeMutation = useMutation({
    mutationFn: () => executeApprovedGeoAiArcgisOperation(operationId as number, session.accessToken),
    onSuccess: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); setConfirmation(""); await refresh(); },
    onError: (error: Error) => Alert.alert("Execution was blocked", error.message),
  });
  const statusMutation = useMutation({
    mutationFn: () => refreshGeoAiArcgisOperation(operationId as number, session.accessToken),
    onSuccess: refresh,
    onError: (error: Error) => Alert.alert("Status refresh failed", error.message),
  });

  if (!operationId) return <View style={styles.center}><Text style={styles.error}>The requested ArcGIS operation identifier is invalid.</Text></View>;
  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (query.error || !query.data) return <View style={styles.center}><Text style={styles.error}>{query.error?.message ?? "ArcGIS operation was not found"}</Text><Pressable onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View>;

  const operation = query.data;
  const executionPhrase = `EXECUTE ${operation.operationKey}`;
  const canExecute = operation.status === "approved" && confirmation.trim() === executionPhrase;
  const confirmApproval = () => Alert.alert(
    "Approve this ArcGIS operation?",
    "Approval records your identity through the server and makes the operation eligible for a separate, explicit execution confirmation. Review the operation and recovery plans before continuing.",
    [{ text: "Cancel", style: "cancel" }, { text: "Approve", onPress: () => approveMutation.mutate() }],
  );
  const confirmExecution = () => Alert.alert(
    "Execute approved operation?",
    "This sends the approved plan and recovery plan to the configured ArcGIS control plane. The server independently rechecks authorization, approval state, and recovery-plan completeness before execution.",
    [{ text: "Cancel", style: "cancel" }, { text: "Execute", style: "destructive", onPress: () => executeMutation.mutate() }],
  );

  return <AppScreen scroll>
    <View style={styles.banner}><Text style={styles.bannerTitle}>Guarded GIS operation</Text><Text style={styles.bannerText}>This screen never performs local desktop GIS automation. It records human intent, then calls the server’s guarded control-plane boundary only after server-side authorization and approval checks.</Text></View>
    <View style={styles.card}><View style={styles.heading}><View style={styles.copy}><Text style={styles.title}>{operation.operationType.replace(/_/g, " ")}</Text><Text style={styles.meta}>{operation.operationKey}</Text></View><GeoAiStatusBadge value={operation.status} /></View><Text selectable style={styles.workspace}>{operation.targetWorkspaceUri}</Text><Text style={styles.meta}>Requested {new Date(operation.createdAt).toLocaleString()}{operation.runId ? ` · linked GeoAI run ${operation.runId}` : ""}</Text>{operation.externalJobId ? <Text style={styles.meta}>Control-plane job: {operation.externalJobId}</Text> : null}{operation.failureReason ? <Text style={styles.failure}>{operation.failureReason}</Text> : null}</View>
    <View style={styles.card}><Text style={styles.cardTitle}>Operation plan</Text><ScrollView horizontal style={styles.jsonScroll}><Text selectable style={styles.json}>{JSON.stringify(operation.operationPlan, null, 2)}</Text></ScrollView></View>
    <View style={styles.recovery}><Text style={styles.cardTitle}>Recovery plan</Text><Text style={styles.recoveryNotice}>Execution is refused by the server when this plan is absent. Confirm it is practical for the target workspace before approval or execution.</Text><ScrollView horizontal style={styles.jsonScroll}><Text selectable style={styles.json}>{JSON.stringify(operation.recoveryPlan, null, 2)}</Text></ScrollView></View>

    {operation.status === "requested" ? <View style={styles.card}><Text style={styles.cardTitle}>Approval control</Text><Text style={styles.cardSubtitle}>Only users with server-enforced GeoAI ArcGIS approval permission can approve this request.</Text><TextInput value={externalJobId} onChangeText={setExternalJobId} placeholder="Optional external approval or change ID" style={styles.input} /><Pressable disabled={approveMutation.isPending} onPress={confirmApproval} style={({ pressed }) => [styles.approveButton, (pressed || approveMutation.isPending) && styles.pressed]}>{approveMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Approve operation</Text>}</Pressable></View> : null}

    {operation.status === "approved" ? <View style={styles.executeCard}><Text style={styles.cardTitle}>Execution confirmation</Text><Text style={styles.cardSubtitle}>An approval is not execution. Re-read the recovery plan, then type the exact confirmation phrase below. The server still has final authority and may deny the request.</Text><Text selectable style={styles.phrase}>{executionPhrase}</Text><TextInput value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} placeholder="Type confirmation phrase" style={styles.input} /><Pressable disabled={!canExecute || executeMutation.isPending} onPress={confirmExecution} style={({ pressed }) => [styles.executeButton, (!canExecute || pressed || executeMutation.isPending) && styles.disabled]}>{executeMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Execute approved operation</Text>}</Pressable></View> : null}

    {operation.status === "running" ? <Pressable disabled={statusMutation.isPending} onPress={() => statusMutation.mutate()} style={({ pressed }) => [styles.refreshButton, (pressed || statusMutation.isPending) && styles.pressed]}><Text style={styles.refreshText}>{statusMutation.isPending ? "Refreshing…" : "Refresh control-plane status"}</Text></Pressable> : null}
    <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>Back to operations</Text></Pressable>
  </AppScreen>;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", padding: 26, gap: 12 }, error: { color: "#b91c1c", textAlign: "center" }, retry: { backgroundColor: "#fee2e2", borderRadius: 8, padding: 10 }, retryText: { color: "#b91c1c", fontWeight: "800" },
  banner: { backgroundColor: "#fff7ed", borderColor: "#fed7aa", borderWidth: 1, borderRadius: 14, padding: 14, gap: 5 }, bannerTitle: { color: "#9a3412", fontWeight: "800", fontSize: 16 }, bannerText: { color: "#7c2d12", fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }, executeCard: { backgroundColor: "#fff7ed", borderColor: "#fed7aa", borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }, recovery: { backgroundColor: "#fffbeb", borderColor: "#fde68a", borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 }, heading: { flexDirection: "row", gap: 10, justifyContent: "space-between" }, copy: { flex: 1, gap: 3 }, title: { color: "#0f172a", fontSize: 18, fontWeight: "800", textTransform: "capitalize" }, meta: { color: "#64748b", fontSize: 11, lineHeight: 16 }, workspace: { color: "#475569", fontSize: 12 }, failure: { color: "#b91c1c", fontSize: 12, lineHeight: 17 }, cardTitle: { color: "#0f172a", fontSize: 16, fontWeight: "800" }, cardSubtitle: { color: "#64748b", fontSize: 12, lineHeight: 18 }, recoveryNotice: { color: "#854d0e", fontSize: 12, lineHeight: 18 }, jsonScroll: { maxHeight: 260 }, json: { color: "#334155", fontFamily: "Courier", fontSize: 11, lineHeight: 17 }, input: { borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 9, backgroundColor: "#ffffff", padding: 11, color: "#0f172a" }, phrase: { color: "#9a3412", fontFamily: "Courier", backgroundColor: "#ffedd5", padding: 10, borderRadius: 8, fontSize: 12 },
  approveButton: { backgroundColor: "#1d4ed8", borderRadius: 10, minHeight: 48, alignItems: "center", justifyContent: "center" }, executeButton: { backgroundColor: "#c2410c", borderRadius: 10, minHeight: 48, alignItems: "center", justifyContent: "center" }, buttonText: { color: "#ffffff", fontWeight: "800" }, disabled: { opacity: 0.45 }, refreshButton: { backgroundColor: "#ffffff", borderColor: "#93c5fd", borderWidth: 1, borderRadius: 10, padding: 13, alignItems: "center" }, refreshText: { color: "#1d4ed8", fontWeight: "800" }, backButton: { alignItems: "center", padding: 8 }, backText: { color: "#1d4ed8", fontWeight: "800" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
