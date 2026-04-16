import { supabase } from './supabase';

const BUCKET = 'vault-files';

export async function uploadFile(
  file: File,
  storagePath: string,
  onProgress?: (progress: number) => void
): Promise<{ path: string; error: string | null }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) return { path: '', error: 'Not authenticated' };

  const url = `${supabaseUrl}/storage/v1/object/${BUCKET}/${storagePath}`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress?.(pct);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ path: storagePath, error: null });
      } else {
        // Try to parse Supabase's JSON error body for a helpful message
        let message = `Upload failed (HTTP ${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body?.error) message = body.error;
          else if (body?.message) message = body.message;
        } catch { /* ignore parse errors */ }
        if (xhr.status === 413) {
          message = 'File too large — Supabase free tier allows up to 50 MB per file.';
        }
        resolve({ path: '', error: message });
      }
    };

    xhr.onerror = () => resolve({ path: '', error: 'Network error during upload' });

    xhr.send(file);
  });
}

export async function downloadFile(storagePath: string): Promise<{ url: string; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);

  if (error) return { url: '', error: error.message };
  return { url: data.signedUrl, error: null };
}

/**
 * Fetch a remote URL as a blob and trigger a named download.
 * Using a blob object URL (same-origin) makes the `download` attribute work
 * on iOS Safari, which ignores it for cross-origin URLs (Supabase storage).
 */
export async function fetchBlobAndDownload(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Keep the object URL alive briefly so the browser can read it
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

/**
 * One-shot helper: get a signed URL then blob-download it.
 * Returns { error } so callers can show a toast on failure.
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

export async function deleteFile(storagePath: string): Promise<{ error: string | null }> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);

  return { error: error?.message ?? null };
}

export async function getPublicUrl(storagePath: string): Promise<string> {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
