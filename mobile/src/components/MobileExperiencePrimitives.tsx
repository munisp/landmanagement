import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";

type Tone = "blue" | "green" | "amber" | "red" | "slate";

const palette: Record<Tone, { surface: string; border: string; icon: string; text: string }> = {
  blue: { surface: "#EFF6FF", border: "#BFDBFE", icon: "#1D4ED8", text: "#1E3A8A" },
  green: { surface: "#ECFDF5", border: "#A7F3D0", icon: "#047857", text: "#065F46" },
  amber: { surface: "#FFFBEB", border: "#FDE68A", icon: "#B45309", text: "#92400E" },
  red: { surface: "#FEF2F2", border: "#FECACA", icon: "#B91C1C", text: "#991B1B" },
  slate: { surface: "#F8FAFC", border: "#E2E8F0", icon: "#475569", text: "#334155" },
};

export function MobilePageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <View style={styles.pageHeader}>
    <View style={styles.headerCopy}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.pageTitle}>{title}</Text>{description ? <Text style={styles.pageDescription}>{description}</Text> : null}</View>
    {action ? <View style={styles.headerAction}>{action}</View> : null}
  </View>;
}

export function MobileStatusBanner({ tone = "blue", icon, title, description }: { tone?: Tone; icon: keyof typeof Ionicons.glyphMap; title: string; description: string }) {
  const colors = palette[tone];
  return <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.bannerIcon, { backgroundColor: "#FFFFFF" }]}><Ionicons name={icon} color={colors.icon} size={18} /></View><View style={styles.bannerCopy}><Text style={[styles.bannerTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.bannerDescription, { color: colors.text }]}>{description}</Text></View></View>;
}

export function MobileMetricTile({ icon, label, value, tone = "blue" }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string | number; tone?: Tone }) {
  const colors = palette[tone];
  return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: colors.surface }]}><Ionicons name={icon} color={colors.icon} size={17} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

export function MobileSection({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <View style={styles.section}><View style={styles.sectionHeader}><View style={styles.headerCopy}><Text style={styles.sectionTitle}>{title}</Text>{description ? <Text style={styles.sectionDescription}>{description}</Text> : null}</View>{action}</View><View style={styles.sectionContent}>{children}</View></View>;
}

export function MobileActionButton({ label, onPress, disabled, tone = "blue", icon }: { label: string; onPress: () => void; disabled?: boolean; tone?: Tone; icon?: keyof typeof Ionicons.glyphMap }) {
  const colors = palette[tone];
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => { if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.icon }, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.actionButtonText}>{label}</Text>{icon ? <Ionicons name={icon} color="#FFFFFF" size={16} /> : null}</Pressable>;
}

export const mobileExperienceStyles = StyleSheet.create({
  choice: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 13, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 11 },
  choiceSelected: { borderColor: "#93C5FD", backgroundColor: "#EFF6FF" },
  choiceTitle: { color: "#0F172A", fontSize: 14, fontWeight: "800" },
  choiceMeta: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 2 },
  textInput: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#0F172A", backgroundColor: "#FFFFFF" },
  compactLabel: { color: "#475569", fontSize: 12, fontWeight: "700", marginBottom: 6 },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  divider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 4 },
  body: { color: "#334155", fontSize: 14, lineHeight: 21 },
  muted: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  error: { color: "#B91C1C", fontSize: 13, lineHeight: 19 },
  statusChip: { alignSelf: "flex-start", borderRadius: 99, backgroundColor: "#EFF6FF", paddingHorizontal: 9, paddingVertical: 4 },
  statusChipText: { color: "#1D4ED8", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
});

const styles = StyleSheet.create({
  pageHeader: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 4, gap: 12 },
  headerCopy: { flex: 1, gap: 4 },
  headerAction: { alignSelf: "flex-start" },
  eyebrow: { color: "#1D4ED8", fontSize: 11, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  pageTitle: { color: "#0F172A", fontSize: 30, lineHeight: 36, fontWeight: "900", letterSpacing: -0.8 },
  pageDescription: { color: "#475569", fontSize: 14, lineHeight: 21 },
  banner: { marginHorizontal: 20, marginTop: 14, borderRadius: 16, borderWidth: 1, padding: 13, flexDirection: "row", gap: 11 },
  bannerIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  bannerCopy: { flex: 1, gap: 2 },
  bannerTitle: { fontSize: 13, fontWeight: "900" },
  bannerDescription: { fontSize: 12, lineHeight: 18, opacity: 0.87 },
  metric: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", padding: 13, gap: 5, shadowColor: "#0F172A", shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  metricIcon: { width: 31, height: 31, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  metricValue: { color: "#0F172A", fontSize: 24, lineHeight: 28, fontWeight: "900", letterSpacing: -0.5 },
  metricLabel: { color: "#64748B", fontSize: 11, lineHeight: 15, fontWeight: "700" },
  section: { marginHorizontal: 20, marginTop: 14, borderRadius: 18, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#FFFFFF", overflow: "hidden", shadowColor: "#0F172A", shadowOpacity: 0.045, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 15, paddingTop: 15, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  sectionTitle: { color: "#0F172A", fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  sectionDescription: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  sectionContent: { padding: 15, gap: 11 },
  actionButton: { minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 14 },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.92 },
});
