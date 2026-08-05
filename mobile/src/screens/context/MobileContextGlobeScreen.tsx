import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as MapLibre from "@maplibre/maplibre-react-native";

import { AppScreen } from "../../components/AppScreen";
import {
  MobileMetricTile,
  MobilePageHeader,
  MobileSection,
  MobileStatusBanner,
  mobileExperienceStyles as ux,
} from "../../components/MobileExperiencePrimitives";
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

const WINDOW_OPTIONS: Array<{ hours: WindowHours; label: string; detail: string }> = [
  { hours: 1, label: "1h", detail: "Immediate" },
  { hours: 24, label: "24h", detail: "Today" },
  { hours: 168, label: "7d", detail: "Week" },
  { hours: 720, label: "30d", detail: "Month" },
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
  const onRefresh = async () => { await Promise.all([layerQuery.refetch(), contextQuery.refetch()]); };

  return (
    <AppScreen scroll refreshing={layerQuery.isRefetching || contextQuery.isRefetching} onRefresh={() => void onRefresh()}>
      <MobilePageHeader
        eyebrow="Governed public context"
        title="Context Globe"
        description="Read-only seismic and weather awareness for situational context. This screen cannot edit parcel records, evidence, transactions, or field observations."
      />
      <MobileStatusBanner tone="blue" icon="shield-checkmark-outline" title="Read-only, online-only context" description="Every event is delivered through an approved source and attribution path. Reconnect before relying on current conditions." />

      <MobileSection title="What you are viewing" description="Turn only approved layers on. Your preferences stay within this governed workspace.">
        {layerQuery.isLoading ? <View style={styles.loadingRow}><ActivityIndicator color="#1D4ED8" /><Text style={ux.muted}>Loading approved layer policy…</Text></View> : null}
        {layerQuery.isError ? <Text style={ux.error}>Layer preferences are unavailable. Pull down to reconnect and retry.</Text> : null}
        {(layerQuery.data ?? []).map((layer) => {
          const selected = selectedLayers.includes(layer.key);
          const weatherLayer = layer.key === "weather-alerts";
          return <Pressable key={layer.key} accessibilityRole="switch" accessibilityState={{ checked: selected }} onPress={() => void toggleLayer(layer)} style={({ pressed }) => [ux.choice, selected && ux.choiceSelected, pressed && styles.pressed]}><View style={[styles.layerIcon, { backgroundColor: weatherLayer ? "#FFF7ED" : "#FEF2F2" }]}><View style={[styles.layerDot, { backgroundColor: weatherLayer ? "#D97706" : "#DC2626" }]} /></View><View style={styles.choiceCopy}><Text style={ux.choiceTitle}>{layer.displayName}</Text><Text style={ux.choiceMeta}>{layer.description} · refreshes up to every {layer.refreshSeconds}s</Text></View><View style={[styles.toggle, selected && styles.toggleSelected]}><View style={[styles.toggleKnob, selected && styles.toggleKnobSelected]} /></View></Pressable>;
        })}
      </MobileSection>

      <MobileSection title="Time window" description="Choose a bounded view of approved public events.">
        <View style={styles.windowRow}>{WINDOW_OPTIONS.map((option) => <Pressable key={option.hours} accessibilityRole="button" accessibilityState={{ selected: hours === option.hours }} onPress={() => setHours(option.hours)} style={({ pressed }) => [styles.windowButton, hours === option.hours && styles.windowButtonSelected, pressed && styles.pressed]}><Text style={[styles.windowLabel, hours === option.hours && styles.windowLabelSelected]}>{option.label}</Text><Text style={[styles.windowDetail, hours === option.hours && styles.windowDetailSelected]}>{option.detail}</Text></Pressable>)}</View>
      </MobileSection>

      <View style={styles.mapCard}>
        <View style={styles.mapHeader}><View><Text style={styles.mapTitle}>Live contextual map</Text><Text style={styles.mapSubtitle}>{selectedLayers.length ? `${selectedLayers.length} approved layer${selectedLayers.length === 1 ? "" : "s"} shown` : "Choose an approved layer to request context"}</Text></View><View style={styles.mapLive}><View style={styles.liveDot} /><Text style={styles.mapLiveText}>{contextQuery.isFetching ? "Updating" : "Online"}</Text></View></View>
        <View style={styles.mapWrap}>
          <MapLibre.MapView style={styles.map} mapStyle={styleUrl()} logoEnabled attributionEnabled compassEnabled rotateEnabled pitchEnabled>
            <MapLibre.Camera centerCoordinate={[0, 20] as Position} zoomLevel={1.4} animationDuration={0} />
            <MapLibre.ShapeSource id="context-seismic" shape={seismic}><MapLibre.CircleLayer id="context-seismic-points" style={{ circleColor: "#DC2626", circleRadius: 6, circleStrokeColor: "#FFFFFF", circleStrokeWidth: 1.5 }} /></MapLibre.ShapeSource>
            <MapLibre.ShapeSource id="context-weather" shape={weather}><MapLibre.FillLayer id="context-weather-fill" style={{ fillColor: "#F59E0B", fillOpacity: 0.25 }} /><MapLibre.LineLayer id="context-weather-line" style={{ lineColor: "#D97706", lineWidth: 2 }} /><MapLibre.CircleLayer id="context-weather-points" style={{ circleColor: "#F59E0B", circleRadius: 5, circleStrokeColor: "#FFFFFF", circleStrokeWidth: 1.5 }} /></MapLibre.ShapeSource>
          </MapLibre.MapView>
          {contextQuery.isFetching ? <View style={styles.mapStatus}><ActivityIndicator size="small" color="#FFFFFF" /><Text style={styles.mapStatusText}>Requesting signed delivery…</Text></View> : null}
        </View>
      </View>

      <MobileSection title="Active observations" description={summary ? `Window: ${prettyTime(summary.windowStart)} to ${prettyTime(summary.windowEnd)}` : "Select an approved layer to request an online-only summary."}>
        {contextQuery.isError ? <MobileStatusBanner tone="red" icon="alert-circle-outline" title="Context delivery is unavailable" description={contextQuery.error.message || "Pull down to retry signed delivery."} /> : null}
        {summary ? <View style={styles.metricRow}>{summary.layers.map((layer) => <MobileMetricTile key={layer.layerKey} icon={layer.layerKey === "seismic" ? "pulse-outline" : "thunderstorm-outline"} label={layer.layerKey === "seismic" ? "Seismic events" : "Weather alerts"} value={layer.activeEvents} tone={layer.layerKey === "seismic" ? "red" : "amber"} />)}</View> : null}
        {!contextQuery.isFetching && !contextQuery.isError && selectedLayers.length > 0 && !observations.length ? <Text style={ux.muted}>No active approved public-context events were returned for this time window.</Text> : null}
        {observations.map((feature, index) => <View key={feature.id ?? `${feature.properties.layerKey}-${index}`} style={styles.observation}><View style={[styles.observationBar, { backgroundColor: feature.properties.layerKey === "seismic" ? "#DC2626" : "#D97706" }]} /><View style={styles.choiceCopy}><Text style={ux.choiceTitle}>{labelFor(feature)}</Text><Text style={ux.choiceMeta}>Observed {prettyTime(feature.properties.sourceObservedAt)}</Text>{feature.properties.severity ? <Text style={ux.choiceMeta}>Severity: {feature.properties.severity}{feature.properties.urgency ? ` · ${feature.properties.urgency}` : ""}</Text> : null}</View></View>)}
      </MobileSection>

      <MobileStatusBanner tone="amber" icon="information-circle-outline" title="Use context responsibly" description={`${summary?.offlinePolicy || "Context events remain online-only; no public-event package is retained by this client."} Follow applicable emergency, operational, survey, and land-record procedures.`} />
      <MobileSection title="Source attribution" description="Sources remain visible so users can understand the origin of contextual information.">
        {(layerQuery.data ?? []).filter((layer) => selectedLayers.includes(layer.key)).map((layer) => <Text key={layer.key} style={ux.muted}>{layer.displayName}: {layer.attribution}</Text>)}
      </MobileSection>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  choiceCopy: { flex: 1, minWidth: 0 },
  layerIcon: { width: 35, height: 35, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  layerDot: { width: 11, height: 11, borderRadius: 99 },
  toggle: { width: 38, height: 23, borderRadius: 99, backgroundColor: "#CBD5E1", padding: 3, justifyContent: "center" },
  toggleSelected: { backgroundColor: "#2563EB", alignItems: "flex-end" },
  toggleKnob: { width: 17, height: 17, borderRadius: 99, backgroundColor: "#FFFFFF" },
  toggleKnobSelected: { shadowColor: "#0F172A", shadowOpacity: 0.15, shadowRadius: 2, elevation: 2 },
  windowRow: { flexDirection: "row", gap: 7 },
  windowButton: { flex: 1, minHeight: 58, borderRadius: 13, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", gap: 1 },
  windowButtonSelected: { borderColor: "#93C5FD", backgroundColor: "#EFF6FF" },
  windowLabel: { color: "#334155", fontSize: 14, fontWeight: "900" },
  windowLabelSelected: { color: "#1D4ED8" },
  windowDetail: { color: "#94A3B8", fontSize: 10, fontWeight: "700" },
  windowDetailSelected: { color: "#2563EB" },
  mapCard: { marginHorizontal: 20, marginTop: 14, overflow: "hidden", borderRadius: 18, borderWidth: 1, borderColor: "#DCE5F0", backgroundColor: "#FFFFFF", shadowColor: "#0F172A", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  mapHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 15, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  mapTitle: { color: "#0F172A", fontSize: 16, fontWeight: "900" },
  mapSubtitle: { marginTop: 2, color: "#64748B", fontSize: 12 },
  mapLive: { flexDirection: "row", gap: 5, alignItems: "center", borderRadius: 99, backgroundColor: "#ECFDF5", paddingHorizontal: 8, paddingVertical: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: "#10B981" },
  mapLiveText: { color: "#047857", fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  mapWrap: { height: 360, backgroundColor: "#E2E8F0" },
  map: { flex: 1 },
  mapStatus: { position: "absolute", left: 12, bottom: 12, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, backgroundColor: "rgba(15,23,42,0.9)", paddingHorizontal: 10, paddingVertical: 7 },
  mapStatusText: { color: "#FFFFFF", fontWeight: "700", fontSize: 11 },
  metricRow: { flexDirection: "row", gap: 10 },
  observation: { flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 13, backgroundColor: "#FFFFFF" },
  observationBar: { width: 5 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
