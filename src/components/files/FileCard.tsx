import { useState, useEffect, useRef } from 'react';
import { Download, Trash2, Share2, MoreVertical, Pencil, Eye, FolderInput } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { downloadFile } from '../../lib/storage';
import { formatBytes, formatDate, getFileIcon, getFileColor } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { FileRecord } from '../../types';

interface FileCardProps {
  file: FileRecord;
  onDelete: () => void;
  onShare: () => void;
  onPreview?: () => void;
  onRename?: (newName: string) => void;
  onMove?: () => void;
  selected?: boolean;
  onSelect?: (shiftKey: boolean) => void;
  selectionMode?: boolean;
}

export function FileCard({
  file, onDelete, onShare, onPreview, onRename, onMove,
  selected, onSelect, selectionMode,
}: FileCardProps) {
  const { user } = useAuth();
  const canManage = user?.id === file.uploaded_by;
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(file.name);
  const renameRef = useRef<HTMLInputElement>(null);

  const isImage = file.mime_type.startsWith('image/');

  useEffect(() => {
    if (isImage) {
      downloadFile(file.storage_path).then(({ url }) => {
        if (url) setThumbUrl(url);
      });
    }
  }, [file.storage_path, isImage]);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      const dot = file.name.lastIndexOf('.');
      renameRef.current.setSelectionRange(0, dot > 0 ? dot : file.name.length);
    }
  }, [isRenaming, file.name]);

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

  const handleRenameConfirm = () => {
    setIsRenaming(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== file.name) onRename?.(trimmed);
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (isRenaming) return;
    if (selectionMode && onSelect) {
      e.preventDefault();
      onSelect(e.shiftKey);
      return;
    }
    if (onPreview) onPreview();
  };

  return (
    <div
      className={`group bg-gray-900 border rounded-xl p-3 sm:p-4 hover:border-gray-700 transition-all relative cursor-pointer ${
        selected ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/50' : 'border-gray-800'
      }`}
      onClick={handleCardClick}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
    >
      {/* Selection checkbox — always visible on hover, always visible in selection mode */}
      <div
        className={`absolute top-2 left-2 z-10 ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
        onClick={(e) => { e.stopPropagation(); onSelect?.(e.shiftKey); }}
      >
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
          selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600 bg-gray-800 hover:border-gray-400'
        }`}>
          {selected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
      </div>

      {/* Menu button */}
      <div className="absolute top-2 right-2 sm:top-3 sm:right-3">
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-all cursor-pointer"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
            <div className="absolute right-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-44">
              <button onClick={(e) => { e.stopPropagation(); onPreview?.(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleDownload(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                <Download className="w-4 h-4" /> Download
              </button>
              <button onClick={(e) => { e.stopPropagation(); onShare(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                <Share2 className="w-4 h-4" /> Share link
              </button>
              {canManage && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); setEditName(file.name); setIsRenaming(true); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                    <Pencil className="w-4 h-4" /> Rename
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onMove?.(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                    <FolderInput className="w-4 h-4" /> Move to...
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm(`Move "${file.name}" to trash?`)) onDelete(); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2.5 text-sm text-red-400 hover:bg-gray-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Move to Trash
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail or Icon */}
      {isImage && thumbUrl ? (
        <div className="w-full h-24 sm:h-32 rounded-lg overflow-hidden bg-gray-800 mb-2 sm:mb-3">
          <img src={thumbUrl} alt={file.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gray-800 flex items-center justify-center mb-2 sm:mb-3 ${colorClass}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
      )}

      {/* File name (inline rename) */}
      {isRenaming ? (
        <input
          ref={renameRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRenameConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleRenameConfirm(); }
            if (e.key === 'Escape') { setIsRenaming(false); setEditName(file.name); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      ) : (
        <p className="text-sm font-medium text-white truncate pr-6" title={file.name}>
          {file.name}
        </p>
      )}

      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-500">{formatBytes(file.size)}</span>
        <span className="text-xs text-gray-700">&middot;</span>
        <span className="text-xs text-gray-500">{formatDate(file.created_at)}</span>
      </div>

      {/* Quick download */}
      <button
        onClick={(e) => { e.stopPropagation(); handleDownload(); }}
        disabled={downloading}
        className="mt-2 sm:mt-3 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium py-2 min-h-[44px] rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        {downloading ? 'Downloading...' : 'Download'}
      </button>
    </div>
  );
}
