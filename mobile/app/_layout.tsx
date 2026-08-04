import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { MobileAppProviders } from "../src/providers/MobileAppProviders";
import { useMobileSession } from "../src/providers/MobileSessionProvider";
import { SignInScreen } from "../src/screens/SignInScreen";

function ApplicationGate() {
  const session = useMobileSession();

  if (session.status === "loading") {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }
  if (session.status === "signed_out" || session.status === "configuration_error") {
    return <SignInScreen />;
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: "#ffffff" }, headerTintColor: "#0f172a", contentStyle: { backgroundColor: "#f8fafc" } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="geoai/[runId]" options={{ title: "GeoAI Evidence" }} />
      <Stack.Screen name="geoai/report/[runId]" options={{ title: "Evidence Report" }} />
      <Stack.Screen name="geoai/map/[runId]" options={{ title: "Evidence Map" }} />
      <Stack.Screen name="geoai/create" options={{ title: "Create GeoAI Run" }} />
      <Stack.Screen name="geoai/capture" options={{ title: "Capture Field Evidence", presentation: "modal" }} />
      <Stack.Screen name="field/drafts" options={{ title: "Offline Field Drafts" }} />
      <Stack.Screen name="arcgis/index" options={{ title: "ArcGIS Operations" }} />
      <Stack.Screen name="arcgis/request" options={{ title: "Request ArcGIS Operation" }} />
      <Stack.Screen name="arcgis/[operationId]" options={{ title: "ArcGIS Operation" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <MobileAppProviders>
      <StatusBar style="dark" />
      <ApplicationGate />
    </MobileAppProviders>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center" },
});
