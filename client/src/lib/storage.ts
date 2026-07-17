/**
 * Frontend storage utility for uploading files to S3
 * Note: This is a client-side helper. The actual upload happens via tRPC in the component.
 */

export interface StorageUploadResult {
  url: string;
  key: string;
}

/**
 * Convert file/buffer to base64 for tRPC transmission
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper function for components to prepare file data for upload
 * Components should use trpc.storage.upload.mutate() with this data
 */
export async function prepareFileForUpload(
  file: File,
  key: string
): Promise<{ key: string; data: string; contentType: string }> {
  const buffer = await file.arrayBuffer();
  const base64Data = arrayBufferToBase64(buffer);
  
  return {
    key,
    data: base64Data,
    contentType: file.type,
  };
}

// Legacy function for backward compatibility - redirects to tRPC
export async function storagePut(
  key: string,
  data: Uint8Array | ArrayBuffer,
  contentType: string
): Promise<StorageUploadResult> {
  // Convert to Uint8Array first for consistent handling
  const uint8Array = data instanceof Uint8Array ? data : new Uint8Array(data);
  const buffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength) as ArrayBuffer;
  const base64Data = arrayBufferToBase64(buffer);
  
  // Note: This requires the component to have access to trpc client
  // In practice, components should call trpc.storage.upload.mutate() directly
  throw new Error('Use trpc.storage.upload.mutate() instead of storagePut() directly');
}
