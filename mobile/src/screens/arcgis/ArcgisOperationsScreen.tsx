import React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { listGeoAiArcgisOperations, type GeoArcgisOperation } from "../../services/api";
import { GeoAiStatusBadge } from "../../components/GeoAiStatusBadge";

export function ArcgisOperationsScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const query = useQuery<GeoArcgisOperation[], Error>({
    queryKey: ["geoai", "arcgis-operations"],
    queryFn: () => listGeoAiArcgisOperations(100, session.accessToken),
    enabled: Boolean(session.accessToken),
    refetchInterval: 10_000,
  });

  const renderItem = ({ item }: { item: GeoArcgisOperation }) => <Pressable onPress={() => router.push(`/arcgis/${item.id}` as any)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.heading}><View style={styles.copy}><Text style={styles.title}>{item.operationType.replace(/_/g, " ")}</Text><Text style={styles.meta}>{item.operationKey}</Text></View><GeoAiStatusBadge value={item.status} /></View>
    <Text numberOfLines={1} selectable style={styles.uri}>{item.targetWorkspaceUri}</Text>
    <Text style={styles.meta}>Requested {new Date(item.createdAt).toLocaleString()}{item.runId ? ` · GeoAI run ${item.runId}` : ""}</Text>
    {item.failureReason ? <Text style={styles.failure}>{item.failureReason}</Text> : null}
  </Pressable>;

  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (query.error) return <View style={styles.center}><Text style={styles.error}>{query.error.message}</Text><Pressable onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View>;

  return <View style={styles.container}>
    <View style={styles.notice}><Text style={styles.noticeTitle}>Guarded operational status</Text><Text style={styles.noticeText}>Operations begin as reviewable requests. Server authorization, a persisted recovery plan, approval, and a separate execution confirmation remain mandatory before the configured control plane can be contacted.</Text></View>
    <Pressable onPress={() => router.push("/arcgis/request" as any)} style={({ pressed }) => [styles.requestButton, pressed && styles.pressed]}><Text style={styles.requestText}>Request guarded ArcGIS operation</Text></Pressable>
    {(query.data?.length ?? 0) === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No ArcGIS operation requests</Text><Text style={styles.emptyText}>Authorized operations requested for GeoAI workflows will appear here with their server-reported status.</Text></View> : <FlatList<GeoArcgisOperation> data={query.data ?? []} renderItem={renderItem} keyExtractor={(item) => String(item.id)} refreshing={query.isFetching} onRefresh={() => void query.refetch()} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 16, gap: 12 }, center: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", gap: 12, padding: 26 },
  notice: { backgroundColor: "#fffbeb", borderColor: "#fde68a", borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 }, noticeTitle: { color: "#713f12", fontWeight: "800" }, noticeText: { color: "#854d0e", fontSize: 12, lineHeight: 18 },
  list: { gap: 10, paddingBottom: 30 }, emptyList: { flexGrow: 1 }, empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 7 }, emptyTitle: { color: "#334155", fontSize: 18, fontWeight: "800" }, emptyText: { color: "#64748b", textAlign: "center", lineHeight: 20 },
  requestButton: { backgroundColor: "#1d4ed8", borderRadius: 10, paddingVertical: 13, alignItems: "center" }, requestText: { color: "#ffffff", fontWeight: "800" },
  card: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 13, padding: 13, gap: 7 }, heading: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, copy: { flex: 1, gap: 3 }, title: { color: "#0f172a", fontSize: 15, fontWeight: "800", textTransform: "capitalize" }, meta: { color: "#64748b", fontSize: 11, lineHeight: 16 }, uri: { color: "#475569", fontSize: 11 }, failure: { color: "#b91c1c", fontSize: 12, lineHeight: 17 },
  error: { color: "#b91c1c", textAlign: "center" }, retry: { backgroundColor: "#fee2e2", padding: 10, borderRadius: 8 }, retryText: { color: "#b91c1c", fontWeight: "800" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
