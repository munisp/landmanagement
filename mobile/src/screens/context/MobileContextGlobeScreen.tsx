import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as MapLibre from "@maplibre/maplibre-react-native";

import { AppScreen } from "../../components/AppScreen";
import { getApiBaseUrl } from "../../lib/runtimeConfig";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import {
  getMobileContextGlobe,
  trpcMutation,
  trpcQuery,
  type MobileContextGlobeFeature,
  type MobileContextGlobeLayerSummary,
} from "../../services/api";

type ContextLayer = {
  key: MobileContextGlobeLayerSummary["layerKey"];
  displayName: string;
  description: string;
  attribution: string;
  refreshSeconds: number;
  userEnabled: boolean;
};

type WindowHours = 1 | 24 | 168 | 720;
type Position = [number, number];

const WINDOW_OPTIONS: Array<{ hours: WindowHours; label: string }> = [
  { hours: 1, label: "1h" },
  { hours: 24, label: "24h" },
  { hours: 168, label: "7d" },
  { hours: 720, label: "30d" },
];

function styleUrl(): string { return `${getApiBaseUrl()}/geospatial-delivery/basemap/style.json`; }
function timeWindow(hours: WindowHours) { const end = new Date(); return { start: new Date(end.getTime() - hours * 60 * 60 * 1000).toISOString(), end: end.toISOString() }; }
function asCollection(features: MobileContextGlobeFeature[]): GeoJSON.FeatureCollection { return { type: "FeatureCollection", features }; }
function labelFor(feature: MobileContextGlobeFeature) { return feature.properties.layerKey === "seismic" ? `M${typeof feature.properties.mag === "number" ? feature.properties.mag.toFixed(1) : "?"} · ${feature.properties.place || "Earthquake"}` : feature.properties.headline || feature.properties.event || "Weather alert"; }
function prettyTime(value?: string) { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Time unavailable"; }

export function MobileContextGlobeScreen() {
  const session = useMobileSession();
  const [hours, setHours] = useState<WindowHours>(24);
  const [enabledLayers, setEnabledLayers] = useState<MobileContextGlobeLayerSummary["layerKey"][]>([]);
  const layerQuery = useQuery({
    queryKey: ["mobile-context-globe-layers"],
    queryFn: () => trpcQuery<ContextLayer[]>("contextGlobe.listLayers", undefined, session.accessToken),
    enabled: Boolean(session.accessToken),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!layerQuery.data) return;
    setEnabledLayers((current) => current.length ? current : layerQuery.data.filter((layer) => layer.userEnabled).map((layer) => layer.key));
  }, [layerQuery.data]);

  const window = useMemo(() => timeWindow(hours), [hours]);
  const selectedLayers = useMemo(() => [...new Set(enabledLayers)].sort() as MobileContextGlobeLayerSummary["layerKey"][], [enabledLayers]);
  const contextQuery = useQuery({
    queryKey: ["mobile-context-globe", selectedLayers.join(","), window.start, window.end],
    queryFn: () => getMobileContextGlobe({ layerKeys: selectedLayers, ...window }, session.accessToken),
    enabled: Boolean(session.accessToken && selectedLayers.length),
    retry: 1,
    staleTime: 20_000,
  });

  const seismic = useMemo(() => asCollection((contextQuery.data?.features ?? []).filter((feature) => feature.properties.layerKey === "seismic")), [contextQuery.data?.features]);
  const weather = useMemo(() => asCollection((contextQuery.data?.features ?? []).filter((feature) => feature.properties.layerKey === "weather-alerts")), [contextQuery.data?.features]);
  const observations = contextQuery.data?.features.slice(0, 8) ?? [];

  const toggleLayer = async (layer: ContextLayer) => {
    const enabled = !selectedLayers.includes(layer.key);
    setEnabledLayers((current) => enabled ? [...new Set([...current, layer.key])] : current.filter((key) => key !== layer.key));
    try {
      await trpcMutation("contextGlobe.setLayerEnabled", { layerKey: layer.key, enabled }, session.accessToken);
      await layerQuery.refetch();
    } catch {
      setEnabledLayers((current) => enabled ? current.filter((key) => key !== layer.key) : [...new Set([...current, layer.key])]);
    }
  };

  const summary = contextQuery.data?.summary;
  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>GOVERNED PUBLIC CONTEXT</Text>
        <Text style={styles.title}>Context Globe</Text>
        <Text style={styles.subtitle}>Live, read-only seismic and weather awareness. This screen cannot edit parcel records, evidence, transactions, or field observations.</Text>
      </View>

      <View style={styles.controlCard}>
        <Text style={styles.section}>Approved layers</Text>
        {layerQuery.isLoading ? <View style={styles.loadingRow}><ActivityIndicator color="#0369a1" /><Text style={styles.muted}>Loading layer policy…</Text></View> : null}
        {layerQuery.isError ? <Text style={styles.error}>Layer preferences are unavailable. Reconnect and retry.</Text> : null}
        {(layerQuery.data ?? []).map((layer) => {
          const selected = selectedLayers.includes(layer.key);
          return <Pressable key={layer.key} onPress={() => void toggleLayer(layer)} style={({ pressed }) => [styles.layerRow, selected && styles.layerRowSelected, pressed && styles.pressed]} accessibilityRole="switch" accessibilityState={{ checked: selected }}><View style={[styles.layerDot, { backgroundColor: layer.key === "seismic" ? "#dc2626" : "#d97706" }]} /><View style={styles.layerText}><Text style={styles.layerName}>{layer.displayName}</Text><Text style={styles.layerDetail}>Refreshes up to every {layer.refreshSeconds}s</Text></View><Text style={[styles.layerState, selected && styles.layerStateSelected]}>{selected ? "Shown" : "Hidden"}</Text></Pressable>;
        })}
        <Text style={[styles.section, styles.windowHeading]}>Time window</Text>
        <View style={styles.windowRow}>{WINDOW_OPTIONS.map((option) => <Pressable key={option.hours} onPress={() => setHours(option.hours)} style={({ pressed }) => [styles.windowButton, hours === option.hours && styles.windowButtonActive, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: hours === option.hours }}><Text style={[styles.windowText, hours === option.hours && styles.windowTextActive]}>{option.label}</Text></Pressable>)}</View>
      </View>

      <View style={styles.mapWrap}>
        <MapLibre.MapView style={styles.map} mapStyle={styleUrl()} logoEnabled attributionEnabled compassEnabled rotateEnabled pitchEnabled>
          <MapLibre.Camera centerCoordinate={[0, 20] as Position} zoomLevel={1.4} animationDuration={0} />
          <MapLibre.ShapeSource id="context-seismic" shape={seismic}><MapLibre.CircleLayer id="context-seismic-points" style={{ circleColor: "#dc2626", circleRadius: 6, circleStrokeColor: "#ffffff", circleStrokeWidth: 1.5 }} /></MapLibre.ShapeSource>
          <MapLibre.ShapeSource id="context-weather" shape={weather}><MapLibre.FillLayer id="context-weather-fill" style={{ fillColor: "#f59e0b", fillOpacity: 0.25 }} /><MapLibre.LineLayer id="context-weather-line" style={{ lineColor: "#d97706", lineWidth: 2 }} /><MapLibre.CircleLayer id="context-weather-points" style={{ circleColor: "#f59e0b", circleRadius: 5, circleStrokeColor: "#ffffff", circleStrokeWidth: 1.5 }} /></MapLibre.ShapeSource>
        </MapLibre.MapView>
        {contextQuery.isFetching ? <View style={styles.mapStatus}><ActivityIndicator size="small" color="#ffffff" /><Text style={styles.mapStatusText}>Requesting signed delivery…</Text></View> : null}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.section}>Active observations</Text>
        {!selectedLayers.length ? <Text style={styles.muted}>Select an approved layer to request an online-only summary.</Text> : null}
        {contextQuery.isError ? <><Text style={styles.error}>{contextQuery.error.message || "Context delivery is unavailable."}</Text><Pressable onPress={() => void contextQuery.refetch()} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}><Text style={styles.retryText}>Retry securely</Text></Pressable></> : null}
        {summary ? <><View style={styles.countRow}>{summary.layers.map((layer) => <View key={layer.layerKey} style={styles.countPill}><Text style={styles.countNumber}>{layer.activeEvents}</Text><Text style={styles.countLabel}>{layer.layerKey === "seismic" ? "seismic" : "weather"}</Text></View>)}</View><Text style={styles.muted}>Window: {prettyTime(summary.windowStart)} to {prettyTime(summary.windowEnd)}</Text></> : null}
        {!contextQuery.isFetching && !contextQuery.isError && selectedLayers.length > 0 && !observations.length ? <Text style={styles.muted}>No active approved public-context events were returned for this window.</Text> : null}
        {observations.map((feature, index) => <View key={feature.id ?? `${feature.properties.layerKey}-${index}`} style={styles.observation}><View style={[styles.observationBar, { backgroundColor: feature.properties.layerKey === "seismic" ? "#dc2626" : "#d97706" }]} /><View style={styles.observationText}><Text style={styles.observationTitle}>{labelFor(feature)}</Text><Text style={styles.observationMeta}>Observed {prettyTime(feature.properties.sourceObservedAt)}</Text>{feature.properties.severity ? <Text style={styles.observationMeta}>Severity: {feature.properties.severity}{feature.properties.urgency ? ` · ${feature.properties.urgency}` : ""}</Text> : null}</View></View>)}
      </View>

      <View style={styles.notice}><Text style={styles.noticeTitle}>Online-only public context</Text><Text style={styles.noticeText}>{summary?.offlinePolicy || "Context events remain online-only; no public-event package is retained by this client."} Reconnect before relying on current conditions, and follow applicable emergency, operational, survey, and land-record procedures.</Text></View>
      <View style={styles.attribution}><Text style={styles.attributionTitle}>Attribution</Text>{(layerQuery.data ?? []).filter((layer) => selectedLayers.includes(layer.key)).map((layer) => <Text key={layer.key} style={styles.attributionText}>{layer.displayName}: {layer.attribution}</Text>)}</View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 14, gap: 6 }, eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: "800", color: "#0369a1" }, title: { fontSize: 28, lineHeight: 34, fontWeight: "900", color: "#0f172a" }, subtitle: { fontSize: 14, lineHeight: 21, color: "#475569" }, controlCard: { margin: 16, marginBottom: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 14, backgroundColor: "#ffffff", padding: 14, gap: 10 }, section: { fontSize: 16, fontWeight: "800", color: "#0f172a" }, loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 }, muted: { fontSize: 13, lineHeight: 19, color: "#475569" }, error: { fontSize: 13, lineHeight: 19, color: "#b91c1c" }, layerRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 11, padding: 11, gap: 10 }, layerRowSelected: { borderColor: "#7dd3fc", backgroundColor: "#f0f9ff" }, layerDot: { width: 10, height: 10, borderRadius: 5 }, layerText: { flex: 1, gap: 2 }, layerName: { color: "#0f172a", fontSize: 14, fontWeight: "800" }, layerDetail: { color: "#64748b", fontSize: 11 }, layerState: { color: "#64748b", fontSize: 11, fontWeight: "800", textTransform: "uppercase" }, layerStateSelected: { color: "#0369a1" }, windowHeading: { marginTop: 4 }, windowRow: { flexDirection: "row", gap: 8 }, windowButton: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 9, paddingVertical: 9 }, windowButtonActive: { backgroundColor: "#0369a1", borderColor: "#0369a1" }, windowText: { color: "#334155", fontWeight: "800", fontSize: 12 }, windowTextActive: { color: "#ffffff" }, pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] }, mapWrap: { height: 420, marginHorizontal: 16, overflow: "hidden", borderRadius: 14, borderColor: "#cbd5e1", borderWidth: 1, backgroundColor: "#e2e8f0" }, map: { flex: 1 }, mapStatus: { position: "absolute", left: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, backgroundColor: "rgba(15,23,42,0.9)", paddingHorizontal: 10, paddingVertical: 7 }, mapStatusText: { color: "#ffffff", fontWeight: "700", fontSize: 11 }, summaryCard: { margin: 16, marginBottom: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 14, backgroundColor: "#ffffff", padding: 14, gap: 10 }, countRow: { flexDirection: "row", gap: 8 }, countPill: { minWidth: 100, borderRadius: 10, backgroundColor: "#f1f5f9", padding: 10, gap: 1 }, countNumber: { color: "#0f172a", fontSize: 20, fontWeight: "900" }, countLabel: { color: "#475569", fontSize: 11, fontWeight: "700", textTransform: "uppercase" }, retryButton: { alignItems: "center", borderWidth: 1, borderColor: "#93c5fd", borderRadius: 9, padding: 11 }, retryText: { color: "#075985", fontWeight: "800" }, observation: { flexDirection: "row", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" }, observationBar: { width: 5 }, observationText: { flex: 1, padding: 10, gap: 3 }, observationTitle: { color: "#0f172a", fontSize: 13, lineHeight: 18, fontWeight: "800" }, observationMeta: { color: "#64748b", fontSize: 11, lineHeight: 16 }, notice: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: "#fde68a", borderRadius: 12, backgroundColor: "#fffbeb", padding: 13, gap: 5 }, noticeTitle: { color: "#92400e", fontSize: 13, fontWeight: "900" }, noticeText: { color: "#92400e", fontSize: 12, lineHeight: 18 }, attribution: { marginHorizontal: 16, marginBottom: 24, borderTopWidth: 1, borderColor: "#e2e8f0", paddingTop: 12, gap: 3 }, attributionTitle: { color: "#0f172a", fontSize: 13, fontWeight: "800" }, attributionText: { color: "#64748b", fontSize: 12, lineHeight: 17 },
});
