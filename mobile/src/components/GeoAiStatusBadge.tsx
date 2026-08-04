import React from "react";
import { StyleSheet, Text, View } from "react-native";

const evidenceStyles: Record<string, { backgroundColor: string; color: string }> = {
  verified: { backgroundColor: "#dcfce7", color: "#166534" },
  provisional: { backgroundColor: "#fef3c7", color: "#92400e" },
  insufficient_evidence: { backgroundColor: "#e2e8f0", color: "#334155" },
  rejected: { backgroundColor: "#fee2e2", color: "#991b1b" },
};

const statusStyles: Record<string, { backgroundColor: string; color: string }> = {
  draft: { backgroundColor: "#e2e8f0", color: "#334155" },
  queued: { backgroundColor: "#dbeafe", color: "#1d4ed8" },
  running: { backgroundColor: "#e0f2fe", color: "#0369a1" },
  awaiting_review: { backgroundColor: "#fef3c7", color: "#92400e" },
  completed: { backgroundColor: "#dcfce7", color: "#166534" },
  failed: { backgroundColor: "#fee2e2", color: "#991b1b" },
  cancelled: { backgroundColor: "#f1f5f9", color: "#475569" },
  requested: { backgroundColor: "#f1f5f9", color: "#475569" },
  approved: { backgroundColor: "#dcfce7", color: "#166534" },
  executing: { backgroundColor: "#dbeafe", color: "#1d4ed8" },
};

export function GeoAiStatusBadge({ value, evidence = false }: { value: string; evidence?: boolean }) {
  const palette = (evidence ? evidenceStyles : statusStyles)[value] ?? { backgroundColor: "#e2e8f0", color: "#334155" };
  return (
    <View style={[styles.pill, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.text, { color: palette.color }]}>{value.replace(/_/g, " ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
  text: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});
