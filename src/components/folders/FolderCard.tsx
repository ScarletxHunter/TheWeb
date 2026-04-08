import { useState } from 'react';
import { Folder as FolderIcon, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { renameFolder, deleteFolder } from '../../lib/database';
import toast from 'react-hot-toast';
import type { Folder } from '../../types';

interface FolderCardProps {
  folder: Folder;
  onNavigate: (folderId: string) => void;
  onRefresh: () => void;
}

export function FolderCard({ folder, onNavigate, onRefresh }: FolderCardProps) {
  const { isAdmin } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleRename = async () => {
    const newName = prompt('Rename folder:', folder.name);
    if (!newName || newName === folder.name) return;
    const { error } = await renameFolder(folder.id, newName);
    if (error) toast.error('Failed to rename folder');
    else onRefresh();
    setMenuOpen(false);
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

  return (
    <div
      className="group bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors cursor-pointer relative"
      onClick={() => onNavigate(folder.id)}
    >
      {isAdmin && (
        <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-all cursor-pointer"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 w-36">
                <button
                  onClick={handleRename}
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
              </div>
            </>
          )}
        </div>
      )}

      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3">
        <FolderIcon className="w-6 h-6 text-indigo-400" />
      </div>
      <p className="text-sm font-medium text-white truncate">{folder.name}</p>
    </div>
  );
}
