import { useState, useRef, useCallback } from 'react';
import { Upload, X, FolderUp } from 'lucide-react';
import { uploadFile } from '../../lib/storage';
import { createFileRecord, createFolder } from '../../lib/database';
import { useAuth } from '../../context/AuthContext';
import { formatBytes } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { UploadProgress } from '../../types';

interface FileUploadProps {
  folderId: string | null;
  onUploadComplete: () => void;
  groupId?: string | null;
}

export function FileUpload({ folderId, onUploadComplete, groupId }: FileUploadProps) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | File[], folderMap?: Map<string, string>) => {
      if (!user) return;
      const files = Array.from(fileList);

      const newUploads: UploadProgress[] = files.map((f) => ({
        file: f,
        progress: 0,
        status: 'pending' as const,
      }));
      setUploads((prev) => [...prev, ...newUploads]);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const storagePath = `${user.id}/${Date.now()}-${file.name}`;

        // Determine which folder this file belongs to
        const targetFolderId = folderMap?.get((file as any).webkitRelativePath || file.name) ?? folderId;

        setUploads((prev) =>
          prev.map((u) =>
            u.file === file ? { ...u, status: 'uploading' as const } : u
          )
        );

        const { error } = await uploadFile(file, storagePath, (progress) => {
          setUploads((prev) =>
            prev.map((u) => (u.file === file ? { ...u, progress } : u))
          );
        });

        if (error) {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file ? { ...u, status: 'error' as const, error } : u
            )
          );
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        const { error: dbError } = await createFileRecord({
          name: file.name,
          storage_path: storagePath,
          size: file.size,
          mime_type: file.type || 'application/octet-stream',
          folder_id: targetFolderId,
          uploaded_by: user.id,
          group_id: groupId ?? null,
        });

        if (dbError) {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file ? { ...u, status: 'error' as const, error: dbError } : u
            )
          );
          toast.error(`Failed to save ${file.name}`);
        } else {
          setUploads((prev) =>
            prev.map((u) =>
              u.file === file ? { ...u, status: 'done' as const, progress: 100 } : u
            )
          );
        }
      }

      onUploadComplete();
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.status !== 'done'));
      }, 2000);
    },
    [user, folderId, onUploadComplete, groupId]
  );

  const handleFolderUpload = useCallback(
    async (fileList: FileList) => {
      if (!user) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      // Build folder structure from webkitRelativePath
      // e.g. "MyFolder/subfolder/file.txt" => create MyFolder, then subfolder inside it
      const folderIdCache = new Map<string, string>(); // path => created folder id
      const fileToFolderMap = new Map<string, string>(); // relativePath => folderId

      toast(`Uploading folder with ${files.length} files...`);

      for (const file of files) {
        const relativePath = (file as any).webkitRelativePath as string;
        if (!relativePath) continue;

        const parts = relativePath.split('/');
        // parts = ["RootFolder", "subfolder", "file.txt"]
        // We need to create folders for all parts except the last (the file)
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

        fileToFolderMap.set(relativePath, parentId!);
      }

      // Now upload all files into their respective folders
      await handleFiles(files, fileToFolderMap);
    },
    [user, folderId, groupId, handleFiles]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      // Check if any items are directories
      const items = e.dataTransfer.items;
      if (items?.length) {
        const entries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry?.();
          if (entry) entries.push(entry);
        }

        const hasDirectory = entries.some((e) => e.isDirectory);
        if (hasDirectory) {
          // Recursively read directory entries
          const allFiles: File[] = [];
          const folderIdCache = new Map<string, string>();
          const fileToFolderMap = new Map<string, string>();

          const readEntry = async (entry: FileSystemEntry, parentPath: string, parentFolderId: string | null): Promise<void> => {
            if (entry.isFile) {
              const file = await new Promise<File>((resolve) =>
                (entry as FileSystemFileEntry).file(resolve)
              );
              const relativePath = parentPath + entry.name;
              Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
              fileToFolderMap.set(relativePath, parentFolderId!);
              allFiles.push(file);
            } else if (entry.isDirectory) {
              const dirReader = (entry as FileSystemDirectoryEntry).createReader();
              const currentPath = parentPath + entry.name + '/';

              // Create folder in DB
              let currentFolderId = parentFolderId;
              const pathKey = currentPath.slice(0, -1); // remove trailing /
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

              const entries = await new Promise<FileSystemEntry[]>((resolve) => {
                const results: FileSystemEntry[] = [];
                const readBatch = () => {
                  dirReader.readEntries((batch) => {
                    if (batch.length === 0) { resolve(results); return; }
                    results.push(...batch);
                    readBatch();
                  });
                };
                readBatch();
              });

              for (const child of entries) {
                await readEntry(child, currentPath, currentFolderId);
              }
            }
          };

          toast(`Uploading ${entries.length} item(s) with folder structure...`);
          for (const entry of entries) {
            await readEntry(entry, '', folderId);
          }

          if (allFiles.length > 0) {
            await handleFiles(allFiles, fileToFolderMap);
          }
          return;
        }
      }

      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles, user, folderId, groupId]
  );

  const clearUpload = (file: File) => {
    setUploads((prev) => prev.filter((u) => u.file !== file));
  };

  return (
    <div>
      {/* Drop zone */}
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
          <span className="text-indigo-400 font-medium">Click to upload files</span> or drag and drop files/folders
        </p>
        <p className="text-xs text-gray-600 mt-1">Any file type</p>
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

      {/* Folder input with webkitdirectory */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        {...({ webkitdirectory: '', directory: '', multiple: true } as any)}
        onChange={(e) => {
          if (e.target.files?.length) {
            handleFolderUpload(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploads.map((u, i) => (
            <div
              key={i}
              className="bg-gray-800 rounded-lg p-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{u.file.name}</p>
                <p className="text-xs text-gray-500">{formatBytes(u.file.size)}</p>
                {u.status === 'uploading' && (
                  <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                {u.status === 'done' && (
                  <span className="text-xs text-green-400">Done</span>
                )}
                {u.status === 'error' && (
                  <button onClick={() => clearUpload(u.file)} className="cursor-pointer">
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                )}
                {u.status === 'uploading' && (
                  <span className="text-xs text-gray-400">{u.progress}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
