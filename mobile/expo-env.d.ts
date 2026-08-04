/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_KEYCLOAK_URL?: string;
    EXPO_PUBLIC_KEYCLOAK_REALM?: string;
    EXPO_PUBLIC_KEYCLOAK_CLIENT_ID?: string;
    EXPO_PUBLIC_KEYCLOAK_SCOPES?: string;
    EXPO_PUBLIC_GEOAI_MAP_TILE_URL?: string;
  }
}
