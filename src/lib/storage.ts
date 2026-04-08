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
        resolve({ path: '', error: `Upload failed: ${xhr.statusText || 'Unknown error'}` });
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
