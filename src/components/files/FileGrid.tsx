import { FileCard } from './FileCard';
import type { FileRecord } from '../../types';

interface FileGridProps {
  files: FileRecord[];
  onRefresh: () => void;
  onShareFile: (file: FileRecord) => void;
}

export function FileGrid({ files, onRefresh, onShareFile }: FileGridProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onDelete={onRefresh}
          onShare={() => onShareFile(file)}
        />
      ))}
    </div>
  );
}
