import { useState, useRef, useEffect } from 'react';
import { Folder as FolderIcon, MoreVertical, Pencil, Trash2, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { renameFolder, deleteFolder, getFiles, getFolders } from '../../lib/database';
import { fetchStoredFileBlob } from '../../lib/storage';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import type { Folder } from '../../types';

interface FolderCardProps {
  folder: Folder;
  onNavigate: (folderId: string) => void;
  onRefresh: () => void;
}

export function FolderCard({ folder, onNavigate, onRefresh }: FolderCardProps) {
  const { user } = useAuth();
  const canManage = user?.id === folder.created_by;
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [isRenaming]);

  const handleRename = async () => {
    setIsRenaming(false);
    const trimmed = editName.trim();
    if (!trimmed || trimmed === folder.name) return;
    const { error } = await renameFolder(folder.id, trimmed);
    if (error) toast.error('Failed to rename folder');
    else onRefresh();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete folder "${folder.name}" and all its contents?`)) return;
    const { error } = await deleteFolder(folder.id);
    if (error) toast.error('Failed to delete folder');
    else {
      toast.success('Folder deleted');
      onRefresh();
    }
    setMenuOpen(false);
  };

  const handleDownloadFolder = async () => {
    setMenuOpen(false);
    const toastId = toast.loading(`Zipping "${folder.name}"...`);

    try {
      const zip = new JSZip();

      // Recursively collect all files in folder and subfolders
      const addFolderToZip = async (fId: string, zipFolder: JSZip) => {
        const [files, subfolders] = await Promise.all([
          getFiles(fId),
          getFolders(fId),
        ]);

        // Download and add each file
        for (const file of files) {
          const { blob, error } = await fetchStoredFileBlob(file);
          if (error || !blob) continue;
          try {
            zipFolder.file(file.name, blob);
          } catch {
            // skip files that fail to download
          }
        }

        // Recurse into subfolders
        for (const sub of subfolders) {
          const subZip = zipFolder.folder(sub.name)!;
          await addFolderToZip(sub.id, subZip);
        }
      };

      await addFolderToZip(folder.id, zip);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(`Downloaded "${folder.name}"`, { id: toastId });
    } catch {
      toast.error('Failed to download folder', { id: toastId });
    }
  };

  return (
    <div
      className="group bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors cursor-pointer relative"
      onClick={() => !isRenaming && onNavigate(folder.id)}
    >
      <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-all cursor-pointer"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-36">
              <button
                onClick={handleDownloadFolder}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
              >
                <Download className="w-4 h-4" /> Download
              </button>
              {canManage && (
                <>
                  <button
                    onClick={() => { setEditName(folder.name); setIsRenaming(true); setMenuOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" /> Rename
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-gray-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3">
        <FolderIcon className="w-6 h-6 text-indigo-400" />
      </div>

      {isRenaming ? (
        <input
          ref={renameRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleRename(); }
            if (e.key === 'Escape') { setIsRenaming(false); setEditName(folder.name); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-sm text-white w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      ) : (
        <p className="text-sm font-medium text-white truncate">{folder.name}</p>
      )}
    </div>
  );
}
