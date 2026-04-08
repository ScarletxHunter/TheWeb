import { useState, useEffect, useCallback } from 'react';
import { getFolders, getFolderPath } from '../lib/database';
import type { Folder } from '../types';

type SpaceCtx = { type: 'personal'; userId: string } | { type: 'group'; groupId: string };

export function useFolders(parentId: string | null, context?: SpaceCtx) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const ctxKey = context ? JSON.stringify(context) : 'none';

  const refresh = useCallback(async () => {
    setLoading(true);
    const [folderData, pathData] = await Promise.all([
      getFolders(parentId, context),
      getFolderPath(parentId),
    ]);
    setFolders(folderData);
    setBreadcrumbs(pathData);
    setLoading(false);
  }, [parentId, ctxKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { folders, breadcrumbs, loading, refresh };
}
