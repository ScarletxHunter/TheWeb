import * as tus from 'tus-js-client';
import { SUPABASE_RESUMABLE_UPLOAD_ENDPOINT, UPLOAD_PART_SIZE_BYTES } from './config';
import { supabase } from './supabase';
import type { FileRecord } from '../types';

const BUCKET = 'vault-files';
const CHUNKED_STORAGE_MARKER = 'chunked';
const CHUNKED_STORAGE_VERSION = 1;

type StoredFileRef = Pick<FileRecord, 'storage_path' | 'mime_type' | 'name'>;

type ChunkedStorageDescriptor = {
  prefix: string;
  partCount: number;
  partSize: number;
};

type TusResponse = {
  getBody?: () => string;
  getStatus?: () => number;
};

type TusError = Error & {
  originalResponse?: TusResponse;
};

function buildChunkPartPath(prefix: string, index: number): string {
  return `${prefix}.part-${String(index + 1).padStart(5, '0')}`;
}

function buildChunkedStoragePath(descriptor: ChunkedStorageDescriptor): string {
  return [
    CHUNKED_STORAGE_MARKER,
    String(CHUNKED_STORAGE_VERSION),
    encodeURIComponent(descriptor.prefix),
    String(descriptor.partCount),
    String(descriptor.partSize),
  ].join('|');
}

function parseChunkedStoragePath(storagePath: string): ChunkedStorageDescriptor | null {
  const [marker, version, encodedPrefix, partCountRaw, partSizeRaw] = storagePath.split('|');
  if (marker !== CHUNKED_STORAGE_MARKER) return null;
  if (Number(version) !== CHUNKED_STORAGE_VERSION) return null;

  const prefix = decodeURIComponent(encodedPrefix ?? '');
  const partCount = Number(partCountRaw);
  const partSize = Number(partSizeRaw);

  if (!prefix || !Number.isInteger(partCount) || partCount <= 0) return null;
  if (!Number.isFinite(partSize) || partSize <= 0) return null;

  return { prefix, partCount, partSize };
}

export function isChunkedStoragePath(storagePath: string): boolean {
  return parseChunkedStoragePath(storagePath) !== null;
}

function getChunkPaths(storagePath: string): string[] {
  const descriptor = parseChunkedStoragePath(storagePath);
  if (!descriptor) return [storagePath];

  return Array.from({ length: descriptor.partCount }, (_, index) =>
    buildChunkPartPath(descriptor.prefix, index)
  );
}

async function removeStoragePaths(paths: string[]): Promise<{ error: string | null }> {
  const uniquePaths = [...new Set(paths)];
  if (uniquePaths.length === 0) return { error: null };

  const batchSize = 100;
  for (let i = 0; i < uniquePaths.length; i += batchSize) {
    const batch = uniquePaths.slice(i, i + batchSize);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) return { error: error.message };
  }

  return { error: null };
}

async function uploadTusBinary(
  payload: Blob,
  storagePath: string,
  fileName: string,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<{ path: string; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { path: '', error: 'Not authenticated' };

  const uploadFile = payload instanceof File
    ? payload
    : new File([payload], fileName, {
        type: contentType || 'application/octet-stream',
        lastModified: Date.now(),
      });

  return new Promise((resolve) => {
    const upload = new tus.Upload(uploadFile, {
      endpoint: SUPABASE_RESUMABLE_UPLOAD_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        Authorization: `Bearer ${token}`,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: BUCKET,
        objectName: storagePath,
        contentType: contentType || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      onError(err: TusError) {
        let message = err.message || 'Upload failed';
        if ('originalResponse' in err) {
          const resp = err.originalResponse;
          const status = resp?.getStatus?.();
          if (status === 413) {
            message =
              'Upload rejected by Supabase because the file exceeds your global or bucket file size limit. Large files can be split automatically, but each uploaded part still has to fit under your current limit.';
          } else if (status) {
            try {
              const body = JSON.parse(resp?.getBody?.() ?? '{}');
              message = body?.error ?? body?.message ?? message;
            } catch {
              // Ignore malformed error bodies.
            }
          }
        }
        resolve({ path: '', error: message });
      },
      onProgress(bytesUploaded: number, bytesTotal: number) {
        const pct = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        onProgress?.(pct);
      },
      onSuccess() {
        onProgress?.(100);
        resolve({ path: storagePath, error: null });
      },
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    });
  });
}

// ---------------------------------------------------------------------------
// Image compression (canvas-based, no external library)
// ---------------------------------------------------------------------------

/**
 * Compress an image file using an off-screen canvas.
 * - Skips GIFs (animation would be lost) and SVGs.
 * - Scales down if either dimension exceeds maxDimension.
 * - Only returns the compressed blob if it's actually smaller.
 */
export async function compressImage(
  file: File,
  maxDimension = 2048,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height / width) * maxDimension);
          width = maxDimension;
        } else {
          width = Math.round((width / height) * maxDimension);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          resolve(
            new File([blob], file.name, {
              type: outputMime,
              lastModified: file.lastModified,
            })
          );
        },
        outputMime,
        outputMime === 'image/png' ? undefined : quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a file using the TUS resumable protocol.
 * Files larger than the configured per-request limit are automatically split
 * into multiple parts and rebuilt during download.
 */
export async function uploadFile(
  file: File,
  storagePath: string,
  onProgress?: (progress: number) => void,
): Promise<{ path: string; error: string | null }> {
  if (file.size <= UPLOAD_PART_SIZE_BYTES) {
    return uploadTusBinary(
      file,
      storagePath,
      file.name,
      file.type || 'application/octet-stream',
      onProgress,
    );
  }

  const totalParts = Math.ceil(file.size / UPLOAD_PART_SIZE_BYTES);
  const chunkPrefix = `${storagePath}.parts`;
  const uploadedPaths: string[] = [];
  let uploadedBytes = 0;

  for (let index = 0; index < totalParts; index++) {
    const start = index * UPLOAD_PART_SIZE_BYTES;
    const end = Math.min(start + UPLOAD_PART_SIZE_BYTES, file.size);
    const chunkBlob = file.slice(start, end);
    const chunkPath = buildChunkPartPath(chunkPrefix, index);
    const chunkName = `${file.name}.part-${String(index + 1).padStart(5, '0')}`;

    const { error } = await uploadTusBinary(
      chunkBlob,
      chunkPath,
      chunkName,
      'application/octet-stream',
      (partProgress) => {
        const currentChunkUploaded = Math.round((partProgress / 100) * chunkBlob.size);
        const totalUploaded = Math.min(file.size, uploadedBytes + currentChunkUploaded);
        const totalProgress = Math.round((totalUploaded / file.size) * 100);
        onProgress?.(totalProgress);
      },
    );

    if (error) {
      await removeStoragePaths(uploadedPaths);
      return { path: '', error };
    }

    uploadedPaths.push(chunkPath);
    uploadedBytes += chunkBlob.size;
    onProgress?.(Math.round((uploadedBytes / file.size) * 100));
  }

  return {
    path: buildChunkedStoragePath({
      prefix: chunkPrefix,
      partCount: totalParts,
      partSize: UPLOAD_PART_SIZE_BYTES,
    }),
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export async function downloadFile(
  storagePath: string,
): Promise<{ url: string; error: string | null }> {
  if (isChunkedStoragePath(storagePath)) {
    return {
      url: '',
      error: 'Chunked files do not have a single direct preview URL.',
    };
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error) return { url: '', error: error.message };
  return { url: data.signedUrl, error: null };
}

async function downloadBlobFromPath(
  storagePath: string,
): Promise<{ blob: Blob | null; error: string | null }> {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) return { blob: null, error: error.message };
  return { blob: data, error: null };
}

export async function fetchStoredFileBlob(
  file: StoredFileRef,
): Promise<{ blob: Blob | null; error: string | null }> {
  const descriptor = parseChunkedStoragePath(file.storage_path);

  if (!descriptor) {
    return downloadBlobFromPath(file.storage_path);
  }

  const parts: Blob[] = [];
  for (let index = 0; index < descriptor.partCount; index++) {
    const partPath = buildChunkPartPath(descriptor.prefix, index);
    const { blob, error } = await downloadBlobFromPath(partPath);
    if (error || !blob) {
      return { blob: null, error: error ?? 'Failed to download one of the file parts.' };
    }
    parts.push(blob);
  }

  return {
    blob: new Blob(parts, { type: file.mime_type || 'application/octet-stream' }),
    error: null,
  };
}

/**
 * Trigger a local download from an already-fetched Blob.
 */
export async function triggerBlobDownload(blob: Blob, filename: string): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

/**
 * Fetch a remote URL as a blob and trigger a named download.
 * Using a blob object URL (same-origin) makes the `download` attribute work
 * on iOS Safari, which ignores it for cross-origin URLs.
 */
export async function fetchBlobAndDownload(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  await triggerBlobDownload(blob, filename);
}

/**
 * Path-only download helper for legacy single-file storage objects.
 */
export async function blobDownload(
  storagePath: string,
  filename: string,
): Promise<{ error: string | null }> {
  const { url, error } = await downloadFile(storagePath);
  if (error || !url) return { error: error ?? 'Failed to get download URL' };
  try {
    await fetchBlobAndDownload(url, filename);
    return { error: null };
  } catch {
    return { error: 'Download failed' };
  }
}

export async function blobDownloadFile(
  file: StoredFileRef,
): Promise<{ error: string | null }> {
  const { blob, error } = await fetchStoredFileBlob(file);
  if (error || !blob) return { error: error ?? 'Download failed' };

  try {
    await triggerBlobDownload(blob, file.name);
    return { error: null };
  } catch {
    return { error: 'Download failed' };
  }
}

// ---------------------------------------------------------------------------
// Delete / public URL
// ---------------------------------------------------------------------------

export async function deleteFile(storagePath: string): Promise<{ error: string | null }> {
  return removeStoragePaths([storagePath]);
}

export async function deleteStoredFile(
  file: Pick<FileRecord, 'storage_path'>,
): Promise<{ error: string | null }> {
  return removeStoragePaths(getChunkPaths(file.storage_path));
}

export async function getPublicUrl(storagePath: string): Promise<string> {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
