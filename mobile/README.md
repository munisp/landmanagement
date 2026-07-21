# IDLR-PTS Mobile App

React Native (Expo) mobile application for the Integrated Digital Land Registry and Property Transaction System.

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Expo SDK 51 + React Native 0.74 | Cross-platform iOS/Android |
| Navigation | Expo Router (file-based) | Deep linking, tab navigation |
| State | TanStack Query v5 | Server state, caching, offline |
| Auth | Expo SecureStore + Keycloak | JWT storage, biometric login |
| Push | Expo Notifications | FCM (Android) + APNs (iOS) |
| Maps | react-native-maps | Parcel boundary visualization |
| Biometrics | expo-local-authentication | Face ID / Touch ID / Fingerprint |
| Offline | AsyncStorage + Background Sync | Field surveyor offline mode |
| Location | expo-location | GPS for field data collection |
| Camera | expo-camera | Document scanning, parcel photos |

## Screens

### Authentication
- `LoginScreen` — Email/password + biometric login
- `BiometricSetupScreen` — Enable Face ID / Touch ID

### Parcel Management
- `ParcelListScreen` — Searchable parcel list with filters
- `ParcelDetailScreen` — Full parcel details with map
- `ParcelMapScreen` — Interactive map with boundary overlay

### Notifications
- `NotificationInboxScreen` — Swipe-to-dismiss inbox
- `NotificationPreferencesScreen` — Channel and category settings
- `ParcelSubscriptionsScreen` — Manage followed parcels

### Field Surveyor
- `FieldSurveyorScreen` — GPS data collection, offline-first
- `DocumentScanScreen` — Camera-based document capture

### Transactions
- `TransactionListScreen` — Active transactions
- `TransactionDetailScreen` — Status, timeline, documents

## Push Notification Channels (Android)

| Channel | Priority | Use Case |
|---|---|---|
| `idlr-default` | HIGH | General notifications |
| `idlr-disputes` | MAX + bypass DND | Dispute alerts |
| `idlr-transactions` | HIGH | Transaction updates |

## Biometric Authentication Flow

1. User logs in with email/password
2. App prompts to enable biometric login
3. Credentials stored encrypted in SecureStore
4. Subsequent logins: biometric prompt → retrieve credentials → authenticate

## Offline Support

The app uses a layered offline strategy:
- **TanStack Query** caches all API responses
- **AsyncStorage** persists data across app restarts
- **Background Sync** queues mutations when offline
- **NetInfo** detects connectivity changes and triggers sync

## Getting Started

```bash
cd mobile
pnpm install
pnpm start
```

## Building for Production

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

## Environment Variables

```
EXPO_PUBLIC_API_URL=https://idlr-pts.ng.gov/api
EXPO_PUBLIC_KEYCLOAK_URL=https://auth.idlr-pts.ng.gov
EXPO_PUBLIC_KEYCLOAK_REALM=idlr-pts
EXPO_PUBLIC_KEYCLOAK_CLIENT_ID=mobile-app
```
