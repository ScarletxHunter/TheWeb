import { useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { createFolder } from '../../lib/database';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

interface CreateFolderProps {
  parentId: string | null;
  onCreated: () => void;
  groupId?: string | null;
}

export function CreateFolder({ parentId, onCreated, groupId }: CreateFolderProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    const { error } = await createFolder(name.trim(), parentId, user.id, groupId);
    if (error) {
      toast.error('Failed to create folder');
    } else {
      toast.success('Folder created');
      setName('');
      setOpen(false);
      onCreated();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors cursor-pointer"
      >
        <FolderPlus className="w-4 h-4" />
        New Folder
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        placeholder="Folder name"
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        autoFocus
      />
      <button
        onClick={handleCreate}
        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg cursor-pointer"
      >
        Create
      </button>
      <button
        onClick={() => { setOpen(false); setName(''); }}
        className="p-2 text-gray-500 hover:text-white cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
