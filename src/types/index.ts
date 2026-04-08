export type UserRole = 'admin' | 'viewer';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface FileRecord {
  id: string;
  name: string;
  storage_path: string;
  size: number;
  mime_type: string;
  folder_id: string | null;
  uploaded_by: string;
  created_at: string;
  profiles?: { display_name: string | null; email: string };
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_by: string;
  created_at: string;
}

export interface ShareLink {
  id: string;
  file_id: string;
  token: string;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  files?: FileRecord;
}

export interface UploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}
