import { supabase } from './supabase';
import type { FileRecord, Folder, Profile, ShareLink } from '../types';
import { generateToken } from './utils';

// ── Profiles ──

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export async function getAllProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function updateProfileRole(userId: string, role: 'admin' | 'viewer') {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);
  return { error: error?.message ?? null };
}

// ── Files ──

export async function getFiles(folderId: string | null): Promise<FileRecord[]> {
  let query = supabase
    .from('files')
    .select('*, profiles(display_name, email)')
    .order('created_at', { ascending: false });

  if (folderId) {
    query = query.eq('folder_id', folderId);
  } else {
    query = query.is('folder_id', null);
  }

  const { data } = await query;
  return data ?? [];
}

export async function searchFiles(searchTerm: string): Promise<FileRecord[]> {
  const { data } = await supabase
    .from('files')
    .select('*, profiles(display_name, email)')
    .ilike('name', `%${searchTerm}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function createFileRecord(file: {
  name: string;
  storage_path: string;
  size: number;
  mime_type: string;
  folder_id: string | null;
  uploaded_by: string;
}): Promise<{ data: FileRecord | null; error: string | null }> {
  const { data, error } = await supabase
    .from('files')
    .insert(file)
    .select()
    .single();
  return { data, error: error?.message ?? null };
}

export async function deleteFileRecord(fileId: string) {
  const { error } = await supabase
    .from('files')
    .delete()
    .eq('id', fileId);
  return { error: error?.message ?? null };
}

export async function getTotalStorageUsed(): Promise<number> {
  const { data } = await supabase
    .from('files')
    .select('size');
  if (!data) return 0;
  return data.reduce((sum, f) => sum + (f.size || 0), 0);
}

export async function getTotalFileCount(): Promise<number> {
  const { count } = await supabase
    .from('files')
    .select('*', { count: 'exact', head: true });
  return count ?? 0;
}

// ── Folders ──

export async function getFolders(parentId: string | null): Promise<Folder[]> {
  let query = supabase
    .from('folders')
    .select('*')
    .order('name', { ascending: true });

  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null);
  }

  const { data } = await query;
  return data ?? [];
}

export async function createFolder(name: string, parentId: string | null, createdBy: string) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, parent_id: parentId, created_by: createdBy })
    .select()
    .single();
  return { data, error: error?.message ?? null };
}

export async function renameFolder(folderId: string, name: string) {
  const { error } = await supabase
    .from('folders')
    .update({ name })
    .eq('id', folderId);
  return { error: error?.message ?? null };
}

export async function deleteFolder(folderId: string) {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId);
  return { error: error?.message ?? null };
}

export async function getFolder(folderId: string): Promise<Folder | null> {
  const { data } = await supabase
    .from('folders')
    .select('*')
    .eq('id', folderId)
    .single();
  return data;
}

export async function getFolderPath(folderId: string | null): Promise<Folder[]> {
  const path: Folder[] = [];
  let currentId = folderId;
  while (currentId) {
    const folder = await getFolder(currentId);
    if (!folder) break;
    path.unshift(folder);
    currentId = folder.parent_id;
  }
  return path;
}

// ── Share Links ──

export async function createShareLink(fileId: string, createdBy: string, expiresInHours?: number) {
  const token = generateToken();
  const expires_at = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('share_links')
    .insert({ file_id: fileId, token, expires_at, created_by: createdBy })
    .select('*, files(*)')
    .single();
  return { data, error: error?.message ?? null };
}

export async function getShareLinks(fileId: string): Promise<ShareLink[]> {
  const { data } = await supabase
    .from('share_links')
    .select('*, files(*)')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function getShareLinkByToken(token: string): Promise<ShareLink | null> {
  const { data } = await supabase
    .from('share_links')
    .select('*, files(*)')
    .eq('token', token)
    .single();
  return data;
}

export async function deleteShareLink(linkId: string) {
  const { error } = await supabase
    .from('share_links')
    .delete()
    .eq('id', linkId);
  return { error: error?.message ?? null };
}
