import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { getApiBaseUrl } from "../lib/runtimeConfig";
import { registerGeoAiAsset, uploadStorageAsset, type GeoAssetReference } from "./api";

const MAX_FIELD_IMAGE_BYTES = 15 * 1024 * 1024;

export type CapturedFieldEvidence = {
  localUri: string;
  mediaType: string;
  capturedAt: string;
  location: {
    latitude: number;
    longitude: number;
    accuracyM: number | null;
    altitudeM: number | null;
    headingDegrees: number | null;
  };
  captureMethod: "camera" | "photo_library";
};

export async function captureFieldEvidence(method: "camera" | "photo_library"): Promise<CapturedFieldEvidence> {
  const permission = method === "camera"
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(`${method === "camera" ? "Camera" : "Photo-library"} permission is required to capture field evidence`);

  const locationPermission = await Location.requestForegroundPermissionsAsync();
  if (!locationPermission.granted) throw new Error("Foreground location permission is required to record field-evidence provenance");

  const pickerResult = method === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, exif: true })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9, exif: true });
  if (pickerResult.canceled || !pickerResult.assets[0]) throw new Error("Field-evidence capture was cancelled before an asset was produced");

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const asset = pickerResult.assets[0];
  const mediaType = asset.mimeType ?? "image/jpeg";
  if (!["image/jpeg", "image/png", "image/heic", "image/heif"].includes(mediaType)) {
    throw new Error(`Captured field evidence has unsupported media type ${mediaType}`);
  }

  return {
    localUri: asset.uri,
    mediaType,
    capturedAt: new Date().toISOString(),
    location: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
      altitudeM: Number.isFinite(position.coords.altitude ?? Number.NaN) ? position.coords.altitude ?? null : null,
      headingDegrees: Number.isFinite(position.coords.heading ?? Number.NaN) ? position.coords.heading ?? null : null,
    },
    captureMethod: method,
  };
}

function extensionFor(mediaType: string): string {
  switch (mediaType) {
    case "image/png": return "png";
    case "image/heic": return "heic";
    case "image/heif": return "heif";
    default: return "jpg";
  }
}

function toAbsoluteStorageUri(url: string): string {
  if (/^https:\/\//i.test(url)) return url;
  return new URL(url, `${getApiBaseUrl()}/`).toString();
}

export async function uploadAndRegisterFieldEvidence(input: {
  captured: CapturedFieldEvidence;
  parcelId?: number;
  accessToken: string;
}): Promise<GeoAssetReference> {
  const info = await FileSystem.getInfoAsync(input.captured.localUri, { size: true });
  if (!info.exists) throw new Error("Captured field-evidence file no longer exists on this device");
  if ((info.size ?? 0) <= 0) throw new Error("Captured field-evidence file is empty");
  if ((info.size ?? 0) > MAX_FIELD_IMAGE_BYTES) throw new Error("Captured field evidence exceeds the server's 15 MiB evidence limit");

  const base64 = await FileSystem.readAsStringAsync(input.captured.localUri, { encoding: FileSystem.EncodingType.Base64 });
  const assetId = `field-${Crypto.randomUUID()}`;
  const stored = await uploadStorageAsset({
    key: `geoai/field-observations/${assetId}.${extensionFor(input.captured.mediaType)}`,
    data: base64,
    contentType: input.captured.mediaType,
  }, input.accessToken);

  const asset: GeoAssetReference = {
    assetId,
    assetType: "field_observation",
    uri: toAbsoluteStorageUri(stored.url),
    dataSource: "idlr-mobile-field-capture",
    sourceCrs: "EPSG:4326",
    acquiredAt: input.captured.capturedAt,
    checksumSha256: stored.checksumSha256,
    qualityMetadata: {
      byteLength: stored.byteLength,
      mediaType: input.captured.mediaType,
      locationAccuracyM: input.captured.location.accuracyM,
    },
    provenance: {
      captureMethod: input.captured.captureMethod,
      capturedAt: input.captured.capturedAt,
      location: input.captured.location,
      platform: Platform.OS,
      localAssetWasSubmitted: true,
    },
  };
  await registerGeoAiAsset(asset, input.parcelId, "insufficient_evidence", input.accessToken);
  return asset;
}
