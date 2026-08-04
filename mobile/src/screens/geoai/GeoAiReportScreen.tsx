import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { getGeoAiEvidenceReport } from "../../services/api";

export function GeoAiReportScreen() {
  const { runId: value } = useLocalSearchParams<{ runId: string }>();
  const runId = Number(value);
  const session = useMobileSession();
  const query = useQuery({
    queryKey: ["geoai", "report", runId],
    queryFn: () => getGeoAiEvidenceReport(runId, session.accessToken),
    enabled: Number.isInteger(runId) && runId > 0 && Boolean(session.accessToken),
  });

  if (!Number.isInteger(runId) || runId <= 0) return <View style={styles.center}><Text style={styles.error}>The report identifier is invalid.</Text></View>;
  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (query.error) return <View style={styles.center}><Text style={styles.error}>{query.error.message}</Text><Pressable onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.notice}><Text style={styles.noticeText}>This report preserves the evidence and uncertainty supplied by the server. It does not convert provisional output into a verified decision.</Text></View>
      <Text selectable style={styles.report}>{query.data?.markdown ?? "No evidence report is available for this run."}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#f8fafc", padding: 16, gap: 14, flexGrow: 1 },
  center: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  notice: { padding: 12, borderRadius: 10, backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a" },
  noticeText: { color: "#713f12", fontSize: 12, lineHeight: 18 },
  report: { color: "#1e293b", lineHeight: 21, fontSize: 14, backgroundColor: "#ffffff", padding: 15, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  error: { color: "#b91c1c", textAlign: "center" }, retry: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "#fee2e2" }, retryText: { color: "#b91c1c", fontWeight: "700" },
});
