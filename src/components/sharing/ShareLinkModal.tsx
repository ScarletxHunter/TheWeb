import { useState, useEffect } from 'react';
import { X, Copy, Trash2, Link as LinkIcon, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useShareLinks } from '../../hooks/useShareLinks';
import { formatDate } from '../../lib/utils';
import toast from 'react-hot-toast';
import type { FileRecord } from '../../types';

interface ShareLinkModalProps {
  file: FileRecord;
  onClose: () => void;
}

export function ShareLinkModal({ file, onClose }: ShareLinkModalProps) {
  const { user } = useAuth();
  const { links, refresh, create, remove } = useShareLinks(file.id);
  const [expiresInHours, setExpiresInHours] = useState<number | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async () => {
    if (!user) return;
    setCreating(true);
    const { error } = await create(user.id, expiresInHours);
    if (error) toast.error('Failed to create link');
    else toast.success('Share link created');
    setCreating(false);
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/shared/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  const handleDelete = async (linkId: string) => {
    const { error } = await remove(linkId);
    if (error) toast.error('Failed to delete link');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Share "{file.name}"</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Create new link */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <select
              value={expiresInHours ?? ''}
              onChange={(e) =>
                setExpiresInHours(e.target.value ? Number(e.target.value) : undefined)
              }
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No expiration</option>
              <option value="1">1 hour</option>
              <option value="24">24 hours</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-2 cursor-pointer"
            >
              <LinkIcon className="w-4 h-4" />
              {creating ? 'Creating...' : 'Create Link'}
            </button>
          </div>
        </div>

        {/* Existing links */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {links.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No share links yet</p>
          )}
          {links.map((link) => {
            const expired =
              link.expires_at && new Date(link.expires_at) < new Date();
            return (
              <div
                key={link.id}
                className={`bg-gray-800 rounded-lg p-3 flex items-center gap-3 ${
                  expired ? 'opacity-50' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 font-mono truncate">
                    /shared/{link.token.slice(0, 12)}...
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">
                      Created {formatDate(link.created_at)}
                    </span>
                    {link.expires_at && (
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
                        {expired ? 'Expired' : `Expires ${formatDate(link.expires_at)}`}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => copyLink(link.token)}
                  className="p-1.5 text-gray-500 hover:text-white cursor-pointer"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(link.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 cursor-pointer"
                  title="Delete link"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
