import { supabase } from './supabase';
import type { FileRecord, Folder, Group, GroupMember, Profile, ShareLink } from '../types';
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

export async function getFiles(folderId: string | null, context?: { type: 'personal'; userId: string } | { type: 'group'; groupId: string }): Promise<FileRecord[]> {
  let query = supabase
    .from('files')
    .select('*, profiles(display_name, email)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (folderId) {
    query = query.eq('folder_id', folderId);
  } else {
    query = query.is('folder_id', null);
  }

  if (context?.type === 'personal') {
    query = query.eq('uploaded_by', context.userId).is('group_id', null);
  } else if (context?.type === 'group') {
    query = query.eq('group_id', context.groupId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function searchFiles(searchTerm: string, context?: { type: 'personal'; userId: string } | { type: 'group'; groupId: string }): Promise<FileRecord[]> {
  let query = supabase
    .from('files')
    .select('*, profiles(display_name, email)')
    .is('deleted_at', null)
    .ilike('name', `%${searchTerm}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (context?.type === 'personal') {
    query = query.eq('uploaded_by', context.userId).is('group_id', null);
  } else if (context?.type === 'group') {
    query = query.eq('group_id', context.groupId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function createFileRecord(file: {
  name: string;
  storage_path: string;
  size: number;
  mime_type: string;
  folder_id: string | null;
  uploaded_by: string;
  group_id?: string | null;
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

// Soft-delete a file (move to trash)
export async function trashFile(fileId: string) {
  const { error } = await supabase
    .from('files')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', fileId);
  return { error: error?.message ?? null };
}

// Trash multiple files
export async function trashFiles(fileIds: string[]) {
  const { error } = await supabase
    .from('files')
    .update({ deleted_at: new Date().toISOString() })
    .in('id', fileIds);
  return { error: error?.message ?? null };
}

// Restore a file from trash
export async function restoreFile(fileId: string) {
  const { error } = await supabase
    .from('files')
    .update({ deleted_at: null })
    .eq('id', fileId);
  return { error: error?.message ?? null };
}

// Get trashed files
export async function getTrashedFiles(): Promise<FileRecord[]> {
  const { data } = await supabase
    .from('files')
    .select('*, profiles(display_name, email)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  return data ?? [];
}

// Rename a file
export async function renameFile(fileId: string, newName: string) {
  const { error } = await supabase
    .from('files')
    .update({ name: newName })
    .eq('id', fileId);
  return { error: error?.message ?? null };
}

// Move file to a different folder
export async function moveFile(fileId: string, targetFolderId: string | null) {
  const { error } = await supabase
    .from('files')
    .update({ folder_id: targetFolderId })
    .eq('id', fileId);
  return { error: error?.message ?? null };
}

// Move multiple files
export async function moveFiles(fileIds: string[], targetFolderId: string | null) {
  const { error } = await supabase
    .from('files')
    .update({ folder_id: targetFolderId })
    .in('id', fileIds);
  return { error: error?.message ?? null };
}

// Get all folders (for move-to picker)
export async function getAllFolders(): Promise<Folder[]> {
  const { data } = await supabase
    .from('folders')
    .select('*')
    .order('name', { ascending: true });
  return data ?? [];
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

export async function getStoragePerUser(): Promise<{ user_id: string; display_name: string | null; email: string; total_size: number; file_count: number }[]> {
  const { data: files } = await supabase
    .from('files')
    .select('uploaded_by, size, profiles(display_name, email)');
  if (!files) return [];

  const map = new Map<string, { display_name: string | null; email: string; total_size: number; file_count: number }>();
  for (const f of files as any[]) {
    const uid = f.uploaded_by;
    if (!uid) continue;
    const existing = map.get(uid);
    if (existing) {
      existing.total_size += f.size || 0;
      existing.file_count += 1;
    } else {
      map.set(uid, {
        display_name: f.profiles?.display_name || null,
        email: f.profiles?.email || uid,
        total_size: f.size || 0,
        file_count: 1,
      });
    }
  }
  return Array.from(map.entries())
    .map(([user_id, data]) => ({ user_id, ...data }))
    .sort((a, b) => b.total_size - a.total_size);
}

// ── Folders ──

export async function getFolders(parentId: string | null, context?: { type: 'personal'; userId: string } | { type: 'group'; groupId: string }): Promise<Folder[]> {
  let query = supabase
    .from('folders')
    .select('*')
    .order('name', { ascending: true });

  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null);
  }

  if (context?.type === 'personal') {
    query = query.eq('created_by', context.userId).is('group_id', null);
  } else if (context?.type === 'group') {
    query = query.eq('group_id', context.groupId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function createFolder(name: string, parentId: string | null, createdBy: string, groupId?: string | null) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ name, parent_id: parentId, created_by: createdBy, group_id: groupId ?? null })
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

export async function createShareLink(fileId: string, createdBy: string, expiresInHours?: number, passwordHash?: string) {
  const token = generateToken();
  const expires_at = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabase
    .from('share_links')
    .insert({ file_id: fileId, token, expires_at, created_by: createdBy, password_hash: passwordHash ?? null })
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

// ── Groups ──

export async function getMyGroups(): Promise<Group[]> {
  const { data } = await supabase
    .from('groups')
    .select('*')
    .order('name', { ascending: true });
  return data ?? [];
}

export async function createGroup(name: string, description: string | null, createdBy: string, avatarColor: string = '#6366f1') {
  // Generate ID client-side so we don't need .select() (which would fail due to RLS)
  const groupId = crypto.randomUUID();

  const { error } = await supabase
    .from('groups')
    .insert({ id: groupId, name, description, avatar_color: avatarColor, created_by: createdBy });

  if (error) return { data: null, error: error.message };

  // Add creator as admin member
  const { error: memberError } = await supabase.from('group_members').insert({
    group_id: groupId,
    user_id: createdBy,
    role: 'admin',
  });

  if (memberError) return { data: null, error: memberError.message };

  return { data: { id: groupId, name, description, avatar_color: avatarColor, created_by: createdBy }, error: null };
}

export async function updateGroup(groupId: string, updates: { name?: string; description?: string | null }) {
  const { error } = await supabase
    .from('groups')
    .update(updates)
    .eq('id', groupId);
  return { error: error?.message ?? null };
}

export async function deleteGroup(groupId: string) {
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);
  return { error: error?.message ?? null };
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data } = await supabase
    .from('group_members')
    .select('*, profiles(display_name, email)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function addGroupMember(groupId: string, userId: string, role: 'admin' | 'member' = 'member') {
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role });
  return { error: error?.message ?? null };
}

export async function removeGroupMember(groupId: string, userId: string) {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}

export async function findUserByEmail(email: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();
  return data;
}
