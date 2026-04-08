import { useState, useCallback } from 'react';
import { getShareLinks, createShareLink, deleteShareLink } from '../lib/database';
import type { ShareLink } from '../types';

export function useShareLinks(fileId: string) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await getShareLinks(fileId);
    setLinks(data);
    setLoading(false);
  }, [fileId]);

  const create = async (createdBy: string, expiresInHours?: number) => {
    const { data, error } = await createShareLink(fileId, createdBy, expiresInHours);
    if (!error && data) {
      setLinks((prev) => [data, ...prev]);
    }
    return { data, error };
  };

  const remove = async (linkId: string) => {
    const { error } = await deleteShareLink(linkId);
    if (!error) {
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    }
    return { error };
  };

  return { links, loading, refresh, create, remove };
}
