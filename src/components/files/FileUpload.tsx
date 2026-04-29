import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type DragEvent,
  type InputHTMLAttributes,
} from 'react';
import { Upload, X, FolderUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { MAX_UPLOAD_FILE_BYTES, getEffectiveUserQuotaBytes } from '../../lib/config';
import { createFileRecord, createFolder, getMyStorageUsed } from '../../lib/database';
import { uploadFile, compressImage, deleteStoredFile } from '../../lib/storage';
import { useAuth } from '../../context/AuthContext';
import { formatBytes } from '../../lib/utils';
import type { UploadProgress } from '../../types';

interface FileUploadProps {
  folderId: string | null;
  onUploadComplete: () => void;
  groupId?: string | null;
}

type DirectoryInputAttributes = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory?: string;
  directory?: string;
};

const folderInputAttributes: DirectoryInputAttributes = {
  webkitdirectory: '',
  directory: '',
  multiple: true,
};

export function FileUpload({ folderId, onUploadComplete, groupId }: FileUploadProps) {
  const { user, profile } = useAuth();
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const open = () => fileInputRef.current?.click();
    window.addEventListener('open-upload-picker', open);
    return () => window.removeEventListener('open-upload-picker', open);
  }, []);

  const uploadFilesToStorage = useCallback(
    async (files: File[], folderMap: Map<number, string>) => {
      if (!user) return;

      const incoming = files.reduce((sum, file) => sum + file.size, 0);
      const used = await getMyStorageUsed(user.id);
      const quota = getEffectiveUserQuotaBytes(profile?.quota_bytes);
      if (used + incoming > quota) {
        if (profile?.role !== 'admin') {
          const over = formatBytes(used + incoming - quota);
          const remaining = formatBytes(Math.max(quota - used, 0));
          toast.error(
            `Quota exceeded by ${over}. You have ${remaining} free out of ${formatBytes(quota)}.${groupId ? ' Group uploads still count against your storage.' : ''}`
          );
          return;
        }
        const over = formatBytes(used + incoming - quota);
        toast(`Admin override: uploading ${over} past your quota.`, { duration: 4000 });
      }

      const newUploads: UploadProgress[] = files.map((file) => ({
        file,
        progress: 0,
        status: 'pending' as const,
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      for (let i = 0; i < files.length; i++) {
        const rawFile = files[i];
        const targetFolderId = folderMap.get(i) ?? folderId;

        if (MAX_UPLOAD_FILE_BYTES && rawFile.size > MAX_UPLOAD_FILE_BYTES) {
          setUploads((prev) =>
            prev.map((upload) =>
              upload.file === rawFile
                ? { ...upload, status: 'error' as const, error: 'Exceeds configured upload limit' }
                : upload
            )
          );
          toast.error(
            `"${rawFile.name}" is ${formatBytes(rawFile.size)} and exceeds the configured upload limit of ${formatBytes(MAX_UPLOAD_FILE_BYTES)}.`,
            { duration: 7000 }
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
          if (file.size < rawFile.size) {
            const saved = formatBytes(rawFile.size - file.size);
            toast(`Image compressed for "${file.name}" - saved ${saved}`, { duration: 3000 });
          }
        }

        const storagePath = `${user.id}/${Date.now()}-${i}-${file.name}`;

        setUploads((prev) =>
          prev.map((upload) =>
            upload.file === rawFile ? { ...upload, status: 'uploading' as const } : upload
          )
        );

        const { path: uploadedPath, error } = await uploadFile(file, storagePath, (progress) => {
          setUploads((prev) =>
            prev.map((upload) => (upload.file === rawFile ? { ...upload, progress } : upload))
          );
        });

        if (error) {
          setUploads((prev) =>
            prev.map((upload) =>
              upload.file === rawFile ? { ...upload, status: 'error' as const, error } : upload
            )
          );
          toast.error(`Failed to upload ${rawFile.name}: ${error}`);
          continue;
        }

        const { error: dbError } = await createFileRecord({
          name: rawFile.name,
          storage_path: uploadedPath,
          size: file.size,
          mime_type: file.type || 'application/octet-stream',
          folder_id: targetFolderId,
          uploaded_by: user.id,
          group_id: groupId ?? null,
        });

        if (dbError) {
          setUploads((prev) =>
            prev.map((upload) =>
              upload.file === rawFile
                ? { ...upload, status: 'error' as const, error: dbError }
                : upload
            )
          );
          if (uploadedPath) {
            await deleteStoredFile({ storage_path: uploadedPath });
          }
          toast.error(`Failed to save ${rawFile.name}`);
        } else {
          setUploads((prev) =>
            prev.map((upload) =>
              upload.file === rawFile
                ? { ...upload, status: 'done' as const, progress: 100 }
                : upload
            )
          );
        }
      }

      onUploadComplete();
      setTimeout(() => {
        setUploads((prev) => prev.filter((upload) => upload.status !== 'done'));
      }, 2000);
    },
    [user, profile, folderId, onUploadComplete, groupId]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      const folderMap = new Map<number, string>();
      await uploadFilesToStorage(files, folderMap);
    },
    [uploadFilesToStorage]
  );

  const handleFolderUpload = useCallback(
    async (fileList: FileList) => {
      if (!user) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      toast(`Creating folders and uploading ${files.length} files...`);

      const folderIdCache = new Map<string, string>();
      const indexToFolderMap = new Map<number, string>();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = file.webkitRelativePath;
        if (!relativePath) continue;

        const parts = relativePath.split('/');
        const folderParts = parts.slice(0, -1);

        let parentId = folderId;
        for (let depth = 0; depth < folderParts.length; depth++) {
          const pathKey = folderParts.slice(0, depth + 1).join('/');
          if (folderIdCache.has(pathKey)) {
            parentId = folderIdCache.get(pathKey)!;
            continue;
          }

          const { data } = await createFolder(
            folderParts[depth],
            parentId,
            user.id,
            groupId ?? null
          );
          if (data) {
            folderIdCache.set(pathKey, data.id);
            parentId = data.id;
          }
        }

        if (parentId) {
          indexToFolderMap.set(i, parentId);
        }
      }

      await uploadFilesToStorage(files, indexToFolderMap);
    },
    [user, folderId, groupId, uploadFilesToStorage]
  );

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const items = e.dataTransfer.items;
      if (items?.length) {
        const entries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) entries.push(entry);
        }

        const hasDirectory = entries.some((entry) => entry.isDirectory);
        if (hasDirectory) {
          const allFiles: File[] = [];
          const folderIdCache = new Map<string, string>();
          const fileToFolderMap = new Map<string, string>();

          const readEntry = async (
            entry: FileSystemEntry,
            parentPath: string,
            parentFolderId: string | null
          ): Promise<void> => {
            if (entry.isFile) {
              const file = await new Promise<File>((resolve) =>
                (entry as FileSystemFileEntry).file(resolve)
              );
              const relativePath = parentPath + entry.name;
              Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
              fileToFolderMap.set(relativePath, parentFolderId!);
              allFiles.push(file);
              return;
            }

            const dirReader = (entry as FileSystemDirectoryEntry).createReader();
            const currentPath = parentPath + entry.name + '/';

            let currentFolderId = parentFolderId;
            const pathKey = currentPath.slice(0, -1);
            if (!folderIdCache.has(pathKey) && user) {
              const { data } = await createFolder(
                entry.name,
                parentFolderId,
                user.id,
                groupId ?? null
              );
              if (data) {
                folderIdCache.set(pathKey, data.id);
                currentFolderId = data.id;
              }
            } else {
              currentFolderId = folderIdCache.get(pathKey) ?? parentFolderId;
            }

            const childEntries = await new Promise<FileSystemEntry[]>((resolve) => {
              const results: FileSystemEntry[] = [];
              const readBatch = () => {
                dirReader.readEntries((batch) => {
                  if (batch.length === 0) {
                    resolve(results);
                    return;
                  }
                  results.push(...batch);
                  readBatch();
                });
              };
              readBatch();
            });

            for (const child of childEntries) {
              await readEntry(child, currentPath, currentFolderId);
            }
          };

          toast(`Uploading ${entries.length} item(s) with folder structure...`);
          for (const entry of entries) {
            await readEntry(entry, '', folderId);
          }

          if (allFiles.length > 0) {
            const indexMap = new Map<number, string>();
            allFiles.forEach((file, index) => {
              const relativePath = file.webkitRelativePath;
              if (relativePath && fileToFolderMap.has(relativePath)) {
                indexMap.set(index, fileToFolderMap.get(relativePath)!);
              }
            });
            await uploadFilesToStorage(allFiles, indexMap);
          }
          return;
        }
      }

      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles, user, folderId, groupId, uploadFilesToStorage]
  );

  const clearUpload = (file: File) => {
    setUploads((prev) => prev.filter((upload) => upload.file !== file));
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50'
        }`}
      >
        <Upload className="w-10 h-10 text-gray-500 mx-auto mb-3" />
        <p className="text-sm text-gray-400">
          <span className="text-indigo-400 font-medium">Click to upload files</span> or drag and
          drop files/folders
        </p>
        <p className="text-xs text-gray-600 mt-1">
          {MAX_UPLOAD_FILE_BYTES
            ? `Any file type up to ${formatBytes(MAX_UPLOAD_FILE_BYTES)}`
            : 'Any file type. Large uploads are split into smaller parts automatically and rebuilt during download.'}
        </p>
        <button
          onClick={(e) => {
            e.stopPropagation();
            folderInputRef.current?.click();
          }}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg transition-colors cursor-pointer"
        >
          <FolderUp className="w-3.5 h-3.5" /> Upload Folder
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFiles(e.target.files);
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
            handleFolderUpload(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploads.map((upload, index) => (
            <div
              key={index}
              className="bg-gray-800 rounded-lg p-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{upload.file.name}</p>
                <p className="text-xs text-gray-500">{formatBytes(upload.file.size)}</p>
                {upload.status === 'uploading' && (
                  <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                {upload.status === 'done' && (
                  <span className="text-xs text-green-400">Done</span>
                )}
                {upload.status === 'error' && (
                  <button onClick={() => clearUpload(upload.file)} className="cursor-pointer">
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                )}
                {upload.status === 'uploading' && (
                  <span className="text-xs text-gray-400">{upload.progress}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
