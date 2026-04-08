import { useState, useEffect, useCallback } from 'react';
import { getFiles, searchFiles as searchFilesDB } from '../lib/database';
import type { FileRecord } from '../types';

export function useFiles(folderId: string | null) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getFiles(folderId);
    setFiles(data);
    setLoading(false);
  }, [folderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const searchFiles = async (term: string) => {
    if (!term.trim()) {
      refresh();
      return;
    }
    setLoading(true);
    const data = await searchFilesDB(term);
    setFiles(data);
    setLoading(false);
  };

  return { files, loading, refresh, searchFiles };
}
