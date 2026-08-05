import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppScreen } from "../../components/AppScreen";
import {
  MobileActionButton,
  MobileMetricTile,
  MobilePageHeader,
  MobileSection,
  MobileStatusBanner,
  mobileExperienceStyles as ux,
} from "../../components/MobileExperiencePrimitives";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import {
  getMobileFieldDashboard,
  isOnline,
  listMobileFieldAccounts,
  reviewMobileFieldEvidence,
  submitMobileFieldEvidence,
  transitionMobileFieldAssignment,
  type MobileFieldAssignment,
} from "../../services/api";

type NextStatus = Extract<MobileFieldAssignment["status"], "in_progress" | "submitted" | "under_review" | "accepted" | "returned" | "cancelled">;

const nextActionByStatus: Record<string, Array<{ status: NextStatus; label: string; tone: "blue" | "green" | "amber" }>> = {
  assigned: [{ status: "in_progress", label: "Start assignment", tone: "blue" }],
  in_progress: [{ status: "submitted", label: "Submit for review", tone: "blue" }],
  submitted: [{ status: "under_review", label: "Begin review", tone: "amber" }],
  under_review: [
    { status: "accepted", label: "Accept reviewed inspection", tone: "green" },
    { status: "returned", label: "Return for correction", tone: "amber" },
  ],
  returned: [{ status: "in_progress", label: "Resume correction", tone: "blue" }],
};

function isClosed(status: string) { return status === "accepted" || status === "cancelled"; }
function pretty(value?: string | null) { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "—"; }

export function MobileFieldSurveyOperationsScreen() {
  const session = useMobileSession();
  const queryClient = useQueryClient();
  const [accountKey, setAccountKey] = useState("");
  const [assignmentKey, setAssignmentKey] = useState("");
  const [online, setOnline] = useState(true);
  const [evidenceType, setEvidenceType] = useState("site_photo");
  const [sourceReference, setSourceReference] = useState("");
  const [checksum, setChecksum] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [qualityFlags, setQualityFlags] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["mobile-commercial-field-accounts"],
    queryFn: () => listMobileFieldAccounts(session.accessToken),
    enabled: Boolean(session.accessToken),
    staleTime: 60_000,
  });
  useEffect(() => { if (!accountKey && accountsQuery.data?.[0]?.accountKey) setAccountKey(accountsQuery.data[0].accountKey); }, [accountKey, accountsQuery.data]);

  const dashboardQuery = useQuery({
    queryKey: ["mobile-field-dashboard", accountKey, assignmentKey],
    queryFn: () => getMobileFieldDashboard({ accountKey, assignmentKey: assignmentKey || undefined }, session.accessToken),
    enabled: Boolean(session.accessToken && accountKey),
    staleTime: 15_000,
  });
  useEffect(() => { const first = dashboardQuery.data?.assignments?.[0]?.assignmentKey; if (!assignmentKey && first) setAssignmentKey(first); }, [assignmentKey, dashboardQuery.data?.assignments]);
  useEffect(() => { void isOnline().then(setOnline); }, []);

  const refresh = async () => {
    await isOnline().then(setOnline);
    await queryClient.invalidateQueries({ queryKey: ["mobile-field-dashboard", accountKey] });
    await queryClient.invalidateQueries({ queryKey: ["mobile-commercial-field-accounts"] });
  };

  const requireOnline = async () => {
    const connected = await isOnline();
    setOnline(connected);
    if (!connected) throw new Error("Reconnect before submitting or reviewing commercial field evidence. This screen never queues field evidence offline.");
  };

  const run = async (operation: () => Promise<unknown>, clear?: () => void) => {
    setBusy(true);
    setActionError(null);
    try {
      await requireOnline();
      await operation();
      clear?.();
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The field operation could not be completed");
    } finally {
      setBusy(false);
    }
  };

  const selected = dashboardQuery.data?.selectedAssignment;
  const openAssignments = useMemo(() => dashboardQuery.data?.assignments.filter((item) => !isClosed(item.status)).length ?? 0, [dashboardQuery.data?.assignments]);
  const availableActions = selected ? nextActionByStatus[selected.assignment.status] ?? [] : [];

  return (
    <AppScreen scroll refreshing={dashboardQuery.isRefetching || accountsQuery.isRefetching} onRefresh={() => void refresh()}>
      <MobilePageHeader
        eyebrow="Field operations"
        title="Today’s inspection work"
        description="Capture evidence, request independent review, and move only through the controlled assignment steps available to your role."
      />
      <MobileStatusBanner
        tone={online ? "green" : "amber"}
        icon={online ? "cloud-done-outline" : "cloud-offline-outline"}
        title={online ? "Ready for governed online capture" : "Reconnect before continuing"}
        description={online ? "Evidence is submitted directly to the responsible service. Nothing is stored as an offline commercial evidence queue." : "Commercial evidence and decisions are not queued locally. Refresh once connectivity returns."}
      />

      {actionError ? <MobileStatusBanner tone="red" icon="alert-circle-outline" title="Action needs attention" description={actionError} /> : null}
      {accountsQuery.isLoading ? <View style={styles.loading}><ActivityIndicator color="#1D4ED8" /><Text style={ux.muted}>Loading your field workspaces…</Text></View> : null}
      {accountsQuery.isError ? <MobileStatusBanner tone="red" icon="warning-outline" title="Field accounts are unavailable" description="Sign in and reconnect before retrying. Pull down to refresh this screen." /> : null}

      {(accountsQuery.data ?? []).length === 0 && !accountsQuery.isLoading ? (
        <MobileSection title="No field workspace yet" description="A field manager must provision an account and assign you the appropriate field role.">
          <Text style={ux.body}>Once your access is ready, this screen will show assignments, controlled evidence capture, and review activity.</Text>
        </MobileSection>
      ) : null}

      {(accountsQuery.data ?? []).length > 1 ? (
        <MobileSection title="Choose your workspace" description="Assignments and evidence stay within the selected institution boundary.">
          {(accountsQuery.data ?? []).map((account) => <Pressable key={account.accountKey} accessibilityRole="button" accessibilityState={{ selected: account.accountKey === accountKey }} onPress={() => { setAccountKey(account.accountKey); setAssignmentKey(""); }} style={({ pressed }) => [ux.choice, account.accountKey === accountKey && ux.choiceSelected, pressed && styles.pressed]}><View style={[styles.accountIcon, account.accountKey === accountKey && styles.accountIconSelected]}><Text style={styles.accountInitial}>{account.legalName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.choiceCopy}><Text style={ux.choiceTitle}>{account.legalName}</Text><Text style={ux.choiceMeta}>{account.role.replaceAll("_", " ")} · {account.status}</Text></View><Text style={styles.accountKey}>{account.accountKey}</Text></Pressable>)}
        </MobileSection>
      ) : null}

      {dashboardQuery.isLoading && accountKey ? <View style={styles.loading}><ActivityIndicator color="#1D4ED8" /><Text style={ux.muted}>Loading assignments…</Text></View> : null}
      {dashboardQuery.isError ? <MobileStatusBanner tone="red" icon="refresh-outline" title="Assignments could not be loaded" description={dashboardQuery.error.message} /> : null}

      {dashboardQuery.data ? (
        <>
          <View style={styles.metricRow}><MobileMetricTile icon="clipboard-outline" label="Open assignments" value={openAssignments} tone="blue" /><MobileMetricTile icon="trending-up-outline" label="Monthly assignments" value={dashboardQuery.data.usageByMetric.monthly_field_assignments ?? 0} tone="green" /></View>

          <MobileSection title="Assigned inspections" description="Select a task to see instructions and the next controlled action.">
            {dashboardQuery.data.assignments.length ? dashboardQuery.data.assignments.map((assignment) => {
              const active = assignment.assignmentKey === assignmentKey;
              return <Pressable key={assignment.assignmentKey} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setAssignmentKey(assignment.assignmentKey)} style={({ pressed }) => [ux.choice, active && ux.choiceSelected, pressed && styles.pressed]}><View style={styles.choiceCopy}><Text style={ux.choiceTitle}>{assignment.assignmentKey}</Text><Text style={ux.choiceMeta}>Parcel {assignment.parcelId} · due {pretty(assignment.dueAt)}</Text></View><View style={ux.statusChip}><Text style={ux.statusChipText}>{assignment.status.replaceAll("_", " ")}</Text></View></Pressable>;
            }) : <Text style={ux.muted}>There are no field assignments in this account right now.</Text>}
          </MobileSection>

          {selected ? (
            <>
              <MobileSection title="Assignment brief" description="Read the task before recording evidence or progressing its status.">
                <Text style={ux.body}>{selected.assignment.instructions}</Text>
                <View style={styles.briefRow}><Text style={styles.briefLabel}>Current stage</Text><View style={ux.statusChip}><Text style={ux.statusChipText}>{selected.assignment.status.replaceAll("_", " ")}</Text></View></View>
              </MobileSection>

              <MobileSection title="Capture evidence" description="Submit a governed reference and optional WGS84 coordinates while online.">
                <View><Text style={ux.compactLabel}>Evidence type</Text><TextInput style={ux.textInput} value={evidenceType} onChangeText={setEvidenceType} placeholder="Example: site_photo" autoCapitalize="none" returnKeyType="next" /></View>
                <View><Text style={ux.compactLabel}>Governed source reference</Text><TextInput style={ux.textInput} value={sourceReference} onChangeText={setSourceReference} placeholder="Required source reference" autoCapitalize="characters" returnKeyType="next" /></View>
                <View><Text style={ux.compactLabel}>SHA-256 checksum <Text style={styles.optional}>optional</Text></Text><TextInput style={ux.textInput} value={checksum} onChangeText={setChecksum} placeholder="Checksum when available" autoCapitalize="none" /></View>
                <View style={ux.row}><View style={ux.half}><Text style={ux.compactLabel}>Latitude</Text><TextInput style={ux.textInput} value={latitude} onChangeText={setLatitude} placeholder="e.g. 6.5244" keyboardType="decimal-pad" /></View><View style={ux.half}><Text style={ux.compactLabel}>Longitude</Text><TextInput style={ux.textInput} value={longitude} onChangeText={setLongitude} placeholder="e.g. 3.3792" keyboardType="decimal-pad" /></View></View>
                <View><Text style={ux.compactLabel}>Quality flags <Text style={styles.optional}>optional</Text></Text><TextInput style={ux.textInput} value={qualityFlags} onChangeText={setQualityFlags} placeholder="Comma-separated flags" autoCapitalize="none" /></View>
                <MobileActionButton label={busy ? "Submitting evidence…" : "Submit online evidence"} icon="cloud-upload-outline" disabled={busy || !online || isClosed(selected.assignment.status) || !sourceReference.trim()} onPress={() => void run(() => submitMobileFieldEvidence({ accountKey, assignmentKey: selected.assignment.assignmentKey, evidenceType, sourceReference, sourceChecksumSha256: checksum || undefined, capturedAt: new Date().toISOString(), latitude: latitude ? Number(latitude) : undefined, longitude: longitude ? Number(longitude) : undefined, qualityFlags: qualityFlags ? qualityFlags.split(",").map((item) => item.trim()).filter(Boolean) : undefined }, session.accessToken), () => { setSourceReference(""); setChecksum(""); setLatitude(""); setLongitude(""); setQualityFlags(""); })} />
              </MobileSection>

              <MobileSection title="Evidence review" description="Only authorized independent reviewers can accept or return a submitted item.">
                {selected.evidence.length ? selected.evidence.map((evidence) => <View key={evidence.evidenceKey} style={styles.evidence}><View style={styles.evidenceTop}><View style={styles.choiceCopy}><Text style={ux.choiceTitle}>{evidence.evidenceType.replaceAll("_", " ")}</Text><Text style={ux.choiceMeta}>{evidence.sourceReference}</Text></View><View style={ux.statusChip}><Text style={ux.statusChipText}>{evidence.status}</Text></View></View>{evidence.status === "pending" ? <><View style={ux.divider} /><Text style={ux.compactLabel}>Independent reviewer rationale</Text><TextInput style={[ux.textInput, styles.multiline]} value={reviewNotes} onChangeText={setReviewNotes} placeholder="Record the factual review rationale" multiline /><View style={ux.row}><View style={ux.half}><MobileActionButton tone="green" label="Accept" disabled={busy || !online || reviewNotes.trim().length < 8} onPress={() => void run(() => reviewMobileFieldEvidence({ accountKey, evidenceKey: evidence.evidenceKey, status: "accepted", reviewNotes }, session.accessToken), () => setReviewNotes(""))} /></View><View style={ux.half}><MobileActionButton tone="red" label="Reject" disabled={busy || !online || reviewNotes.trim().length < 8} onPress={() => void run(() => reviewMobileFieldEvidence({ accountKey, evidenceKey: evidence.evidenceKey, status: "rejected", reviewNotes }, session.accessToken), () => setReviewNotes(""))} /></View></View></> : null}</View>) : <Text style={ux.muted}>No evidence has been submitted for this assignment.</Text>}
              </MobileSection>

              <MobileSection title="Next controlled action" description={availableActions.length ? "Only workflow steps appropriate to the assignment’s current stage are shown." : "This assignment has no further action available on this screen."}>
                {availableActions.length ? <><View><Text style={ux.compactLabel}>Reviewer note <Text style={styles.optional}>required for reviewer transitions</Text></Text><TextInput style={[ux.textInput, styles.multiline]} value={statusNotes} onChangeText={setStatusNotes} placeholder="Add a factual operational note" multiline /></View>{availableActions.map((action) => <MobileActionButton key={action.status} tone={action.tone} label={busy ? "Saving…" : action.label} disabled={busy || !online || isClosed(selected.assignment.status)} onPress={() => void run(() => transitionMobileFieldAssignment({ accountKey, assignmentKey: selected.assignment.assignmentKey, nextStatus: action.status, reviewNotes: statusNotes || undefined }, session.accessToken), () => setStatusNotes(""))} />)}</> : <Text style={ux.muted}>This inspection is complete, cancelled, or waiting for an authorized role.</Text>}
              </MobileSection>

              <MobileSection title="Accountable activity" description="This timeline records governed work; it does not change registry records automatically.">
                {selected.events.length ? selected.events.map((event) => <View key={event.id} style={styles.event}><View style={styles.timelineDot} /><View style={styles.choiceCopy}><Text style={ux.body}>{event.description}</Text><Text style={ux.choiceMeta}>{pretty(event.createdAt)}</Text></View></View>) : <Text style={ux.muted}>No activity has been recorded for this assignment yet.</Text>}
              </MobileSection>
            </>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  loading: { paddingHorizontal: 20, paddingTop: 20, flexDirection: "row", gap: 9, alignItems: "center" },
  metricRow: { marginHorizontal: 20, marginTop: 16, flexDirection: "row", gap: 10 },
  accountIcon: { height: 35, width: 35, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F5F9" },
  accountIconSelected: { backgroundColor: "#DBEAFE" },
  accountInitial: { color: "#1D4ED8", fontWeight: "900", fontSize: 14 },
  choiceCopy: { flex: 1, minWidth: 0 },
  accountKey: { color: "#64748B", fontSize: 10, fontWeight: "800" },
  briefRow: { marginTop: 3, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  briefLabel: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  optional: { color: "#64748B", fontWeight: "500" },
  multiline: { minHeight: 78, textAlignVertical: "top" },
  evidence: { gap: 9, paddingBottom: 4 },
  evidenceTop: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  event: { flexDirection: "row", gap: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingVertical: 10 },
  timelineDot: { marginTop: 5, height: 8, width: 8, borderRadius: 99, backgroundColor: "#60A5FA" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
});
