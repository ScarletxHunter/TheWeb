import { useState, useEffect, useCallback } from 'react';
import { getFiles, searchFiles as searchFilesDb } from '../lib/database';
import type { FileRecord } from '../types';

type SpaceCtx = { type: 'personal'; userId: string } | { type: 'group'; groupId: string };

export function useFiles(folderId: string | null, context?: SpaceCtx) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const ctxKey = context ? JSON.stringify(context) : 'none';

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getFiles(folderId, context);
    setFiles(data);
    setLoading(false);
  }, [folderId, ctxKey]);

  useEffect(() => { refresh(); }, [refresh]);

  const searchFiles = useCallback(async (term: string) => {
    if (!term.trim()) {
      refresh();
      return;
    }
    setLoading(true);
    const data = await searchFilesDb(term, context);
    setFiles(data);
    setLoading(false);
  }, [refresh, ctxKey]);

  return { files, loading, refresh, searchFiles };
}
