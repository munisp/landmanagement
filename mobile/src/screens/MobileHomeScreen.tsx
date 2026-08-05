import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { AppScreen } from "../components/AppScreen";
import {
  MobileActionButton,
  MobileMetricTile,
  MobilePageHeader,
  MobileSection,
  MobileStatusBanner,
  mobileExperienceStyles as ux,
} from "../components/MobileExperiencePrimitives";
import { useMobileSession } from "../providers/MobileSessionProvider";
import { getMobileOnboardingJourney, listGeoAiRuns, type GeoAnalysisRun, type MobileOnboardingJourney } from "../services/api";

function isFieldRole(role: string) {
  const value = role.toLowerCase();
  return value.includes("surveyor") || value.includes("inspector") || value.includes("field");
}

function ownerLabel(owner: MobileOnboardingJourney["next"]["owner"]) {
  return {
    participant: "You can continue from this device.",
    administrator: "An authorized administrator owns this step.",
    verifier: "An approved verifier owns this step.",
    training_team: "The training team supports this step.",
  }[owner];
}

export function MobileHomeScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const runs = useQuery<GeoAnalysisRun[], Error>({ queryKey: ["geoai", "home-summary"], queryFn: () => listGeoAiRuns({ limit: 100 }, session.accessToken), enabled: Boolean(session.accessToken) });
  const journey = useQuery<MobileOnboardingJourney, Error>({ queryKey: ["mobile-onboarding-journey"], queryFn: () => getMobileOnboardingJourney(session.accessToken), enabled: Boolean(session.accessToken), staleTime: 30_000 });
  const summary = useMemo(() => runs.data?.reduce((acc: { active: number; review: number; verified: number }, run: GeoAnalysisRun) => ({ ...acc, active: acc.active + (["queued", "running"].includes(run.status) ? 1 : 0), review: acc.review + (run.status === "awaiting_review" ? 1 : 0), verified: acc.verified + (run.evidenceStatus === "verified" ? 1 : 0) }), { active: 0, review: 0, verified: 0 }) ?? { active: 0, review: 0, verified: 0 }, [runs.data]);

  const role = journey.data?.role ?? session.identity?.roles[0] ?? "participant";
  const fieldRole = isFieldRole(role);
  const active = journey.data?.status === "active" || journey.data?.status === "workspace_ready";
  const goToSafeNext = () => {
    if (journey.data?.next.owner === "participant" && fieldRole && active) {
      router.push("/field-operations" as any);
      return;
    }
    router.push("/(tabs)/more" as any);
  };

  return <AppScreen scroll refreshing={runs.isRefetching || journey.isRefetching} onRefresh={() => { void Promise.all([runs.refetch(), journey.refetch()]); }}>
    <MobilePageHeader
      eyebrow="Your workday"
      title={journey.data ? `Welcome to your ${role.replaceAll("_", " ")} workspace` : "Your governed field workspace"}
      description={journey.data ? "Your readiness, role, and next action are synchronized with the platform’s protected onboarding controls." : "Loading the role-aware path for your authenticated workspace."}
    />

    {journey.isLoading ? <View style={styles.loading}><ActivityIndicator color="#1D4ED8" /><Text style={ux.muted}>Preparing your safe next step…</Text></View> : null}
    {journey.isError ? <MobileStatusBanner tone="amber" icon="cloud-offline-outline" title="Guided readiness is unavailable" description="You can still use the approved mobile tools already assigned to you. Pull down to reconnect and refresh your role journey." /> : null}
    {journey.data ? <MobileStatusBanner tone={active ? "green" : "amber"} icon={active ? "shield-checkmark-outline" : "time-outline"} title={active ? "Workspace readiness confirmed" : journey.data.next.title} description={active ? journey.data.launch.description : `${journey.data.next.description} ${ownerLabel(journey.data.next.owner)}`} /> : null}

    <MobileSection title="Your next safe action" description={journey.data?.next.description ?? "Choose a governed mobile task while your role journey loads."}>
      <View style={styles.nextAction}><View style={styles.nextIcon}><Text style={styles.nextIconText}>{active ? "01" : "…"}</Text></View><View style={styles.nextCopy}><Text style={ux.choiceTitle}>{journey.data?.next.title ?? "Open approved field work"}</Text><Text style={ux.choiceMeta}>{journey.data ? ownerLabel(journey.data.next.owner) : "Only tasks already authorized for your account are shown."}</Text></View></View>
      <MobileActionButton label={journey.data?.next.actionLabel ?? (fieldRole ? "Open field work" : "Open approved options")} icon="arrow-forward-outline" disabled={Boolean(journey.data && !active && journey.data.next.owner !== "participant")} onPress={goToSafeNext} />
      {journey.data && !active ? <Text style={ux.muted}>Mobile does not perform role provisioning, policy synchronization, document approval, or activation. The responsible party is identified above.</Text> : null}
    </MobileSection>

    <View style={styles.metricRow}><MobileMetricTile icon="pulse-outline" label="Active GeoAI runs" value={summary.active} tone="blue" /><MobileMetricTile icon="eye-outline" label="Need review" value={summary.review} tone="amber" /><MobileMetricTile icon="checkmark-circle-outline" label="Verified" value={summary.verified} tone="green" /></View>

    <MobileSection title={fieldRole ? "Field continuity" : "Approved mobile tools"} description={fieldRole ? "Continue assigned field work from the same authenticated session, with server-enforced evidence and review controls." : "Mobile emphasizes situational awareness and approved field-safe access. Use the web workspace for broader administrative and commercial workflows."}>
      {fieldRole ? <MobileActionButton label="Review field assignments" icon="clipboard-outline" onPress={() => router.push("/field-operations" as any)} /> : <MobileActionButton label="Open contextual mapping" icon="map-outline" onPress={() => router.push("/context" as any)} />}
      <MobileActionButton tone="slate" label="View guided workspace options" icon="compass-outline" onPress={() => router.push("/(tabs)/more" as any)} />
    </MobileSection>

    <MobileSection title="What remains governed" description="These safeguards apply equally on mobile and the PWA.">
      <Text style={ux.body}>Your screen can explain readiness and launch permitted work. Identity verification, role provisioning, approval, activation, and final land-record decisions continue through authorized platform workflows.</Text>
    </MobileSection>
  </AppScreen>;
}

const styles = StyleSheet.create({
  loading: { paddingHorizontal: 20, paddingTop: 18, flexDirection: "row", gap: 9, alignItems: "center" },
  nextAction: { flexDirection: "row", gap: 11, alignItems: "center", paddingBottom: 4 },
  nextIcon: { height: 39, width: 39, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#DBEAFE" },
  nextIconText: { color: "#1D4ED8", fontSize: 12, fontWeight: "900" },
  nextCopy: { flex: 1, gap: 2 },
  metricRow: { marginHorizontal: 20, marginTop: 16, flexDirection: "row", gap: 9 },
});
