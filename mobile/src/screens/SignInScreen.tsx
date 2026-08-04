import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useMobileSession } from "../providers/MobileSessionProvider";

export function SignInScreen() {
  const session = useMobileSession();
  const isBusy = session.status === "loading";
  const configurationError = session.status === "configuration_error";

  const signIn = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    await session.signIn();
  };

  return (
    <View style={styles.container}>
      <View style={styles.brandMark}><Text style={styles.brandGlyph}>G</Text></View>
      <Text style={styles.title}>GeoAI Field Operations</Text>
      <Text style={styles.subtitle}>
        Access verified land evidence, field capture, review workflows, and guarded GIS operations through your authorized IDLR account.
      </Text>
      {session.error ? <Text style={styles.error}>{session.error}</Text> : null}
      {isBusy ? (
        <ActivityIndicator color="#2563eb" size="large" />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign in securely with Keycloak"
          disabled={configurationError}
          onPress={signIn}
          style={({ pressed }) => [styles.button, (pressed || configurationError) && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{configurationError ? "Identity configuration required" : "Secure sign in"}</Text>
        </Pressable>
      )}
      <Text style={styles.footnote}>Field data is not treated as verified evidence until the server-side GeoAI policy and an authorized review have passed.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", paddingHorizontal: 28, justifyContent: "center", gap: 18 },
  brandMark: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#1d4ed8", justifyContent: "center", alignItems: "center", alignSelf: "center" },
  brandGlyph: { color: "#ffffff", fontSize: 34, fontWeight: "800" },
  title: { color: "#0f172a", fontSize: 28, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "#475569", fontSize: 16, lineHeight: 23, textAlign: "center" },
  error: { color: "#b91c1c", backgroundColor: "#fef2f2", padding: 12, borderRadius: 10, lineHeight: 20 },
  button: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  buttonPressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  footnote: { color: "#64748b", fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 10 },
});
