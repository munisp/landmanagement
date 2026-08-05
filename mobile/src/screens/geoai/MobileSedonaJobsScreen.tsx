import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppScreen } from "../../components/AppScreen";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { cancelSedonaJob, listSedonaJobsForRun, type MobileSedonaJob } from "../../services/api";

function parseRunId(value: string | string[] | undefined): number | null {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const activeStatuses = new Set(["queued", "claimed", "running", "cancel_requested"]);

function statusStyle(status: MobileSedonaJob["status"]) {
  if (status === "succeeded") return styles.succeeded;
  if (status === "failed" || status === "cancelled") return styles.failed;
  return styles.pending;
}

export function MobileSedonaJobsScreen() {
  const { runId: rawRunId } = useLocalSearchParams<{ runId: string }>();
  const runId = parseRunId(rawRunId);
  const session = useMobileSession();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["sedona", "jobs", runId],
    queryFn: () => listSedonaJobsForRun(runId as number, session.accessToken),
    enabled: Boolean(runId && session.accessToken),
    refetchInterval: 5000,
    staleTime: 0,
  });
  const cancel = useMutation({
    mutationFn: (jobId: number) => cancelSedonaJob(jobId, session.accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sedona", "jobs", runId] });
    },
    onError: (error: Error) => Alert.alert("Unable to cancel Lakehouse job", error.message),
  });

  if (!runId) return <View style={styles.center}><Text style={styles.error}>The requested GeoAI run identifier is invalid.</Text></View>;
  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /><Text style={styles.muted}>Loading governed Lakehouse jobs…</Text></View>;
  if (query.error) return <View style={styles.center}><Text style={styles.error}>{query.error.message}</Text><Pressable onPress={() => void query.refetch()} style={styles.retry}><Text style={styles.retryText}>Retry securely</Text></Pressable></View>;

  const jobs = query.data ?? [];
  return (
    <AppScreen scroll>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Governed Lakehouse execution</Text>
        <Text style={styles.bannerText}>Status is fetched live from the signed-in platform session. This device does not cache a job manifest, a service capability, a raw output URI, or any private GeoParquet content.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>GeoAI run {runId}</Text>
        <Text style={styles.subtitle}>{jobs.length} Lakehouse job{jobs.length === 1 ? "" : "s"} recorded. A successful computation remains provisional until the evidence review policy permits a decision or release.</Text>
      </View>

      {jobs.length ? jobs.map((job) => (
        <View key={job.id} style={styles.card}>
          <View style={styles.row}><View style={styles.copy}><Text style={styles.operation}>{job.operation.replace(/_/g, " ")}</Text><Text selectable style={styles.jobKey}>{job.jobKey}</Text></View><View style={[styles.status, statusStyle(job.status)]}><Text style={styles.statusText}>{job.status.replace(/_/g, " ")}</Text></View></View>
          <Text style={styles.detail}>Attempt {job.attempt} of {job.maxAttempts} · submitted {new Date(job.createdAt).toLocaleString()}</Text>
          {job.completedAt ? <Text style={styles.detail}>Completed {new Date(job.completedAt).toLocaleString()}</Text> : null}
          {job.failureCode || job.failureReason ? <Text style={styles.errorDetail}>{job.failureCode ? `${job.failureCode}: ` : ""}{job.failureReason ?? "The Lakehouse worker reported a failure."}</Text> : null}
          {job.resultSummary ? <Text style={styles.detail}>Result summary: {JSON.stringify(job.resultSummary)}</Text> : null}
          {activeStatuses.has(job.status) ? <Pressable disabled={cancel.isPending} onPress={() => Alert.alert("Request cancellation", "The worker will stop at its next safe heartbeat and preserve the audit record.", [{ text: "Keep running", style: "cancel" }, { text: "Cancel job", style: "destructive", onPress: () => cancel.mutate(job.id) }])} style={({ pressed }) => [styles.cancel, (pressed || cancel.isPending) && styles.pressed]}><Text style={styles.cancelText}>{cancel.isPending ? "Recording cancellation…" : "Request cancellation"}</Text></Pressable> : null}
        </View>
      )) : <View style={styles.card}><Text style={styles.muted}>No governed Sedona jobs are attached to this run. Submit the operation through the authenticated PWA workbench or an approved control-plane workflow.</Text></View>}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: "#f8fafc" },
  error: { color: "#b91c1c", textAlign: "center", lineHeight: 20 }, muted: { color: "#64748b", lineHeight: 19 }, retry: { backgroundColor: "#fee2e2", borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 }, retryText: { color: "#b91c1c", fontWeight: "800" },
  banner: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1, padding: 15, borderRadius: 14, gap: 6 }, bannerTitle: { color: "#0f172a", fontSize: 16, fontWeight: "800" }, bannerText: { color: "#334155", fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: "#fff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 15, gap: 9 }, title: { color: "#0f172a", fontSize: 21, fontWeight: "800" }, subtitle: { color: "#64748b", fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", gap: 10, justifyContent: "space-between", alignItems: "flex-start" }, copy: { flex: 1, gap: 3 }, operation: { color: "#0f172a", textTransform: "capitalize", fontSize: 16, fontWeight: "800" }, jobKey: { color: "#64748b", fontSize: 11 },
  status: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 }, pending: { backgroundColor: "#fef3c7" }, succeeded: { backgroundColor: "#dcfce7" }, failed: { backgroundColor: "#fee2e2" }, statusText: { color: "#334155", fontWeight: "800", fontSize: 11, textTransform: "capitalize" },
  detail: { color: "#475569", fontSize: 12, lineHeight: 18 }, errorDetail: { color: "#b91c1c", fontSize: 12, lineHeight: 18 }, cancel: { alignItems: "center", borderColor: "#fecaca", borderWidth: 1, borderRadius: 10, paddingVertical: 11 }, cancelText: { color: "#b91c1c", fontWeight: "800" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
