import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "grid-outline",
  geoai: "map-outline",
  field: "camera-outline",
  notifications: "notifications-outline",
  more: "menu-outline",
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }: { route: { name: string } }) => ({
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#0f172a",
        tabBarActiveTintColor: "#2563eb",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: { backgroundColor: "#ffffff", borderTopColor: "#e2e8f0", height: Platform.select({ ios: 84, android: 64, default: 60 }) },
        tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name={icons[route.name] ?? "ellipse-outline"} color={color} size={size} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="geoai" options={{ title: "GeoAI" }} />
      <Tabs.Screen name="field" options={{ title: "Field" }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
