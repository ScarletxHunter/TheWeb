import { useState, useEffect } from 'react';
import { X, Folder, Home, ChevronRight } from 'lucide-react';
import { getAllFolders, moveFile, moveFiles } from '../../lib/database';
import toast from 'react-hot-toast';
import type { Folder as FolderType } from '../../types';

interface MoveToFolderModalProps {
  fileIds: string[];
  currentFolderId: string | null;
  onClose: () => void;
  onMoved: () => void;
}

export function MoveToFolderModal({ fileIds, currentFolderId, onClose, onMoved }: MoveToFolderModalProps) {
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);

  useEffect(() => {
    getAllFolders().then(setFolders);
  }, []);

  const visibleFolders = folders.filter(f => f.parent_id === parentId && f.id !== currentFolderId);

  const handleMove = async () => {
    setMoving(true);
    const targetId = selectedId;
    const { error } = fileIds.length === 1
      ? await moveFile(fileIds[0], targetId)
      : await moveFiles(fileIds, targetId);
    if (error) toast.error('Failed to move file(s)');
    else { toast.success('File(s) moved'); onMoved(); onClose(); }
    setMoving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center lg:p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-sm max-h-[70vh] flex flex-col z-10 animate-slide-up lg:animate-none">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Move to folder</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {parentId && (
            <button
              onClick={() => {
                const parent = folders.find(f => f.id === parentId);
                setParentId(parent?.parent_id ?? null);
                setSelectedId(parent?.parent_id ?? null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-gray-800 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 rotate-180" /> Back
            </button>
          )}

          <button
            onClick={() => setSelectedId(parentId)}
            className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
              selectedId === parentId ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <Home className="w-4 h-4" /> {parentId ? 'Current folder' : 'Root (Home)'}
          </button>

          {visibleFolders.map(folder => (
            <div key={folder.id} className="flex items-center">
              <button
                onClick={() => setSelectedId(folder.id)}
                className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                  selectedId === folder.id ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <Folder className="w-4 h-4" /> {folder.name}
              </button>
              {folders.some(f => f.parent_id === folder.id) && (
                <button
                  onClick={() => { setParentId(folder.id); setSelectedId(folder.id); }}
                  className="p-2 text-gray-500 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleMove}
            disabled={moving}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg cursor-pointer transition-colors"
          >
            {moving ? 'Moving...' : `Move ${fileIds.length > 1 ? `${fileIds.length} files` : 'here'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
