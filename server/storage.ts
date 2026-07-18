// Storage helpers with two real backends:
//  1. Storage proxy (BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY) — the
//     managed Biz-provided proxy, used when configured.
//  2. Local filesystem backend (LOCAL_STORAGE_DIR, default <cwd>/storage) —
//     for self-hosted deployments. Files are written to disk and served over
//     HTTP by the /api/files route registered in server/_core/index.ts.
//
// Both backends persist real bytes and return resolvable URLs. No mocks.

import { promises as fs } from 'fs';
import path from 'path';
import { ENV } from './_core/env';

type StorageConfig = { baseUrl: string; apiKey: string };

function getStorageConfig(): StorageConfig | null {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl)
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

// ---------------------------------------------------------------------------
// Local filesystem backend
// ---------------------------------------------------------------------------

function getLocalStorageRoot(): string {
  return path.resolve(process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), 'storage'));
}

/**
 * Resolve a storage key to an absolute path inside the local storage root,
 * rejecting path traversal outside the root.
 */
export function resolveLocalStoragePath(relKey: string): string {
  const root = getLocalStorageRoot();
  const key = normalizeKey(relKey);
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Invalid storage key (path traversal): ${relKey}`);
  }
  return resolved;
}

async function localStoragePut(
  relKey: string,
  data: Buffer | Uint8Array | string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = resolveLocalStoragePath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data));
  return { key, url: `/api/files/${key.split('/').map(encodeURIComponent).join('/')}` };
}

async function localStorageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const filePath = resolveLocalStoragePath(key);
  // Stat the file so missing keys fail loudly instead of minting dead URLs.
  await fs.access(filePath);
  return { key, url: `/api/files/${key.split('/').map(encodeURIComponent).join('/')}` };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const config = getStorageConfig();
  if (!config) {
    return localStoragePut(relKey, data);
  }
  const { baseUrl, apiKey } = config;
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string; }> {
  const config = getStorageConfig();
  if (!config) {
    return localStorageGet(relKey);
  }
  const { baseUrl, apiKey } = config;
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}
