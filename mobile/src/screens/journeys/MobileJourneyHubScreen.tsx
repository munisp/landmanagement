import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { AppScreen } from "../../components/AppScreen";
import { MobileActionButton, MobileMetricTile, MobilePageHeader, MobileSection, MobileStatusBanner, mobileExperienceStyles as ux } from "../../components/MobileExperiencePrimitives";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { getMobileStakeholderJourneyTemplates, listMobileStakeholderJourneys, retryMobileStakeholderJourney, startMobileStakeholderJourney, type MobileStakeholderJourneyTemplate } from "../../services/api";

const activeStatuses = new Set(["pending", "running", "awaiting_intervention", "blocked", "failed"]);

export function MobileJourneyHubScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const templates = useQuery({ queryKey: ["mobile-journey-templates"], queryFn: () => getMobileStakeholderJourneyTemplates(session.accessToken), enabled: Boolean(session.accessToken), staleTime: 30_000 });
  const runs = useQuery({ queryKey: ["mobile-journey-runs"], queryFn: () => listMobileStakeholderJourneys(session.accessToken), enabled: Boolean(session.accessToken), staleTime: 15_000 });
  const mobileTemplates = useMemo(() => templates.data?.filter((template) => Boolean(template.mobileRoute)) ?? [], [templates.data]);
  const [selectedCode, setSelectedCode] = useState<string>("");
  const selected = mobileTemplates.find((template) => template.code === selectedCode) as MobileStakeholderJourneyTemplate | undefined;
  const [reference, setReference] = useState("");

  useEffect(() => { if (!selectedCode && mobileTemplates[0]) setSelectedCode(mobileTemplates[0].code); }, [selectedCode, mobileTemplates]);

  const start = useMutation({
    mutationFn: () => {
      if (!selected || !reference.trim()) throw new Error("Choose a mobile-safe journey and enter the existing record reference.");
      return startMobileStakeholderJourney({ templateCode: selected.code, subjectKind: selected.subjectKinds[0], subjectReference: reference.trim(), idempotencyKey: `mobile-journey-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` }, session.accessToken);
    },
    onSuccess: (result) => {
      void runs.refetch();
      if (result.orchestrationBlocked) return;
      setReference("");
      if (selected?.mobileRoute) router.push(selected.mobileRoute as never);
    },
  });
  const retry = useMutation({ mutationFn: (runKey: string) => retryMobileStakeholderJourney(runKey, session.accessToken), onSuccess: () => runs.refetch() });

  const active = runs.data?.filter((run) => activeStatuses.has(run.status)) ?? [];
  const waiting = active.filter((run) => run.status === "awaiting_intervention").length;

  return <AppScreen scroll refreshing={templates.isRefetching || runs.isRefetching} onRefresh={() => { void Promise.all([templates.refetch(), runs.refetch()]); }}>
    <MobilePageHeader eyebrow="Connected service paths" title="Your guided journeys" description="Mobile continues only the safe, assigned journeys that work in the field. Other authorized services remain available through the web workspace." />
    {templates.isLoading || runs.isLoading ? <View style={styles.loading}><ActivityIndicator color="#1D4ED8" /><Text style={ux.muted}>Synchronizing your journey evidence…</Text></View> : null}
    {templates.isError || runs.isError ? <MobileStatusBanner tone="amber" icon="cloud-offline-outline" title="Journey continuity is unavailable" description="No run state is stored locally. Reconnect and refresh before starting, retrying, or relying on a journey status." /> : null}
    <View style={styles.metricRow}><MobileMetricTile icon="trail-sign-outline" label="Active" value={active.length} tone="blue" /><MobileMetricTile icon="hand-left-outline" label="Waiting for review" value={waiting} tone="amber" /><MobileMetricTile icon="phone-portrait-outline" label="Mobile-safe templates" value={mobileTemplates.length} tone="green" /></View>

    <MobileSection title="Start a field-safe journey" description="Select a path, then enter the reference of a real record already created in the appropriate governed service.">
      <View style={styles.templateList}>{mobileTemplates.map((template) => <MobileActionButton key={template.code} tone={selectedCode === template.code ? "blue" : "slate"} label={`${template.code} · ${template.title}`} icon={selectedCode === template.code ? "checkmark-circle-outline" : "navigate-outline"} onPress={() => setSelectedCode(template.code)} />)}</View>
      {selected ? <View style={styles.selectedCard}><Text style={ux.choiceTitle}>{selected.stakeholder} journey</Text><Text style={ux.choiceMeta}>{selected.description}</Text><Text style={styles.boundary}>{selected.decisionBoundary}</Text><TextInput value={reference} onChangeText={setReference} placeholder={`Existing ${selected.subjectKinds[0].replaceAll("_", " ")} reference`} placeholderTextColor="#64748B" style={styles.input} autoCapitalize="characters" /></View> : null}
      <MobileActionButton label={start.isPending ? "Starting governed journey…" : "Start selected journey"} icon="play-outline" disabled={!selected || !reference.trim() || start.isPending} onPress={() => start.mutate()} />
      {start.isError ? <Text style={styles.error}>{start.error instanceof Error ? start.error.message : "The journey could not be started."}</Text> : null}
    </MobileSection>

    <MobileSection title="Active work" description="These records remain online-only. A journey does not make a decision; it preserves accountable progress and shows when a human role must intervene.">
      {!active.length ? <Text style={ux.muted}>No active mobile journey is assigned to this session.</Text> : active.map((run) => <View key={run.runKey} style={styles.runCard}><View style={styles.runHeading}><View style={{ flex: 1 }}><Text style={ux.choiceTitle}>{run.templateCode} · {run.template.title}</Text><Text style={ux.choiceMeta}>{run.subjectKind.replaceAll("_", " ")} · {run.subjectReference}</Text></View><Text style={styles.status}>{run.status.replaceAll("_", " ")}</Text></View>{run.blockedReason ? <Text style={styles.error}>{run.blockedReason}</Text> : null}{["blocked", "failed"].includes(run.status) ? <MobileActionButton tone="slate" label={retry.isPending ? "Requesting retry…" : "Retry after correction"} icon="refresh-outline" disabled={retry.isPending} onPress={() => retry.mutate(run.runKey)} /> : null}{run.template.mobileRoute ? <MobileActionButton tone="slate" label="Open mobile service" icon="arrow-forward-outline" onPress={() => router.push(run.template.mobileRoute as never)} /> : null}</View>)}
    </MobileSection>

    <MobileSection title="When the web workspace is needed" description="Administration, legal review, policy, payments, rollout governance, commercial account setup, and non-field service decisions stay in the authenticated web workspace.">
      <Text style={ux.body}>Mobile can show your assigned journey and maintain field continuity. It never bypasses identity, verification, role, provider, registry, lending, legal, or statutory approval controls.</Text>
      <MobileActionButton tone="slate" label="Open contextual mapping" icon="map-outline" onPress={() => router.push("/context" as never)} />
    </MobileSection>
  </AppScreen>;
}

const styles = StyleSheet.create({
  loading: { paddingHorizontal: 20, paddingTop: 18, flexDirection: "row", gap: 9, alignItems: "center" },
  metricRow: { marginHorizontal: 20, marginTop: 16, flexDirection: "row", gap: 9 },
  templateList: { gap: 8 },
  selectedCard: { marginTop: 12, borderWidth: 1, borderColor: "#BFDBFE", borderRadius: 16, backgroundColor: "#EFF6FF", padding: 14, gap: 8 },
  boundary: { color: "#92400E", fontSize: 12, fontWeight: "700", lineHeight: 18 },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#FFFFFF", color: "#0F172A", paddingHorizontal: 12, fontSize: 15 },
  error: { marginTop: 9, color: "#B91C1C", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  runCard: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 16, backgroundColor: "#FFFFFF", padding: 14, gap: 10, marginBottom: 10 },
  runHeading: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  status: { color: "#334155", borderRadius: 99, backgroundColor: "#E2E8F0", paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: "800", textTransform: "capitalize" },
});
