import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { AppScreen } from "../../components/AppScreen";
import { GeoAiStatusBadge } from "../../components/GeoAiStatusBadge";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { getGeoAiPresentation, getGeoAiRun, queueGeoAiRun, reviewGeoAiRun } from "../../services/api";

function parseRunId(value: string | string[] | undefined): number | null {
  const id = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function GeoAiRunDetailScreen() {
  const { runId: value } = useLocalSearchParams<{ runId: string }>();
  const runId = parseRunId(value);
  const router = useRouter();
  const session = useMobileSession();
  const client = useQueryClient();
  const [reviewNotes, setReviewNotes] = useState("");

  const runQuery = useQuery({
    queryKey: ["geoai", "run", runId],
    queryFn: () => getGeoAiRun(runId as number, session.accessToken),
    enabled: Boolean(runId && session.accessToken),
  });
  const presentationQuery = useQuery({
    queryKey: ["geoai", "presentation", runId],
    queryFn: () => getGeoAiPresentation(runId as number, session.accessToken),
    enabled: Boolean(runId && session.accessToken),
  });

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["geoai", "runs"] }),
      client.invalidateQueries({ queryKey: ["geoai", "run", runId] }),
      client.invalidateQueries({ queryKey: ["geoai", "presentation", runId] }),
    ]);
  };

  const queueMutation = useMutation({
    mutationFn: () => queueGeoAiRun(runId as number, session.accessToken),
    onSuccess: async () => { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await refresh(); },
    onError: (error: Error) => Alert.alert("Unable to queue analysis", error.message),
  });

  const reviewMutation = useMutation({
    mutationFn: (decision: "verified" | "rejected") => reviewGeoAiRun(runId as number, decision, reviewNotes.trim() || undefined, session.accessToken),
    onSuccess: async (_result, decision) => {
      await Haptics.notificationAsync(decision === "verified" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
      setReviewNotes("");
      await refresh();
    },
    onError: (error: Error) => Alert.alert("Review was not recorded", error.message),
  });

  const gateSummary = useMemo(() => {
    const gates = presentationQuery.data?.qualityGates ?? [];
    return { passed: gates.filter((gate) => ["passed", "waived"].includes(gate.status)).length, required: gates.filter((gate) => gate.required).length };
  }, [presentationQuery.data]);

  if (!runId) return <View style={styles.center}><Text style={styles.error}>The requested GeoAI run identifier is invalid.</Text></View>;
  if (runQuery.isLoading || presentationQuery.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (runQuery.error || presentationQuery.error) return <View style={styles.center}><Text style={styles.error}>{(runQuery.error ?? presentationQuery.error)?.message}</Text><Pressable onPress={() => void refresh()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View>;

  const run = runQuery.data?.run;
  const presentation = presentationQuery.data;
  if (!run || !presentation) return <View style={styles.center}><Text style={styles.error}>This GeoAI run is no longer available.</Text></View>;
  const canReview = run.status === "awaiting_review";
  const canQueue = ["draft", "failed", "cancelled"].includes(run.status);

  return (
    <AppScreen scroll>
      <View style={[styles.banner, presentation.display.allowedForDecisionPresentation ? styles.verifiedBanner : styles.cautionBanner]}>
        <Text style={styles.bannerTitle}>{presentation.display.allowedForDecisionPresentation ? "Verified decision evidence" : "Evidence has limitations"}</Text>
        <Text style={styles.bannerText}>{presentation.display.banner}</Text>
      </View>

      <View style={styles.headerCard}>
        <Text style={styles.title}>{run.title}</Text>
        <Text style={styles.meta}>{run.analysisType.replace(/_/g, " ")} · {run.runKey}</Text>
        <View style={styles.badges}><GeoAiStatusBadge value={run.status} /><GeoAiStatusBadge value={run.evidenceStatus} evidence /></View>
        <Text style={styles.purpose}>{run.purpose}</Text>
        {run.failureReason ? <Text style={styles.failure}>{run.failureReason}</Text> : null}
      </View>

      <View style={styles.actionRow}>
        {canQueue ? <Pressable disabled={queueMutation.isPending} onPress={() => queueMutation.mutate()} style={({ pressed }) => [styles.primaryButton, (pressed || queueMutation.isPending) && styles.pressed]}><Text style={styles.primaryButtonText}>{queueMutation.isPending ? "Queueing…" : "Queue analysis"}</Text></Pressable> : null}
        <Pressable onPress={() => router.push(`/geoai/report/${run.id}` as any)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Open report</Text></Pressable>
      </View>
      <Pressable onPress={() => router.push(`/geoai/map/${run.id}` as any)} style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}>
        <Text style={styles.mapButtonText}>Open evidence map</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quality gates</Text>
        <Text style={styles.cardSubtitle}>{gateSummary.passed}/{gateSummary.required} required gates passed</Text>
        <View style={styles.stack}>{presentation.qualityGates.map((gate) => <View key={gate.key} style={styles.gate}><View style={styles.gateContent}><Text style={styles.gateName}>{gate.name}</Text><Text style={styles.gateNotes}>{gate.required ? "Required" : "Optional"}{gate.notes ? ` · ${gate.notes}` : ""}</Text></View><GeoAiStatusBadge value={gate.status} /></View>)}</View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Declared evidence layers</Text>
        {presentation.layers.length ? <View style={styles.stack}>{presentation.layers.map((layer) => <View key={layer.artifactId} style={styles.layer}><Text style={styles.layerType}>{layer.artifactType}</Text><Text selectable style={styles.uri}>{layer.uri}</Text><Text style={layer.usableForVerifiedPresentation ? styles.allowed : styles.notAllowed}>{layer.usableForVerifiedPresentation ? "Eligible for verified presentation" : "Not eligible for verified decision presentation"}</Text></View>)}</View> : <Text style={styles.emptyText}>No visual or numeric artifact has been attached to this run.</Text>}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Uncertainty and limitations</Text>
        <ScrollView horizontal style={styles.jsonScroll}><Text selectable style={styles.json}>{JSON.stringify(presentation.uncertaintySummary ?? { status: "Not supplied" }, null, 2)}</Text></ScrollView>
      </View>

      {canReview ? <View style={styles.reviewCard}>
        <Text style={styles.cardTitle}>Authorized evidence review</Text>
        <Text style={styles.cardSubtitle}>The server enforces reviewer permission and rejects verification when required checkpoints are incomplete.</Text>
        <TextInput value={reviewNotes} onChangeText={setReviewNotes} multiline placeholder="Review notes (optional, but recommended for a decision record)" style={styles.reviewInput} textAlignVertical="top" />
        <View style={styles.actionRow}>
          <Pressable disabled={reviewMutation.isPending} onPress={() => reviewMutation.mutate("verified")} style={({ pressed }) => [styles.verifyButton, (pressed || reviewMutation.isPending) && styles.pressed]}><Text style={styles.primaryButtonText}>Verify evidence</Text></Pressable>
          <Pressable disabled={reviewMutation.isPending} onPress={() => reviewMutation.mutate("rejected")} style={({ pressed }) => [styles.rejectButton, (pressed || reviewMutation.isPending) && styles.pressed]}><Text style={styles.rejectButtonText}>Reject</Text></Pressable>
        </View>
      </View> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  error: { color: "#b91c1c", textAlign: "center", lineHeight: 20 }, retry: { backgroundColor: "#fee2e2", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }, retryText: { color: "#b91c1c", fontWeight: "700" },
  banner: { borderRadius: 14, padding: 14, gap: 5 }, verifiedBanner: { backgroundColor: "#ecfdf5", borderColor: "#86efac", borderWidth: 1 }, cautionBanner: { backgroundColor: "#fffbeb", borderColor: "#fde68a", borderWidth: 1 }, bannerTitle: { color: "#0f172a", fontWeight: "800", fontSize: 16 }, bannerText: { color: "#334155", fontSize: 13, lineHeight: 19 },
  headerCard: { backgroundColor: "#ffffff", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#e2e8f0", gap: 8 }, title: { color: "#0f172a", fontSize: 22, lineHeight: 28, fontWeight: "800" }, meta: { color: "#64748b", textTransform: "capitalize", fontSize: 12 }, badges: { flexDirection: "row", gap: 7, flexWrap: "wrap" }, purpose: { color: "#475569", lineHeight: 20 }, failure: { color: "#b91c1c", lineHeight: 19 },
  actionRow: { flexDirection: "row", gap: 10 }, mapButton: { backgroundColor: "#ffffff", borderColor: "#bfdbfe", borderWidth: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" }, mapButtonText: { color: "#1d4ed8", fontWeight: "800" }, primaryButton: { flex: 1, backgroundColor: "#2563eb", paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, alignItems: "center" }, primaryButtonText: { color: "#ffffff", fontWeight: "800" }, secondaryButton: { flex: 1, backgroundColor: "#ffffff", borderColor: "#93c5fd", borderWidth: 1, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 10, alignItems: "center" }, secondaryButtonText: { color: "#1d4ed8", fontWeight: "800" }, pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  card: { backgroundColor: "#ffffff", borderRadius: 14, padding: 15, borderWidth: 1, borderColor: "#e2e8f0", gap: 10 }, reviewCard: { backgroundColor: "#f8fafc", borderRadius: 14, padding: 15, borderWidth: 1, borderColor: "#bfdbfe", gap: 10 }, cardTitle: { color: "#0f172a", fontSize: 17, fontWeight: "800" }, cardSubtitle: { color: "#64748b", fontSize: 12, lineHeight: 18 }, stack: { gap: 9 }, gate: { flexDirection: "row", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: "#e2e8f0", padding: 10, borderRadius: 10 }, gateContent: { flex: 1, gap: 3 }, gateName: { color: "#1e293b", fontWeight: "700", fontSize: 13 }, gateNotes: { color: "#64748b", fontSize: 11, lineHeight: 16 },
  layer: { borderWidth: 1, borderColor: "#e2e8f0", padding: 10, borderRadius: 10, gap: 4 }, layerType: { color: "#1e293b", fontWeight: "700", textTransform: "capitalize" }, uri: { color: "#475569", fontSize: 11, lineHeight: 16 }, allowed: { color: "#166534", fontSize: 11, fontWeight: "700" }, notAllowed: { color: "#92400e", fontSize: 11, fontWeight: "700" }, emptyText: { color: "#64748b", lineHeight: 19 }, jsonScroll: { maxHeight: 260 }, json: { color: "#334155", fontSize: 11, lineHeight: 17, fontFamily: "Courier" }, reviewInput: { minHeight: 96, padding: 11, backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 10, color: "#0f172a" }, verifyButton: { flex: 1, backgroundColor: "#15803d", paddingVertical: 13, borderRadius: 10, alignItems: "center" }, rejectButton: { flex: 1, backgroundColor: "#ffffff", borderColor: "#fecaca", borderWidth: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center" }, rejectButtonText: { color: "#b91c1c", fontWeight: "800" },
});
