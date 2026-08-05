import React from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppScreen } from "../../components/AppScreen";
import { GeoAiStatusBadge } from "../../components/GeoAiStatusBadge";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { clearMobileEvidenceCache, getMobileParcelEvidence } from "../../services/api";

function parseParcelId(value: string | string[] | undefined): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function MobileParcelEvidenceScreen() {
  const { parcelId: rawParcelId } = useLocalSearchParams<{ parcelId: string }>();
  const parcelId = parseParcelId(rawParcelId);
  const session = useMobileSession();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["geospatial-delivery", "mobile-evidence", parcelId],
    queryFn: () => getMobileParcelEvidence(parcelId as number, session.accessToken),
    enabled: Boolean(parcelId && session.accessToken),
    staleTime: 5 * 60 * 1000,
  });

  if (!parcelId) return <View style={styles.center}><Text style={styles.error}>The requested parcel identifier is invalid.</Text></View>;
  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /><Text style={styles.muted}>Loading governed parcel evidence…</Text></View>;
  if (query.error) return <View style={styles.center}><Text style={styles.error}>{query.error.message}</Text><Pressable onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryText}>Retry securely</Text></Pressable></View>;

  const result = query.data;
  if (!result) return <View style={styles.center}><Text style={styles.error}>The governed evidence manifest was unavailable.</Text></View>;
  const expiresAt = new Date(result.expiresAt);
  const isCached = result.source === "secure_cache";

  const clearCache = async () => {
    await clearMobileEvidenceCache(parcelId);
    await queryClient.invalidateQueries({ queryKey: ["geospatial-delivery", "mobile-evidence", parcelId] });
    Alert.alert("Offline evidence cleared", "This device no longer retains a local parcel-evidence manifest.");
  };

  return (
    <AppScreen scroll>
      <View style={[styles.banner, isCached ? styles.cacheBanner : styles.networkBanner]}>
        <Text style={styles.bannerTitle}>{isCached ? "Encrypted offline evidence copy" : "Live governed evidence manifest"}</Text>
        <Text style={styles.bannerText}>{isCached ? `This device is showing only an unexpired encrypted metadata cache. It expires ${expiresAt.toLocaleString()} and contains no delivery capability or raw asset URI.` : "This manifest was scoped to the signed-in user and parcel by the platform policy gateway. It has been written to encrypted local storage for limited offline review."}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Parcel {parcelId} evidence posture</Text>
        <Text style={styles.subtitle}>Generated {new Date(result.manifest.generatedAt).toLocaleString()} · {result.manifest.evidence.length} non-rejected evidence asset{result.manifest.evidence.length === 1 ? "" : "s"}</Text>
        <Text style={styles.warning}>This screen does not store a service capability, asset URI, inferred boundary, or legal conclusion. It is an evidence-provenance view only.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Authorized asset provenance</Text>
        {result.manifest.evidence.length ? result.manifest.evidence.map((asset) => (
          <View key={asset.assetId} style={styles.asset}>
            <View style={styles.assetHeading}><View style={styles.assetCopy}><Text style={styles.assetId}>{asset.assetId}</Text><Text style={styles.assetMeta}>{asset.assetType.replace(/_/g, " ")} · {asset.acquiredAt ? new Date(asset.acquiredAt).toLocaleDateString() : "acquisition time not recorded"}</Text></View><GeoAiStatusBadge value={asset.evidenceStatus} evidence /></View>
            <Text selectable style={styles.detail}>Checksum: {asset.checksumSha256 ?? "not recorded"}</Text>
            <Text style={styles.detail}>CRS: {asset.sourceCrs ?? "not recorded"}{asset.verticalCrs ? ` · vertical ${asset.verticalCrs}` : ""}</Text>
          </View>
        )) : <Text style={styles.muted}>No active, non-rejected evidence asset was returned for this parcel scope.</Text>}
      </View>

      <Pressable onPress={() => router.push(`/geoai/map/${parcelId}`)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Open governed MapLibre field map</Text></Pressable>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Operational limitations</Text>
        {result.manifest.limitations.map((limitation) => <Text key={limitation} style={styles.limitation}>• {limitation}</Text>)}
      </View>

      {isCached ? <Pressable onPress={() => void query.refetch()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Revalidate with platform</Text></Pressable> : null}
      <Pressable onPress={() => void clearCache()} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}><Text style={styles.secondaryText}>Clear offline evidence copy</Text></Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", padding: 24, gap: 12 },
  error: { color: "#b91c1c", textAlign: "center", lineHeight: 20 }, muted: { color: "#64748b", textAlign: "center", lineHeight: 19 },
  retry: { backgroundColor: "#fee2e2", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 }, retryText: { color: "#b91c1c", fontWeight: "800" },
  banner: { borderRadius: 14, padding: 15, gap: 6 }, cacheBanner: { backgroundColor: "#fffbeb", borderColor: "#fde68a", borderWidth: 1 }, networkBanner: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1 },
  bannerTitle: { color: "#0f172a", fontSize: 16, fontWeight: "800" }, bannerText: { color: "#334155", fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: "#fff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 15, gap: 9 }, title: { color: "#0f172a", fontSize: 21, fontWeight: "800" }, subtitle: { color: "#64748b", fontSize: 12, lineHeight: 17 }, warning: { color: "#92400e", fontSize: 12, lineHeight: 18 }, sectionTitle: { color: "#0f172a", fontSize: 16, fontWeight: "800" },
  asset: { borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 10, padding: 11, gap: 5 }, assetHeading: { flexDirection: "row", justifyContent: "space-between", gap: 8 }, assetCopy: { flex: 1, gap: 3 }, assetId: { color: "#1e293b", fontWeight: "800", fontSize: 13 }, assetMeta: { color: "#64748b", fontSize: 11, textTransform: "capitalize" }, detail: { color: "#475569", fontSize: 11, lineHeight: 16 }, limitation: { color: "#475569", fontSize: 12, lineHeight: 18 },
  primary: { backgroundColor: "#2563eb", padding: 13, borderRadius: 10, alignItems: "center" }, primaryText: { color: "#fff", fontWeight: "800" }, secondary: { backgroundColor: "#fff", borderColor: "#cbd5e1", borderWidth: 1, padding: 13, borderRadius: 10, alignItems: "center" }, secondaryText: { color: "#334155", fontWeight: "800" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
