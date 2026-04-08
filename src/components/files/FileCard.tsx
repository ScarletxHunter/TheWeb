import { useState } from 'react';
import { Download, Trash2, Share2, MoreVertical } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { downloadFile } from '../../lib/storage';
import { deleteFile } from '../../lib/storage';
import { deleteFileRecord } from '../../lib/database';
import { formatBytes, formatDate, getFileIcon, getFileColor } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { FileRecord } from '../../types';

interface FileCardProps {
  file: FileRecord;
  onDelete: () => void;
  onShare: () => void;
}

export function FileCard({ file, onDelete, onShare }: FileCardProps) {
  const { isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const Icon = getFileIcon(file.mime_type);
  const colorClass = getFileColor(file.mime_type);

  const handleDownload = async () => {
    setDownloading(true);
    const { url, error } = await downloadFile(file.storage_path);
    if (error) {
      toast.error('Download failed');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
    }
    setDownloading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${file.name}"?`)) return;
    const { error: storageErr } = await deleteFile(file.storage_path);
    if (storageErr) {
      toast.error('Failed to delete file');
      return;
    }
    const { error: dbErr } = await deleteFileRecord(file.id);
    if (dbErr) {
      toast.error('Failed to remove file record');
      return;
    }
    toast.success('File deleted');
    onDelete();
  };

  return (
    <div className="group bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors relative">
      {/* Menu */}
      <div className="absolute top-3 right-3">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-all cursor-pointer"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-40">
              <button
                onClick={() => { handleDownload(); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download
              </button>
              <button
                onClick={() => { onShare(); setMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
              >
                <Share2 className="w-4 h-4" /> Share link
              </button>
              {isAdmin && (
                <button
                  onClick={() => { handleDelete(); setMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl bg-gray-800 flex items-center justify-center mb-3 ${colorClass}`}>
        <Icon className="w-6 h-6" />
      </div>

      {/* Info */}
      <p className="text-sm font-medium text-white truncate" title={file.name}>
        {file.name}
      </p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-500">{formatBytes(file.size)}</span>
        <span className="text-xs text-gray-700">·</span>
        <span className="text-xs text-gray-500">{formatDate(file.created_at)}</span>
      </div>

      {/* Quick download on click */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="mt-3 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        {downloading ? 'Downloading...' : 'Download'}
      </button>
    </div>
  );
}
