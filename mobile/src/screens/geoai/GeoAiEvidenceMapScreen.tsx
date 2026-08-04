import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { getGeoAiPresentation } from "../../services/api";
import { GeoAiStatusBadge } from "../../components/GeoAiStatusBadge";

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function GeoAiEvidenceMapScreen() {
  const { runId: value } = useLocalSearchParams<{ runId: string }>();
  const runId = Number(value);
  const session = useMobileSession();
  const query = useQuery({
    queryKey: ["geoai", "presentation", runId],
    queryFn: () => getGeoAiPresentation(runId, session.accessToken),
    enabled: Number.isInteger(runId) && runId > 0 && Boolean(session.accessToken),
  });

  const observations = useMemo(() => (query.data?.provenance.sourceAssets ?? []).flatMap((asset) => {
    if (asset.assetType !== "field_observation" || asset.sourceCrs?.toUpperCase() !== "EPSG:4326") return [];
    const location = asset.provenance.location;
    if (!location || typeof location !== "object") return [];
    const latitude = numeric((location as Record<string, unknown>).latitude);
    const longitude = numeric((location as Record<string, unknown>).longitude);
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    return [{
      assetId: asset.assetId,
      latitude,
      longitude,
      acquiredAt: asset.acquiredAt,
      dataSource: asset.dataSource,
      checksum: asset.checksumSha256,
      accuracyM: numeric((location as Record<string, unknown>).accuracyM),
    }];
  }), [query.data]);

  const region: Region | null = observations.length ? {
    latitude: observations.reduce((sum, item) => sum + item.latitude, 0) / observations.length,
    longitude: observations.reduce((sum, item) => sum + item.longitude, 0) / observations.length,
    latitudeDelta: Math.max(0.004, Math.min(1, observations.length * 0.015)),
    longitudeDelta: Math.max(0.004, Math.min(1, observations.length * 0.015)),
  } : null;

  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  if (query.error) return <View style={styles.center}><Text style={styles.error}>{query.error.message}</Text></View>;
  if (!region) return <View style={styles.center}><Text style={styles.emptyTitle}>No mappable field observations</Text><Text style={styles.emptyText}>This run has no persisted EPSG:4326 field-observation provenance. The app will not invent a marker or substitute an unrelated map location.</Text></View>;

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={region}>
        {observations.map((observation) => <Marker key={observation.assetId} coordinate={{ latitude: observation.latitude, longitude: observation.longitude }} title="Field observation" description={`${observation.assetId}${observation.accuracyM !== null ? ` · accuracy ${observation.accuracyM.toFixed(1)} m` : ""}`} pinColor={query.data?.run.evidenceStatus === "verified" ? "green" : "orange"} />)}
      </MapView>
      <View style={styles.sheet}>
        <View style={styles.sheetTitleRow}><Text style={styles.sheetTitle}>{query.data?.run.title}</Text>{query.data ? <GeoAiStatusBadge value={query.data.run.evidenceStatus} evidence /> : null}</View>
        <Text style={styles.sheetText}>{observations.length} server-recorded field observation{observations.length === 1 ? "" : "s"}. Markers show captured provenance only; they do not establish a verified boundary or legal conclusion.</Text>
        {observations.map((observation) => <Text key={`${observation.assetId}-detail`} selectable style={styles.detail}>{observation.assetId} · {observation.latitude.toFixed(6)}, {observation.longitude.toFixed(6)} · checksum {observation.checksum ?? "not recorded"}</Text>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" }, map: { flex: 1 }, center: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center", padding: 26, gap: 10 }, error: { color: "#b91c1c", textAlign: "center" }, emptyTitle: { color: "#334155", fontSize: 18, fontWeight: "800" }, emptyText: { color: "#64748b", textAlign: "center", lineHeight: 20 },
  sheet: { backgroundColor: "#ffffff", borderTopWidth: 1, borderColor: "#e2e8f0", padding: 16, gap: 8 }, sheetTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }, sheetTitle: { flex: 1, color: "#0f172a", fontSize: 16, fontWeight: "800" }, sheetText: { color: "#475569", lineHeight: 19, fontSize: 13 }, detail: { color: "#64748b", fontSize: 11, lineHeight: 16 },
});
