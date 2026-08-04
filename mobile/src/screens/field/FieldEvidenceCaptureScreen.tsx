import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { AppScreen } from "../../components/AppScreen";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import { captureFieldEvidence, uploadAndRegisterFieldEvidence, type CapturedFieldEvidence } from "../../services/fieldEvidence";
import { createGeoAiRun, queueGeoAiRun } from "../../services/api";
import { saveFieldDraft } from "../../services/fieldDrafts";

export function FieldEvidenceCaptureScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const [captured, setCaptured] = useState<CapturedFieldEvidence | null>(null);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [capturePending, setCapturePending] = useState(false);

  const capture = async (method: "camera" | "photo_library") => {
    setCapturePending(true);
    try {
      const result = await captureFieldEvidence(method);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCaptured(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Field evidence could not be captured";
      if (!message.includes("cancelled")) Alert.alert("Capture unavailable", message);
    } finally {
      setCapturePending(false);
    }
  };

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!captured) throw new Error("Capture a field observation before saving a local draft");
      const normalizedTitle = title.trim();
      const normalizedPurpose = purpose.trim();
      if (normalizedTitle.length < 3) throw new Error("Provide a descriptive evidence title of at least three characters");
      if (normalizedPurpose.length < 10) throw new Error("Describe the evidence purpose in at least ten characters");
      const parsedParcelId = parcelId.trim() ? Number(parcelId.trim()) : undefined;
      if (parsedParcelId !== undefined && (!Number.isInteger(parsedParcelId) || parsedParcelId <= 0)) throw new Error("Parcel ID must be a positive whole number when supplied");
      return saveFieldDraft({ title: normalizedTitle, purpose: normalizedPurpose, parcelId: parsedParcelId, captured });
    },
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Offline draft saved", "The media and provenance remain only on this device until you open Offline Field Drafts and explicitly synchronize them.", [{ text: "View drafts", onPress: () => router.push("/field/drafts" as any) }, { text: "Continue", style: "cancel" }]);
    },
    onError: (error: Error) => Alert.alert("Draft was not saved", error.message),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!session.accessToken) throw new Error("Sign in is required to submit field evidence");
      if (!captured) throw new Error("Capture a field observation before submitting a GeoAI workflow");
      const normalizedTitle = title.trim();
      const normalizedPurpose = purpose.trim();
      if (normalizedTitle.length < 3) throw new Error("Provide a descriptive evidence title of at least three characters");
      if (normalizedPurpose.length < 10) throw new Error("Describe the evidence purpose in at least ten characters");
      const parsedParcelId = parcelId.trim() ? Number(parcelId.trim()) : undefined;
      if (parsedParcelId !== undefined && (!Number.isInteger(parsedParcelId) || parsedParcelId <= 0)) {
        throw new Error("Parcel ID must be a positive whole number when supplied");
      }
      const asset = await uploadAndRegisterFieldEvidence({ captured, parcelId: parsedParcelId, accessToken: session.accessToken });
      const created = await createGeoAiRun({
        analysisType: "field_evidence_review",
        title: normalizedTitle,
        purpose: normalizedPurpose,
        parcelId: parsedParcelId,
        sourceAssets: [asset],
        methodParameters: { submittedFrom: "idlr-native-field-capture" },
        legalOrRegulatoryUse: false,
        allowProvisionalOutput: true,
      }, session.accessToken);
      await queueGeoAiRun(created.run.id, session.accessToken);
      return created.run.id;
    },
    onSuccess: async (runId) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/geoai/${runId}` as any);
    },
    onError: (error: Error) => Alert.alert("Submission was not completed", error.message),
  });

  return (
    <AppScreen scroll>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Evidence is captured, not verified</Text>
        <Text style={styles.noticeText}>The app records media, GPS provenance, and a server-computed checksum. A server-side evidence workflow and authorized review remain required before any verification claim.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Evidence title</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Boundary marker observation" style={styles.input} />
        <Text style={styles.label}>Purpose and context</Text>
        <TextInput value={purpose} onChangeText={setPurpose} placeholder="Describe why this field observation is being collected" style={[styles.input, styles.multiline]} multiline textAlignVertical="top" />
        <Text style={styles.label}>Parcel ID (optional)</Text>
        <TextInput value={parcelId} onChangeText={setParcelId} placeholder="Existing platform parcel ID" keyboardType="number-pad" style={styles.input} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Capture source media</Text>
        <Text style={styles.cardDescription}>The camera or photo library plus an approved foreground location reading are required. The device does not invent coordinates or media metadata.</Text>
        <View style={styles.buttonRow}>
          <Pressable disabled={capturePending || submitMutation.isPending || saveDraftMutation.isPending} onPress={() => void capture("camera")} style={({ pressed }) => [styles.primaryButton, (pressed || capturePending) && styles.pressed]}><Text style={styles.primaryButtonText}>{capturePending ? "Capturing…" : "Use camera"}</Text></Pressable>
          <Pressable disabled={capturePending || submitMutation.isPending || saveDraftMutation.isPending} onPress={() => void capture("photo_library")} style={({ pressed }) => [styles.secondaryButton, (pressed || capturePending) && styles.pressed]}><Text style={styles.secondaryButtonText}>Use library</Text></Pressable>
        </View>
        {captured ? <View style={styles.capturePreview}><Image source={{ uri: captured.localUri }} style={styles.image} /><View style={styles.captureMeta}><Text style={styles.captureTitle}>Field observation captured</Text><Text style={styles.captureText}>{captured.captureMethod.replace(/_/g, " ")} · {new Date(captured.capturedAt).toLocaleString()}</Text><Text style={styles.captureText}>{captured.location.latitude.toFixed(6)}, {captured.location.longitude.toFixed(6)} · accuracy {captured.location.accuracyM ?? "unknown"} m</Text></View></View> : <Text style={styles.empty}>No field observation has been captured.</Text>}
      </View>
      <Pressable disabled={!captured || submitMutation.isPending || saveDraftMutation.isPending} onPress={() => submitMutation.mutate()} style={({ pressed }) => [styles.submitButton, (!captured || pressed || submitMutation.isPending || saveDraftMutation.isPending) && styles.disabledButton]}>
        {submitMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Upload, register, and queue field review</Text>}
      </Pressable>
      <Pressable disabled={!captured || submitMutation.isPending || saveDraftMutation.isPending} onPress={() => saveDraftMutation.mutate()} style={({ pressed }) => [styles.draftButton, (!captured || pressed || submitMutation.isPending || saveDraftMutation.isPending) && styles.disabledButton]}>
        <Text style={styles.draftText}>{saveDraftMutation.isPending ? "Saving device-local draft…" : "Save secure offline draft"}</Text>
      </Pressable>
      <Pressable onPress={() => router.push("/field/drafts" as any)} style={({ pressed }) => [styles.draftsLink, pressed && styles.pressed]}>
        <Text style={styles.draftsLinkText}>Open Offline Field Drafts</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 14, padding: 14, gap: 5 }, noticeTitle: { color: "#713f12", fontWeight: "800", fontSize: 16 }, noticeText: { color: "#854d0e", fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, padding: 14, gap: 9 }, cardTitle: { color: "#0f172a", fontWeight: "800", fontSize: 17 }, cardDescription: { color: "#64748b", lineHeight: 19, fontSize: 13 }, label: { color: "#334155", fontWeight: "700", fontSize: 13, marginTop: 3 }, input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 10, color: "#0f172a", backgroundColor: "#ffffff" }, multiline: { minHeight: 92 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 3 }, primaryButton: { flex: 1, backgroundColor: "#2563eb", paddingVertical: 13, borderRadius: 10, alignItems: "center" }, primaryButtonText: { color: "#ffffff", fontWeight: "800" }, secondaryButton: { flex: 1, borderColor: "#93c5fd", borderWidth: 1, paddingVertical: 13, borderRadius: 10, alignItems: "center" }, secondaryButtonText: { color: "#1d4ed8", fontWeight: "800" },
  capturePreview: { flexDirection: "row", gap: 11, backgroundColor: "#f8fafc", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#e2e8f0" }, image: { width: 92, height: 92, borderRadius: 8, backgroundColor: "#e2e8f0" }, captureMeta: { flex: 1, gap: 5 }, captureTitle: { color: "#0f172a", fontWeight: "800" }, captureText: { color: "#64748b", fontSize: 11, lineHeight: 16 }, empty: { color: "#64748b", fontStyle: "italic", marginTop: 4 },
  submitButton: { backgroundColor: "#15803d", borderRadius: 12, paddingVertical: 15, alignItems: "center", minHeight: 50, justifyContent: "center" }, submitText: { color: "#ffffff", fontWeight: "800", textAlign: "center" }, draftButton: { backgroundColor: "#ffffff", borderColor: "#93c5fd", borderWidth: 1, borderRadius: 12, paddingVertical: 15, alignItems: "center", minHeight: 50, justifyContent: "center" }, draftText: { color: "#1d4ed8", fontWeight: "800", textAlign: "center" }, draftsLink: { alignItems: "center", paddingVertical: 5 }, draftsLinkText: { color: "#1d4ed8", fontWeight: "700" }, disabledButton: { opacity: 0.48 }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
