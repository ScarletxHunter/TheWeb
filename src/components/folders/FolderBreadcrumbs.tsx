import { ChevronRight, Home } from 'lucide-react';
import type { Folder } from '../../types';

interface BreadcrumbsProps {
  breadcrumbs: Folder[];
  onNavigate: (folderId: string | null) => void;
}

export function FolderBreadcrumbs({ breadcrumbs, onNavigate }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm overflow-x-auto">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
      >
        <Home className="w-4 h-4" />
        <span>Home</span>
      </button>

      {breadcrumbs.map((folder) => (
        <span key={folder.id} className="flex items-center gap-1">
          <ChevronRight className="w-4 h-4 text-gray-600" />
          <button
            onClick={() => onNavigate(folder.id)}
            className="text-gray-400 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {folder.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
