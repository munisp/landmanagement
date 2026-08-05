import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMobileSession } from "../providers/MobileSessionProvider";
import {
  acknowledgeGeoInnovationAlert,
  approveGeoInnovationRelease,
  createGeoInnovationMonitor,
  getGeoInnovationParcelFeatures,
  listGeoInnovationAlerts,
  listGeoInnovationCollections,
  listGeoInnovationMonitors,
  listGeoInnovationReleases,
  publishGeoInnovationRelease,
  revokeGeoInnovationRelease,
  setGeoInnovationMonitorStatus,
  type GeoChangeAlert,
  type GeoMonitor,
  type GeoPublicRelease,
} from "../services/api";
import { GeoAiStatusBadge } from "../components/GeoAiStatusBadge";

const monitorOptions: Array<GeoMonitor["innovationType"]> = ["change_vectorization", "hazard_profile", "field_geofence", "zonal_statistics"];

function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }

export function GeoInnovationScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const queryClient = useQueryClient();
  const [monitorType, setMonitorType] = useState<GeoMonitor["innovationType"]>("change_vectorization");
  const [parcelId, setParcelId] = useState("");
  const [scheduleHint, setScheduleHint] = useState("manual-authorized-trigger");
  const [settingsJson, setSettingsJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  const enabled = Boolean(session.accessToken);
  const catalog = useQuery({ queryKey: ["geo-innovations", "catalog"], queryFn: () => listGeoInnovationCollections(session.accessToken), enabled });
  const monitors = useQuery({ queryKey: ["geo-innovations", "monitors"], queryFn: () => listGeoInnovationMonitors({}, session.accessToken), enabled, refetchInterval: 15_000 });
  const alerts = useQuery({ queryKey: ["geo-innovations", "alerts"], queryFn: () => listGeoInnovationAlerts({ limit: 100 }, session.accessToken), enabled, refetchInterval: 12_000 });
  const releases = useQuery({ queryKey: ["geo-innovations", "releases"], queryFn: () => listGeoInnovationReleases({ limit: 100 }, session.accessToken), enabled });
  const features = useQuery({ queryKey: ["geo-innovations", "features"], queryFn: () => getGeoInnovationParcelFeatures({ limit: 20 }, session.accessToken), enabled });
  const refresh = () => Promise.all([catalog.refetch(), monitors.refetch(), alerts.refetch(), releases.refetch(), features.refetch()]);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["geo-innovations"] });

  const createMonitor = useMutation({
    mutationFn: (input: Parameters<typeof createGeoInnovationMonitor>[0]) => createGeoInnovationMonitor(input, session.accessToken),
    onSuccess: () => { setError(null); void invalidate(); },
    onError: (reason: Error) => setError(reason.message),
  });
  const updateMonitor = useMutation({ mutationFn: ({ id, status }: { id: number; status: GeoMonitor["status"] }) => setGeoInnovationMonitorStatus(id, status, session.accessToken), onSuccess: invalidate, onError: (reason: Error) => setError(reason.message) });
  const triageAlert = useMutation({ mutationFn: (id: number) => acknowledgeGeoInnovationAlert(id, "investigating", session.accessToken), onSuccess: invalidate, onError: (reason: Error) => setError(reason.message) });
  const approveRelease = useMutation({ mutationFn: (id: number) => approveGeoInnovationRelease(id, session.accessToken), onSuccess: invalidate, onError: (reason: Error) => setError(reason.message) });
  const publishRelease = useMutation({ mutationFn: (id: number) => publishGeoInnovationRelease(id, session.accessToken), onSuccess: invalidate, onError: (reason: Error) => setError(reason.message) });
  const revokeRelease = useMutation({ mutationFn: (id: number) => revokeGeoInnovationRelease(id, session.accessToken), onSuccess: invalidate, onError: (reason: Error) => setError(reason.message) });

  const overview = useMemo(() => ({
    monitors: (monitors.data ?? []).filter((item) => item.status === "active").length,
    alerts: (alerts.data ?? []).filter((item) => ["open", "acknowledged", "investigating"].includes(item.status)).length,
    features: features.data?.numberReturned ?? 0,
  }), [monitors.data, alerts.data, features.data]);

  const submitMonitor = () => {
    try {
      const parsedParcelId = parcelId.trim() ? Number(parcelId) : undefined;
      if (parsedParcelId !== undefined && (!Number.isInteger(parsedParcelId) || parsedParcelId <= 0)) throw new Error("Parcel ID must be a positive whole number");
      const settings = JSON.parse(settingsJson) as Record<string, unknown>;
      createMonitor.mutate({ parcelId: parsedParcelId, innovationType: monitorType, scheduleHint: scheduleHint.trim(), settings });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Monitor settings must be valid JSON"); }
  };

  if (!enabled) return <View style={styles.center}><Text style={styles.error}>Sign in is required to access governed geospatial innovation workflows.</Text></View>;
  if (catalog.isLoading && monitors.isLoading && alerts.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;

  return <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={catalog.isFetching || monitors.isFetching || alerts.isFetching} onRefresh={() => void refresh()} />}>
    <View style={styles.hero}><Text style={styles.eyebrow}>GOVERNED GEOSPATIAL INTELLIGENCE</Text><Text style={styles.title}>Innovation Hub</Text><Text style={styles.subtitle}>Quality, hazards, imagery, catalog, monitoring, field provenance, zonal statistics, and privacy releases are evidence-gated. None creates an automatic legal or regulatory decision.</Text></View>
    {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><Pressable onPress={() => setError(null)}><Text style={styles.dismiss}>Dismiss</Text></Pressable></View> : null}
    <View style={styles.metrics}><Metric label="Active monitors" value={overview.monitors} /><Metric label="Alerts to review" value={overview.alerts} /><Metric label="Protected features" value={overview.features} /></View>
    <Pressable style={styles.primaryButton} onPress={() => router.push("/geoai/create" as any)}><Text style={styles.primaryText}>Create a policy-gated innovation run</Text></Pressable>

    <Section title="Innovation portfolio" subtitle="The native app reuses the published analysis workflow; select real assets and declared method parameters in the GeoAI composer.">
      {["Spatial evidence quality", "Multi-hazard profile", "COG readiness", "STAC catalog", "OGC feature discovery", "Change vectorization", "Accessibility equity", "Field geofence", "Zonal statistics", "Privacy release"].map((item, index) => <View key={item} style={styles.portfolioRow}><Text style={styles.number}>{String(index + 1).padStart(2, "0")}</Text><Text style={styles.portfolioText}>{item}</Text></View>)}
    </Section>

    <Section title="Protected feature discovery" subtitle="The server returns only persisted geometry/reference points and non-sensitive metadata. A feature is never represented as a certified survey, title, or legal boundary.">
      <Text style={styles.muted}>{features.data?.numberReturned ?? 0} protected parcel features returned by the current server-scoped query.</Text>
      {(features.data?.features ?? []).slice(0, 3).map((feature) => <View key={feature.id} style={styles.listCard}><Text style={styles.cardTitle}>{feature.id}</Text><Text style={styles.cardMeta}>{String(feature.properties.state ?? "Unknown location")} · {String(feature.properties.status ?? "Unknown status")}</Text><Text style={styles.cardMeta}>{String(feature.properties.geometry_representation ?? "persisted geometry")}</Text></View>)}
    </Section>

    <Section title="STAC-compatible catalog" subtitle="Collections expose governed metadata and internal discoverability. Asset use remains controlled by the GeoAI evidence policy.">
      {(catalog.data ?? []).length ? catalog.data!.map((collection) => <View key={collection.id} style={styles.listCard}><Text style={styles.cardTitle}>{collection.title}</Text><Text style={styles.cardMeta}>{collection.collectionKey} · {collection.license}</Text><Text style={styles.cardBody}>{collection.description}</Text></View>) : <Text style={styles.muted}>No catalog collections are registered yet.</Text>}
    </Section>

    <Section title="Evidence monitors" subtitle="A monitor stores approved settings and an audit trail. It does not synthesize data or bypass Temporal, source-asset, or policy gates.">
      <Text style={styles.label}>Monitor type</Text><View style={styles.chips}>{monitorOptions.map((option) => <Pressable key={option} onPress={() => setMonitorType(option)} style={[styles.chip, monitorType === option && styles.chipSelected]}><Text style={[styles.chipText, monitorType === option && styles.chipTextSelected]}>{titleCase(option)}</Text></Pressable>)}</View>
      <TextInput value={parcelId} onChangeText={setParcelId} style={styles.input} placeholder="Parcel ID (optional)" keyboardType="numeric" /><TextInput value={scheduleHint} onChangeText={setScheduleHint} style={styles.input} placeholder="Schedule hint" /><TextInput value={settingsJson} onChangeText={setSettingsJson} style={[styles.input, styles.jsonInput]} placeholder="Evidence settings JSON" multiline autoCapitalize="none" autoCorrect={false} />
      <Pressable style={styles.secondaryButton} onPress={submitMonitor} disabled={createMonitor.isPending}><Text style={styles.secondaryText}>{createMonitor.isPending ? "Creating monitor…" : "Create evidence monitor"}</Text></Pressable>
      {(monitors.data ?? []).map((monitor) => <MonitorCard key={monitor.id} item={monitor} onStatus={(status) => updateMonitor.mutate({ id: monitor.id, status })} />)}
    </Section>

    <Section title="Change alerts" subtitle="Vectorized change candidates are provisional until an authorized reviewer investigates and resolves the evidence.">
      {(alerts.data ?? []).length ? alerts.data!.map((alert) => <AlertCard key={alert.id} item={alert} onInvestigate={() => triageAlert.mutate(alert.id)} />) : <Text style={styles.muted}>No persisted alerts are available.</Text>}
    </Section>

    <Section title="Privacy-governed releases" subtitle="Only a completed privacy_release run can prepare a release. Approval, publication, revocation, and the public geometry remain server-authoritative.">
      {(releases.data ?? []).length ? releases.data!.map((release) => <ReleaseCard key={release.id} item={release} onApprove={() => approveRelease.mutate(release.id)} onPublish={() => publishRelease.mutate(release.id)} onRevoke={() => revokeRelease.mutate(release.id)} />) : <Text style={styles.muted}>No privacy release records. Create a privacy_release analysis from real governed assets first.</Text>}
    </Section>
  </ScrollView>;
}

function Metric({ label, value }: { label: string; value: number }) { return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text>{children}</View>; }
function MonitorCard({ item, onStatus }: { item: GeoMonitor; onStatus: (status: GeoMonitor["status"]) => void }) { return <View style={styles.listCard}><View style={styles.row}><View style={styles.flex}><Text style={styles.cardTitle}>{titleCase(item.innovationType)}</Text><Text style={styles.cardMeta}>{item.scheduleHint}</Text></View><GeoAiStatusBadge value={item.status} /></View><View style={styles.actionRow}><MiniButton label={item.status === "active" ? "Pause" : "Resume"} onPress={() => onStatus(item.status === "active" ? "paused" : "active")} /><MiniButton label="Disable" danger onPress={() => onStatus("disabled")} /></View></View>; }
function AlertCard({ item, onInvestigate }: { item: GeoChangeAlert; onInvestigate: () => void }) { return <View style={styles.listCard}><View style={styles.row}><View style={styles.flex}><Text style={styles.cardTitle}>{titleCase(item.alertType)}</Text><Text style={styles.cardMeta}>{item.alertKey} · {item.summary}</Text></View><GeoAiStatusBadge value={item.status} /></View><Text style={styles.cardMeta}>Severity: {item.severity} · Evidence: {item.evidenceStatus}</Text>{["open", "acknowledged"].includes(item.status) ? <View style={styles.actionRow}><MiniButton label="Investigate" onPress={onInvestigate} /></View> : null}</View>; }
function ReleaseCard({ item, onApprove, onPublish, onRevoke }: { item: GeoPublicRelease; onApprove: () => void; onPublish: () => void; onRevoke: () => void }) { return <View style={styles.listCard}><View style={styles.row}><View style={styles.flex}><Text style={styles.cardTitle}>{titleCase(item.privacyMethod)}</Text><Text style={styles.cardMeta}>{item.releaseKey} · {item.license}</Text></View><GeoAiStatusBadge value={item.status} /></View><Text style={styles.cardBody}>{item.legalNotice}</Text><View style={styles.actionRow}>{item.status === "draft" ? <MiniButton label="Approve" onPress={onApprove} /> : null}{item.status === "approved" ? <MiniButton label="Publish" onPress={onPublish} /> : null}{item.status === "published" ? <MiniButton label="Revoke" danger onPress={onRevoke} /> : null}</View></View>; }
function MiniButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) { return <Pressable onPress={onPress} style={[styles.miniButton, danger && styles.miniDanger]}><Text style={[styles.miniText, danger && styles.miniDangerText]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  container: { padding: 16, gap: 15, backgroundColor: "#f8fafc", paddingBottom: 34 }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "#f8fafc" }, hero: { gap: 6 }, eyebrow: { color: "#2563eb", fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }, title: { color: "#0f172a", fontSize: 29, fontWeight: "800" }, subtitle: { color: "#475569", lineHeight: 20 }, errorBox: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, padding: 12, borderRadius: 12, gap: 7 }, error: { color: "#b91c1c" }, dismiss: { color: "#991b1b", fontWeight: "800" }, metrics: { flexDirection: "row", gap: 8 }, metric: { flex: 1, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0", padding: 12, borderRadius: 12, gap: 4 }, metricValue: { fontSize: 26, fontWeight: "800", color: "#0f172a" }, metricLabel: { color: "#64748b", fontSize: 11 }, primaryButton: { backgroundColor: "#1d4ed8", paddingVertical: 13, borderRadius: 10, alignItems: "center" }, primaryText: { color: "#ffffff", fontWeight: "800" }, section: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 13, gap: 10 }, sectionTitle: { color: "#0f172a", fontSize: 17, fontWeight: "800" }, sectionSubtitle: { color: "#64748b", fontSize: 12, lineHeight: 18 }, portfolioRow: { flexDirection: "row", gap: 11, borderBottomWidth: 1, borderBottomColor: "#f1f5f9", paddingVertical: 9 }, number: { color: "#2563eb", fontSize: 12, fontWeight: "800", width: 24 }, portfolioText: { flex: 1, color: "#334155", fontSize: 14, fontWeight: "700" }, muted: { color: "#64748b", lineHeight: 19 }, listCard: { borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", borderRadius: 10, padding: 11, gap: 6 }, cardTitle: { color: "#0f172a", fontWeight: "800", fontSize: 14 }, cardMeta: { color: "#64748b", fontSize: 11, lineHeight: 16 }, cardBody: { color: "#475569", fontSize: 12, lineHeight: 18 }, label: { color: "#334155", fontWeight: "800", fontSize: 12 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1" }, chipSelected: { borderColor: "#2563eb", backgroundColor: "#dbeafe" }, chipText: { color: "#475569", fontSize: 11 }, chipTextSelected: { color: "#1d4ed8", fontWeight: "800" }, input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, color: "#0f172a", backgroundColor: "#ffffff" }, jsonInput: { minHeight: 76, textAlignVertical: "top", fontFamily: "monospace", fontSize: 11 }, secondaryButton: { alignSelf: "flex-start", backgroundColor: "#dbeafe", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 }, secondaryText: { color: "#1d4ed8", fontWeight: "800" }, row: { flexDirection: "row", gap: 10, alignItems: "flex-start" }, flex: { flex: 1, gap: 3 }, actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, miniButton: { backgroundColor: "#dbeafe", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7 }, miniDanger: { backgroundColor: "#fee2e2" }, miniText: { color: "#1d4ed8", fontWeight: "800", fontSize: 12 }, miniDangerText: { color: "#b91c1c" },
});
