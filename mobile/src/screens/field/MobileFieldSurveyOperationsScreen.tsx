import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppScreen } from "../../components/AppScreen";
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

const nextActions: Array<{ status: NextStatus; label: string }> = [
  { status: "in_progress", label: "Start assignment" },
  { status: "submitted", label: "Submit for review" },
  { status: "under_review", label: "Begin review" },
  { status: "accepted", label: "Accept reviewed inspection" },
  { status: "returned", label: "Return for correction" },
];

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
  };
  const requireOnline = async () => {
    const connected = await isOnline();
    setOnline(connected);
    if (!connected) throw new Error("Reconnect before submitting or reviewing commercial field evidence. This screen does not queue field evidence offline.");
  };
  const run = async (operation: () => Promise<unknown>, clear?: () => void) => {
    setBusy(true); setActionError(null);
    try { await requireOnline(); await operation(); clear?.(); await refresh(); }
    catch (error) { setActionError(error instanceof Error ? error.message : "The field operation could not be completed"); }
    finally { setBusy(false); }
  };

  const selected = dashboardQuery.data?.selectedAssignment;
  return <AppScreen scroll>
    <View style={styles.header}><Text style={styles.eyebrow}>COMMERCIAL FIELD OPERATIONS</Text><Text style={styles.title}>Field Survey Operations</Text><Text style={styles.subtitle}>Assignments, source-provenanced evidence, and independent review. This mobile surface is online-only for commercial evidence; it never stores a local evidence queue or automatically edits registry records.</Text></View>
    <View style={[styles.notice, online ? styles.noticeOnline : styles.noticeOffline]}><Text style={styles.noticeTitle}>{online ? "Online capture available" : "Reconnect required"}</Text><Text style={styles.noticeText}>{online ? "Submit references and coordinates only when the governed service is reachable." : "Commercial field evidence and decisions are not queued locally. Reconnect before continuing."}</Text></View>
    {accountsQuery.isLoading ? <View style={styles.loading}><ActivityIndicator color="#0369a1" /><Text style={styles.muted}>Loading field accounts…</Text></View> : null}
    {accountsQuery.isError ? <View style={styles.card}><Text style={styles.error}>Commercial field accounts are unavailable. Sign in and reconnect before retrying.</Text></View> : null}
    {(accountsQuery.data ?? []).length === 0 && !accountsQuery.isLoading ? <View style={styles.card}><Text style={styles.section}>No field operations account</Text><Text style={styles.muted}>A field manager must provision a Field Survey and Parcel Inspection commercial account and assign your account the appropriate field role.</Text></View> : null}
    {(accountsQuery.data ?? []).map((account) => <Pressable key={account.accountKey} onPress={() => { setAccountKey(account.accountKey); setAssignmentKey(""); }} style={({ pressed }) => [styles.account, account.accountKey === accountKey && styles.accountSelected, pressed && styles.pressed]}><View style={styles.accountText}><Text style={styles.accountName}>{account.legalName}</Text><Text style={styles.muted}>{account.role} · {account.status}</Text></View><Text style={styles.accountKey}>{account.accountKey}</Text></Pressable>)}
    {dashboardQuery.isLoading && accountKey ? <View style={styles.loading}><ActivityIndicator color="#0369a1" /><Text style={styles.muted}>Loading assignments…</Text></View> : null}
    {dashboardQuery.isError ? <View style={styles.card}><Text style={styles.error}>{dashboardQuery.error.message}</Text><Pressable style={styles.retry} onPress={() => void dashboardQuery.refetch()}><Text style={styles.retryText}>Retry</Text></Pressable></View> : null}
    {dashboardQuery.data ? <>
      <View style={styles.summary}><View style={styles.summaryItem}><Text style={styles.summaryNumber}>{dashboardQuery.data.assignments.filter((item) => !isClosed(item.status)).length}</Text><Text style={styles.summaryLabel}>open assignments</Text></View><View style={styles.summaryItem}><Text style={styles.summaryNumber}>{dashboardQuery.data.usageByMetric.monthly_field_assignments ?? 0}</Text><Text style={styles.summaryLabel}>monthly assignments</Text></View></View>
      <View style={styles.card}><Text style={styles.section}>Assigned inspections</Text>{dashboardQuery.data.assignments.length ? dashboardQuery.data.assignments.map((assignment) => <Pressable key={assignment.assignmentKey} onPress={() => setAssignmentKey(assignment.assignmentKey)} style={({ pressed }) => [styles.assignment, assignment.assignmentKey === assignmentKey && styles.assignmentSelected, pressed && styles.pressed]}><View style={styles.assignmentText}><Text style={styles.assignmentKey}>{assignment.assignmentKey}</Text><Text style={styles.muted}>Parcel {assignment.parcelId} · due {pretty(assignment.dueAt)}</Text></View><Text style={styles.assignmentStatus}>{assignment.status.replaceAll("_", " ")}</Text></Pressable>) : <Text style={styles.muted}>No commercial field assignments are available in this account.</Text>}</View>
      {selected ? <>
        <View style={styles.card}><Text style={styles.section}>Assignment instructions</Text><Text style={styles.body}>{selected.assignment.instructions}</Text><Text style={styles.muted}>Status: {selected.assignment.status.replaceAll("_", " ")}</Text></View>
        <View style={styles.card}><Text style={styles.section}>Submit online field evidence</Text><Text style={styles.muted}>References must point to evidence already stored through the governed upload flow. Latitude and longitude must be supplied together in WGS84.</Text><TextInput style={styles.input} value={evidenceType} onChangeText={setEvidenceType} placeholder="Evidence type" autoCapitalize="none" /><TextInput style={styles.input} value={sourceReference} onChangeText={setSourceReference} placeholder="Governed source reference" autoCapitalize="characters" /><TextInput style={styles.input} value={checksum} onChangeText={setChecksum} placeholder="Optional SHA-256 checksum" autoCapitalize="none" /><View style={styles.row}><TextInput style={[styles.input, styles.half]} value={latitude} onChangeText={setLatitude} placeholder="Latitude" keyboardType="decimal-pad" /><TextInput style={[styles.input, styles.half]} value={longitude} onChangeText={setLongitude} placeholder="Longitude" keyboardType="decimal-pad" /></View><TextInput style={styles.input} value={qualityFlags} onChangeText={setQualityFlags} placeholder="Quality flags, comma separated" autoCapitalize="none" /><Pressable disabled={busy || isClosed(selected.assignment.status)} onPress={() => void run(() => submitMobileFieldEvidence({ accountKey, assignmentKey: selected.assignment.assignmentKey, evidenceType, sourceReference, sourceChecksumSha256: checksum || undefined, capturedAt: new Date().toISOString(), latitude: latitude ? Number(latitude) : undefined, longitude: longitude ? Number(longitude) : undefined, qualityFlags: qualityFlags ? qualityFlags.split(",").map((item) => item.trim()).filter(Boolean) : undefined }, session.accessToken), () => { setSourceReference(""); setChecksum(""); setLatitude(""); setLongitude(""); setQualityFlags(""); })} style={({ pressed }) => [styles.primaryButton, (busy || isClosed(selected.assignment.status)) && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{busy ? "Submitting…" : "Submit online evidence"}</Text></Pressable></View>
        <View style={styles.card}><Text style={styles.section}>Evidence review</Text>{selected.evidence.length ? selected.evidence.map((evidence) => <View key={evidence.evidenceKey} style={styles.evidence}><Text style={styles.assignmentKey}>{evidence.evidenceType} · {evidence.status}</Text><Text style={styles.muted}>{evidence.sourceReference}</Text>{evidence.status === "pending" ? <><TextInput style={styles.input} value={reviewNotes} onChangeText={setReviewNotes} placeholder="Independent reviewer rationale" multiline /><View style={styles.row}><Pressable disabled={busy || reviewNotes.trim().length < 8} onPress={() => void run(() => reviewMobileFieldEvidence({ accountKey, evidenceKey: evidence.evidenceKey, status: "accepted", reviewNotes }, session.accessToken), () => setReviewNotes(""))} style={({ pressed }) => [styles.compactButton, styles.acceptButton, (busy || reviewNotes.trim().length < 8) && styles.disabled, pressed && styles.pressed]}><Text style={styles.compactButtonText}>Accept</Text></Pressable><Pressable disabled={busy || reviewNotes.trim().length < 8} onPress={() => void run(() => reviewMobileFieldEvidence({ accountKey, evidenceKey: evidence.evidenceKey, status: "rejected", reviewNotes }, session.accessToken), () => setReviewNotes(""))} style={({ pressed }) => [styles.compactButton, styles.rejectButton, (busy || reviewNotes.trim().length < 8) && styles.disabled, pressed && styles.pressed]}><Text style={styles.compactButtonText}>Reject</Text></Pressable></View></> : null}</View>) : <Text style={styles.muted}>No evidence has been submitted for this assignment.</Text>}</View>
        <View style={styles.card}><Text style={styles.section}>Controlled assignment progression</Text><TextInput style={styles.input} value={statusNotes} onChangeText={setStatusNotes} placeholder="Required for reviewer transitions" multiline />{nextActions.map((action) => <Pressable key={action.status} disabled={busy || isClosed(selected.assignment.status)} onPress={() => void run(() => transitionMobileFieldAssignment({ accountKey, assignmentKey: selected.assignment.assignmentKey, nextStatus: action.status, reviewNotes: statusNotes || undefined }, session.accessToken), () => setStatusNotes(""))} style={({ pressed }) => [styles.statusButton, (busy || isClosed(selected.assignment.status)) && styles.disabled, pressed && styles.pressed]}><Text style={styles.statusButtonText}>{action.label}</Text></Pressable>)}</View>
        <View style={styles.card}><Text style={styles.section}>Audit activity</Text>{selected.events.map((event) => <View key={event.id} style={styles.event}><Text style={styles.body}>{event.description}</Text><Text style={styles.muted}>{pretty(event.createdAt)}</Text></View>)}</View>
      </> : null}
    </> : null}
    {actionError ? <View style={styles.errorCard}><Text style={styles.error}>{actionError}</Text></View> : null}
  </AppScreen>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 14, gap: 6 }, eyebrow: { fontSize: 11, letterSpacing: 1.4, fontWeight: "800", color: "#0369a1" }, title: { fontSize: 28, lineHeight: 34, fontWeight: "900", color: "#0f172a" }, subtitle: { fontSize: 14, lineHeight: 21, color: "#475569" }, notice: { margin: 16, marginBottom: 8, padding: 13, borderRadius: 12, borderWidth: 1, gap: 4 }, noticeOnline: { backgroundColor: "#ecfdf5", borderColor: "#86efac" }, noticeOffline: { backgroundColor: "#fff7ed", borderColor: "#fdba74" }, noticeTitle: { color: "#0f172a", fontWeight: "900", fontSize: 13 }, noticeText: { color: "#475569", fontSize: 12, lineHeight: 18 }, loading: { padding: 18, flexDirection: "row", gap: 8, alignItems: "center" }, card: { marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#ffffff", gap: 10 }, section: { color: "#0f172a", fontSize: 16, fontWeight: "900" }, muted: { color: "#64748b", fontSize: 12, lineHeight: 17 }, body: { color: "#334155", fontSize: 13, lineHeight: 19 }, error: { color: "#b91c1c", fontSize: 13, lineHeight: 19 }, errorCard: { margin: 16, borderRadius: 12, borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", padding: 13 }, account: { marginHorizontal: 16, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#ffffff", padding: 12, flexDirection: "row", gap: 10, alignItems: "center" }, accountSelected: { borderColor: "#38bdf8", backgroundColor: "#f0f9ff" }, accountText: { flex: 1, gap: 2 }, accountName: { color: "#0f172a", fontSize: 14, fontWeight: "800" }, accountKey: { color: "#0369a1", fontSize: 10, fontWeight: "800" }, summary: { margin: 16, marginBottom: 0, flexDirection: "row", gap: 10 }, summaryItem: { flex: 1, borderRadius: 12, backgroundColor: "#e0f2fe", padding: 12, gap: 2 }, summaryNumber: { color: "#0f172a", fontSize: 24, fontWeight: "900" }, summaryLabel: { color: "#0369a1", fontSize: 11, fontWeight: "800", textTransform: "uppercase" }, assignment: { flexDirection: "row", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderColor: "#e2e8f0", alignItems: "center" }, assignmentSelected: { backgroundColor: "#f0f9ff", paddingHorizontal: 8, borderRadius: 8 }, assignmentText: { flex: 1, gap: 2 }, assignmentKey: { color: "#0f172a", fontSize: 13, fontWeight: "800" }, assignmentStatus: { color: "#0369a1", fontSize: 11, fontWeight: "900", textTransform: "uppercase" }, input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: "#0f172a", backgroundColor: "#ffffff" }, row: { flexDirection: "row", gap: 8 }, half: { flex: 1 }, primaryButton: { alignItems: "center", borderRadius: 9, backgroundColor: "#0369a1", paddingVertical: 11 }, primaryButtonText: { color: "#ffffff", fontWeight: "900", fontSize: 13 }, evidence: { gap: 6, borderTopWidth: 1, borderColor: "#e2e8f0", paddingTop: 10 }, compactButton: { flex: 1, alignItems: "center", borderRadius: 8, paddingVertical: 9 }, acceptButton: { backgroundColor: "#047857" }, rejectButton: { backgroundColor: "#475569" }, compactButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "900" }, statusButton: { alignItems: "center", borderWidth: 1, borderColor: "#7dd3fc", borderRadius: 8, paddingVertical: 10 }, statusButtonText: { color: "#075985", fontSize: 12, fontWeight: "900" }, event: { gap: 3, borderTopWidth: 1, borderColor: "#e2e8f0", paddingTop: 9 }, retry: { alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: "#93c5fd", padding: 10 }, retryText: { color: "#075985", fontWeight: "900" }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
});
