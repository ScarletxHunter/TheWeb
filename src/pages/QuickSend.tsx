import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type DragEvent,
  type InputHTMLAttributes,
} from 'react';
import {
  Zap,
  Upload,
  Copy,
  Check,
  Link as LinkIcon,
  Terminal,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  AlertCircle,
  FolderUp,
  Download,
} from 'lucide-react';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import { Header } from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { uploadFile, compressImage } from '../lib/storage';
import {
  createFileRecord,
  createShareLink,
  getMyStorageUsed,
} from '../lib/database';
import {
  getEffectiveUserQuotaBytes,
  MAX_UPLOAD_FILE_BYTES,
} from '../lib/config';
import { supabase } from '../lib/supabase';
import { formatBytes, hashPassword } from '../lib/utils';

type SentItem = {
  fileId: string;
  fileName: string;
  fileSize: number;
  token: string;
  shareUrl: string;
  expiresAt: string | null;
  hasPassword: boolean;
  createdAt: string;
};

type ActiveUpload = {
  id: string;
  file: File;
  progress: number;
  status: 'uploading' | 'sharing' | 'done' | 'error';
  error?: string;
};

const EXPIRY_OPTIONS = [
  { value: 0, label: 'No expiration' },
  { value: 1, label: '1 hour' },
  { value: 24, label: '24 hours' },
  { value: 168, label: '7 days' },
  { value: 720, label: '30 days' },
];

type DirectoryInputAttributes = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

const folderInputAttributes: DirectoryInputAttributes = {
  webkitdirectory: '',
  directory: '',
  multiple: true,
};

async function readAllDirEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const collected: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return collected;
    collected.push(...batch);
  }
}

async function collectFilesFromEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: { path: string; file: File }[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ path: prefix + entry.name, file });
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children = await readAllDirEntries(reader);
  for (const child of children) {
    await collectFilesFromEntry(child, prefix + entry.name + '/', out);
  }
}

async function zipFilesToBlob(
  entries: { path: string; file: File }[],
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  const zip = new JSZip();
  for (const { path, file } of entries) {
    zip.file(path, file);
  }
  return zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    onProgress
      ? (meta) => {
          onProgress(Math.round(meta.percent));
        }
      : undefined,
  );
}

function safeZipName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || 'folder';
}

export function QuickSend() {
  const { user, profile } = useAuth();
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<ActiveUpload[]>([]);
  const [sent, setSent] = useState<SentItem[]>([]);
  const [expiresInHours, setExpiresInHours] = useState<number>(168);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [showApi, setShowApi] = useState(false);
  const [token, setToken] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [zipping, setZipping] = useState<{ name: string; pct: number } | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showApi) return;
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? '');
    });
  }, [showApi]);

  const supabaseUrl =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const anonKey =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

  const uploadAndShare = useCallback(
    async (files: File[]) => {
      if (!user) return;

      const incoming = files.reduce((sum, f) => sum + f.size, 0);
      const used = await getMyStorageUsed(user.id);
      const quota = getEffectiveUserQuotaBytes(profile?.quota_bytes);
      if (used + incoming > quota && profile?.role !== 'admin') {
        const over = formatBytes(used + incoming - quota);
        const remaining = formatBytes(Math.max(quota - used, 0));
        toast.error(
          `Quota exceeded by ${over}. ${remaining} free of ${formatBytes(quota)}.`,
        );
        return;
      }

      let pwHash: string | undefined;
      if (passwordEnabled && password) {
        pwHash = await hashPassword(password);
      }

      const baseId = Date.now();
      const initial: ActiveUpload[] = files.map((f, i) => ({
        id: `${baseId}-${i}-${f.name}`,
        file: f,
        progress: 0,
        status: 'uploading' as const,
      }));
      setUploads((prev) => [...prev, ...initial]);

      for (let i = 0; i < files.length; i++) {
        const rawFile = files[i];
        const uploadId = initial[i].id;

        if (MAX_UPLOAD_FILE_BYTES && rawFile.size > MAX_UPLOAD_FILE_BYTES) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: 'error', error: 'Exceeds upload limit' }
                : u,
            ),
          );
          toast.error(
            `"${rawFile.name}" is ${formatBytes(rawFile.size)} — over the ${formatBytes(MAX_UPLOAD_FILE_BYTES)} limit.`,
          );
          continue;
        }

        let file = rawFile;
        if (
          rawFile.type.startsWith('image/') &&
          rawFile.type !== 'image/gif' &&
          rawFile.type !== 'image/svg+xml'
        ) {
          file = await compressImage(rawFile);
        }

        const storagePath = `${user.id}/${Date.now()}-${i}-${file.name}`;

        const { path: uploadedPath, error: uploadError } = await uploadFile(
          file,
          storagePath,
          (progress) => {
            setUploads((prev) =>
              prev.map((u) => (u.id === uploadId ? { ...u, progress } : u)),
            );
          },
        );

        if (uploadError) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: 'error', error: uploadError }
                : u,
            ),
          );
          toast.error(`Upload failed: ${uploadError}`);
          continue;
        }

        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: 'sharing' } : u)),
        );

        const { data: record, error: dbError } = await createFileRecord({
          name: rawFile.name,
          storage_path: uploadedPath,
          size: file.size,
          mime_type: file.type || 'application/octet-stream',
          folder_id: null,
          uploaded_by: user.id,
          group_id: null,
        });

        if (dbError || !record) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? {
                    ...u,
                    status: 'error',
                    error: dbError ?? 'Save failed',
                  }
                : u,
            ),
          );
          toast.error(`Could not save: ${dbError ?? 'unknown error'}`);
          continue;
        }

        const { data: link, error: shareError } = await createShareLink(
          record.id,
          user.id,
          expiresInHours > 0 ? expiresInHours : undefined,
          pwHash,
        );

        if (shareError || !link) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? {
                    ...u,
                    status: 'error',
                    error: shareError ?? 'Share link failed',
                  }
                : u,
            ),
          );
          toast.error(`Share link failed: ${shareError ?? 'unknown error'}`);
          continue;
        }

        const shareUrl = `${window.location.origin}/shared/${link.token}`;
        const newItem: SentItem = {
          fileId: record.id,
          fileName: rawFile.name,
          fileSize: file.size,
          token: link.token,
          shareUrl,
          expiresAt: link.expires_at,
          hasPassword: Boolean(pwHash),
          createdAt: new Date().toISOString(),
        };
        setSent((prev) => [newItem, ...prev]);

        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, status: 'done', progress: 100 } : u,
          ),
        );

        if (i === 0) {
          try {
            await navigator.clipboard.writeText(shareUrl);
            setCopiedLink(link.token);
            toast.success('Link copied to clipboard');
            setTimeout(
              () =>
                setCopiedLink((c) => (c === link.token ? null : c)),
              2500,
            );
          } catch {
            toast.success('Share link ready');
          }
        }
      }

      setTimeout(
        () => setUploads((prev) => prev.filter((u) => u.status !== 'done')),
        3000,
      );

      if (passwordEnabled) {
        setPassword('');
        setPasswordEnabled(false);
      }
    },
    [user, profile, expiresInHours, passwordEnabled, password],
  );

  const zipAndShare = useCallback(
    async (
      entries: { path: string; file: File }[],
      zipBaseName: string,
    ) => {
      if (entries.length === 0) {
        toast.error('Folder is empty');
        return;
      }

      const totalBytes = entries.reduce((s, e) => s + e.file.size, 0);
      const safeName = safeZipName(zipBaseName);
      const zipName = `${safeName}.zip`;

      setZipping({ name: zipName, pct: 0 });
      const toastId = `zip-${zipName}`;
      toast.loading(
        `Zipping ${entries.length} file(s) (${formatBytes(totalBytes)})…`,
        { id: toastId },
      );

      try {
        const zipBlob = await zipFilesToBlob(entries, (pct) => {
          setZipping((prev) => (prev ? { ...prev, pct } : prev));
        });
        toast.dismiss(toastId);
        setZipping(null);

        const zipFile = new File([zipBlob], zipName, {
          type: 'application/zip',
          lastModified: Date.now(),
        });
        await uploadAndShare([zipFile]);
      } catch (err) {
        toast.dismiss(toastId);
        setZipping(null);
        toast.error(
          `Could not zip folder: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    },
    [uploadAndShare],
  );

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const items = e.dataTransfer.items;
      const entries: FileSystemEntry[] = [];
      if (items && items.length) {
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) entries.push(entry);
        }
      }

      const hasDirectory = entries.some((entry) => entry.isDirectory);
      if (hasDirectory) {
        const collected: { path: string; file: File }[] = [];
        try {
          for (const entry of entries) {
            await collectFilesFromEntry(entry, '', collected);
          }
        } catch (err) {
          toast.error(
            `Could not read folder: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
          return;
        }

        const dirEntries = entries.filter((e) => e.isDirectory);
        const zipBaseName =
          dirEntries.length === 1 ? dirEntries[0].name : 'drop';
        await zipAndShare(collected, zipBaseName);
        return;
      }

      if (e.dataTransfer.files.length) {
        uploadAndShare(Array.from(e.dataTransfer.files));
      }
    },
    [uploadAndShare, zipAndShare],
  );

  const handleFolderPick = useCallback(
    async (fileList: FileList) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const zipBaseName = firstPath.split('/')[0] || 'folder';
      const entries = files.map((file) => ({
        path: file.webkitRelativePath || file.name,
        file,
      }));
      await zipAndShare(entries, zipBaseName);
    },
    [zipAndShare],
  );

  const copyShare = async (token: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(token);
      toast.success('Link copied');
      setTimeout(
        () => setCopiedLink((c) => (c === token ? null : c)),
        2000,
      );
    } catch {
      toast.error('Could not access clipboard');
    }
  };

  const copySnippet = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSnippet(key);
      setTimeout(
        () => setCopiedSnippet((c) => (c === key ? null : c)),
        2000,
      );
    } catch {
      toast.error('Could not access clipboard');
    }
  };

  const refreshToken = async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      toast.error('Could not refresh token');
      return;
    }
    setToken(data.session?.access_token ?? '');
    toast.success('Token refreshed');
  };

  const appUrl =
    typeof window !== 'undefined' ? window.location.origin : '';

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const fetchTokenIfNeeded = async (): Promise<string | null> => {
    if (token) return token;
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token ?? null;
    if (t) setToken(t);
    return t;
  };

  const handleDownloadScript = async (kind: 'ps1' | 'sh') => {
    if (!user) {
      toast.error('Sign in first');
      return;
    }
    const t = await fetchTokenIfNeeded();
    if (!t) {
      toast.error('Could not get session token');
      return;
    }
    const cfg: ScriptConfig = {
      supabaseUrl,
      appUrl,
      anonKey,
      userId: user.id,
      token: t,
    };
    if (kind === 'ps1') {
      downloadFile(
        'theweb-send.ps1',
        buildPowerShellScript(cfg),
        'text/plain',
      );
      toast.success('Downloaded theweb-send.ps1');
    } else {
      downloadFile(
        'theweb-send.sh',
        buildBashScript(cfg),
        'text/plain',
      );
      toast.success('Downloaded theweb-send.sh');
    }
  };

  const copyAgentInstructions = async () => {
    if (!user) {
      toast.error('Sign in first');
      return;
    }
    const t = await fetchTokenIfNeeded();
    const cfg: ScriptConfig = {
      supabaseUrl,
      appUrl,
      anonKey,
      userId: user.id,
      token: t ?? '',
    };
    await copySnippet('agent', buildAgentInstructions(cfg));
    toast.success('Agent instructions copied');
  };

  const selectedExpiryLabel =
    EXPIRY_OPTIONS.find((o) => o.value === expiresInHours)?.label ?? '7 days';

  return (
    <>
      <Header
        onMenuClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
        onSearch={() => {}}
        title="Quick Send"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto w-full">
          {/* Intro */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Quick Send</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                Drop a file for an instant shareable link, or push files from
                your PC over the terminal.
              </p>
            </div>
          </div>

          {/* Share options */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs text-gray-400 flex-shrink-0">
                  Link expires
                </label>
                <select
                  value={expiresInHours}
                  onChange={(e) => setExpiresInHours(Number(e.target.value))}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {EXPIRY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={passwordEnabled}
                  onChange={(e) => setPasswordEnabled(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                />
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                Password
              </label>
            </div>

            {passwordEnabled && (
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password recipient will type"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/40'
            }`}
          >
            <Upload className="w-12 h-12 text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-gray-300">
              <span className="text-indigo-400 font-medium">
                Drop files or a folder
              </span>{' '}
              — link copies to your clipboard the moment it's ready. Folders
              are zipped into one archive.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              {passwordEnabled && password ? 'Password protected · ' : ''}
              {selectedExpiryLabel}
            </p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                folderInputRef.current?.click();
              }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors cursor-pointer"
            >
              <FolderUp className="w-3.5 h-3.5" /> Choose folder
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                uploadAndShare(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
          />

          <input
            ref={folderInputRef}
            type="file"
            className="hidden"
            {...folderInputAttributes}
            onChange={(e) => {
              if (e.target.files?.length) {
                handleFolderPick(e.target.files);
                e.target.value = '';
              }
            }}
          />

          {/* Zipping progress */}
          {zipping && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{zipping.name}</p>
                <p className="text-xs text-gray-500">Zipping folder…</p>
                <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                    style={{ width: `${zipping.pct}%` }}
                  />
                </div>
              </div>
              <div className="flex-shrink-0 text-xs text-gray-400">
                {zipping.pct}%
              </div>
            </div>
          )}

          {/* In-flight uploads */}
          {uploads.length > 0 && (
            <div className="space-y-2">
              {uploads.map((u) => {
                const uploaded = Math.min(
                  u.file.size,
                  (u.progress / 100) * u.file.size,
                );
                const pctLabel =
                  u.progress >= 10
                    ? `${Math.round(u.progress)}%`
                    : `${u.progress.toFixed(1)}%`;
                return (
                <div
                  key={u.id}
                  className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{u.file.name}</p>
                    <p className="text-xs text-gray-500">
                      {u.status === 'uploading'
                        ? `${formatBytes(uploaded)} of ${formatBytes(u.file.size)}`
                        : formatBytes(u.file.size)}
                    </p>
                    {(u.status === 'uploading' || u.status === 'sharing') && (
                      <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                          style={{
                            width: `${u.status === 'sharing' ? 100 : u.progress}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs">
                    {u.status === 'uploading' && (
                      <span className="text-gray-400">{pctLabel}</span>
                    )}
                    {u.status === 'sharing' && (
                      <span className="text-indigo-400">Sharing…</span>
                    )}
                    {u.status === 'done' && (
                      <span className="text-green-400">Done</span>
                    )}
                    {u.status === 'error' && (
                      <span
                        className="flex items-center gap-1 text-red-400"
                        title={u.error}
                      >
                        <AlertCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {/* Sent links */}
          {sent.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-2">
                Sent in this session
              </h2>
              <div className="space-y-2">
                {sent.map((item) => (
                  <div
                    key={item.token}
                    className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3"
                  >
                    <LinkIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {item.fileName}
                      </p>
                      <p className="text-xs text-gray-500 font-mono truncate">
                        {item.shareUrl}
                      </p>
                    </div>
                    {item.hasPassword && (
                      <Lock
                        className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0"
                        aria-label="Password protected"
                      />
                    )}
                    <button
                      onClick={() => copyShare(item.token, item.shareUrl)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer flex-shrink-0 transition-colors"
                    >
                      {copiedLink === item.token ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copiedLink === item.token ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hand-off to AI agent */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <button
              onClick={() => setShowApi(!showApi)}
              className="w-full p-4 flex items-center gap-3 text-left hover:bg-gray-800/50 cursor-pointer rounded-xl transition-colors"
            >
              <Terminal className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  Hand it to Claude Code, Cursor, or Codex
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Download a one-shot script with your auth baked in — your
                  agent runs <code className="text-gray-400">theweb-send {'<file>'}</code> and
                  gets back a share URL.
                </p>
              </div>
              {showApi ? (
                <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
              )}
            </button>

            {showApi && (
              <div className="border-t border-gray-800 p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => handleDownloadScript('ps1')}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download theweb-send.ps1
                  </button>
                  <button
                    onClick={() => handleDownloadScript('sh')}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download theweb-send.sh
                  </button>
                </div>

                <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-1 text-xs font-mono text-gray-300 leading-relaxed">
                  <p className="text-gray-500"># Then run it</p>
                  <p>pwsh ./theweb-send.ps1 ./my-photo.jpg</p>
                  <p>bash ./theweb-send.sh ./my-photo.jpg</p>
                  <p className="text-gray-500 pt-2"># Output</p>
                  <p>{appUrl}/shared/abcdef…</p>
                </div>

                <button
                  onClick={copyAgentInstructions}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs rounded-lg cursor-pointer transition-colors"
                >
                  {copiedSnippet === 'agent' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  Copy instructions for your AI agent
                </button>

                <p className="text-xs text-gray-500 leading-relaxed">
                  The script has your auth token baked in and expires ~1 hour
                  after download. When it stops working, come back here and
                  download again.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-800/60">
                  <button
                    onClick={refreshToken}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg cursor-pointer transition-colors"
                  >
                    Refresh token
                  </button>
                  <button
                    onClick={() => setTokenVisible(!tokenVisible)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg cursor-pointer transition-colors"
                  >
                    {tokenVisible ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    {tokenVisible ? 'Hide token' : 'Reveal token'}
                  </button>
                  {tokenVisible && token && (
                    <button
                      onClick={() => copySnippet('token', token)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg cursor-pointer transition-colors"
                    >
                      {copiedSnippet === 'token' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy token
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

type ScriptConfig = {
  supabaseUrl: string;
  appUrl: string;
  anonKey: string;
  userId: string;
  token: string;
};

function buildPowerShellScript(cfg: ScriptConfig) {
  return `#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Upload a file to TheWeb and print the share URL.
.DESCRIPTION
  Hand this script to Claude Code, Cursor, Codex, or any CLI agent.
  It uploads <Path> to your vault and prints a share URL on stdout.
  When the embedded token expires (~1 hour), regenerate at:
    ${cfg.appUrl}/quick
.EXAMPLE
  .\\theweb-send.ps1 .\\photo.jpg
  ${cfg.appUrl}/shared/abcdef...
.EXAMPLE
  .\\theweb-send.ps1 .\\big.zip -NoShare
  Uploaded big.zip
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory, Position=0)][string]$Path,
  [switch]$NoShare,
  [int]$ExpiresHours = 168
)
$ErrorActionPreference = "Stop"

$SUPABASE_URL = "${cfg.supabaseUrl}"
$APP_URL      = "${cfg.appUrl}"
$ANON_KEY     = "${cfg.anonKey}"
$USER_ID      = "${cfg.userId}"
$TOKEN        = "${cfg.token}"

if (-not (Test-Path $Path)) { Write-Error "File not found: $Path"; exit 1 }
$item = Get-Item $Path
$name = $item.Name
$size = $item.Length
$ms   = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$key  = "$USER_ID/$ms-$name"

try {
  Invoke-RestMethod -Method Post -InFile $item.FullName \`
    -Uri "$SUPABASE_URL/storage/v1/object/vault-files/$key" \`
    -Headers @{ Authorization = "Bearer $TOKEN" } \`
    -ContentType "application/octet-stream" | Out-Null
} catch {
  Write-Error "Upload failed (token may have expired — regenerate at $APP_URL/quick): $_"
  exit 1
}

$record = Invoke-RestMethod -Method Post \`
  -Uri "$SUPABASE_URL/rest/v1/files" \`
  -Headers @{
    Authorization = "Bearer $TOKEN"
    apikey        = $ANON_KEY
    Prefer        = "return=representation"
  } \`
  -ContentType "application/json" \`
  -Body (@{
    name         = $name
    storage_path = $key
    size         = $size
    mime_type    = "application/octet-stream"
    folder_id    = $null
    uploaded_by  = $USER_ID
    group_id     = $null
  } | ConvertTo-Json)

if ($NoShare) { Write-Output "Uploaded $name ($size bytes)."; exit 0 }

$chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray()
$shareTok = -join ((1..32) | ForEach-Object { Get-Random -InputObject $chars })
$expiresAt = $null
if ($ExpiresHours -gt 0) {
  $expiresAt = (Get-Date).ToUniversalTime().AddHours($ExpiresHours).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

Invoke-RestMethod -Method Post \`
  -Uri "$SUPABASE_URL/rest/v1/share_links" \`
  -Headers @{
    Authorization = "Bearer $TOKEN"
    apikey        = $ANON_KEY
    Prefer        = "return=representation"
  } \`
  -ContentType "application/json" \`
  -Body (@{
    file_id       = $record[0].id
    token         = $shareTok
    expires_at    = $expiresAt
    created_by    = $USER_ID
    password_hash = $null
  } | ConvertTo-Json) | Out-Null

Write-Output "$APP_URL/shared/$shareTok"
`;
}

function buildBashScript(cfg: ScriptConfig) {
  return `#!/usr/bin/env bash
# theweb-send.sh — upload a file to TheWeb and print the share URL.
#
# Hand this to Claude Code, Cursor, Codex, or any CLI agent. It uploads
# the file at <path> and prints the share URL on stdout. When the
# embedded token expires (~1 hour), regenerate at:
#   ${cfg.appUrl}/quick
#
# Usage:
#   ./theweb-send.sh <path>              # upload + 7-day share link
#   ./theweb-send.sh <path> --no-share   # upload only
#   ./theweb-send.sh <path> --hours 24   # custom expiry
set -euo pipefail

SUPABASE_URL="${cfg.supabaseUrl}"
APP_URL="${cfg.appUrl}"
ANON_KEY="${cfg.anonKey}"
USER_ID="${cfg.userId}"
TOKEN="${cfg.token}"

NO_SHARE=0
EXPIRES_HOURS=168
FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-share) NO_SHARE=1; shift ;;
    --hours)    EXPIRES_HOURS="$2"; shift 2 ;;
    *)          FILE="$1"; shift ;;
  esac
done

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "usage: $0 <file> [--no-share] [--hours N]" >&2
  exit 1
fi

NAME=$(basename "$FILE")
SIZE=$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE")
MS=$(($(date +%s) * 1000))
KEY="$USER_ID/$MS-$NAME"

if ! curl -fsS -X POST "$SUPABASE_URL/storage/v1/object/vault-files/$KEY" \\
    -H "Authorization: Bearer $TOKEN" \\
    -H "Content-Type: application/octet-stream" \\
    --data-binary "@$FILE" >/dev/null; then
  echo "Upload failed (token may have expired — regenerate at $APP_URL/quick)" >&2
  exit 1
fi

BODY=$(printf '{"name":"%s","storage_path":"%s","size":%s,"mime_type":"application/octet-stream","folder_id":null,"uploaded_by":"%s","group_id":null}' \\
  "$NAME" "$KEY" "$SIZE" "$USER_ID")
RECORD=$(curl -fsS -X POST "$SUPABASE_URL/rest/v1/files" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "apikey: $ANON_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Prefer: return=representation" \\
  -d "$BODY")
FILE_ID=$(printf '%s' "$RECORD" | sed -n 's/.*"id":"\\([^"]*\\)".*/\\1/p' | head -1)

if [[ "$NO_SHARE" == "1" ]]; then
  echo "Uploaded $NAME ($SIZE bytes)."
  exit 0
fi

SHARE_TOKEN=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
if [[ "$EXPIRES_HOURS" -gt 0 ]]; then
  EXPIRES_AT=$(date -u -d "+$EXPIRES_HOURS hours" +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null \\
    || date -u -v+"$EXPIRES_HOURS"H +"%Y-%m-%dT%H:%M:%S.000Z")
  EXPIRES_FIELD="\\"$EXPIRES_AT\\""
else
  EXPIRES_FIELD="null"
fi

curl -fsS -X POST "$SUPABASE_URL/rest/v1/share_links" \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "apikey: $ANON_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Prefer: return=representation" \\
  -d "{\\"file_id\\":\\"$FILE_ID\\",\\"token\\":\\"$SHARE_TOKEN\\",\\"expires_at\\":$EXPIRES_FIELD,\\"created_by\\":\\"$USER_ID\\",\\"password_hash\\":null}" \\
  >/dev/null

echo "$APP_URL/shared/$SHARE_TOKEN"
`;
}

function buildAgentInstructions(cfg: ScriptConfig) {
  return `Upload files to my TheWeb vault by running the helper script:

  Windows (PowerShell): pwsh ./theweb-send.ps1 <path-to-file>
  macOS / Linux:        bash ./theweb-send.sh  <path-to-file>

The script prints the share URL on stdout. Add -NoShare (PowerShell)
or --no-share (bash) to skip the share link.

If you get an upload error mentioning the token, the embedded token
has expired — ask me to regenerate the script at ${cfg.appUrl}/quick.

User ID: ${cfg.userId}
`;
}
