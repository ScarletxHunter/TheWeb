import { FileCard } from './FileCard';
import type { FileRecord } from '../../types';

interface FileGridProps {
  files: FileRecord[];
  onRefresh: () => void;
  onShareFile: (file: FileRecord) => void;
  onPreviewFile?: (file: FileRecord) => void;
  onTrashFile?: (file: FileRecord) => void;
  onRenameFile?: (file: FileRecord) => void;
  onMoveFile?: (file: FileRecord) => void;
  selectedIds?: Set<string>;
  onSelect?: (fileId: string, shiftKey: boolean) => void;
  selectionMode?: boolean;
}

export function FileGrid({
  files, onRefresh, onShareFile, onPreviewFile, onTrashFile,
  onRenameFile, onMoveFile, selectedIds, onSelect, selectionMode
}: FileGridProps) {
  if (files.length === 0) {
    return null;
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
          onRename={() => onRenameFile?.(file)}
          onMove={() => onMoveFile?.(file)}
          selected={selectedIds?.has(file.id)}
          onSelect={(shiftKey) => onSelect?.(file.id, shiftKey)}
          selectionMode={selectionMode}
        />
      ))}
    </div>
  );
}
