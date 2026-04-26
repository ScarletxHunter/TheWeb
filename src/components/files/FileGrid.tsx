import { FileCard } from './FileCard';
import { FileListItem } from './FileListItem';
import type { FileRecord } from '../../types';
import type { ViewMode } from '../layout/Header';

interface FileGridProps {
  files: FileRecord[];
  onRefresh: () => void;
  onShareFile: (file: FileRecord) => void;
  onPreviewFile?: (file: FileRecord) => void;
  onTrashFile?: (file: FileRecord) => void;
  onRenameFile?: (file: FileRecord, newName: string) => void;
  onMoveFile?: (file: FileRecord) => void;
  canManageFile?: (file: FileRecord) => boolean;
  selectedIds?: Set<string>;
  onSelect?: (fileId: string, shiftKey: boolean) => void;
  selectionMode?: boolean;
  viewMode?: ViewMode;
}

export function FileGrid({
  files, onRefresh, onShareFile, onPreviewFile, onTrashFile,
  onRenameFile, onMoveFile, canManageFile, selectedIds, onSelect, selectionMode,
  viewMode = 'grid',
}: FileGridProps) {
  if (files.length === 0) return null;

  if (viewMode === 'list') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/* List header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 text-xs text-gray-500 font-medium">
          {selectionMode && <div className="w-5 flex-shrink-0" />}
          <div className="w-8 flex-shrink-0" />
          <div className="flex-1">Name</div>
          <div className="w-20 text-right flex-shrink-0 hidden sm:block">Size</div>
          <div className="w-28 text-right flex-shrink-0 hidden md:block">Modified</div>
          <div className="w-24 text-right flex-shrink-0 hidden lg:block">Owner</div>
          <div className="w-16 flex-shrink-0" />
        </div>
        {files.map((file) => (
          <FileListItem
            key={file.id}
            file={file}
            onDelete={() => onTrashFile ? onTrashFile(file) : onRefresh()}
            onShare={() => onShareFile(file)}
            onPreview={() => onPreviewFile?.(file)}
            onRename={(newName) => onRenameFile?.(file, newName)}
            onMove={() => onMoveFile?.(file)}
            canManage={canManageFile?.(file)}
            selected={selectedIds?.has(file.id)}
            onSelect={(shiftKey) => onSelect?.(file.id, shiftKey)}
            selectionMode={selectionMode}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onDelete={() => onTrashFile ? onTrashFile(file) : onRefresh()}
          onShare={() => onShareFile(file)}
          onPreview={() => onPreviewFile?.(file)}
          onRename={(newName) => onRenameFile?.(file, newName)}
          onMove={() => onMoveFile?.(file)}
          canManage={canManageFile?.(file)}
          selected={selectedIds?.has(file.id)}
          onSelect={(shiftKey) => onSelect?.(file.id, shiftKey)}
          selectionMode={selectionMode}
        />
      ))}
    </div>
  );
}
