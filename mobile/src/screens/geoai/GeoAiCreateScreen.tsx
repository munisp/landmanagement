import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { AppScreen } from "../../components/AppScreen";
import { GeoAiStatusBadge } from "../../components/GeoAiStatusBadge";
import { useMobileSession } from "../../providers/MobileSessionProvider";
import {
  createGeoAiRun,
  listGeoAiAssets,
  queueGeoAiRun,
  type GeoAnalysisManifest,
  type GeoAnalysisType,
  type GeoAssetCatalogRecord,
} from "../../services/api";

const analysisTypes: Array<{ value: GeoAnalysisType; label: string; helper: string }> = [
  { value: "spatial_correctness", label: "Spatial correctness", helper: "Use registered parcel geometry plus a metric analysis CRS and a geometry method parameter." },
  { value: "network_access", label: "Network access", helper: "Use registered road-network evidence and declared routing assumptions." },
  { value: "imagery_analysis", label: "Imagery analysis", helper: "Use registered orthophoto, satellite, or raster evidence." },
  { value: "change_detection", label: "Change detection", helper: "Use two registered comparable scenes and a declared temporal window." },
  { value: "lidar_qc", label: "LiDAR quality control", helper: "Use a registered LiDAR point cloud with a vertical CRS and resolution parameter." },
  { value: "model_governance", label: "Model governance", helper: "Attach real model training, split, metric, and uncertainty evidence." },
  { value: "suitability_analysis", label: "Suitability analysis", helper: "Create an evidence-bound suitability run; complete it with the dedicated decision request." },
  { value: "cartography_review", label: "Cartography review", helper: "Create a reviewable presentation and map-design evidence record." },
  { value: "arcgis_automation", label: "ArcGIS automation", helper: "Create an evidence record before requesting a separate human-approved ArcGIS operation." },
  { value: "field_evidence_review", label: "Field evidence review", helper: "Review a real mobile-captured field observation with immutable server integrity and GPS provenance." },
];

function parseObject(value: string, label: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label} must be a valid JSON object`);
  }
}

function parseOptionalObject(value: string, label: string): Record<string, unknown> | undefined {
  return value.trim() ? parseObject(value, label) : undefined;
}

function assetReference(asset: GeoAssetCatalogRecord) {
  if (!asset.checksumSha256) throw new Error(`Registered asset ${asset.assetId} is missing a server-recorded SHA-256 checksum`);
  return {
    assetId: asset.assetId,
    assetType: asset.assetType,
    uri: asset.uri,
    dataSource: asset.dataSource,
    sourceCrs: asset.sourceCrs ?? undefined,
    verticalCrs: asset.verticalCrs ?? undefined,
    acquiredAt: asset.acquiredAt ?? undefined,
    checksumSha256: asset.checksumSha256,
    qualityMetadata: asset.qualityMetadata,
    provenance: asset.provenance,
  };
}

export function GeoAiCreateScreen() {
  const router = useRouter();
  const session = useMobileSession();
  const [analysisType, setAnalysisType] = useState<GeoAnalysisType>("imagery_analysis");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [analysisCrs, setAnalysisCrs] = useState("");
  const [outputCrs, setOutputCrs] = useState("");
  const [methodParameters, setMethodParameters] = useState("{}");
  const [temporalWindow, setTemporalWindow] = useState("");
  const [networkAssumptions, setNetworkAssumptions] = useState("");
  const [modelContext, setModelContext] = useState("");
  const [legalUse, setLegalUse] = useState(false);
  const [allowProvisionalOutput, setAllowProvisionalOutput] = useState(true);

  const assetQuery = useQuery<GeoAssetCatalogRecord[], Error>({
    queryKey: ["geoai", "assets"],
    queryFn: () => listGeoAiAssets({ limit: 200 }, session.accessToken),
    enabled: Boolean(session.accessToken),
  });

  const selectedAssets = useMemo(() => (assetQuery.data ?? []).filter((asset) => selectedAssetIds.includes(asset.assetId)), [assetQuery.data, selectedAssetIds]);
  const activeType = analysisTypes.find((candidate) => candidate.value === analysisType) ?? analysisTypes[0];

  const toggleAsset = (assetId: string) => setSelectedAssetIds((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]);

  const createMutation = useMutation<number, Error, boolean>({
    mutationFn: async (queueImmediately: boolean) => {
      if (!session.accessToken) throw new Error("Sign in is required to create a GeoAI analysis");
      if (title.trim().length < 3) throw new Error("Provide an analysis title of at least three characters");
      if (purpose.trim().length < 10) throw new Error("Describe the analysis purpose in at least ten characters");
      if (!selectedAssets.length) throw new Error("Select one or more real registered source assets");
      const parsedParcelId = parcelId.trim() ? Number(parcelId.trim()) : undefined;
      if (parsedParcelId !== undefined && (!Number.isInteger(parsedParcelId) || parsedParcelId <= 0)) throw new Error("Parcel ID must be a positive whole number when supplied");
      const temporal = parseOptionalObject(temporalWindow, "Temporal window") as GeoAnalysisManifest["temporalWindow"];
      const network = parseOptionalObject(networkAssumptions, "Network assumptions") as GeoAnalysisManifest["networkAssumptions"];
      const model = parseOptionalObject(modelContext, "Model context") as GeoAnalysisManifest["modelContext"];
      const manifest: GeoAnalysisManifest = {
        analysisType,
        title: title.trim(),
        purpose: purpose.trim(),
        parcelId: parsedParcelId,
        sourceAssets: selectedAssets.map(assetReference),
        analysisCrs: analysisCrs.trim() || undefined,
        outputCrs: outputCrs.trim() || undefined,
        temporalWindow: temporal,
        networkAssumptions: network,
        modelContext: model,
        methodParameters: parseObject(methodParameters, "Method parameters"),
        legalOrRegulatoryUse: legalUse,
        allowProvisionalOutput,
      };
      const created = await createGeoAiRun(manifest, session.accessToken);
      if (queueImmediately) await queueGeoAiRun(created.run.id, session.accessToken);
      return created.run.id;
    },
    onSuccess: async (runId) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/geoai/${runId}` as any);
    },
    onError: (error: Error) => Alert.alert("Analysis was not created", error.message),
  });

  const renderAsset = ({ item }: { item: GeoAssetCatalogRecord }) => {
    const selected = selectedAssetIds.includes(item.assetId);
    return <Pressable onPress={() => toggleAsset(item.assetId)} style={({ pressed }) => [styles.asset, selected && styles.assetSelected, pressed && styles.pressed]}>
      <View style={styles.assetHeading}><View style={styles.assetCopy}><Text style={styles.assetId}>{item.assetId}</Text><Text style={styles.assetMeta}>{item.assetType.replace(/_/g, " ")} · {item.dataSource}</Text></View><GeoAiStatusBadge value={item.evidenceStatus} evidence /></View>
      <Text numberOfLines={1} style={styles.assetUri}>{item.uri}</Text>
      <Text style={styles.assetSelection}>{selected ? "Selected" : "Tap to select"}</Text>
    </Pressable>;
  };

  return <AppScreen scroll>
    <View style={styles.notice}><Text style={styles.noticeTitle}>Advanced, policy-gated analysis creation</Text><Text style={styles.noticeText}>The mobile app submits only registered evidence and the exact declared methodology. The server validates every asset, CRS, temporal, network, and model requirement before it creates a durable run.</Text></View>
    <Pressable onPress={() => router.push("/geoai/capture" as any)} style={({ pressed }) => [styles.fieldShortcut, pressed && styles.pressed]}><Text style={styles.fieldShortcutTitle}>Need to collect field evidence?</Text><Text style={styles.fieldShortcutText}>Open the dedicated GPS-and-camera capture workflow.</Text></Pressable>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Analysis type</Text>
      <View style={styles.typeList}>{analysisTypes.map((type) => <Pressable key={type.value} onPress={() => setAnalysisType(type.value)} style={[styles.typeOption, analysisType === type.value && styles.typeOptionSelected]}><Text style={[styles.typeLabel, analysisType === type.value && styles.typeLabelSelected]}>{type.label}</Text><Text style={styles.typeHelper}>{type.helper}</Text></Pressable>)}</View>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Purpose and spatial context</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Analysis title" style={styles.input} />
      <TextInput value={purpose} onChangeText={setPurpose} placeholder="Operational purpose" multiline textAlignVertical="top" style={[styles.input, styles.multiline]} />
      <TextInput value={parcelId} onChangeText={setParcelId} placeholder="Parcel ID (optional)" keyboardType="number-pad" style={styles.input} />
      <TextInput value={analysisCrs} onChangeText={setAnalysisCrs} placeholder="Analysis CRS, e.g. EPSG:32632 when required" style={styles.input} />
      <TextInput value={outputCrs} onChangeText={setOutputCrs} placeholder="Output CRS (optional)" style={styles.input} />
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Registered source assets</Text>
      <Text style={styles.cardSubtitle}>Select real platform assets. A rejected asset cannot be used, and the server checks immutable URI/checksum consistency.</Text>
      {assetQuery.isLoading ? <ActivityIndicator color="#2563eb" /> : assetQuery.error ? <Text style={styles.error}>{assetQuery.error.message}</Text> : (assetQuery.data?.length ? <View style={styles.assetList}>{assetQuery.data.map((asset) => <React.Fragment key={asset.assetId}>{renderAsset({ item: asset })}</React.Fragment>)}</View> : <Text style={styles.empty}>No registered assets are available to this authorized user.</Text>)}
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Method contract</Text>
      <Text style={styles.cardSubtitle}>Provide JSON objects for the selected method. The server is the authority for semantic and evidence validation; it rejects incomplete or incompatible workflows.</Text>
      <Text style={styles.jsonLabel}>Method parameters (required object)</Text><TextInput value={methodParameters} onChangeText={setMethodParameters} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={[styles.jsonInput, styles.jsonLarge]} />
      <Text style={styles.jsonLabel}>Temporal window (optional object)</Text><TextInput value={temporalWindow} onChangeText={setTemporalWindow} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={styles.jsonInput} />
      <Text style={styles.jsonLabel}>Network assumptions (optional object)</Text><TextInput value={networkAssumptions} onChangeText={setNetworkAssumptions} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={styles.jsonInput} />
      <Text style={styles.jsonLabel}>Model context (optional object)</Text><TextInput value={modelContext} onChangeText={setModelContext} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" style={styles.jsonInput} />
      <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Legal or regulatory use</Text><Text style={styles.switchText}>Adds the stricter policy evidence gate.</Text></View><Switch value={legalUse} onValueChange={setLegalUse} /></View>
      <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.switchTitle}>Allow provisional output</Text><Text style={styles.switchText}>Shows evidence limitations; it never marks a run verified.</Text></View><Switch value={allowProvisionalOutput} onValueChange={setAllowProvisionalOutput} /></View>
    </View>
    <View style={styles.actionRow}><Pressable disabled={createMutation.isPending} onPress={() => createMutation.mutate(false)} style={({ pressed }) => [styles.secondaryButton, (pressed || createMutation.isPending) && styles.pressed]}><Text style={styles.secondaryText}>Save draft</Text></Pressable><Pressable disabled={createMutation.isPending} onPress={() => createMutation.mutate(true)} style={({ pressed }) => [styles.primaryButton, (pressed || createMutation.isPending) && styles.pressed]}>{createMutation.isPending ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Create & queue</Text>}</Pressable></View>
  </AppScreen>;
}

const styles = StyleSheet.create({
  notice: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1, borderRadius: 14, padding: 14, gap: 5 }, noticeTitle: { color: "#1e3a8a", fontWeight: "800", fontSize: 16 }, noticeText: { color: "#334155", fontSize: 13, lineHeight: 19 }, fieldShortcut: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", borderWidth: 1, borderRadius: 13, padding: 13, gap: 4 }, fieldShortcutTitle: { color: "#166534", fontWeight: "800" }, fieldShortcutText: { color: "#166534", fontSize: 12 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }, cardTitle: { color: "#0f172a", fontWeight: "800", fontSize: 17 }, cardSubtitle: { color: "#64748b", lineHeight: 18, fontSize: 12 }, typeList: { gap: 8 }, typeOption: { borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 }, typeOptionSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" }, typeLabel: { color: "#1e293b", fontWeight: "800", textTransform: "capitalize" }, typeLabelSelected: { color: "#1d4ed8" }, typeHelper: { color: "#64748b", fontSize: 11, lineHeight: 16 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 9, paddingHorizontal: 10, paddingVertical: 10, color: "#0f172a" }, multiline: { minHeight: 82 }, assetList: { gap: 8 }, asset: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 10, gap: 5 }, assetSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" }, assetHeading: { flexDirection: "row", gap: 8, justifyContent: "space-between" }, assetCopy: { flex: 1, gap: 3 }, assetId: { color: "#1e293b", fontWeight: "800", fontSize: 12 }, assetMeta: { color: "#64748b", fontSize: 11, textTransform: "capitalize" }, assetUri: { color: "#64748b", fontSize: 10 }, assetSelection: { color: "#1d4ed8", fontSize: 11, fontWeight: "700" },
  jsonLabel: { color: "#334155", fontSize: 12, fontWeight: "700", marginTop: 3 }, jsonInput: { minHeight: 68, borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 9, padding: 10, fontFamily: "Courier", fontSize: 11, color: "#0f172a" }, jsonLarge: { minHeight: 106 }, switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 3 }, switchCopy: { flex: 1, gap: 2 }, switchTitle: { color: "#1e293b", fontWeight: "700", fontSize: 13 }, switchText: { color: "#64748b", fontSize: 11, lineHeight: 16 },
  actionRow: { flexDirection: "row", gap: 10 }, primaryButton: { flex: 1, backgroundColor: "#2563eb", minHeight: 50, borderRadius: 11, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#ffffff", fontWeight: "800" }, secondaryButton: { flex: 1, backgroundColor: "#ffffff", borderColor: "#93c5fd", borderWidth: 1, minHeight: 50, borderRadius: 11, alignItems: "center", justifyContent: "center" }, secondaryText: { color: "#1d4ed8", fontWeight: "800" }, error: { color: "#b91c1c" }, empty: { color: "#64748b", fontStyle: "italic" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
