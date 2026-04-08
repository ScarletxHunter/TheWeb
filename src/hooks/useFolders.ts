import { useState, useEffect, useCallback } from 'react';
import { getFolders, getFolderPath } from '../lib/database';
import type { Folder } from '../types';

export function useFolders(parentId: string | null) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [folderData, pathData] = await Promise.all([
      getFolders(parentId),
      getFolderPath(parentId),
    ]);
    setFolders(folderData);
    setBreadcrumbs(pathData);
    setLoading(false);
  }, [parentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { folders, breadcrumbs, loading, refresh };
}
