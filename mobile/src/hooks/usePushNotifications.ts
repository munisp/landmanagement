/**
 * Push Notifications Hook
 * ========================
 * Handles Expo push notification registration, token management,
 * and notification event listeners for the IDLR-PTS mobile app.
 */

import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerPushToken } from '../services/api';

// Configure how notifications are displayed when the app is in the foreground
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

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    expoPushToken: null,
    notification: null,
    error: null,
  });

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (token) {
        setState((s) => ({ ...s, expoPushToken: token }));
        // Register token with the backend
        const platform = Platform.OS as 'ios' | 'android';
        registerPushToken(token, platform).catch(console.error);
      }
    });

    // Listen for notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setState((s) => ({ ...s, notification }));
    });

    // Listen for notification response (user tapped notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      handleNotificationResponse(data);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return state;
}

async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[Push] Must use physical device for push notifications');
    return null;
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Push notification permission denied');
    return null;
  }

  // Configure Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('idlr-default', {
      name: 'IDLR-PTS Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0ea5e9',
      sound: 'notification.wav',
    });

    await Notifications.setNotificationChannelAsync('idlr-disputes', {
      name: 'Dispute Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#ef4444',
      sound: 'notification.wav',
      bypassDnd: true,
    });

    await Notifications.setNotificationChannelAsync('idlr-transactions', {
      name: 'Transaction Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#22c55e',
    });
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    console.error('[Push] Failed to get push token:', err);
    return null;
  }
}

function handleNotificationResponse(data: Record<string, unknown>) {
  // Navigation will be handled by the app's navigation service
  console.log('[Push] Notification tapped, data:', data);
  // In a real app, use a navigation ref to navigate:
  // if (data.transactionId) navigationRef.navigate('Transaction', { id: data.transactionId });
  // if (data.parcelId) navigationRef.navigate('Parcel', { id: data.parcelId });
  // if (data.disputeId) navigationRef.navigate('Dispute', { id: data.disputeId });
}
