import React, { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { AppScreen } from "../../components/AppScreen";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { requestGeoAiArcgisOperation } from "../../services/api";

function parsePlan(value: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label} must be a non-empty JSON object`);
  }
}

export function ArcgisRequestScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const [runId, setRunId] = useState("");
  const [operationType, setOperationType] = useState("");
  const [targetWorkspaceUri, setTargetWorkspaceUri] = useState("");
  const [operationPlan, setOperationPlan] = useState("{\n  \n}");
  const [recoveryPlan, setRecoveryPlan] = useState("{\n  \n}");

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!session.accessToken) throw new Error("Sign in is required before requesting a controlled ArcGIS operation");
      const parsedRunId = runId.trim() ? Number(runId.trim()) : undefined;
      if (parsedRunId !== undefined && (!Number.isInteger(parsedRunId) || parsedRunId <= 0)) throw new Error("Linked GeoAI run ID must be a positive whole number when supplied");
      if (operationType.trim().length < 2) throw new Error("Describe the ArcGIS operation type");
      if (!/^(https|s3|ipfs|gs):\/\//i.test(targetWorkspaceUri.trim())) throw new Error("Target workspace must use an HTTPS, S3, IPFS, or GCS URI");
      return requestGeoAiArcgisOperation({
        runId: parsedRunId,
        operationType: operationType.trim(),
        targetWorkspaceUri: targetWorkspaceUri.trim(),
        operationPlan: parsePlan(operationPlan, "Operation plan"),
        recoveryPlan: parsePlan(recoveryPlan, "Recovery plan"),
      }, session.accessToken);
    },
    onSuccess: async (operation) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/arcgis/${operation.id}` as any);
    },
    onError: (error: Error) => Alert.alert("Operation request was not created", error.message),
  });

  return <AppScreen scroll>
    <View style={styles.banner}><Text style={styles.bannerTitle}>Request, do not execute</Text><Text style={styles.bannerText}>Creating a request only persists the operation plan and recovery plan for authorized review. It cannot run GIS automation. Approval and a separate confirmation are required before the server can contact the configured control plane.</Text></View>
    <View style={styles.card}><Text style={styles.label}>Linked GeoAI run ID (optional)</Text><TextInput value={runId} onChangeText={setRunId} keyboardType="number-pad" placeholder="Existing GeoAI run ID" style={styles.input} /><Text style={styles.label}>Operation type</Text><TextInput value={operationType} onChangeText={setOperationType} placeholder="e.g. reconcile_feature_class" style={styles.input} /><Text style={styles.label}>Target workspace URI</Text><TextInput value={targetWorkspaceUri} onChangeText={setTargetWorkspaceUri} autoCapitalize="none" autoCorrect={false} placeholder="https://… or s3://…" style={styles.input} /></View>
    <View style={styles.card}><Text style={styles.label}>Operation plan</Text><Text style={styles.help}>Specify the exact proposed work in a structured JSON object. The control plane receives this immutable server-persisted plan.</Text><TextInput value={operationPlan} onChangeText={setOperationPlan} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={styles.jsonInput} /><Text style={styles.label}>Recovery plan</Text><Text style={styles.help}>A non-empty recovery plan is mandatory. The backend refuses execution when it is missing.</Text><TextInput value={recoveryPlan} onChangeText={setRecoveryPlan} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={styles.jsonInput} /></View>
    <Pressable disabled={requestMutation.isPending} onPress={() => requestMutation.mutate()} style={({ pressed }) => [styles.requestButton, (pressed || requestMutation.isPending) && styles.disabled]}>{requestMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.requestText}>Submit guarded operation request</Text>}</Pressable>
  </AppScreen>;
}

const styles = StyleSheet.create({
  banner: { backgroundColor: "#fff7ed", borderColor: "#fed7aa", borderWidth: 1, borderRadius: 14, padding: 14, gap: 5 }, bannerTitle: { color: "#9a3412", fontWeight: "800", fontSize: 16 }, bannerText: { color: "#7c2d12", fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 14, gap: 9 }, label: { color: "#334155", fontWeight: "800", fontSize: 13, marginTop: 2 }, help: { color: "#64748b", fontSize: 12, lineHeight: 17 }, input: { borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 9, padding: 10, color: "#0f172a" }, jsonInput: { minHeight: 150, borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 9, padding: 10, color: "#0f172a", fontFamily: "Courier", fontSize: 11 }, requestButton: { backgroundColor: "#1d4ed8", minHeight: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" }, requestText: { color: "#ffffff", fontWeight: "800" }, disabled: { opacity: 0.48 },
});
