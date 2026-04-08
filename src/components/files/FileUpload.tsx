import { useState, useRef, useCallback } from 'react';
import { Upload, X } from 'lucide-react';
import { uploadFile } from '../../lib/storage';
import { createFileRecord } from '../../lib/database';
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

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
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
          folder_id: folderId,
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
      // Clear completed uploads after a delay
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.status !== 'done'));
      }, 2000);
    },
    [user, folderId, onUploadComplete, groupId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
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
          <span className="text-indigo-400 font-medium">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-gray-600 mt-1">Any file type</p>
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
