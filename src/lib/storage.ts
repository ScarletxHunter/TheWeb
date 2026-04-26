import * as tus from 'tus-js-client';
import { supabase } from './supabase';

const BUCKET = 'vault-files';

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

      // Scale proportionally if either side exceeds the limit
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
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);

      // Keep PNG as PNG to preserve transparency; everything else → JPEG
      const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name, { type: outputMime, lastModified: file.lastModified }));
        },
        outputMime,
        outputMime === 'image/png' ? undefined : quality,
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a file using the TUS resumable protocol.
 * Works for any size; automatically resumes interrupted uploads.
 * Requires the bucket's file_size_limit to accommodate the file size.
 */
export async function uploadFile(
  file: File,
  storagePath: string,
  onProgress?: (progress: number) => void,
): Promise<{ path: string; error: string | null }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { path: '', error: 'Not authenticated' };

  return new Promise((resolve) => {
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        Authorization: `Bearer ${token}`,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: BUCKET,
        objectName: storagePath,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024, // 6 MB chunks (Supabase minimum for TUS)
      onError(err) {
        let message = err.message || 'Upload failed';
        // tus wraps HTTP errors; try to extract the status
        if ('originalResponse' in err) {
          const resp = (err as any).originalResponse;
          const status = resp?.getStatus?.() as number | undefined;
          if (status === 413) {
            message = 'File too large for your current storage plan.';
          } else if (status) {
            try {
              const body = JSON.parse(resp.getBody?.() ?? '{}');
              message = body?.error ?? body?.message ?? message;
            } catch { /* ignore */ }
          }
        }
        resolve({ path: '', error: message });
      },
      onProgress(bytesUploaded, bytesTotal) {
        const pct = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
        onProgress?.(pct);
      },
      onSuccess() {
        onProgress?.(100);
        resolve({ path: storagePath, error: null });
      },
    });

    // Resume any previous upload for this file if possible
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Get a signed URL for a stored file. Pass `downloadAs` to get a URL that
 * Supabase serves with `Content-Disposition: attachment; filename=...` so
 * the browser streams it as a download (no in-memory blob — works for
 * arbitrarily large files on iOS and desktop).
 */
export async function downloadFile(
  storagePath: string,
  downloadAs?: string,
): Promise<{ url: string; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600, downloadAs ? { download: downloadAs } : undefined);

  if (error) return { url: '', error: error.message };
  return { url: data.signedUrl, error: null };
}

/**
 * Trigger a named download for a stored file.
 * Uses Supabase's `download=<filename>` query param so the response is
 * served with `Content-Disposition: attachment` — the browser streams it
 * directly to disk instead of buffering the whole file in memory.
 */
export async function blobDownload(
  storagePath: string,
  filename: string,
): Promise<{ error: string | null }> {
  const { url, error } = await downloadFile(storagePath, filename);
  if (error || !url) return { error: error ?? 'Failed to get download URL' };

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Delete / public URL
// ---------------------------------------------------------------------------

export async function deleteFile(storagePath: string): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  return { error: error?.message ?? null };
}

export async function getPublicUrl(storagePath: string): Promise<string> {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
