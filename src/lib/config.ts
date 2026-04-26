const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

const BYTE_UNITS = {
  B: 1,
  KB,
  MB,
  GB,
  TB,
} as const;

function readEnv(name: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  const value = env[name];
  if (!value) return undefined;

  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseByteSize(raw?: string): number | null {
  if (!raw) return null;

  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = (match[2] ?? 'B').toUpperCase() as keyof typeof BYTE_UNITS;
  if (!Number.isFinite(value) || value <= 0) return null;

  return Math.round(value * BYTE_UNITS[unit]);
}

function getDirectStorageOrigin(projectUrl?: string): string | null {
  if (!projectUrl) return null;

  try {
    const url = new URL(projectUrl);

    if (url.hostname.endsWith('.storage.supabase.co')) {
      return url.origin;
    }

    if (url.hostname.endsWith('.supabase.co')) {
      return `${url.protocol}//${url.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co')}`;
    }
  } catch {
    return null;
  }

  return null;
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL');
const directStorageOrigin = getDirectStorageOrigin(supabaseUrl);

export const DEFAULT_USER_QUOTA_BYTES =
  parseByteSize(readEnv('VITE_DEFAULT_USER_QUOTA_BYTES')) ?? 5 * GB;

export function getEffectiveUserQuotaBytes(quotaBytes?: number | null): number {
  return Math.max(quotaBytes ?? 0, DEFAULT_USER_QUOTA_BYTES);
}

export const PROJECT_DB_LIMIT_BYTES =
  parseByteSize(readEnv('VITE_PROJECT_DB_LIMIT_BYTES')) ?? 500 * MB;

export const PROJECT_STORAGE_LIMIT_BYTES =
  parseByteSize(readEnv('VITE_PROJECT_STORAGE_LIMIT_BYTES')) ?? GB;

export const PROJECT_PLAN_NAME = readEnv('VITE_PROJECT_PLAN_NAME') ?? 'Free';

export const MAX_UPLOAD_FILE_BYTES = parseByteSize(readEnv('VITE_MAX_UPLOAD_FILE_BYTES'));

export const UPLOAD_PART_SIZE_BYTES =
  parseByteSize(readEnv('VITE_UPLOAD_PART_SIZE_BYTES')) ?? 49 * MB;

export const SUPABASE_RESUMABLE_UPLOAD_ENDPOINT = directStorageOrigin
  ? `${directStorageOrigin}/storage/v1/upload/resumable`
  : `${supabaseUrl ?? ''}/storage/v1/upload/resumable`;
