import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const icons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  index: { active: "grid", inactive: "grid-outline" },
  geoai: { active: "map", inactive: "map-outline" },
  field: { active: "camera", inactive: "camera-outline" },
  notifications: { active: "notifications", inactive: "notifications-outline" },
  more: { active: "menu", inactive: "menu-outline" },
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 10);
  return (
    <Tabs
      screenOptions={({ route }: { route: { name: string } }) => ({
        headerStyle: { backgroundColor: "#F8FAFC" },
        headerTintColor: "#0F172A",
        headerTitleStyle: { fontWeight: "800", fontSize: 16 },
        headerShadowVisible: false,
        tabBarActiveTintColor: "#1D4ED8",
        tabBarInactiveTintColor: "#64748B",
        tabBarStyle: {
          backgroundColor: "rgba(255,255,255,0.98)",
          borderTopColor: "#E2E8F0",
          borderTopWidth: 1,
          height: 58 + bottomInset,
          paddingTop: 7,
          paddingBottom: bottomInset,
          shadowColor: "#0F172A",
          shadowOpacity: 0.08,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: -4 },
          elevation: 10,
        },
        tabBarItemStyle: { borderRadius: 12, marginHorizontal: 2 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: 1 },
        tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => {
          const icon = icons[route.name] ?? { active: "ellipse", inactive: "ellipse-outline" };
          return <Ionicons name={focused ? icon.active : icon.inactive} color={color} size={focused ? size + 1 : size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="geoai" options={{ title: "Maps" }} />
      <Tabs.Screen name="field" options={{ title: "Field" }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}
