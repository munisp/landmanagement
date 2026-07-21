/**
 * Mobile API Service
 * ==================
 * Handles all API communication with the IDLR-PTS backend.
 * Uses tRPC-compatible JSON endpoints with JWT auth via SecureStore.
 */

import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://idlr-pts.ng.gov/api';

// ─────────────────────────────────────────────────────────────────────────────
// Token management
// ─────────────────────────────────────────────────────────────────────────────

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('auth_token', token);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync('auth_token');
}

// ─────────────────────────────────────────────────────────────────────────────
// Base fetch with auth
// ─────────────────────────────────────────────────────────────────────────────

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message ?? `HTTP ${response.status}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline detection
// ─────────────────────────────────────────────────────────────────────────────

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiFetch<LoginResponse>('/trpc/auth.login', {
    method: 'POST',
    body: JSON.stringify({ json: { email, password } }),
  });
  await setAuthToken(response.token);
  return response;
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/trpc/auth.logout', { method: 'POST', body: JSON.stringify({ json: {} }) });
  } finally {
    await clearAuthToken();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcel endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface Parcel {
  id: number;
  parcelNumber: string;
  address: string;
  status: string;
  area: number;
  ownerName?: string;
  lgaCode?: string;
  stateCode?: string;
  latitude?: number;
  longitude?: number;
}

export async function listParcels(params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<{ items: Parcel[]; total: number }> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  return apiFetch(`/trpc/parcels.list?input=${encodeURIComponent(JSON.stringify({ json: params }))}`);
}

export async function getParcel(id: number): Promise<Parcel> {
  return apiFetch(`/trpc/parcels.get?input=${encodeURIComponent(JSON.stringify({ json: { id } }))}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification endpoints
// ─────────────────────────────────────────────────────────────────────────────

export interface MobileNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export async function listNotifications(params: {
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
}): Promise<{ notifications: MobileNotification[]; total: number; unreadCount: number }> {
  return apiFetch(
    `/trpc/notificationInbox.list?input=${encodeURIComponent(JSON.stringify({ json: params }))}`
  );
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  await apiFetch('/trpc/notificationInbox.markAsRead', {
    method: 'POST',
    body: JSON.stringify({ json: { notificationId } }),
  });
}

export async function markAllNotificationsRead(): Promise<{ count: number }> {
  return apiFetch('/trpc/notificationInbox.markAllAsRead', {
    method: 'POST',
    body: JSON.stringify({ json: {} }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Parcel subscription endpoints
// ─────────────────────────────────────────────────────────────────────────────

export async function subscribeToParcel(parcelId: number, events: string[]): Promise<void> {
  await apiFetch('/trpc/parcelSubscriptions.subscribe', {
    method: 'POST',
    body: JSON.stringify({ json: { parcelId, events } }),
  });
}

export async function listMySubscriptions(): Promise<Parcel[]> {
  return apiFetch('/trpc/parcelSubscriptions.listMySubscriptions?input=%7B%22json%22%3A%7B%22activeOnly%22%3Atrue%7D%7D');
}

// ─────────────────────────────────────────────────────────────────────────────
// Push token registration
// ─────────────────────────────────────────────────────────────────────────────

export async function registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
  await apiFetch('/trpc/notificationPreferences.registerPushToken', {
    method: 'POST',
    body: JSON.stringify({ json: { token, platform } }),
  });
}
