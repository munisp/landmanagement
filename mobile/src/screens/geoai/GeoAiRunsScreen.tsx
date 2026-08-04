import React, { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { listGeoAiRuns, type GeoAnalysisRun } from "../../services/api";
import { GeoAiStatusBadge } from "../../components/GeoAiStatusBadge";

const activeStatuses = new Set(["queued", "running"]);

export function GeoAiRunsScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const query = useQuery<GeoAnalysisRun[], Error>({
    queryKey: ["geoai", "runs"],
    queryFn: () => listGeoAiRuns({ limit: 100 }, session.accessToken),
    enabled: Boolean(session.accessToken),
    refetchInterval: 8_000,
  });

  const headline = useMemo(() => {
    const runs = query.data ?? [];
    const active = runs.filter((run) => activeStatuses.has(run.status)).length;
    const review = runs.filter((run) => run.status === "awaiting_review").length;
    return { active, review };
  }, [query.data]);

  const openRun = async (run: GeoAnalysisRun) => {
    await Haptics.selectionAsync().catch(() => undefined);
    router.push(`/geoai/${run.id}` as any);
  };

  const renderRun = ({ item }: { item: GeoAnalysisRun }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open GeoAI run ${item.title}`}
      onPress={() => void openRun(item)}
      style={({ pressed }) => [styles.runCard, pressed && styles.pressed]}
    >
      <View style={styles.runTopline}>
        <View style={styles.titleBlock}>
          <Text style={styles.runTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.runMeta}>{item.analysisType.replace(/_/g, " ")} · {item.runKey}</Text>
        </View>
        <View style={styles.badges}>
          <GeoAiStatusBadge value={item.status} />
          <GeoAiStatusBadge value={item.evidenceStatus} evidence />
        </View>
      </View>
      <Text style={styles.purpose} numberOfLines={2}>{item.purpose}</Text>
      {item.failureReason ? <Text style={styles.failure}>{item.failureReason}</Text> : null}
      <Text style={styles.updated}>Updated {new Date(item.updatedAt).toLocaleString()}</Text>
    </Pressable>
  );

  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (query.error) return <View style={styles.center}><Text style={styles.error}>{query.error.message}</Text><Pressable style={styles.retry} onPress={() => void query.refetch()}><Text style={styles.retryText}>Retry</Text></Pressable></View>;

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>Evidence-gated GeoAI</Text>
          <Text style={styles.summaryText}>Results remain provisional until required checkpoints and an authorized review are recorded.</Text>
        </View>
        <View style={styles.summaryMetrics}>
          <Text style={styles.metricValue}>{headline.active}</Text><Text style={styles.metricLabel}>Active</Text>
          <Text style={styles.metricValue}>{headline.review}</Text><Text style={styles.metricLabel}>Review</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]} onPress={() => router.push("/geoai/create" as any)}>
          <Text style={styles.primaryActionText}>Create analysis</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]} onPress={() => router.push("/geoai/capture" as any)}>
          <Text style={styles.secondaryActionText}>Capture evidence</Text>
        </Pressable>
      </View>
      {(query.data?.length ?? 0) === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No GeoAI analysis runs</Text><Text style={styles.emptyText}>Capture evidence or create a policy-gated analysis to begin a reviewable workflow.</Text></View> : <FlatList<GeoAnalysisRun>
        data={query.data ?? []}
        renderItem={renderRun}
        keyExtractor={(item) => String(item.id)}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#f8fafc" },
  summaryCard: { backgroundColor: "#eff6ff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#bfdbfe", flexDirection: "row", gap: 12 },
  summaryCopy: { flex: 1, gap: 5 }, summaryTitle: { color: "#1e3a8a", fontWeight: "800", fontSize: 18 }, summaryText: { color: "#334155", lineHeight: 18, fontSize: 13 },
  summaryMetrics: { flexDirection: "row", alignItems: "center", gap: 8 }, metricValue: { fontSize: 20, fontWeight: "800", color: "#1d4ed8", textAlign: "center" }, metricLabel: { fontSize: 10, color: "#475569", marginRight: 2 },
  actions: { flexDirection: "row", gap: 10 }, primaryAction: { flex: 1, backgroundColor: "#2563eb", padding: 13, borderRadius: 10, alignItems: "center" }, secondaryAction: { flex: 1, backgroundColor: "#ffffff", borderColor: "#bfdbfe", borderWidth: 1, padding: 13, borderRadius: 10, alignItems: "center" }, primaryActionText: { color: "#ffffff", fontWeight: "700" }, secondaryActionText: { color: "#1d4ed8", fontWeight: "700" },
  list: { gap: 10, paddingBottom: 28 }, emptyList: { flexGrow: 1 }, runCard: { backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", padding: 14, gap: 9 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  runTopline: { flexDirection: "row", gap: 10 }, titleBlock: { flex: 1, gap: 4 }, runTitle: { color: "#0f172a", fontSize: 16, fontWeight: "700" }, runMeta: { color: "#64748b", fontSize: 11, textTransform: "capitalize" }, badges: { alignItems: "flex-end", gap: 5 }, purpose: { color: "#475569", fontSize: 13, lineHeight: 18 }, failure: { color: "#b91c1c", fontSize: 12, lineHeight: 17 }, updated: { color: "#94a3b8", fontSize: 11 },
  empty: { alignItems: "center", justifyContent: "center", flex: 1, paddingHorizontal: 28, gap: 8 }, emptyTitle: { color: "#334155", fontSize: 18, fontWeight: "700" }, emptyText: { color: "#64748b", textAlign: "center", lineHeight: 20 }, error: { color: "#b91c1c", textAlign: "center" }, retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "#fee2e2" }, retryText: { color: "#b91c1c", fontWeight: "700" },
});
