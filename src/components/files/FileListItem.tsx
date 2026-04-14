import { useState, useRef, useEffect } from 'react';
import { Download, Trash2, Share2, MoreVertical, Pencil, Eye, FolderInput } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { downloadFile } from '../../lib/storage';
import { formatBytes, formatDate, getFileIcon, getFileColor } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { FileRecord } from '../../types';

interface FileListItemProps {
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

export function FileListItem({
  file, onDelete, onShare, onPreview, onRename, onMove,
  selected, onSelect, selectionMode,
}: FileListItemProps) {
  const { user } = useAuth();
  const canManage = user?.id === file.uploaded_by;
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(file.name);
  const renameRef = useRef<HTMLInputElement>(null);

  const Icon = getFileIcon(file.mime_type);
  const colorClass = getFileColor(file.mime_type);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      const dot = file.name.lastIndexOf('.');
      renameRef.current.setSelectionRange(0, dot > 0 ? dot : file.name.length);
    }
  }, [isRenaming, file.name]);

  const handleDownload = async () => {
    setDownloading(true);
    const { url, error } = await downloadFile(file.storage_path);
    if (error) toast.error('Download failed');
    else {
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

  const handleClick = (e: React.MouseEvent) => {
    if (isRenaming) return;
    if (selectionMode && onSelect) { e.preventDefault(); onSelect(e.shiftKey); return; }
    onPreview?.();
  };

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/50 transition-colors cursor-pointer border-b border-gray-800/50 relative ${
        selected ? 'bg-indigo-500/10' : ''
      }`}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
    >
      {/* Checkbox — always visible on hover, always visible in selection mode */}
      <div
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 cursor-pointer transition-opacity ${
          selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-600 bg-gray-800 hover:border-gray-400'
        } ${selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={(e) => { e.stopPropagation(); onSelect?.(e.shiftKey); }}
      >
        {selected && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
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
            className="bg-gray-800 border border-indigo-500 rounded px-2 py-0.5 text-sm text-white w-full max-w-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        ) : (
          <p className="text-sm text-white truncate">{file.name}</p>
        )}
      </div>

      {/* Size */}
      <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0 hidden sm:block">
        {formatBytes(file.size)}
      </span>

      {/* Date */}
      <span className="text-xs text-gray-500 w-28 text-right flex-shrink-0 hidden md:block">
        {formatDate(file.created_at)}
      </span>

      {/* Uploader */}
      {file.profiles && (
        <span className="text-xs text-gray-600 w-24 text-right flex-shrink-0 truncate hidden lg:block">
          {file.profiles.display_name || file.profiles.email}
        </span>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          disabled={downloading}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-700 text-gray-400 hover:text-white transition-all cursor-pointer"
          title="Download"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-700 text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
              <div className="absolute right-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-44">
                <button onClick={(e) => { e.stopPropagation(); onPreview?.(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDownload(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                  <Download className="w-4 h-4" /> Download
                </button>
                <button onClick={(e) => { e.stopPropagation(); onShare(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                  <Share2 className="w-4 h-4" /> Share link
                </button>
                {canManage && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); setEditName(file.name); setIsRenaming(true); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                      <Pencil className="w-4 h-4" /> Rename
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onMove?.(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer">
                      <FolderInput className="w-4 h-4" /> Move to...
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Move "${file.name}" to trash?`)) onDelete(); setMenuOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 cursor-pointer">
                      <Trash2 className="w-4 h-4" /> Move to Trash
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
