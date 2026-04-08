import { supabase } from './supabase';

const BUCKET = 'vault-files';

export async function uploadFile(
  file: File,
  storagePath: string,
  onProgress?: (progress: number) => void
): Promise<{ path: string; error: string | null }> {
  // For files under 50MB, use standard upload
  if (file.size < 50 * 1024 * 1024) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false });

    if (error) return { path: '', error: error.message };
    onProgress?.(100);
    return { path: data.path, error: null };
  }

  // For larger files, use resumable upload
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      upsert: false,
    });

  if (error) return { path: '', error: error.message };
  onProgress?.(100);
  return { path: data.path, error: null };
}

export async function downloadFile(storagePath: string): Promise<{ url: string; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600); // 1 hour expiry

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
