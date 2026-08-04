import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useMobileSession } from "../providers/MobileSessionProvider";
import { listGeoAiRuns, type GeoAnalysisRun } from "../services/api";

export function MobileHomeScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const runs = useQuery<GeoAnalysisRun[], Error>({ queryKey: ["geoai", "home-summary"], queryFn: () => listGeoAiRuns({ limit: 100 }, session.accessToken), enabled: Boolean(session.accessToken) });
  const summary = runs.data?.reduce((acc: { active: number; review: number; verified: number }, run: GeoAnalysisRun) => ({ ...acc, active: acc.active + (["queued", "running"].includes(run.status) ? 1 : 0), review: acc.review + (run.status === "awaiting_review" ? 1 : 0), verified: acc.verified + (run.evidenceStatus === "verified" ? 1 : 0) }), { active: 0, review: 0, verified: 0 }) ?? { active: 0, review: 0, verified: 0 };
  return <View style={styles.container}>
    <View style={styles.hero}><Text style={styles.greeting}>GeoAI Field Operations</Text><Text style={styles.description}>Collect and review evidence through the same server-enforced policy, provenance, and approval controls used by the wider platform.</Text></View>
    <View style={styles.metrics}><View style={styles.metric}><Text style={styles.metricValue}>{summary.active}</Text><Text style={styles.metricLabel}>Active runs</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{summary.review}</Text><Text style={styles.metricLabel}>Need review</Text></View><View style={styles.metric}><Text style={styles.metricValue}>{summary.verified}</Text><Text style={styles.metricLabel}>Verified</Text></View></View>
    <View style={styles.actions}><Pressable style={styles.primary} onPress={() => router.push("/(tabs)/geoai" as any)}><Text style={styles.primaryText}>Open GeoAI operations</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push("/(tabs)/field" as any)}><Text style={styles.secondaryText}>Capture field evidence</Text></Pressable><Pressable style={styles.secondary} onPress={() => router.push("/field/drafts" as any)}><Text style={styles.secondaryText}>Review offline drafts</Text></Pressable></View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 14 }, hero: { backgroundColor: "#1e3a8a", borderRadius: 16, padding: 18, gap: 7 }, greeting: { color: "#ffffff", fontSize: 22, fontWeight: "800" }, description: { color: "#dbeafe", fontSize: 13, lineHeight: 19 }, metrics: { flexDirection: "row", gap: 8 }, metric: { flex: 1, backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center", gap: 3 }, metricValue: { color: "#1d4ed8", fontSize: 22, fontWeight: "800" }, metricLabel: { color: "#64748b", fontSize: 11, textAlign: "center" }, actions: { gap: 10 }, primary: { backgroundColor: "#2563eb", borderRadius: 11, padding: 15, alignItems: "center" }, primaryText: { color: "#ffffff", fontWeight: "800" }, secondary: { backgroundColor: "#ffffff", borderColor: "#bfdbfe", borderWidth: 1, borderRadius: 11, padding: 15, alignItems: "center" }, secondaryText: { color: "#1d4ed8", fontWeight: "800" },
});
