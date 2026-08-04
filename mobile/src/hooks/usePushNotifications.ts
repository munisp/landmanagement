import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { registerPushToken } from "../services/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationState {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: string | null;
}

export function usePushNotifications({ enabled, accessToken }: { enabled: boolean; accessToken: string | null }) {
  const [state, setState] = useState<PushNotificationState>({
    expoPushToken: null,
    notification: null,
    error: null,
  });
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!enabled || !accessToken || Platform.OS === "web") return;
    let cancelled = false;

    void (async () => {
      try {
        const token = await registerForPushNotifications();
        if (!token || cancelled) return;
        const platform = Platform.OS === "ios" ? "ios" : "android";
        await registerPushToken(token, platform, accessToken);
        if (!cancelled) setState((current) => ({ ...current, expoPushToken: token, error: null }));
      } catch (error) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "Unable to register this device for protected notifications",
          }));
        }
      }
    })();

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setState((current) => ({ ...current, notification }));
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      routeNotificationPayload(response.notification.request.content.data, router);
    });

    return () => {
      cancelled = true;
      if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
      if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [accessToken, enabled, router]);

  return state;
}

type ExpoPermissionCompatibility = { granted?: boolean };

function permissionsAreGranted(permissions: Notifications.NotificationPermissionsStatus): boolean {
  // Expo SDK 51 exposes `granted` at runtime while its mobile declaration can omit it
  // under pnpm's isolated transitive-module layout.
  return (permissions as unknown as ExpoPermissionCompatibility).granted === true;
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions = permissionsAreGranted(currentPermissions)
    ? currentPermissions
    : await Notifications.requestPermissionsAsync();
  if (!permissionsAreGranted(permissions)) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("idlr-default", {
      name: "IDLR platform updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0ea5e9",
    });
    await Notifications.setNotificationChannelAsync("idlr-geoai", {
      name: "GeoAI evidence and review alerts",
      description: "Evidence workflow completion, failure, and review-required notifications",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: "#2563eb",
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Expo EAS projectId is required to register push notifications");
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

function routeNotificationPayload(data: Record<string, unknown>, router: ReturnType<typeof useRouter>) {
  const route = typeof data.route === "string" ? data.route : null;
  if (route && (route.startsWith("/geoai/") || route.startsWith("/arcgis"))) {
    router.push(route as any);
    return;
  }
  const runId = Number(data.runId);
  if (Number.isInteger(runId) && runId > 0) router.push(`/geoai/${runId}` as any);
}
