import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Menu } from 'lucide-react';
import { getTrashedFiles, restoreFile, deleteFileRecord } from '../lib/database';
import { deleteStoredFile } from '../lib/storage';
import { formatBytes, formatDate } from '../lib/utils';
import toast from 'react-hot-toast';
import type { FileRecord } from '../types';

export function Trash() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getTrashedFiles();
    setFiles(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleRestore = async (file: FileRecord) => {
    const { error } = await restoreFile(file.id);
    if (error) toast.error('Failed to restore file');
    else { toast.success('File restored'); refresh(); }
  };

  const handlePermanentDelete = async (file: FileRecord) => {
    if (!confirm(`Permanently delete "${file.name}"? This cannot be undone.`)) return;
    const { error: dbError } = await deleteFileRecord(file.id);
    if (dbError) {
      toast.error(dbError);
      return;
    }

    const { error: storageError } = await deleteStoredFile(file);
    if (storageError) {
      toast.error(`File record deleted, but storage cleanup failed: ${storageError}`);
      refresh();
      return;
    }

    toast.success('File permanently deleted');
    refresh();
  };

  const handleEmptyTrash = async () => {
    if (!confirm(`Permanently delete all ${files.length} files in trash? This cannot be undone.`)) return;
    for (const file of files) {
      const { error: dbError } = await deleteFileRecord(file.id);
      if (dbError) {
        toast.error(`Failed to delete "${file.name}": ${dbError}`);
        continue;
      }

      const { error: storageError } = await deleteStoredFile(file);
      if (storageError) {
        toast.error(`Deleted "${file.name}" from the database, but storage cleanup failed.`);
      }
    }
    toast.success('Trash emptied');
    refresh();
  };

  return (
    <>
      <header className="bg-gray-900 border-b border-gray-800 px-4 lg:px-6 py-4 flex items-center gap-4 safe-area-pt">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
          className="lg:hidden text-gray-400 hover:text-white cursor-pointer"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Trash2 className="w-6 h-6 text-gray-400" />
        <h1 className="text-lg font-semibold text-white">Trash</h1>
        {files.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            className="ml-auto px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors cursor-pointer"
          >
            Empty Trash
          </button>
        )}
      </header>

      <div className="flex-1 p-4 lg:p-6 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && files.length === 0 && (
          <div className="text-center py-16">
            <Trash2 className="w-16 h-16 text-gray-700 mx-auto mb-4" />
            <p className="text-gray-400 text-lg">Trash is empty</p>
            <p className="text-gray-600 text-sm mt-1">Deleted files will appear here</p>
          </div>
        )}

        {!loading && files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-4 text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Files in trash can be restored or permanently deleted</span>
            </div>
            {files.map((file) => (
              <div key={file.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{file.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{formatBytes(file.size)}</span>
                    <span className="text-xs text-gray-700">·</span>
                    <span className="text-xs text-gray-500">Deleted {file.deleted_at ? formatDate(file.deleted_at) : ''}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(file)}
                  className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-green-400 transition-colors cursor-pointer"
                  title="Restore"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePermanentDelete(file)}
                  className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Delete permanently"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
